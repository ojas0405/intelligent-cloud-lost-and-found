import "../config/env.js";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  RekognitionClient,
  DetectLabelsCommand,
} from "@aws-sdk/client-rekognition";
import {
  LambdaClient,
  InvokeCommand,
  GetFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import { SNSClient, GetTopicAttributesCommand } from "@aws-sdk/client-sns";
import { randomUUID } from "node:crypto";
import { decodeMatchResponse } from "../utils/lambdaResponse.js";
const options = { region: process.env.AWS_REGION, maxAttempts: 2 };
const rekognitionRegion =
  process.env.AWS_REKOGNITION_REGION || process.env.AWS_REGION;
export const s3 = new S3Client(options),
  dynamo = new DynamoDBClient(options),
  db = DynamoDBDocumentClient.from(dynamo, {
    marshallOptions: { removeUndefinedValues: true },
  }),
  rekognition = new RekognitionClient({
    ...options,
    region: rekognitionRegion,
  }),
  lambda = new LambdaClient(options);
export const table = process.env.AWS_DYNAMODB_TABLE,
  bucket = process.env.AWS_S3_BUCKET_NAME;
export const configured = () =>
  Boolean(
    process.env.AWS_REGION &&
      bucket &&
      table &&
      process.env.AWS_MATCH_LAMBDA_NAME,
  );
export function requireCloud() {
  if (!configured())
    throw Object.assign(
      new Error(
        "AWS is Not Configured. Complete backend/.env and the AWS setup guide.",
      ),
      { status: 503 },
    );
}
export const put = (Item) =>
  db.send(new PutCommand({ TableName: table, Item }));
export const get = async (itemId) =>
  (
    await db.send(
      new GetCommand({
        TableName: table,
        Key: { itemId },
        ConsistentRead: true,
      }),
    )
  ).Item;
export const remove = (itemId) =>
  db.send(new DeleteCommand({ TableName: table, Key: { itemId } }));
export async function scan(entity) {
  let rows = [],
    key;
  do {
    const page = await db.send(
      new ScanCommand({
        TableName: table,
        ExclusiveStartKey: key,
        FilterExpression: "entity = :e",
        ExpressionAttributeValues: { ":e": entity },
        ConsistentRead: true,
      }),
    );
    rows.push(...page.Items);
    key = page.LastEvaluatedKey;
  } while (key);
  return rows;
}
export async function update(itemId, values) {
  const entries = Object.entries({
    ...values,
    updatedAt: new Date().toISOString(),
  });
  await db.send(
    new UpdateCommand({
      TableName: table,
      Key: { itemId },
      UpdateExpression:
        "SET " + entries.map((_, i) => `#k${i} = :v${i}`).join(", "),
      ExpressionAttributeNames: Object.fromEntries(
        entries.map(([k], i) => [`#k${i}`, k]),
      ),
      ExpressionAttributeValues: Object.fromEntries(
        entries.map(([, v], i) => [`:v${i}`, v]),
      ),
      ConditionExpression: "attribute_exists(itemId)",
    }),
  );
}
export const upload = (key, body) =>
  s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "image/jpeg",
      ServerSideEncryption: "AES256",
    }),
  );
export const deleteImage = (key) =>
  s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
export const imageUrl = (key) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 300,
  });
