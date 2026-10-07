import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export const normalize = (value) =>
  String(value).trim().toLowerCase().replace(/\s+/g, " ");
export function hashSecret(value) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(normalize(value), salt, 32).toString("hex")}`;
}
export function verifySecret(value, hash) {
  if (!hash) return false;
  const [salt, expected] = hash.split(":");
  const actual = scryptSync(normalize(value), salt, 32);
  const buffer = Buffer.from(expected, "hex");
  return actual.length === buffer.length && timingSafeEqual(actual, buffer);
}
export function publicItem(item) {
  const { ownershipAnswerHash, claimTokenHash, identifyingFeature, ...safe } =
    item;
  return {
    ...safe,
    matchedItemIds:
      item.matchedItemIds instanceof Set
        ? [...item.matchedItemIds]
        : item.matchedItemIds || [],
  };
}
