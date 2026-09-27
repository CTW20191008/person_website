import { afterAll, afterEach, beforeEach, describe, it } from "vitest";
import { loadContent } from "../../src/content/load-content.js";
import { publish } from "../../src/publish/publish.js";
import { resolveRoute } from "../../src/present/render-site.js";
import type { PublishSuccess } from "../../src/publish/publish.js";
import { makePiecesDir } from "../helpers/pieces-dir.js";
import { beginCase, review, writeReviewReport } from "../helpers/review.js";

const cleanups: Array<() => void> = [];

beforeEach(() => {
  beginCase();
});

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups.length = 0;
});

afterAll(() => {
  writeReviewReport();
});

function site(files: Record<string, string>): PublishSuccess {
  const made = makePiecesDir(files);
  cleanups.push(made.cleanup);
  const result = publish(loadContent(made.dir));
  if (!result.ok) throw new Error(result.errors.map((error) => error.code).join(","));
  return result;
}

function piece(
  slug: string,
  overrides: Record<string, string | string[] | undefined> = {},
  body = "正文",
): Record<string, string> {
  const fields: Record<string, string | string[] | undefined> = {
    slug,
    title: slug,
    summary: `${slug} 的摘要`,
    kind: "essay",
    status: "published",
    publishedAt: "2026-09-01",
    category: "learning",
    ...overrides,
  };
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${JSON.stringify(item)}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---");
  if (body.length > 0) lines.push(body);
  return { [`content/pieces/${slug}.md`]: `${lines.join("\n")}\n` };
}

const identity = `---
name: 样例
now: 正在读一本书
---
关于正文里的句子
`;
const topics = `topics:
  - id: learning
    title: 学习
  - id: writing
    title: 写作
`;

function bodyOf(result: PublishSuccess, pathname: string): string {
  const route = resolveRoute(result, pathname, { siteUrl: "https://example.com" });
  return "body" in route ? route.body : "";
}

describe("render site", () => {
  it("shows the person, the latest notes, and hides drafts", () => {
    const result = site({
      "config/identity.md": identity,
      "config/topics.yml": topics,
      ...piece("how-to-read", { title: "如何阅读", publishedAt: "2026-09-02" }, "先写一段 **重点**。"),
      ...piece("older-note", { title: "较早的笔记", kind: "note", publishedAt: "2026-08-01" }),
      ...piece("wip", { title: "不要公开", status: "draft" }),
    });
    const home = bodyOf(result, "/");

    review({
      content: "首页显示名字、近况和已发布记录，不显示草稿",
      expected: {
        showsName: true,
        showsNow: true,
        showsPublished: true,
        hidesDraft: true,
        newerBeforeOlder: true,
      },
      output: {
        showsName: home.includes("样例"),
        showsNow: home.includes("正在读一本书"),
        showsPublished: home.includes("如何阅读"),
        hidesDraft: !home.includes("不要公开"),
        newerBeforeOlder: home.indexOf("如何阅读") < home.indexOf("较早的笔记"),
      },
    });
  });

  it("limits the home page to ten pieces", () => {
    const files: Record<string, string> = {
      "config/identity.md": identity,
      "config/topics.yml": topics,
    };
    for (let day = 1; day <= 11; day += 1) {
      const slug = `piece-${String(day).padStart(2, "0")}`;
      Object.assign(
        files,
        piece(slug, { title: slug, publishedAt: `2026-08-${String(day).padStart(2, "0")}` }),
      );
    }
    const result = site(files);
    const home = bodyOf(result, "/");
    const archive = bodyOf(result, "/archive");

    review({
      content: "首页最多十篇，其余仍在时间线",
      expected: { homeHasNewest: true, homeHidesOldest: true, archiveHasOldest: true },
      output: {
        homeHasNewest: home.includes("piece-11"),
        homeHidesOldest: !home.includes("piece-01"),
        archiveHasOldest: archive.includes("piece-01"),
      },
    });
  });

  it("renders about, now, a topic, and a piece", () => {
    const result = site({
      "config/identity.md": identity,
      "config/topics.yml": topics,
      ...piece("how-to-read", { title: "如何阅读" }, "先写一段 **重点**。"),
      "content/media/shore.svg": "<svg xmlns='http://www.w3.org/2000/svg'/>",
      ...piece("shore", { title: "岸边", kind: "photo", media: ["shore.svg"] }, ""),
    });

    review({
      content: "关于、近况、栏目和单篇都能读到对应内容",
      expected: {
        about: true,
        now: true,
        topic: true,
        unusedTopic: 404,
        pieceHtml: true,
        photo: true,
      },
      output: {
        about: bodyOf(result, "/about").includes("关于正文里的句子"),
        now: bodyOf(result, "/now").includes("正在读一本书"),
        topic: bodyOf(result, "/topics/learning").includes("如何阅读"),
        unusedTopic: resolveRoute(result, "/topics/writing").status,
        pieceHtml: bodyOf(result, "/how-to-read").includes("<strong>重点</strong>"),
        photo: bodyOf(result, "/shore").includes("/media/shore.svg"),
      },
    });
  });

  it("redirects a published alias and answers unknown paths with 404", () => {
    const result = site({
      "config/identity.md": identity,
      "config/topics.yml": topics,
      ...piece("how-to-read", { aliases: ["old-name"] }),
    });
    const alias = resolveRoute(result, "/old-name");
    const missing = resolveRoute(result, "/missing");

    review({
      content: "已发布别名永久跳转，未知地址是 404",
      expected: { alias: { status: 301, location: "/how-to-read" }, missing: 404 },
      output: {
        alias: alias.status === 301 ? { status: alias.status, location: alias.location } : { status: alias.status },
        missing: missing.status,
      },
    });
  });

  it("writes an absolute feed and sitemap without drafts or unused topics", () => {
    const result = site({
      "config/identity.md": identity,
      "config/topics.yml": topics,
      ...piece("how-to-read", { title: "如何阅读", aliases: ["old-name"] }),
      ...piece("wip", { title: "不要公开", status: "draft" }),
    });
    const feed = bodyOf(result, "/feed.xml");
    const sitemap = bodyOf(result, "/sitemap.xml");

    review({
      content: "RSS 和站点地图使用绝对地址，不含草稿、别名和空栏目",
      expected: {
        feedTitle: true,
        feedLink: true,
        feedHidesDraft: true,
        pieceLoc: true,
        aliasLoc: false,
        emptyTopic: false,
      },
      output: {
        feedTitle: feed.includes("如何阅读"),
        feedLink: feed.includes("https://example.com/how-to-read"),
        feedHidesDraft: !feed.includes("不要公开"),
        pieceLoc: sitemap.includes("https://example.com/how-to-read"),
        aliasLoc: sitemap.includes("https://example.com/old-name"),
        emptyTopic: sitemap.includes("https://example.com/topics/writing"),
      },
    });
  });

  it("still serves now when the note is empty", () => {
    const result = site({
      "config/identity.md": "---\nname: 样例\n---\n关于\n",
      "config/topics.yml": "topics: []\n",
    });
    const now = resolveRoute(result, "/now");

    review({
      content: "近况为空时页面仍然存在",
      expected: 200,
      output: now.status,
    });
  });
});
