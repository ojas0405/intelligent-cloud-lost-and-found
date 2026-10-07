export const weights = {
  category: 25,
  labels: 25,
  color: 15,
  description: 15,
  location: 10,
  time: 10,
};
const norm = (x) =>
  String(x || "")
    .trim()
    .toLowerCase();
const tokens = (x) =>
  new Set(
    norm(x)
      .match(/[a-z0-9]+/g)
      ?.filter(
        (w) =>
          ![
            "a",
            "the",
            "and",
            "with",
            "my",
            "at",
            "in",
            "on",
            "of",
            "item",
            "lost",
            "found",
          ].includes(w),
      ) || [],
  );
const overlap = (a, b) => {
  const union = new Set([...a, ...b]);
  return union.size ? [...a].filter((x) => b.has(x)).length / union.size : 0;
};
const nearby = [
  ["Library", "CSE Block"],
  ["CSE Block", "Lab"],
  ["Cafeteria", "Auditorium"],
  ["Parking", "Ground"],
  ["Hostel", "Ground"],
  ["Lab", "Classroom"],
];
export function scoreItems(a, b) {
  const labels = (x) =>
    new Set(
      (x.detectedLabels || [])
        .map((l) => norm(typeof l === "string" ? l : l.Name))
        .filter((l) => !["person", "human", "indoors", "outdoors"].includes(l)),
    );
  const t = (x) => Date.parse(`${x.date}T${x.time || "12:00"}:00Z`);
  const hours = Math.abs(t(a) - t(b)) / 3600000;
  const sameLocation = a.location !== "Other" && a.location === b.location;
  const near = nearby.some(
    (p) => p.includes(a.location) && p.includes(b.location),
  );
  const factors = {
    category: a.category !== "Other" && a.category === b.category ? 1 : 0,
    labels: overlap(labels(a), labels(b)),
    color: norm(a.color) && norm(a.color) === norm(b.color) ? 1 : 0,
    description: overlap(
      tokens(`${a.itemName} ${a.description}`),
      tokens(`${b.itemName} ${b.description}`),
    ),
    location: sameLocation ? 1 : near ? 0.7 : 0,
    time: Number.isFinite(hours)
      ? hours <= 2
        ? 1
        : hours <= 24
          ? 0.7
          : hours <= 72
            ? 0.4
            : 0
      : 0,
  };
  const names = {
    category: "Same category",
    labels: "Image label overlap",
    color: "Same color",
    description: "Description keyword overlap",
    location: sameLocation
      ? "Same location"
      : near
        ? "Nearby campus locations"
        : "Location proximity",
    time: "Date and time closeness",
  };
  const explanation = Object.entries(weights).map(([signal, max]) => ({
    signal,
    label: names[signal],
    points: Math.round(factors[signal] * max * 10) / 10,
    max,
  }));
  return {
    score: Math.round(explanation.reduce((s, x) => s + x.points, 0)),
    explanation,
  };
}
