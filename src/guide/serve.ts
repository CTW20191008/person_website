import path from "node:path";
import { createSiteServer } from "./server.js";

const root = process.env.SITE_ROOT
  ? path.resolve(process.env.SITE_ROOT)
  : path.resolve("private/site");
const port = Number(process.env.PORT ?? 4321);
const siteUrl = process.env.SITE_ORIGIN ?? `http://localhost:${port}`;

const server = createSiteServer(root, siteUrl);
server.listen(port, () => {
  console.log(`站点已打开 ${siteUrl}`);
});
