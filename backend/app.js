import express from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { api } from "./routes/api.js";
export const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "16kb" }));
app.use(
  rateLimit({
    windowMs: 60000,
    limit: 240,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again shortly." },
  }),
);
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", app: "FindBack" }),
);
app.use("/api", api);
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => {
  const validation = err.status && err.status < 500;
  const status =
    err.code === "LIMIT_FILE_SIZE"
      ? 413
      : err.name === "MulterError"
        ? 400
        : err.name === "TransactionCanceledException"
          ? 409
          : err.status || 502;
  res
    .status(status)
    .json({
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? "Image must be 5 MB or smaller."
          : validation || err.status === 503
            ? err.message
            : err.name === "TransactionCanceledException"
              ? "This claim changed. Refresh and try again."
              : `Cloud request failed (${err.name || "Error"}). Check backend configuration and AWS permissions.`,
    });
});
