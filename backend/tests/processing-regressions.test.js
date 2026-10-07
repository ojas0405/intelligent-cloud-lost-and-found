import test from "node:test";
import assert from "node:assert/strict";
import { decodeMatchResponse } from "../utils/lambdaResponse.js";

test("Lambda Uint8Array payload supports plain and API Gateway match objects", () => {
  const result = { matches: [], notification: "Optional" };
  const encode = (value) => new Uint8Array(Buffer.from(JSON.stringify(value)));
  assert.deepEqual(decodeMatchResponse({ Payload: encode(result) }), result);
  assert.deepEqual(
    decodeMatchResponse({
      Payload: encode({ statusCode: 200, body: JSON.stringify(result) }),
    }),
    result,
  );
  assert.throws(
    () =>
      decodeMatchResponse({
        Payload: encode({
          statusCode: 200,
          body: JSON.stringify("Hello from Lambda!"),
        }),
      }),
    /Deploy the FindBack matching package/,
  );
  assert.throws(
    () => decodeMatchResponse({ Payload: encode(JSON.stringify(result)) }),
    /unexpected response/,
  );
  assert.throws(
    () => decodeMatchResponse({ Payload: new Uint8Array() }),
    /empty response/,
  );
  assert.throws(
    () =>
      decodeMatchResponse({
        FunctionError: "Unhandled",
        Payload: encode({
          errorType: "AccessDeniedException",
          errorMessage: "Denied",
        }),
      }),
    { name: "AccessDeniedException", message: "Denied" },
  );
});

// Test-only responses; no real AWS calls from this test process.
process.env.AWS_REGION = "eu-north-1";
process.env.AWS_REKOGNITION_REGION = "eu-west-1";
process.env.AWS_S3_BUCKET_NAME = "test-only-bucket";
process.env.AWS_DYNAMODB_TABLE = "TestOnlyTable";
process.env.AWS_MATCH_LAMBDA_NAME = "TestOnlyLambda";
const aws = await import("../services/aws.js");
test("cross-region analysis reads private S3 bytes and stores only plain label values", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const saved = [];
  let image;
  aws.s3.send = async (command) => {
    assert.equal(command.constructor.name, "GetObjectCommand");
    assert.equal(command.input.Bucket, "test-only-bucket");
    return { Body: { transformToByteArray: async () => bytes } };
  };
  aws.rekognition.send = async (command) => {
    image = command.input.Image;
    return {
      Labels: [
        { Name: "Bottle", Confidence: 98.8, Parents: [{ Name: "Container" }] },
        { Name: undefined, Confidence: 99 },
      ],
      $metadata: { httpStatusCode: 200 },
    };
  };
  aws.lambda.send = async () => ({
    Payload: new Uint8Array(
      Buffer.from(JSON.stringify({ matches: [], notification: "Optional" })),
    ),
  });
  aws.db.send = async (command) => {
    saved.push(command.input);
    return {};
  };
  await aws.processItem({ itemId: "test-report", imageKey: "lost/test.jpg" });
  assert.deepEqual(image, { Bytes: bytes });
  const labelsWrite = saved.find(
    (x) =>
      x.ExpressionAttributeNames &&
      Object.values(x.ExpressionAttributeNames).includes("detectedLabels"),
  );
  const key = Object.keys(labelsWrite.ExpressionAttributeNames).find(
    (k) => labelsWrite.ExpressionAttributeNames[k] === "detectedLabels",
  );
  const index = key.slice(2);
  assert.deepEqual(labelsWrite.ExpressionAttributeValues[`:v${index}`], [
    { Name: "Bottle", Confidence: 99 },
  ]);
});
