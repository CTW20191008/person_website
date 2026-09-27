import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import { loadContent } from "../content/load-content.js";
import type { IdentityLink, Topic } from "../content/types.js";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SiteSettings = {
  name: string;
  now: string;
  body: string;
  topics: Topic[];
  topicsReadable: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

function existingLinks(rootDir: string): IdentityLink[] {
  const file = path.join(rootDir, "config", "identity.md");
  if (!existsSync(file)) return [];
  try {
    const parsed = matter(readFileSync(file, "utf8"), {
      engines: {
        yaml: {
          parse: (input: string) =>
            (yaml.load(input, { schema: yaml.CORE_SCHEMA }) ?? {}) as Record<string, unknown>,
        },
      },
    });
    const links = parsed.data.links;
    if (!Array.isArray(links)) return [];
    const result: IdentityLink[] = [];
    for (const item of links) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const url = typeof record.url === "string" ? record.url.trim() : "";
      if (label === "" || url === "") return [];
      result.push({ label, url });
    }
    return result;
  } catch {
    return [];
  }
}

export function readSettings(rootDir: string): SiteSettings {
  const catalog = loadContent(rootDir);
  const topicsBroken = catalog.errors.some((item) => item.code.startsWith("topics-"));
  return {
    name: catalog.identity?.name ?? "",
    now: catalog.identity?.now ?? "",
    body: catalog.identity?.body ?? "",
    topics: catalog.topics,
    topicsReadable: !topicsBroken,
  };
}

export function saveIdentity(
  rootDir: string,
  input: { name: string; now: string; body: string },
): { ok: true } | { ok: false; message: string } {
  const name = input.name.trim();
  if (name === "") return { ok: false, message: "请填写名字。" };
  const links = existingLinks(rootDir);
  const linkBlock =
    links.length === 0
      ? ""
      : `links:\n${links
          .map((item) => `  - label: ${yamlQuote(item.label)}\n    url: ${yamlQuote(item.url)}`)
          .join("\n")}\n`;
  mkdirSync(path.join(rootDir, "config"), { recursive: true });
  writeFileSync(
    path.join(rootDir, "config", "identity.md"),
    `---\nname: ${yamlQuote(name)}\nnow: ${yamlQuote(input.now.trim())}\n${linkBlock}---\n\n${input.body.trim()}\n`,
  );
  return { ok: true };
}

export function addTopic(
  rootDir: string,
  id: string,
  title: string,
): { ok: true } | { ok: false; message: string } {
  const topicId = id.trim();
  const topicTitle = title.trim();
  if (!ID_PATTERN.test(topicId)) {
    return { ok: false, message: "栏目编号只能使用小写英文、数字和连字符。" };
  }
  if (topicTitle === "") return { ok: false, message: "请填写栏目名称。" };
  const current = readSettings(rootDir);
  if (!current.topicsReadable) {
    return { ok: false, message: "现有栏目词表无法读取，没有改动。" };
  }
  if (current.topics.some((item) => item.id === topicId)) {
    return { ok: false, message: "这个栏目已经有了。" };
  }
  const topics = [...current.topics, { id: topicId, title: topicTitle }].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  mkdirSync(path.join(rootDir, "config"), { recursive: true });
  writeFileSync(
    path.join(rootDir, "config", "topics.yml"),
    yaml.dump({ topics }, { lineWidth: 120 }),
  );
  return { ok: true };
}

const css = `
  :root { color: #1c1915; background: #f6f1e7; }
  body { margin: 0; font-family: "Iowan Old Style", "Songti SC", Palatino, serif; line-height: 1.6; }
  main { width: min(40rem, calc(100% - 2.5rem)); margin: 0 auto; padding: 2.5rem 0 4rem; }
  h1 { font-weight: 500; letter-spacing: 0.03em; }
  form { display: grid; gap: 1rem; margin: 0 0 2rem; }
  label { display: grid; gap: 0.35rem; }
  button, input, textarea { font: inherit; }
  textarea { min-height: 8rem; }
  button { width: fit-content; padding: 0.35rem 0.9rem; }
  a { color: inherit; }
  .note { color: #5c5346; }
`;

export function renderSettings(settings: SiteSettings, message = ""): string {
  const topics = settings.topics
    .map((item) => `<li>${escapeHtml(item.title)}（${escapeHtml(item.id)}）</li>`)
    .join("");
  const note = message ? `<p>${escapeHtml(message)}</p>` : "";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>设置</title>
  <style>${css}</style>
</head>
<body>
  <main>
    <h1>设置</h1>
    ${note}
    <form method="post" action="/settings">
      <input type="hidden" name="form" value="identity" />
      <label>名字<input name="name" value="${escapeHtml(settings.name)}" required /></label>
      <label>近况<input name="now" value="${escapeHtml(settings.now)}" /></label>
      <label>关于<textarea name="body">${escapeHtml(settings.body)}</textarea></label>
      <button type="submit">保存资料</button>
    </form>
    <h2>栏目</h2>
    ${topics ? `<ul>${topics}</ul>` : `<p class="note">还没有栏目。</p>`}
    <form method="post" action="/settings">
      <input type="hidden" name="form" value="topic" />
      <label>栏目编号<input name="id" required /></label>
      <p class="note">编号用小写英文、数字和连字符，文章里的栏目填这个编号。</p>
      <label>栏目名称<input name="title" required /></label>
      <button type="submit">添加栏目</button>
    </form>
    <p><a href="/">回到首页</a></p>
  </main>
</body>
</html>
`;
}
