import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { runLocalBuild } from "./local-build.js";

const root = path.resolve("private/site");
const command = process.argv[2];

if (command !== "dev" && command !== "build") {
  console.error("用法：npm run dev:local 或 npm run build:local");
  process.exit(1);
}

if (!existsSync(path.join(root, "config", "identity.md"))) {
  console.error("缺少 private/site/config/identity.md");
  console.error(
    "本机构建还需要 private/site/config/topics.yml、private/site/content/pieces/ 和 private/site/content/media/。这些文件不进入公开仓库。",
  );
  process.exit(1);
}

const ok = runLocalBuild(root, (siteRoot) => {
  const result = spawnSync(
    process.execPath,
    [path.resolve("node_modules/astro/bin/astro.mjs"), command],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        SITE_ROOT: siteRoot,
        SITE_CHECKED: "1",
        ASTRO_TELEMETRY_DISABLED: "1",
      },
    },
  );
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
});

if (!ok) process.exit(1);
