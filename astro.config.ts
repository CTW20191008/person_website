import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import { formatSiteLog, planLocalBuild } from "./src/present/local-build.ts";
import { loadPublishedSite, siteOrigin, siteRoot } from "./src/present/site.ts";

const plan = planLocalBuild(siteRoot());
if (!plan.proceed) {
  const lines = formatSiteLog(plan);
  for (const line of lines) console.error(line);
  throw new Error(lines[0] ?? "发布停住");
}
if (process.env.SITE_CHECKED !== "1") {
  for (const line of formatSiteLog(plan)) console.error(line);
}
const published = loadPublishedSite();
const mediaDir = path.join(siteRoot(), "content", "media");

function insideMedia(relative: string): string | undefined {
  if (relative.includes("..")) return undefined;
  const root = path.resolve(mediaDir);
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return undefined;
  if (!existsSync(file) || !statSync(file).isFile()) return undefined;
  return file;
}

export default defineConfig({
  site: siteOrigin,
  redirects: Object.fromEntries(
    published.redirects.map((item) => [
      `/${item.from}`,
      { status: 301 as const, destination: item.to },
    ]),
  ),
  vite: {
    plugins: [
      {
        name: "site-media",
        configureServer(server) {
          server.middlewares.use("/media", (req, res, next) => {
            const raw = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
            const file = insideMedia(raw.replace(/^\/+/, ""));
            if (!file) {
              next();
              return;
            }
            const type =
              path.extname(file) === ".svg"
                ? "image/svg+xml"
                : path.extname(file) === ".png"
                  ? "image/png"
                  : "application/octet-stream";
            res.setHeader("Content-Type", type);
            createReadStream(file).pipe(res);
          });
        },
      },
    ],
  },
  integrations: [
    {
      name: "copy-media",
      hooks: {
        "astro:build:done": ({ dir }) => {
          if (!existsSync(mediaDir)) return;
          const out = path.join(fileURLToPath(dir), "media");
          cpSync(mediaDir, out, { recursive: true });
        },
      },
    },
  ],
});
