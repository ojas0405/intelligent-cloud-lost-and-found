import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const findings = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      ["node_modules", "dist", ".git"].includes(entry.name) ||
      entry.name === ".env" ||
      entry.name.endsWith(".zip") ||
      entry.name.endsWith(".log")
    )
      continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|jsx|json|md|css|html|example)$/.test(file)) {
      const text = fs.readFileSync(file, "utf8");
      if (
        /(?:AKIA|ASIA)[A-Z0-9]{16}/.test(text) ||
        /AWS_SECRET_ACCESS_KEY\s*=\s*(?!YOUR_|\s*$)[A-Za-z0-9/+]{35,}/m.test(
          text,
        )
      )
        findings.push(path.relative(root, file));
    }
  }
}
walk(root);
if (findings.length) {
  console.error("Potential credentials detected in: " + findings.join(", "));
  process.exitCode = 1;
} else
  console.log(
    "Basic source secret scan passed. Review staged changes before pushing.",
  );
