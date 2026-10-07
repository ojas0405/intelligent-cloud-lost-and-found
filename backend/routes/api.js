import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { randomUUID, randomBytes } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import * as aws from "../services/aws.js";
import { validateReport } from "../utils/validation.js";
import { hashSecret, verifySecret, publicItem } from "../utils/security.js";
export const api = Router();
const cloud = (req, res, next) => {
  try {
    aws.requireCloud();
    next();
  } catch (e) {
    next(e);
  }
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 15 },
  fileFilter: (req, file, cb) =>
    cb(
      ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)
        ? null
        : Object.assign(new Error("Upload JPG, PNG or WEBP images only."), {
            status: 400,
          }),
      true,
    ),
});
const jobs = new Set();
function queue(item) {
  if (jobs.has(item.itemId)) return;
  jobs.add(item.itemId);
  aws.processItem(item).finally(() => jobs.delete(item.itemId));
}
const requireItem = async (id) => {
  const item = await aws.get(id);
  if (!item || item.entity !== "ITEM")
    throw Object.assign(new Error("Item not found"), { status: 404 });
  return item;
};
api.get("/cloud/status", async (req, res) => res.json(await aws.cloudStatus()));
api.get("/items", async (req, res) => {
  if (!aws.configured()) return res.json({ items: [], configured: false });
  let items = (await aws.scan("ITEM")).map(publicItem);
  const q = String(req.query.search || "").toLowerCase();
  if (q)
    items = items.filter((i) =>
      [i.itemName, i.description, i.category, i.location].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  const filter = req.query.filter;
  if (["LOST", "FOUND"].includes(filter))
    items = items.filter((i) => i.type === filter);
  if (filter === "MATCHED")
    items = items.filter(
      (i) => i.bestMatchScore > 0 && i.status !== "RETURNED",
    );
  if (filter === "RETURNED")
    items = items.filter((i) => i.status === "RETURNED");
  items.sort((a, b) =>
    req.query.sort === "score"
      ? (b.bestMatchScore || 0) - (a.bestMatchScore || 0)
      : req.query.sort === "oldest"
        ? a.createdAt.localeCompare(b.createdAt)
        : b.createdAt.localeCompare(a.createdAt),
  );
  res.json({ items, configured: true });
});
api.post("/items/:type", cloud, upload.single("image"), async (req, res) => {
  const type = req.params.type.toUpperCase();
  if (!["LOST", "FOUND"].includes(type))
    return res.status(400).json({ error: "Choose lost or found" });
  const values = validateReport(req.body);
  if (!req.file)
    return res.status(400).json({ error: "An item image is required" });
  let body;
  try {
    const image = sharp(req.file.buffer, {
      limitInputPixels: 25000000,
      animated: false,
    });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format)) throw new Error();
    body = await image
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch {
    return res.status(400).json({
      error: "Invalid image. Use a readable JPG, PNG or WEBP up to 5 MB.",
    });
  }
  const itemId = randomUUID(),
    imageKey = `${type.toLowerCase()}/${itemId}.jpg`,
    now = new Date().toISOString();
  const { ownershipAnswer, ...fields } = values;
  const item = {
    ...fields,
    itemId,
    entity: "ITEM",
    type,
    imageKey,
    detectedLabels: [],
    ownershipAnswerHash: ownershipAnswer
      ? hashSecret(ownershipAnswer)
      : undefined,
    status: "REPORTED",
    analysisStatus: "PENDING",
    matchingStatus: "PENDING",
    createdAt: now,
    updatedAt: now,
    bestMatchScore: 0,
  };
  await aws.upload(imageKey, body);
  try {
    await aws.put(item);
  } catch (e) {
    await aws.deleteImage(imageKey).catch(() => {});
    throw e;
  }
  await aws
    .activity(itemId, "S3", "Image stored in private Amazon S3")
    .catch(() => {});
  await aws.activity(itemId, "DynamoDB", "Item record created").catch(() => {});
  queue(item);
  res.status(202).json({ item: publicItem(item) });
});
api.get("/items/:id", cloud, async (req, res) =>
  res.json({ item: publicItem(await requireItem(req.params.id)) }),
);
api.get("/items/:id/image-url", cloud, async (req, res) => {
  const item = await requireItem(req.params.id);
  res.json({ url: await aws.imageUrl(item.imageKey), expiresIn: 300 });
});
api.post("/items/:id/retry", cloud, async (req, res) => {
  const item = await requireItem(req.params.id);
  if (["CLAIM_REQUESTED", "VERIFIED", "RETURNED"].includes(item.status))
    return res.status(409).json({ error: "Recovery is already in progress" });
  if (!jobs.has(item.itemId)) {
    // Commit pending states before acknowledging so the frontend cannot read
    // a previous FAILED flag and stop polling this new attempt prematurely.
    await aws.update(item.itemId, {
      analysisStatus: "PENDING",
      matchingStatus: "PENDING",
      processingError: "",
    });
    queue(item);
  }
  res.status(202).json({ message: "Cloud processing queued" });
});
api.delete("/items/:id", cloud, async (req, res) => {
  const item = await requireItem(req.params.id);
  if (jobs.has(item.itemId))
    return res
      .status(409)
      .json({ error: "Wait for processing to finish before deleting." });
  const matches = (await aws.scan("MATCH")).filter(
    (m) => m.lostId === item.itemId || m.foundId === item.itemId,
  );
  if (matches.some((m) => ["CLAIM_REQUESTED", "VERIFIED"].includes(m.status)))
    return res
      .status(409)
      .json({ error: "Cannot delete an item during a claim." });
  await aws.deleteImage(item.imageKey);
  for (const match of matches) await aws.remove(match.itemId);
  await aws.remove(item.itemId);
  const remaining = await aws.scan("MATCH");
  for (const id of new Set(
    matches.map((m) => (m.lostId === item.itemId ? m.foundId : m.lostId)),
  )) {
    const other = await aws.get(id);
    if (!other) continue;
    const active = remaining.filter(
      (m) => (m.lostId === id || m.foundId === id) && m.status !== "RETURNED",
    );
    await aws.update(id, {
      matchedItemIds: active.map((m) =>
        m.lostId === id ? m.foundId : m.lostId,
      ),
      bestMatchScore: Math.max(0, ...active.map((m) => m.score)),
      status:
        other.status === "RETURNED"
          ? "RETURNED"
          : active.length
            ? "POSSIBLE_MATCH"
            : "ANALYZED",
    });
  }
  res.status(204).end();
});
async function hydratedMatches(id) {
  const [matches, items] = await Promise.all([
    aws.scan("MATCH"),
    aws.scan("ITEM"),
  ]);
  const map = new Map(items.map((i) => [i.itemId, publicItem(i)]));
  return matches
    .filter(
      (m) =>
        (!id || m.lostId === id || m.foundId === id) &&
        map.has(m.lostId) &&
        map.has(m.foundId) &&
        (m.status === "RETURNED" ||
          (map.get(m.lostId).status !== "RETURNED" &&
            map.get(m.foundId).status !== "RETURNED")),
    )
    .map((m) => ({
      ...publicItem(m),
      lost: map.get(m.lostId),
      found: map.get(m.foundId),
    }))
    .sort((a, b) => b.score - a.score);
}
api.get("/matches", async (req, res) =>
  res.json({ matches: aws.configured() ? await hydratedMatches() : [] }),
);
api.get("/matches/:itemId", cloud, async (req, res) =>
  res.json({ matches: await hydratedMatches(req.params.itemId) }),
);
api.get("/activity", async (req, res) =>
  res.json({
    activity: aws.configured()
      ? (await aws.scan("ACTIVITY"))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 100)
      : [],
  }),
);
api.get("/dashboard/stats", async (req, res) => {
  const [items, matches] = aws.configured()
    ? await Promise.all([aws.scan("ITEM"), aws.scan("MATCH")])
    : [[], []];
  const lost = items.filter((i) => i.type === "LOST"),
    found = items.filter((i) => i.type === "FOUND"),
    recovered = lost.filter((i) => i.status === "RETURNED").length;
  const counts = (rows, key) =>
    Object.entries(
      rows.reduce(
        (acc, i) => ({ ...acc, [i[key]]: (acc[i[key]] || 0) + 1 }),
        {},
      ),
    )
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  const eligible = new Set(
    items.filter((i) => i.status !== "RETURNED").map((i) => i.itemId),
  );
  res.json({
    lost: lost.length,
    found: found.length,
    matches: matches.filter(
      (m) =>
        m.status !== "RETURNED" &&
        eligible.has(m.lostId) &&
        eligible.has(m.foundId),
    ).length,
    recovered,
    recoveryRate: lost.length
      ? Math.round((recovered / lost.length) * 1000) / 10
      : 0,
    locations: counts(lost, "location"),
    categories: counts(lost, "category"),
  });
});
api.use(
  "/claims",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 25,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many claim attempts. Try again in 15 minutes." },
  }),
);
const claimMatch = async (req) => {
  if (typeof req.body.matchId !== "string")
    throw Object.assign(new Error("A matchId is required"), { status: 400 });
  const m = await aws.get(req.body.matchId);
  if (!m || m.entity !== "MATCH" || m.lostId !== req.params.itemId)
    throw Object.assign(new Error("Match not found for this lost item"), {
      status: 404,
    });
  return m;
};
api.post("/claims/:itemId/cancel", cloud, async (req, res) => {
  const match = await claimMatch(req);
  if (
    match.status !== "CLAIM_REQUESTED" ||
    (match.claimExpiresAt >= Date.now() &&
      !verifySecret(req.body.claimToken, match.claimTokenHash))
  )
    return res.status(403).json({
      error: "Only the claim session holder can cancel an active claim.",
    });
  await aws.transitionPair(match, "CLAIM_REQUESTED", "POSSIBLE_MATCH", {
    claimTokenHash: "",
    claimExpiresAt: 0,
  });
  res.json({ message: "Claim released. You can request it again." });
});
api.post("/claims/:itemId", cloud, async (req, res) => {
  const match = await claimMatch(req),
    item = await requireItem(req.params.itemId),
    found = await requireItem(match.foundId);
  if (!item.ownershipAnswerHash)
    return res.status(409).json({
      error:
        "No ownership question was set. A campus coordinator must verify this item in person; automatic return is unavailable.",
    });
  if (
    ["VERIFIED", "RETURNED"].includes(item.status) ||
    ["VERIFIED", "RETURNED"].includes(found.status) ||
    match.status !== "POSSIBLE_MATCH"
  )
    return res
      .status(409)
      .json({ error: "This match is already claimed or returned." });
  const token = randomBytes(32).toString("hex");
  await aws.transitionPair(match, "POSSIBLE_MATCH", "CLAIM_REQUESTED", {
    claimTokenHash: hashSecret(token),
    claimExpiresAt: Date.now() + 15 * 60 * 1000,
  });
  res.json({ question: item.ownershipQuestion, claimToken: token });
});
api.post("/claims/:itemId/verify", cloud, async (req, res) => {
  const match = await claimMatch(req),
    item = await requireItem(req.params.itemId);
  if (
    match.status !== "CLAIM_REQUESTED" ||
    match.claimExpiresAt < Date.now() ||
    !verifySecret(req.body.claimToken, match.claimTokenHash)
  )
    return res.status(403).json({ error: "Claim session invalid or expired." });
  if (!verifySecret(req.body.answer, item.ownershipAnswerHash))
    return res
      .status(403)
      .json({ error: "Verification failed. The answer was not correct." });
  await aws.transitionPair(match, "CLAIM_REQUESTED", "VERIFIED");
  await aws.activity(item.itemId, "Recovery", "Ownership verified");
  res.json({ message: "Ownership verified." });
});
api.post("/claims/:itemId/returned", cloud, async (req, res) => {
  const match = await claimMatch(req);
  if (
    match.status !== "VERIFIED" ||
    match.claimExpiresAt < Date.now() ||
    !verifySecret(req.body.claimToken, match.claimTokenHash)
  )
    return res
      .status(403)
      .json({ error: "A valid verified claim session is required." });
  await aws.transitionPair(match, "VERIFIED", "RETURNED");
  await aws.activity(
    req.params.itemId,
    "Recovery",
    "Item returned to its owner",
  );
  res.json({ message: "Item marked as returned." });
});
