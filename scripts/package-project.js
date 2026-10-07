import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = createWriteStream(path.join(root, "..", "FindBack.zip"));
const archive = archiver("zip", { zlib: { level: 9 } });
archive.on("error", (err) => {
  throw err;
});
const closed = new Promise((resolve, reject) => {
  output.on("close", resolve);
  output.on("error", reject);
});
archive.pipe(output);
archive.glob(
  "**/*",
  {
    cwd: root,
    dot: true,
    ignore: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.env",
      "**/.env.*",
      "**/*.log",
      ".git/**",
    ],
  },
  { prefix: "findback" },
);
archive.file(path.join(root, "backend", ".env.example"), {
  name: "findback/backend/.env.example",
});
await archive.finalize();
await closed;
console.log(
  "Created ../FindBack.zip with source, guides, lockfiles and Lambda deployment package. No credentials or generated dependency folders.",
);
