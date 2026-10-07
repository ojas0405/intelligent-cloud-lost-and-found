// Explicit AWS test doubles. These never run in the production app.
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import sharp from "sharp";
process.env.AWS_REGION = "us-east-1";
process.env.AWS_REKOGNITION_REGION = "us-east-1";
process.env.AWS_S3_BUCKET_NAME = "test-only-bucket";
process.env.AWS_DYNAMODB_TABLE = "TestOnlyTable";
process.env.AWS_MATCH_LAMBDA_NAME = "TestOnlyLambda";
const aws = await import("../services/aws.js");
const { app } = await import("../app.js");
const records = new Map(),
  calls = [];
aws.s3.send = async (command) => {
  calls.push(command.constructor.name);
  return {};
};
aws.rekognition.send = async (command) => {
  calls.push(command.constructor.name);
  return { Labels: [{ Name: "Bottle", Confidence: 99 }] };
};
aws.lambda.send = async (command) => {
  calls.push(command.constructor.name);
  const id = JSON.parse(command.input.Payload.toString()).itemId;
  records.get(id).matchingStatus = "COMPLETE";
  return {
    Payload: Buffer.from(
      JSON.stringify({ matches: [], notification: "Optional" }),
    ),
  };
};
function apply(input) {
  const row = records.get(input.Key.itemId);
  if (!row) throw new Error("Test record missing");
  const expression = input.UpdateExpression.replace(/^SET /, "");
  for (const part of expression.split(", ")) {
    const [name, value] = part.split(" = ");
    const key = input.ExpressionAttributeNames?.[name] || name;
    row[key] = input.ExpressionAttributeValues[value];
  }
}
aws.db.send = async (command) => {
  calls.push(command.constructor.name);
  const input = command.input;
  switch (command.constructor.name) {
    case "PutCommand":
      records.set(input.Item.itemId, structuredClone(input.Item));
      return {};
    case "GetCommand":
      return { Item: structuredClone(records.get(input.Key.itemId)) };
    case "UpdateCommand":
      apply(input);
      return {};
    case "DeleteCommand":
      records.delete(input.Key.itemId);
      return {};
    case "ScanCommand":
      return {
        Items: [...records.values()]
          .filter((x) => x.entity === input.ExpressionAttributeValues[":e"])
          .map((x) => structuredClone(x)),
      };
    case "TransactWriteCommand":
      for (const { Update: u } of input.TransactItems) {
        const row = records.get(u.Key.itemId);
        const expected =
          u.ExpressionAttributeValues[":expected"] ||
          u.ExpressionAttributeValues[":possible"];
        if (
          row.status !== expected ||
          (u.ExpressionAttributeValues[":match"] &&
            row.activeClaimMatch !== u.ExpressionAttributeValues[":match"])
        )
          throw Object.assign(new Error("Conflict"), {
            name: "TransactionCanceledException",
          });
      }
      for (const { Update: u } of input.TransactItems) apply(u);
      return {};
    default:
      throw new Error(`Unexpected test command ${command.constructor.name}`);
  }
};
const png = await sharp({
  create: { width: 8, height: 8, channels: 3, background: "#222" },
})
  .png()
  .toBuffer();