export async function activity(itemId, service, message, level = "success") {
  await put({
    itemId: `ACTIVITY#${randomUUID()}`,
    entity: "ACTIVITY",
    reportId: itemId,
    service,
    message,
    level,
    createdAt: new Date().toISOString(),
  });
}
export async function processItem(item) {
  let stage = "analysis";
  try {
    await update(item.itemId, {
      analysisStatus: "PROCESSING",
      matchingStatus: "PENDING",
      processingError: "",
    });
    let image = { S3Object: { Bucket: bucket, Name: item.imageKey } };
    if (rekognitionRegion !== process.env.AWS_REGION) {
      // Rekognition S3Object requires a bucket in its own region. Keep the
      // existing private bucket and supply its image bytes across regions.
      const object = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: item.imageKey }),
      );
      const bytes = await object.Body.transformToByteArray();
      if (bytes.length > 5 * 1024 * 1024)
        throw new Error("Image exceeds Rekognition's 5 MB byte limit.");
      image = { Bytes: bytes };
    }
    const result = await rekognition.send(
      new DetectLabelsCommand({
        Image: image,
        MaxLabels: 12,
        MinConfidence: 65,
      }),
    );
    const detectedLabels = (result.Labels || [])
      .filter(
        (l) => typeof l.Name === "string" && Number.isFinite(l.Confidence),
      )
      .map(({ Name, Confidence }) => ({
        Name,
        Confidence: Math.round(Confidence),
      }));
    await update(item.itemId, {
      detectedLabels,
      analysisStatus: "COMPLETE",
      status: "ANALYZED",
    });
    await activity(
      item.itemId,
      "Rekognition",
      `Image analysis completed · ${detectedLabels.length} labels detected`,
    );
    stage = "matching";
    await update(item.itemId, { matchingStatus: "PROCESSING" });
    const response = await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.AWS_MATCH_LAMBDA_NAME,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(JSON.stringify({ itemId: item.itemId })),
      }),
    );
    const resultBody = decodeMatchResponse(response);
    await activity(
      item.itemId,
      "Lambda",
      `Matching completed · ${resultBody.matches.length} possible matches`,
    );
    if (resultBody.matches.length)
      await activity(
        item.itemId,
        "Matches",
        `Possible match found · ${resultBody.matches[0].score}% match score`,
      );
    if (["Sent", "Failed"].includes(resultBody.notification))
      await activity(
        item.itemId,
        "SNS",
        `Notification ${resultBody.notification.toLowerCase()}`,
        resultBody.notification === "Sent" ? "success" : "error",
      );
  } catch (e) {
    const detail = String(e.message || e.name || "Unknown error").replace(
      /[\r\n]+/g,
      " ",
    );
    // Log only the operation and error, never credentials or full SDK objects.
    const safeDetail = [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
    ]
      .reduce(
        (text, key) =>
          process.env[key]
            ? text.split(process.env[key]).join("[REDACTED]")
            : text,
        detail,
      )
      .slice(0, 700);
    console.error(
      JSON.stringify({
        event: "cloud_processing_failed",
        itemId: item.itemId,
        stage,
        error: e.name || "Error",
        message: safeDetail,
      }),
    );
    const message = `${stage === "analysis" ? "Image analysis" : "Cloud matching"} failed (${e.name || "Error"}). Check AWS permissions, region and CloudWatch, then retry.`;
    await update(item.itemId, {
      [stage === "analysis" ? "analysisStatus" : "matchingStatus"]: "FAILED",
      processingError: `${message} ${safeDetail}`,
    }).catch(() => {});
    await activity(
      item.itemId,
      stage === "analysis" ? "Rekognition" : "Lambda",
      message,
      "error",
    ).catch(() => {});
  }
}
export async function cloudStatus() {
  const region = process.env.AWS_REGION;
  const check = async (enabled, fn) => {
    if (!enabled) return "Not Configured";
    try {
      await fn();
      return "Connected";
    } catch (e) {
      return `Unavailable (${e.name})`;
    }
  };
  const [S3, DynamoDB, Lambda, SNS] = await Promise.all([
    check(region && bucket, () =>
      s3.send(new HeadBucketCommand({ Bucket: bucket })),
    ),
    check(region && table, () =>
      dynamo.send(new DescribeTableCommand({ TableName: table })),
    ),
    check(region && process.env.AWS_MATCH_LAMBDA_NAME, () =>
      lambda.send(
        new GetFunctionConfigurationCommand({
          FunctionName: process.env.AWS_MATCH_LAMBDA_NAME,
        }),
      ),
    ),
    process.env.AWS_SNS_TOPIC_ARN
      ? check(region, () =>
          new SNSClient(options).send(
            new GetTopicAttributesCommand({
              TopicArn: process.env.AWS_SNS_TOPIC_ARN,
            }),
          ),
        )
      : Promise.resolve("Optional"),
  ]);
  return {
    S3,
    DynamoDB,
    Lambda,
    SNS,
    Rekognition:
      rekognitionRegion && bucket
        ? "Configured · verified on upload"
        : "Not Configured",
    rekognitionRegion: rekognitionRegion || "Not Configured",
    configured: configured(),
    region: region || "Not Configured",
  };
}
export async function transitionPair(match, expected, status, extra = {}) {
  const now = new Date().toISOString();
  const records = [match.itemId, match.lostId, match.foundId];
  await db.send(
    new TransactWriteCommand({
      TransactItems: records.map((id, i) => {
        const values = {
          status,
          updatedAt: now,
          ...(i === 0
            ? extra
            : {
                activeClaimMatch:
                  status === "POSSIBLE_MATCH" ? "" : match.itemId,
              }),
        };
        const entries = Object.entries(values);
        const condition =
          i === 0
            ? "#s = :expected"
            : expected === "POSSIBLE_MATCH"
              ? "attribute_exists(itemId) AND #s = :possible"
              : "attribute_exists(itemId) AND #s = :expected AND activeClaimMatch = :match";
        const conditionValues =
          i === 0
            ? { ":expected": expected }
            : expected === "POSSIBLE_MATCH"
              ? { ":possible": "POSSIBLE_MATCH" }
              : { ":expected": expected, ":match": match.itemId };
        return {
          Update: {
            TableName: table,
            Key: { itemId: id },
            UpdateExpression:
              "SET " + entries.map((_, j) => `#k${j} = :v${j}`).join(", "),
            ConditionExpression: condition,
            ExpressionAttributeNames: {
              "#s": "status",
              ...Object.fromEntries(entries.map(([k], j) => [`#k${j}`, k])),
            },
            ExpressionAttributeValues: {
              ...conditionValues,
              ...Object.fromEntries(entries.map(([, v], j) => [`:v${j}`, v])),
            },
          },
        };
      }),
    }),
  );
}
