import { afterAll, afterEach, beforeEach, describe, it } from "vitest";
import { loadContent } from "../../src/content/load-content.js";
import { publish } from "../../src/publish/publish.js";
import type { PublishResult, PublishSuccess } from "../../src/publish/publish.js";
import { resolveRoute } from "../../src/present/render-site.js";
import { beginCase, review, writeReviewReport } from "../helpers/review.js";
import { writeSite } from "../helpers/site-repo.js";

const TITLE = "阅读";
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

function pieceFile(
  slug: string,
  overrides: Record<string, string | string[] | undefined> = {},
  body = "先写下问题。",
  filename = `${slug}.md`,
): Record<string, string> {
  const fields: Record<string, string | string[] | undefined> = {
    slug,
    title: TITLE,
    summary: "先看问题。",
    kind: "essay",
    status: "published",
    publishedAt: "2026-09-02",
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
  return { [`content/pieces/${filename}`]: `${lines.join("\n")}\n` };
}

function open(files: Record<string, string>): { dir: string; result: PublishResult } {
  const made = writeSite(files);
  cleanups.push(made.cleanup);
  return { dir: made.dir, result: publish(loadContent(made.dir)) };
}

function failureOf(result: PublishResult): {
  ok: boolean;
  codes: string[];
  keys: string[];
} {
  return {
    ok: result.ok,
    codes: result.ok ? [] : result.errors.map((item) => item.code).sort(),
    keys: Object.keys(result).sort(),
  };
}

function bodyIncludes(result: PublishSuccess, pathname: string, text: string): boolean {
  const route = resolveRoute(result, pathname);
  return route.status === 200 && route.body.includes(text);
}

describe("site contract", () => {
  it("shows a legal essay on the piece, archive, home, feed, and sitemap", () => {
    const { result } = open(pieceFile("reading"));
    const success = result.ok ? result : undefined;
    review({
      content: "合法文章出现在单篇、时间线、首页、RSS 和站点地图",
      expected: {
        ok: true,
        path: "/reading",
        piece: true,
        archive: true,
        home: true,
        feed: true,
        sitemap: true,
      },
      output: {
        ok: result.ok,
        path: success?.pieces[0]?.path ?? null,
        piece: success ? bodyIncludes(success, "/reading", TITLE) : false,
        archive: success ? bodyIncludes(success, "/archive", TITLE) : false,
        home: success ? bodyIncludes(success, "/", TITLE) : false,
        feed: success ? bodyIncludes(success, "/feed.xml", "/reading") : false,
        sitemap: success ? bodyIncludes(success, "/sitemap.xml", "/reading") : false,
      },
    });
  });

  it("keeps the piece path when kind and category change", () => {
    const { result } = open(
      pieceFile("field-note", { kind: "note", category: "writing", title: "田野" }),
    );
    const sitemap = result.ok ? result.sitemap : [];
    review({
      content: "改栏目或类型后，作品地址仍是短链",
      expected: {
        path: "/field-note",
        hasPiece: true,
        hasKindPath: false,
        hasCategoryPath: false,
      },
      output: {
        path: result.ok ? (result.pieces[0]?.path ?? null) : null,
        hasPiece: sitemap.includes("/field-note"),
        hasKindPath: sitemap.includes("/notes/field-note"),
        hasCategoryPath: sitemap.includes("/writing/field-note"),
      },
    });
  });

  it("publishes a photo with an existing image and an empty body", () => {
    const { result } = open({
      ...pieceFile("shore", { kind: "photo", title: "岸", media: ["shore.svg"] }, ""),
      "content/media/shore.svg": `<svg xmlns="http://www.w3.org/2000/svg"></svg>\n`,
    });
    const route = result.ok ? resolveRoute(result, "/shore") : undefined;
    review({
      content: "已发布的照片可以没有正文，只要图片存在",
      expected: { ok: true, path: "/shore", html: "", status: 200 },
      output: {
        ok: result.ok,
        path: result.ok ? (result.pieces[0]?.path ?? null) : null,
        html: result.ok ? (result.pieces[0]?.html ?? null) : null,
        status: route?.status ?? null,
      },
    });
  });

  it("does not publish a topic page nobody uses", () => {
    const { result } = open(pieceFile("reading"));
    const route = result.ok ? resolveRoute(result, "/topics/writing") : undefined;
    review({
      content: "没有任何已发布记录使用的栏目，不产生栏目页",
      expected: { listed: false, status: 404 },
      output: {
        listed: result.ok ? result.sitemap.includes("/topics/writing") : true,
        status: route?.status ?? null,
      },
    });
  });

  it("redirects a published alias permanently", () => {
    const { result } = open(pieceFile("reading", { aliases: ["old-name"] }));
    const route = result.ok ? resolveRoute(result, "/old-name") : undefined;
    review({
      content: "已发布记录的别名永久跳转到作品地址",
      expected: { from: "old-name", to: "/reading", status: 301, location: "/reading" },
      output: {
        from: result.ok ? (result.redirects[0]?.from ?? null) : null,
        to: result.ok ? (result.redirects[0]?.to ?? null) : null,
        status: route?.status ?? null,
        location: route?.status === 301 ? route.location : null,
      },
    });
  });

  it("sorts pieces from the same day by slug", () => {
    const { result } = open({
      ...pieceFile("beta", { publishedAt: "2026-09-01", title: "乙" }),
      ...pieceFile("alpha", { publishedAt: "2026-09-01", title: "甲" }),
    });
    const sitemap = result.ok ? result.sitemap : [];
    review({
      content: "同一天的记录按短链升序",
      expected: {
        pieces: ["/alpha", "/beta"],
        feed: ["/alpha", "/beta"],
        sitemapPieces: ["/alpha", "/beta"],
      },
      output: {
        pieces: result.ok ? result.pieces.map((item) => item.path) : [],
        feed: result.ok ? result.feed.map((item) => item.path) : [],
        sitemapPieces: sitemap.filter((item) => item === "/alpha" || item === "/beta"),
      },
    });
  });

  const failures: Array<{
    content: string;
    codes: string[];
    files: () => Record<string, string>;
  }> = [
    {
      content: "已发布记录缺少标题时构建失败",
      codes: ["title-missing"],
      files: () => pieceFile("reading", { title: undefined }),
    },
    {
      content: "已发布记录缺少摘要时构建失败",
      codes: ["summary-missing"],
      files: () => pieceFile("reading", { summary: undefined }),
    },
    {
      content: "已发布记录缺少发布日时构建失败",
      codes: ["published-at-missing"],
      files: () => pieceFile("reading", { publishedAt: undefined }),
    },
    {
      content: "已发布的文章缺少正文时构建失败",
      codes: ["body-missing"],
      files: () => pieceFile("reading", {}, ""),
    },
    {
      content: "已发布的笔记缺少正文时构建失败",
      codes: ["body-missing"],
      files: () => pieceFile("reading", { kind: "note" }, ""),
    },
    {
      content: "已发布的照片没有图片时构建失败",
      codes: ["media-missing"],
      files: () => pieceFile("shore", { kind: "photo", title: "岸" }, ""),
    },
    {
      content: "未知类型使构建失败",
      codes: ["kind-invalid"],
      files: () => pieceFile("reading", { kind: "poem" }),
    },
    {
      content: "栏目不在词表中时构建失败",
      codes: ["category-unknown"],
      files: () => pieceFile("reading", { category: "gardening" }),
    },
    {
      content: "图片指向不存在的文件时构建失败",
      codes: ["media-not-found"],
      files: () => pieceFile("reading", { media: ["missing.png"] }),
    },
    {
      content: "短链与文件名不一致时构建失败",
      codes: ["slug-mismatch"],
      files: () => pieceFile("other", {}, "先写下问题。", "reading.md"),
    },
    {
      content: "两条记录短链相同时构建失败",
      codes: ["slug-duplicate", "slug-duplicate", "slug-mismatch"],
      files: () => ({
        ...pieceFile("reading"),
        ...pieceFile("reading", {}, "另一篇。", "other.md"),
      }),
    },
    {
      content: "短链使用保留字时构建失败",
      codes: ["slug-reserved"],
      files: () => pieceFile("about"),
    },
    {
      content: "短链 upload 留给上传页时构建失败",
      codes: ["slug-reserved"],
      files: () => pieceFile("upload"),
    },
    {
      content: "别名使用保留字时构建失败",
      codes: ["alias-conflict"],
      files: () => pieceFile("reading", { aliases: ["archive"] }),
    },
    {
      content: "别名与另一条记录的短链相同时构建失败",
      codes: ["alias-conflict"],
      files: () => ({
        ...pieceFile("reading"),
        ...pieceFile("field-note", {
          aliases: ["reading"],
          publishedAt: "2026-09-01",
          title: "笔记",
        }),
      }),
    },
    {
      content: "两条记录使用同一个别名时构建失败",
      codes: ["alias-conflict", "alias-conflict"],
      files: () => ({
        ...pieceFile("alpha", { aliases: ["shared"], title: "甲" }),
        ...pieceFile("beta", { aliases: ["shared"], publishedAt: "2026-09-01", title: "乙" }),
      }),
    },
    {
      content: "发布日不是 YYYY-MM-DD 时构建失败",
      codes: ["date-invalid"],
      files: () => pieceFile("reading", { publishedAt: "2026/09/02" }),
    },
  ];

  for (const item of failures) {
    it(item.content, () => {
      const { result } = open(item.files());
      review({
        content: item.content,
        expected: { ok: false, codes: [...item.codes].sort(), keys: ["errors", "ok"] },
        output: failureOf(result),
      });
    });
  }

  it("keeps an incomplete draft out of the public site and warns", () => {
    const { result } = open({
      ...pieceFile("reading"),
      ...pieceFile(
        "wip",
        {
          title: undefined,
          summary: undefined,
          publishedAt: undefined,
          status: "draft",
          kind: undefined,
          category: undefined,
          aliases: ["wip-old"],
        },
        "",
      ),
    });
    const success = result.ok ? result : undefined;
    const hidden = (pathname: string) =>
      success ? !bodyIncludes(success, pathname, "wip") : false;
    review({
      content: "草稿给出警告，且不出现在页面、RSS、站点地图和跳转中",
      expected: {
        ok: true,
        warnings: [
          { code: "title-missing", slug: "wip" },
          { code: "summary-missing", slug: "wip" },
          { code: "published-at-missing", slug: "wip" },
          { code: "body-missing", slug: "wip" },
        ],
        pieces: ["/reading"],
        home: true,
        archive: true,
        feed: true,
        sitemap: true,
        piece: 404,
        redirects: [],
        alias: 404,
      },
      output: {
        ok: result.ok,
        warnings: success
          ? success.warnings.map((item) => ({ code: item.code, slug: item.slug }))
          : [],
        pieces: success ? success.pieces.map((item) => item.path) : [],
        home: hidden("/"),
        archive: hidden("/archive"),
        feed: hidden("/feed.xml"),
        sitemap: hidden("/sitemap.xml"),
        piece: success ? resolveRoute(success, "/wip").status : null,
        redirects: success ? success.redirects : null,
        alias: success ? resolveRoute(success, "/wip-old").status : null,
      },
    });
  });

  it("fails when a draft reuses another piece slug", () => {
    const { result } = open({
      ...pieceFile("reading"),
      ...pieceFile("reading", { status: "draft", title: "草稿" }, "草稿。", "other.md"),
    });
    review({
      content: "草稿与另一条记录短链冲突时构建失败",
      expected: {
        ok: false,
        codes: ["slug-duplicate", "slug-duplicate", "slug-mismatch"].sort(),
        keys: ["errors", "ok"],
      },
      output: failureOf(result),
    });
  });

  it("fails when a draft uses a reserved slug", () => {
    const { result } = open(pieceFile("about", { status: "draft", title: "草稿" }));
    review({
      content: "草稿使用保留短链时构建失败",
      expected: { ok: false, codes: ["slug-reserved"], keys: ["errors", "ok"] },
      output: failureOf(result),
    });
  });
});
