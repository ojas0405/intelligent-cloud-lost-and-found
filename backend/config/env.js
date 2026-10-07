import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Resolve relative to this module, not the directory used to launch Node.
// Existing process environment variables retain dotenv's normal precedence.
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
