import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { scoreItems } from "./scoring.js";
export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const table = process.env.AWS_DYNAMODB_TABLE;
export async function handler(event) {
  if (!table || !event.itemId) throw new Error("Table and itemId are required");
  const { Item: item } = await db.send(
    new GetCommand({ TableName: table, Key: { itemId: event.itemId } }),
  );
  if (!item || item.entity !== "ITEM" || item.analysisStatus !== "COMPLETE")
    throw new Error("An analyzed item is required");
  if (["CLAIM_REQUESTED", "VERIFIED", "RETURNED"].includes(item.status))
    return { matches: [], skipped: true };
  let candidates = [],
    key;
  do {
    const page = await db.send(
      new ScanCommand({
        TableName: table,
        ExclusiveStartKey: key,
        FilterExpression: "entity = :e AND #type = :t",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: {
          ":e": "ITEM",
          ":t": item.type === "LOST" ? "FOUND" : "LOST",
        },
        ConsistentRead: true,
      }),
    );
    candidates.push(...page.Items);
    key = page.LastEvaluatedKey;
  } while (key);
  const threshold = Number(process.env.MATCH_THRESHOLD || 55);
  const matches = candidates
    .filter(
      (c) =>
        c.analysisStatus === "COMPLETE" &&
        !["CLAIM_REQUESTED", "VERIFIED", "RETURNED"].includes(c.status),
    )
    .map((c) => ({ candidate: c, ...scoreItems(item, c) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const now = new Date().toISOString();
  for (const m of matches) {
    const lost = item.type === "LOST" ? item : m.candidate,
      found = item.type === "FOUND" ? item : m.candidate;
    const matchId = `MATCH#${lost.itemId}#${found.itemId}`;
    try {
      await db.send(
        new PutCommand({
          TableName: table,
          Item: {
            itemId: matchId,
            entity: "MATCH",
            lostId: lost.itemId,
            foundId: found.itemId,
            score: m.score,
            explanation: m.explanation,
            status: "POSSIBLE_MATCH",
            createdAt: now,
            updatedAt: now,
          },
          ConditionExpression: "attribute_not_exists(itemId)",
        }),
      );
    } catch (e) {
      if (e.name !== "ConditionalCheckFailedException") throw e;
    }
    for (const [id, opposite] of [
      [lost.itemId, found.itemId],
      [found.itemId, lost.itemId],
    ]) {
      const { Item: current } = await db.send(
        new GetCommand({
          TableName: table,
          Key: { itemId: id },
          ConsistentRead: true,
        }),
      );
      const ids = [...new Set([...(current?.matchedItemIds || []), opposite])];
      await db
        .send(
          new UpdateCommand({
            TableName: table,
            Key: { itemId: id },
            UpdateExpression:
              "SET #s = :s, updatedAt = :u, matchedItemIds = :ids",
            ConditionExpression:
              "attribute_exists(itemId) AND #s <> :v AND #s <> :r AND #s <> :c",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":s": "POSSIBLE_MATCH",
              ":u": now,
              ":ids": ids,
              ":v": "VERIFIED",
              ":r": "RETURNED",
              ":c": "CLAIM_REQUESTED",
            },
          }),
        )
        .catch((e) => {
          if (e.name !== "ConditionalCheckFailedException") throw e;
        });
      await db
        .send(
          new UpdateCommand({
            TableName: table,
            Key: { itemId: id },
            UpdateExpression: "SET bestMatchScore = :score",
            ConditionExpression:
              "attribute_exists(itemId) AND (attribute_not_exists(bestMatchScore) OR bestMatchScore < :score)",
            ExpressionAttributeValues: { ":score": m.score },
          }),
        )
        .catch((e) => {
          if (e.name !== "ConditionalCheckFailedException") throw e;
        });
    }
  }
  let notification = "Optional";
  if (
    matches[0]?.score >= Number(process.env.NOTIFICATION_THRESHOLD || 80) &&
    process.env.AWS_SNS_TOPIC_ARN
  ) {
    try {
      await new SNSClient({}).send(
        new PublishCommand({
          TopicArn: process.env.AWS_SNS_TOPIC_ARN,
          Subject: "FindBack: possible match",
          Message: `FindBack found a possible match for your lost item. Match score: ${matches[0].score}%. Open FindBack to review and verify ownership.`,
        }),
      );
      notification = "Sent";
    } catch {
      notification = "Failed";
    }
  }
  await db.send(
    new UpdateCommand({
      TableName: table,
      Key: { itemId: item.itemId },
      UpdateExpression: "SET matchingStatus = :s, updatedAt = :u",
      ExpressionAttributeValues: { ":s": "COMPLETE", ":u": now },
    }),
  );
  console.log(
    JSON.stringify({
      event: "matching_complete",
      itemId: item.itemId,
      matchCount: matches.length,
      notification,
    }),
  );
  return {
    matches: matches.map((m) => ({
      itemId: m.candidate.itemId,
      score: m.score,
    })),
    notification,
  };
}
