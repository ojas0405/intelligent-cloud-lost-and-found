export const categories = [
  "Electronics",
  "Wallet",
  "Keys",
  "Bag",
  "Bottle",
  "ID Card",
  "Clothing",
  "Accessories",
  "Books",
  "Other",
];
export const locations = [
  "Library",
  "CSE Block",
  "Cafeteria",
  "Auditorium",
  "Parking",
  "Lab",
  "Classroom",
  "Hostel",
  "Ground",
  "Other",
];
export function validateReport(body) {
  const clean = {};
  for (const [key, max] of Object.entries({
    itemName: 100,
    description: 1000,
    color: 40,
    location: 50,
    category: 40,
    date: 10,
    time: 5,
    identifyingFeature: 250,
    ownershipQuestion: 250,
    ownershipAnswer: 250,
  })) {
    clean[key] = String(body[key] || "").trim();
    if (clean[key].length > max)
      throw Object.assign(new Error(`${key} is too long`), { status: 400 });
  }
  if (
    !clean.itemName ||
    !clean.description ||
    !clean.color ||
    !categories.includes(clean.category) ||
    !locations.includes(clean.location) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(clean.date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(clean.time) ||
    !Number.isFinite(Date.parse(`${clean.date}T${clean.time}:00Z`)) ||
    new Date(`${clean.date}T00:00:00Z`).toISOString().slice(0, 10) !==
      clean.date
  )
    throw Object.assign(
      new Error(
        "Enter a name, description, color, valid category, location, date and time.",
      ),
      { status: 400 },
    );
  if (Boolean(clean.ownershipQuestion) !== Boolean(clean.ownershipAnswer))
    throw Object.assign(
      new Error(
        "Provide both an ownership question and answer, or leave both empty.",
      ),
      { status: 400 },
    );
  return clean;
}
