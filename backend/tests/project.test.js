import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../app.js";
import { scoreItems } from "../../lambda/matchItems/scoring.js";
import { validateReport } from "../utils/validation.js";
import { hashSecret, verifySecret, publicItem } from "../utils/security.js";
const item = {
  itemName: "Black water bottle",
  description: "Black steel bottle with blue star sticker",
  category: "Bottle",
  color: "Black",
  location: "Library",
  date: "2026-10-06",
  time: "10:30",
  detectedLabels: [{ Name: "Bottle" }, { Name: "Water Bottle" }],
};
test("identical records earn 100 explainable points", () => {
  const result = scoreItems(item, item);
  assert.equal(result.score, 100);
  assert.equal(
    result.explanation.reduce((sum, x) => sum + x.points, 0),
    100,
  );
});
test("unrelated records have a low score, matching is symmetric", () => {
  const b = {
    ...item,
    itemName: "Red textbook",
    description: "Mathematics hardcover",
    color: "Red",
    category: "Books",
    location: "Hostel",
    date: "2026-09-01",
    detectedLabels: [{ Name: "Book" }],
  };
  assert.equal(scoreItems(item, b).score, 0);
  assert.deepEqual(scoreItems(item, b), scoreItems(b, item));
});
test("missing labels do not earn image similarity or renormalize score", () => {
  const a = { ...item, detectedLabels: [] };
  assert.equal(scoreItems(a, a).score, 75);
});
test("nearby locations have defined points, later dates lose time points", () => {
  assert.equal(
    scoreItems(item, { ...item, location: "CSE Block" }).explanation.find(
      (x) => x.signal === "location",
    ).points,
    7,
  );
  assert.equal(scoreItems(item, { ...item, date: "2026-10-12" }).score, 90);
});
test("unsupported dates/categories and incomplete ownership questions are rejected", () => {
  assert.throws(() => validateReport({ ...item, date: "2026-02-30" }));
  assert.throws(() => validateReport({ ...item, category: "Fake" }));
  assert.throws(() =>
    validateReport({ ...item, ownershipQuestion: "Which sticker?" }),
  );
  assert.equal(validateReport(item).itemName, item.itemName);
});
test("salted ownership hash verifies normalized answer without exposing it", () => {
  const a = hashSecret("Blue star"),
    b = hashSecret("Blue star");
  assert.notEqual(a, b);
  assert.ok(verifySecret(" BLUE  STAR ", a));
  assert.equal(verifySecret("red star", a), false);
  assert.equal(a.includes("Blue"), false);
  assert.equal(
    publicItem({
      ...item,
      ownershipAnswerHash: a,
      claimTokenHash: b,
      identifyingFeature: "private",
    }).ownershipAnswerHash,
    undefined,
  );
});
test("API health responds and unknown routes use 404", async () => {
  await request(app).get("/api/health").expect(200);
  await request(app).get("/api/no-route").expect(404);
});
test("missing AWS serves empty actual records and zero statistics", async () => {
  if (process.env.AWS_S3_BUCKET_NAME) return;
  for (const path of ["/api/items", "/api/matches", "/api/activity"])
    await request(app).get(path).expect(200);
  const r = await request(app).get("/api/dashboard/stats").expect(200);
  assert.equal(r.body.lost, 0);
  assert.equal(r.body.recoveryRate, 0);
  const cloud = await request(app).get("/api/cloud/status").expect(200);
  assert.equal(cloud.body.S3, "Not Configured");
  assert.equal(cloud.body.Lambda, "Not Configured");
});
test("cloud mutations and claim routes safely fail with 503 without AWS", async () => {
  if (process.env.AWS_S3_BUCKET_NAME) return;
  for (const path of [
    "/api/items/lost",
    "/api/items/found",
    "/api/items/demo/retry",
    "/api/claims/demo",
    "/api/claims/demo/verify",
    "/api/claims/demo/returned",
    "/api/claims/demo/cancel",
  ])
    await request(app).post(path).send({}).expect(503);
  await request(app).delete("/api/items/demo").expect(503);
  await request(app).get("/api/items/demo/image-url").expect(503);
});
