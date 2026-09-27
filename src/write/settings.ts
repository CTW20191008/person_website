import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { loadContent } from "../content/load-content.js";
import { findTopic, SLUG_PATTERN, type Topic } from "../content/types.js";

const TOPIC_PRESETS: Topic[] = [
  { id: "learning", title: "学习" },
  { id: "tech", title: "技术" },
  { id: "thinking", title: "思考" },
  { id: "notes", title: "记录" },
];

export type SiteSettings = {
  name: string;
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

export function readSettings(rootDir: string): SiteSettings {
  const catalog = loadContent(rootDir);
  const topicsBroken = catalog.errors.some((item) => item.code.startsWith("topics-"));
  return {
    name: catalog.identity?.name ?? "",
    body: catalog.identity?.body ?? "",
    topics: catalog.topics,
    topicsReadable: !topicsBroken,
  };
}

export function saveIdentity(
  rootDir: string,
  input: { name: string; body: string },
): { ok: true } | { ok: false; message: string } {
  const name = input.name.trim();
  if (name === "") return { ok: false, message: "请填写名字。" };
  mkdirSync(path.join(rootDir, "config"), { recursive: true });
  writeFileSync(
    path.join(rootDir, "config", "identity.md"),
    `---\nname: ${yamlQuote(name)}\n---\n\n${input.body.trim()}\n`,
  );
  return { ok: true };
}

function topicIdFor(title: string, existing: Topic[]): string {
  const preset = TOPIC_PRESETS.find((item) => item.title === title);
  if (preset) return preset.id;
  const typed = title.toLowerCase();
  if (SLUG_PATTERN.test(typed)) return typed;
  let n = 1;
  while (existing.some((item) => item.id === `topic-${n}`)) n += 1;
  return `topic-${n}`;
}

export function addTopic(
  rootDir: string,
  title: string,
): { ok: true } | { ok: false; message: string } {
  const topicTitle = title.trim();
  if (topicTitle === "") return { ok: false, message: "请填写栏目名称。" };
  const current = readSettings(rootDir);
  if (!current.topicsReadable) {
    return { ok: false, message: "现有栏目词表无法读取，没有改动。" };
  }
  const topicId = topicIdFor(topicTitle, current.topics);
  if (findTopic(current.topics, topicId) || findTopic(current.topics, topicTitle)) {
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
  .choices { display: flex; flex-wrap: wrap; gap: 0.75rem; }
  a { color: inherit; }
  .note { color: #5c5346; }
`;

function topicChoice(title: string): string {
  return `<form method="post" action="/settings">
      <input type="hidden" name="form" value="topic" />
      <input type="hidden" name="title" value="${escapeHtml(title)}" />
      <button type="submit">${escapeHtml(title)}</button>
    </form>`;
}

export function renderSettings(settings: SiteSettings, message = ""): string {
  const topics = settings.topics.map((item) => `<li>${escapeHtml(item.title)}</li>`).join("");
  const choices = TOPIC_PRESETS.filter(
    (item) => !findTopic(settings.topics, item.id) && !findTopic(settings.topics, item.title),
  )
    .map((item) => topicChoice(item.title))
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
      <label>关于<textarea name="body">${escapeHtml(settings.body)}</textarea></label>
      <button type="submit">保存资料</button>
    </form>
    <h2>栏目</h2>
    ${topics ? `<ul>${topics}</ul>` : `<p class="note">还没有栏目。</p>`}
    ${choices ? `<p>选择一个栏目</p><div class="choices">${choices}</div>` : ""}
    <form method="post" action="/settings">
      <input type="hidden" name="form" value="topic" />
      <label>其他名称<input name="title" /></label>
      <button type="submit">添加栏目</button>
    </form>
    <p><a href="/">回到首页</a></p>
  </main>
</body>
</html>
`;
}
