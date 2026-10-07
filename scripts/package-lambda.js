import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = createWriteStream(
  path.join(root, "lambda", "findback-match.zip"),
);
const archive = archiver("zip", { zlib: { level: 9 } });
archive.on("error", (err) => {
  throw err;
});
const closed = new Promise((resolve, reject) => {
  output.on("close", resolve);
  output.on("error", reject);
});
archive.pipe(output);
archive.directory(path.join(root, "lambda", "matchItems"), false);
await archive.finalize();
await closed;
console.log(
  "Created lambda/findback-match.zip. Handler: index.handler. Runtime: Node.js 24.x.",
);