const fields = {
  itemName: "Black bottle",
  description: "Steel bottle",
  color: "Black",
  category: "Bottle",
  location: "Library",
  date: "2026-10-06",
  time: "10:30",
  ownershipQuestion: "Private initials?",
  ownershipAnswer: "AB",
};
function upload(path, body = png) {
  let r = request(app).post(path);
  for (const [key, value] of Object.entries(fields)) r = r.field(key, value);
  return r.attach("image", body, {
    filename: "bottle.png",
    contentType: "image/png",
  });
}
test("real API wiring validates image, calls S3/Rekognition/Lambda and returns safe records", async () => {
  const response = await upload("/api/items/lost").expect(202);
  const id = response.body.item.itemId;
  for (let i = 0; i < 30 && records.get(id).matchingStatus !== "COMPLETE"; i++)
    await new Promise((r) => setTimeout(r, 10));
  assert.ok(calls.includes("PutObjectCommand"));
  assert.ok(calls.includes("DetectLabelsCommand"));
  assert.ok(calls.includes("InvokeCommand"));
  assert.equal(records.get(id).detectedLabels[0].Name, "Bottle");
  assert.ok(records.get(id).ownershipAnswerHash);
  const read = await request(app).get(`/api/items/${id}`).expect(200);
  assert.equal(read.body.item.ownershipAnswerHash, undefined);
  assert.equal(read.body.item.ownershipAnswer, undefined);
  await upload("/api/items/found", Buffer.from("not an image")).expect(400);
});
test("retry returns JSON and clears old failures before the new analysis finishes", async () => {
  const item = [...records.values()].find((row) => row.entity === "ITEM");
  item.analysisStatus = "FAILED";
  item.matchingStatus = "FAILED";
  item.processingError = "previous failure";
  const original = aws.rekognition.send;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  aws.rekognition.send = async (command) => {
    await gate;
    return original(command);
  };
  try {
    const response = await request(app)
      .post(`/api/items/${item.itemId}/retry`)
      .send({})
      .expect(202)
      .expect("Content-Type", /application\/json/);
    assert.deepEqual(response.body, { message: "Cloud processing queued" });
    assert.equal(records.get(item.itemId).matchingStatus, "PENDING");
    assert.ok(
      ["PENDING", "PROCESSING"].includes(
        records.get(item.itemId).analysisStatus,
      ),
    );
    assert.equal(records.get(item.itemId).processingError, "");
  } finally {
    release();
    for (
      let i = 0;
      i < 30 && records.get(item.itemId).matchingStatus !== "COMPLETE";
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    aws.rekognition.send = original;
  }
});
test("claim requires token and correct answer, locks the pair, then returns both items", async () => {
  records.clear();
  records.set("lost", {
    ...fields,
    itemId: "lost",
    entity: "ITEM",
    type: "LOST",
    status: "POSSIBLE_MATCH",
    ownershipAnswerHash: (await import("../utils/security.js")).hashSecret(
      "AB",
    ),
  });
  records.set("found", {
    itemId: "found",
    entity: "ITEM",
    type: "FOUND",
    status: "POSSIBLE_MATCH",
  });
  records.set("m", {
    itemId: "m",
    entity: "MATCH",
    lostId: "lost",
    foundId: "found",
    status: "POSSIBLE_MATCH",
  });
  const start = await request(app)
    .post("/api/claims/lost")
    .send({ matchId: "m" })
    .expect(200);
  const claimToken = start.body.claimToken;
  await request(app)
    .post("/api/claims/lost/verify")
    .send({ matchId: "m", answer: "AB" })
    .expect(403);
  await request(app)
    .post("/api/claims/lost/verify")
    .send({ matchId: "m", claimToken, answer: "wrong" })
    .expect(403);
  await request(app)
    .post("/api/claims/lost/returned")
    .send({ matchId: "m", claimToken })
    .expect(403);
  await request(app)
    .post("/api/claims/lost/verify")
    .send({ matchId: "m", claimToken, answer: "ab" })
    .expect(200);
  assert.equal(records.get("lost").status, "VERIFIED");
  assert.equal(records.get("found").status, "VERIFIED");
  await request(app)
    .post("/api/claims/lost/returned")
    .send({ matchId: "m", claimToken })
    .expect(200);
  assert.equal(records.get("lost").status, "RETURNED");
  assert.equal(records.get("found").status, "RETURNED");
});
test("a competing claim cannot take an already claimed found item", async () => {
  records.clear();
  const { hashSecret } = await import("../utils/security.js");
  for (const id of ["lost-a", "lost-b"])
    records.set(id, {
      itemId: id,
      entity: "ITEM",
      type: "LOST",
      status: "POSSIBLE_MATCH",
      ownershipQuestion: "Initials?",
      ownershipAnswerHash: hashSecret("AB"),
    });
  records.set("found", {
    itemId: "found",
    entity: "ITEM",
    status: "POSSIBLE_MATCH",
  });
  for (const id of ["a", "b"])
    records.set(id, {
      itemId: id,
      entity: "MATCH",
      lostId: `lost-${id}`,
      foundId: "found",
      status: "POSSIBLE_MATCH",
    });
  await request(app)
    .post("/api/claims/lost-a")
    .send({ matchId: "a" })
    .expect(200);
  await request(app)
    .post("/api/claims/lost-b")
    .send({ matchId: "b" })
    .expect(409);
  assert.equal(records.get("b").status, "POSSIBLE_MATCH");
});
test("Rekognition failure records FAILED and does not invoke Lambda", async () => {
  records.clear();
  calls.length = 0;
  records.set("failed", {
    itemId: "failed",
    entity: "ITEM",
    status: "REPORTED",
    imageKey: "lost/test.jpg",
  });
  const original = aws.rekognition.send;
  aws.rekognition.send = async () => {
    throw Object.assign(new Error("test failure"), {
      name: "AccessDeniedException",
    });
  };
  await aws.processItem(records.get("failed"));
  aws.rekognition.send = original;
  assert.equal(records.get("failed").analysisStatus, "FAILED");
  assert.ok(!calls.includes("InvokeCommand"));
  assert.ok(
    records.get("failed").processingError.includes("AccessDeniedException"),
  );
});
