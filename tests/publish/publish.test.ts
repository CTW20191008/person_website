import { afterAll, afterEach, beforeEach, describe, it } from "vitest";
import { loadContent } from "../../src/content/load-content.js";
import { publish } from "../../src/publish/publish.js";
import type { PublishResult } from "../../src/publish/publish.js";
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

function site(files: Record<string, string>): string {
  const made = makePiecesDir(files);
  cleanups.push(made.cleanup);
  return made.dir;
}

function piece(
  fields: Record<string, string | string[] | undefined>,
  body = "正文",
): Record<string, string> {
  const slug = typeof fields.slug === "string" ? fields.slug : "how-to-read";
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

function published(
  slug: string,
  overrides: Record<string, string | string[] | undefined> = {},
  body = "正文",
): Record<string, string> {
  return piece(
    {
      slug,
      title: slug,
      summary: "摘要",
      kind: "essay",
      status: "published",
      publishedAt: "2026-09-01",
      category: "learning",
      ...overrides,
    },
    body,
  );
}

const identity = "---\nname: 某人\n---\n关于\n";
const learningTopics = "topics:\n  - id: learning\n    title: 学习\n";

function run(files: Record<string, string>): PublishResult {
  return publish(loadContent(site(files)));
}

function paths(result: PublishResult): string[] {
  return result.ok ? result.pieces.map((item) => item.path) : [];
}

describe("publish", () => {
  it("stops when the catalog has a fatal error", () => {
    const result = run({
      "config/identity.md": identity,
      "config/topics.yml": learningTopics,
      ...published("how-to-read", { media: ["shore.jpg"] }),
    });

    review({
      content: "目录有致命错误时不发布",
      expected: {
        ok: false,
        errors: ["media-not-found"],
        pieces: false,
        redirects: false,
        feed: false,
        sitemap: false,
      },
      output: {
        ok: result.ok,
        errors: result.ok ? [] : result.errors.map((item) => item.code),
        pieces: "pieces" in result,
        redirects: "redirects" in result,
        feed: "feed" in result,
        sitemap: "sitemap" in result,
      },
    });
  });

  it("keeps only published pieces and passes warnings through", () => {
    const result = run({
      "config/identity.md": identity,
      "config/topics.yml": learningTopics,
      ...published("how-to-read"),
      ...piece({
        slug: "draft-note",
        summary: "还在写",
        kind: "note",
        status: "draft",
        publishedAt: "2026-09-01",
        category: "learning",
      }),
    });

    review({
      content: "只留下已发布记录，草稿缺标题时仍给出警告",
      expected: {
        ok: true,
        name: "某人",
        paths: ["/how-to-read"],
        warnings: ["title-missing"],
      },
      output: {
        ok: result.ok,
        name: result.ok ? result.identity.name : null,
        paths: paths(result),
        warnings: result.ok ? result.warnings.map((item) => item.code) : [],
      },
    });
  });

  it("sorts newer published dates first", () => {
    const result = run({
      "config/identity.md": identity,
      "config/topics.yml": learningTopics,
      ...published("earlier-note", { publishedAt: "2026-09-01" }),
      ...published("later-note", { publishedAt: "2026-09-02" }),
    });

    review({
      content: "发布日较新的记录排在前面",
      expected: ["/later-note", "/earlier-note"],
      output: paths(result),
    });
  });

  it("sorts the same day by slug", () => {
    const result = run({
      "config/identity.md": identity,
      "config/topics.yml": learningTopics,
      ...published("beta"),
      ...published("alpha"),
    });

    review({
      content: "同一天的记录按短链升序",
      expected: ["/alpha", "/beta"],
      output: paths(result),
    });
  });

  it("publishes an empty list when nothing is published", () => {
    const result = run({
      "config/identity.md": identity,
      "config/topics.yml": learningTopics,
    });

    review({
      content: "没有已发布记录时列表为空",
      expected: { ok: true, pieces: [] },
      output: { ok: result.ok, pieces: paths(result) },
    });
  });

  it("redirects published aliases and ignores draft aliases", () => {
    const result = run({
      "config/identity.md": identity,
      "config/topics.yml": learningTopics,
      ...published("how-to-read", { aliases: ["old-name", "older-name"] }),
      ...piece({
        slug: "draft-note",
        title: "草稿",
        summary: "还在写",
        kind: "note",
        status: "draft",
        publishedAt: "2026-09-01",
        category: "learning",
        aliases: ["draft-alias"],
      }),
    });

    review({
      content: "已发布记录的别名永久跳转，草稿别名不跳转",
      expected: [
        { from: "old-name", to: "/how-to-read" },
        { from: "older-name", to: "/how-to-read" },
      ],
      output: result.ok ? result.redirects : [],
    });
  });

  it("renders the body to HTML and reuses it in the feed", () => {
    const result = run({
      "config/identity.md": identity,
      "config/topics.yml": learningTopics,
      ...published("how-to-read", {}, "先写一段 **重点**。"),
    });
    const pieceResult = result.ok ? result.pieces[0] : undefined;
    const entry = result.ok ? result.feed[0] : undefined;

    review({
      content: "正文渲染成 HTML，RSS 使用同一段",
      expected: {
        html: "<p>先写一段 <strong>重点</strong>。</p>\n",
        title: "how-to-read",
        path: "/how-to-read",
        publishedAt: "2026-09-01",
        summary: "摘要",
        sameHtml: true,
      },
      output: {
        html: pieceResult?.html ?? null,
        title: entry?.title ?? null,
        path: entry?.path ?? null,
        publishedAt: entry?.publishedAt ?? null,
        summary: entry?.summary ?? null,
        sameHtml: pieceResult?.html === entry?.html,
      },
    });
  });

  it("keeps a published photo with an empty body in the feed", () => {
    const result = run({
      "config/identity.md": identity,
      "config/topics.yml": learningTopics,
      ...published("shore", { kind: "photo", media: ["shore.jpg"] }, ""),
      "content/media/shore.jpg": "image",
    });

    review({
      content: "没有正文的已发布图片仍进入 RSS",
      expected: { html: "", paths: ["/shore"] },
      output: {
        html: result.ok ? result.pieces[0]?.html ?? null : null,
        paths: result.ok ? result.feed.map((item) => item.path) : [],
      },
    });
  });

  it("orders the feed like the published list and leaves drafts out", () => {
    const result = run({
      "config/identity.md": identity,
      "config/topics.yml": learningTopics,
      ...published("earlier-note", { publishedAt: "2026-09-01" }),
      ...published("later-note", { publishedAt: "2026-09-02" }),
      ...piece({
        slug: "draft-note",
        title: "草稿",
        summary: "还在写",
        kind: "note",
        status: "draft",
        publishedAt: "2026-09-03",
        category: "learning",
      }),
    });

    review({
      content: "RSS 顺序与已发布列表相同，且不含草稿",
      expected: ["/later-note", "/earlier-note"],
      output: result.ok ? result.feed.map((item) => item.path) : [],
    });
  });

  it("lists public paths and skips unused topics and aliases", () => {
    const result = run({
      "config/identity.md": identity,
      "config/topics.yml": `topics:
  - id: learning
    title: 学习
  - id: writing
    title: 写作
`,
      ...published("how-to-read", { aliases: ["old-name"] }),
    });

    review({
      content: "站点地图包含公开路径，不含未使用栏目和别名",
      expected: [
        "/",
        "/about",
        "/now",
        "/archive",
        "/topics/learning",
        "/how-to-read",
        "/feed.xml",
        "/sitemap.xml",
      ],
      output: result.ok ? result.sitemap : [],
    });
  });

  it("lists each used topic once, in id order", () => {
    const result = run({
      "config/identity.md": identity,
      "config/topics.yml": `topics:
  - id: writing
    title: 写作
  - id: learning
    title: 学习
`,
      ...published("fresh-note", { publishedAt: "2026-09-02", category: "writing" }),
      ...published("also-learning", { category: "learning" }),
      ...published("more-learning", { category: "learning" }),
    });

    review({
      content: "有文章的栏目按 id 只出现一次",
      expected: [
        "/",
        "/about",
        "/now",
        "/archive",
        "/topics/learning",
        "/topics/writing",
        "/fresh-note",
        "/also-learning",
        "/more-learning",
        "/feed.xml",
        "/sitemap.xml",
      ],
      output: result.ok ? result.sitemap : [],
    });
  });

  it("keeps the fixed pages when nothing is published", () => {
    const result = run({
      "config/identity.md": identity,
      "config/topics.yml": learningTopics,
    });

    review({
      content: "没有已发布记录时站点地图仍有固定页面",
      expected: ["/", "/about", "/now", "/archive", "/feed.xml", "/sitemap.xml"],
      output: result.ok ? result.sitemap : [],
    });
  });
});
