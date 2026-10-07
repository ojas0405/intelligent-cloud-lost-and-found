import "./config/env.js";
import { app } from "./app.js";
const port = Number(process.env.PORT || 3001);
app.listen(port, "127.0.0.1", () =>
  console.log(
    `FindBack API listening at http://localhost:${port} · AWS credentials stay on the backend`,
  ),
);
