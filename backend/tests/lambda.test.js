// AWS is injected only inside this test process; no real account is called.
import test from "node:test";
import assert from "node:assert/strict";
process.env.AWS_DYNAMODB_TABLE = "TestOnlyTable";
process.env.MATCH_THRESHOLD = "55";
delete process.env.AWS_SNS_TOPIC_ARN;
const { handler, db } = await import("../../lambda/matchItems/index.js");
const rows = new Map(),
  calls = [];
db.send = async (command) => {
  calls.push(command.constructor.name);
  const x = command.input;
  if (command.constructor.name === "GetCommand")
    return { Item: rows.get(x.Key.itemId) };
  if (command.constructor.name === "ScanCommand")
    return {
      Items: [...rows.values()].filter(
        (i) =>
          i.entity === x.ExpressionAttributeValues[":e"] &&
          i.type === x.ExpressionAttributeValues[":t"],
      ),
    };
  if (command.constructor.name === "PutCommand") {
    if (rows.has(x.Item.itemId))
      throw Object.assign(new Error("Duplicate"), {
        name: "ConditionalCheckFailedException",
      });
    rows.set(x.Item.itemId, x.Item);
    return {};
  }
  if (command.constructor.name === "UpdateCommand") {
    const row = rows.get(x.Key.itemId);
    const values = x.ExpressionAttributeValues;
    if (values[":score"] && row.bestMatchScore >= values[":score"])
      throw Object.assign(new Error("Lower score"), {
        name: "ConditionalCheckFailedException",
      });
    for (const part of x.UpdateExpression.replace(/^SET /, "").split(", ")) {
      const [name, value] = part.split(" = ");
      row[x.ExpressionAttributeNames?.[name] || name] = values[value];
    }
    return {};
  }
  throw new Error(`Unexpected command ${command.constructor.name}`);
};
const details = {
  itemName: "Black bottle",
  description: "Steel water bottle",
  category: "Bottle",
  color: "Black",
  location: "Library",
  date: "2026-10-06",
  time: "10:30",
  detectedLabels: [{ Name: "Bottle" }],
  analysisStatus: "COMPLETE",
  status: "ANALYZED",
  entity: "ITEM",
};
test("Lambda persists an explained pair and symmetric item references; retries keep one match", async () => {
  rows.clear();
  rows.set("lost", { ...details, itemId: "lost", type: "LOST" });
  rows.set("found", { ...details, itemId: "found", type: "FOUND" });
  rows.set("unrelated", {
    ...details,
    itemId: "unrelated",
    type: "FOUND",
    category: "Books",
    color: "Red",
    location: "Hostel",
    date: "2026-09-01",
    itemName: "Math book",
    description: "Calculus textbook",
    detectedLabels: [{ Name: "Book" }],
  });
  const result = await handler({ itemId: "found" });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].score, 100);
  assert.equal(rows.get("lost").bestMatchScore, 100);
  assert.deepEqual(rows.get("lost").matchedItemIds, ["found"]);
  assert.deepEqual(rows.get("found").matchedItemIds, ["lost"]);
  assert.equal(rows.get("found").matchingStatus, "COMPLETE");
  assert.equal(rows.get("MATCH#lost#found").explanation.length, 6);
  await handler({ itemId: "found" });
  assert.equal(
    [...rows.values()].filter((x) => x.entity === "MATCH").length,
    1,
  );
  assert.equal(result.notification, "Optional");
});
test("Lambda skips claimed/returned candidates and rejects analysis-pending input", async () => {
  rows.clear();
  rows.set("lost", { ...details, itemId: "lost", type: "LOST" });
  rows.set("found", {
    ...details,
    itemId: "found",
    type: "FOUND",
    status: "CLAIM_REQUESTED",
  });
  assert.equal((await handler({ itemId: "lost" })).matches.length, 0);
  rows.get("lost").analysisStatus = "PENDING";
  await assert.rejects(handler({ itemId: "lost" }), /analyzed item/);
});
