import { afterAll, afterEach, beforeEach, describe, it } from "vitest";
import { loadPieces } from "../../src/content/load-pieces.js";
import type { Diagnostic, PieceLoadResult } from "../../src/content/types.js";
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

function pieces(files: Record<string, string>) {
  const made = makePiecesDir(files);
  cleanups.push(made.cleanup);
  return made.dir;
}

function frontmatter(
  fields: Record<string, string | string[] | undefined>,
  body = "正文",
): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) lines.push(`  - ${JSON.stringify(item)}`);
      }
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---");
  if (body.length > 0) lines.push(body);
  return `${lines.join("\n")}\n`;
}

function publishedFields(
  overrides: Record<string, string | string[] | undefined> = {},
): Record<string, string | string[] | undefined> {
  return {
    slug: "how-to-read",
    title: "如何读一篇论文",
    summary: "先看问题",
    kind: "essay",
    status: "published",
    publishedAt: "2026-09-01",
    category: "learning",
    ...overrides,
  };
}

function publishedFile(
  overrides: Record<string, string | string[] | undefined> = {},
  body = "正文",
  filename?: string,
): Record<string, string> {
  const fields = publishedFields(overrides);
  const slug = typeof fields.slug === "string" ? fields.slug : "how-to-read";
  return { [filename ?? `${slug}.md`]: frontmatter(fields, body) };
}

function codes(list: Diagnostic[]) {
  return list.map((item) => item.code);
}

function verdict(result: PieceLoadResult) {
  return {
    errors: codes(result.errors),
    warnings: codes(result.warnings),
  };
}

describe("loadPieces", () => {
  it("reads one published essay", () => {
    const result = loadPieces(
      pieces(
        publishedFile({
          created: "2026-08-01",
          updated: "2026-09-02",
          tags: ["reading"],
        }),
      ),
    );

    review({
      content: "读出一篇字段齐全的已发布文章",
      expected: {
        errors: [],
        warnings: [],
        pieces: [
          {
            slug: "how-to-read",
            title: "如何读一篇论文",
            summary: "先看问题",
            kind: "essay",
            status: "published",
            publishedAt: "2026-09-01",
            created: "2026-08-01",
            updated: "2026-09-02",
            category: "learning",
            tags: ["reading"],
            media: [],
            aliases: [],
            language: "zh",
            body: "正文",
          },
        ],
      },
      output: {
        errors: result.errors,
        warnings: result.warnings,
        pieces: result.pieces,
      },
    });
  });

  it("keeps optional identity fields when they are present", () => {
    const piece = loadPieces(
      pieces(
        publishedFile({
          author: "Ada",
          series: "reading-group",
          translationGroup: "how-to-read-group",
        }),
      ),
    ).pieces[0];

    review({
      content: "保留作者、系列和译文分组",
      expected: {
        author: "Ada",
        series: "reading-group",
        translationGroup: "how-to-read-group",
      },
      output: {
        author: piece?.author,
        series: piece?.series,
        translationGroup: piece?.translationGroup,
      },
    });
  });

  it("treats a missing status as a draft and does not invent dates", () => {
    const result = loadPieces(
      pieces(publishedFile({ status: undefined, language: undefined })),
    );
    const piece = result.pieces[0];

    review({
      content: "未写状态时视为草稿，并且不编造日期",
      expected: {
        errors: [],
        status: "draft",
        language: "zh",
        tags: [],
        media: [],
        aliases: [],
        created: undefined,
        updated: undefined,
      },
      output: {
        errors: result.errors,
        status: piece?.status,
        language: piece?.language,
        tags: piece?.tags,
        media: piece?.media,
        aliases: piece?.aliases,
        created: piece?.created,
        updated: piece?.updated,
      },
    });
  });

  it("defaults omitted created and updated to publishedAt on published pieces", () => {
    const piece = loadPieces(pieces(publishedFile())).pieces[0];

    review({
      content: "已发布记录省略的写作日和修订日等于发布日",
      expected: { created: "2026-09-01", updated: "2026-09-01" },
      output: { created: piece?.created, updated: piece?.updated },
    });
  });

  it("keeps an earlier created date", () => {
    const piece = loadPieces(pieces(publishedFile({ created: "2026-08-01" }))).pieces[0];

    review({
      content: "文件里更早的写作日保持不变",
      expected: { created: "2026-08-01", updated: "2026-09-01" },
      output: { created: piece?.created, updated: piece?.updated },
    });
  });

  it.each([
    ["标题", { title: undefined }, "title-missing"],
    ["摘要", { summary: undefined }, "summary-missing"],
    ["发布日", { publishedAt: undefined }, "published-at-missing"],
    ["栏目", { category: undefined }, "category-missing"],
    ["类型", { kind: undefined }, "kind-invalid"],
  ] as const)("rejects a published piece missing %s", (label, overrides, code) => {
    const result = loadPieces(pieces(publishedFile(overrides)));

    review({
      content: `已发布文章缺少${label}`,
      expected: { errors: [code], warnings: [] },
      output: verdict(result),
    });
  });

  it("rejects a published piece with an unknown kind", () => {
    const result = loadPieces(pieces(publishedFile({ kind: "video" })));

    review({
      content: "已发布文章使用未知类型",
      expected: { errors: ["kind-invalid"], warnings: [] },
      output: verdict(result),
    });
  });

  it("rejects a published essay with a blank body", () => {
    const result = loadPieces(pieces(publishedFile({}, "  \n")));

    review({
      content: "已发布文章正文为空白",
      expected: { errors: ["body-missing"], warnings: [] },
      output: verdict(result),
    });
  });

  it("rejects a published note with a blank body", () => {
    const result = loadPieces(pieces(publishedFile({ kind: "note" }, "")));

    review({
      content: "已发布学习笔记正文为空白",
      expected: { errors: ["body-missing"], warnings: [] },
      output: verdict(result),
    });
  });

  it("rejects a published photo with no media", () => {
    const result = loadPieces(pieces(publishedFile({ kind: "photo", media: [] }, "")));

    review({
      content: "已发布图片记录没有图片路径",
      expected: { errors: ["media-missing"], warnings: [] },
      output: verdict(result),
    });
  });

  it("accepts a published photo that has media and no body", () => {
    const result = loadPieces(
      pieces(publishedFile({ kind: "photo", media: ["shore.jpg"] }, "")),
    );

    review({
      content: "已发布图片记录可以没有正文，只要有图片路径",
      expected: { errors: [], kind: "photo", media: ["shore.jpg"], body: "" },
      output: {
        errors: result.errors,
        kind: result.pieces[0]?.kind,
        media: result.pieces[0]?.media,
        body: result.pieces[0]?.body,
      },
    });
  });

  it.each(["2026-13-40", "2026/09/01"])("rejects an impossible date %s", (publishedAt) => {
    const result = loadPieces(pieces(publishedFile({ publishedAt })));

    review({
      content: `发布日 ${publishedAt} 不是合法日期`,
      expected: { errors: ["date-invalid"], warnings: [] },
      output: verdict(result),
    });
  });

  it("rejects a missing slug", () => {
    const result = loadPieces(
      pieces(publishedFile({ slug: undefined }, "正文", "how-to-read.md")),
    );

    review({
      content: "文件头没有短链",
      expected: [{ level: "fatal", code: "slug-missing", slug: "how-to-read" }],
      output: result.errors,
    });
  });

  it.each(["Hello", "bad_name", "has.dot", "-bad", "bad-"])(
    "rejects an illegal slug %s",
    (slug) => {
      const result = loadPieces(pieces(publishedFile({ slug }, "正文", `${slug}.md`)));

      review({
        content: `短链 ${slug} 不符合规则`,
        expected: { errors: ["slug-invalid"] },
        output: { errors: codes(result.errors) },
      });
    },
  );

  it("rejects a slug that does not match the filename", () => {
    const result = loadPieces(
      pieces(publishedFile({ slug: "how-to-read" }, "正文", "other-name.md")),
    );

    review({
      content: "短链和文件名不一致",
      expected: [{ level: "fatal", code: "slug-mismatch", slug: "how-to-read" }],
      output: result.errors,
    });
  });

  it.each(["about", "now", "archive", "topics", "photos", "tags"])(
    "rejects reserved slug %s",
    (slug) => {
      const result = loadPieces(pieces(publishedFile({ slug })));

      review({
        content: `短链 ${slug} 被站点页面占用`,
        expected: [{ level: "fatal", code: "slug-reserved", slug }],
        output: result.errors,
      });
    },
  );

  it("rejects an unknown status without turning the piece into a draft warning", () => {
    const result = loadPieces(pieces(publishedFile({ status: "live" })));

    review({
      content: "状态不是草稿或已发布",
      expected: {
        errors: [{ level: "fatal", code: "status-invalid", slug: "how-to-read" }],
        warnings: [],
      },
      output: { errors: result.errors, warnings: result.warnings },
    });
  });

  it("rejects broken frontmatter", () => {
    const result = loadPieces(pieces({ "how-to-read.md": "---\nslug: [\n---\n正文\n" }));

    review({
      content: "文件头不是合法 YAML",
      expected: { errors: ["frontmatter-invalid"], pieceCount: 1 },
      output: { errors: codes(result.errors), pieceCount: result.pieces.length },
    });
  });

  it("warns when a draft is missing writing fields", () => {
    const result = loadPieces(
      pieces({ "wip-note.md": "---\nslug: wip-note\nstatus: draft\n---\n" }),
    );

    review({
      content: "草稿缺少标题、摘要、发布日和正文时只警告",
      expected: {
        errors: [],
        warnings: ["title-missing", "summary-missing", "published-at-missing", "body-missing"],
      },
      output: verdict(result),
    });
  });

  it("warns on an unknown kind for a draft", () => {
    const result = loadPieces(
      pieces({
        "wip-note.md": frontmatter({
          slug: "wip-note",
          status: "draft",
          kind: "video",
          title: "草稿",
          summary: "还在写",
          publishedAt: "2026-09-01",
        }),
      }),
    );

    review({
      content: "草稿使用未知类型时只警告",
      expected: { errors: [], warnings: ["kind-invalid"] },
      output: verdict(result),
    });
  });

  it("still rejects a reserved slug on a draft", () => {
    const result = loadPieces(pieces({ "about.md": "---\nslug: about\nstatus: draft\n---\n" }));

    review({
      content: "草稿使用保留短链仍然失败",
      expected: {
        errors: ["slug-reserved"],
        warnings: ["title-missing", "summary-missing", "published-at-missing", "body-missing"],
      },
      output: verdict(result),
    });
  });

  it("rejects a file with no slug instead of warning", () => {
    const result = loadPieces(pieces({ "wip-note.md": "没有文件头\n" }));

    review({
      content: "没有文件头时按缺少短链失败，短链错误不进警告",
      expected: {
        errors: ["slug-missing"],
        warnings: ["title-missing", "summary-missing", "published-at-missing"],
      },
      output: verdict(result),
    });
  });

  it("rejects duplicate slugs on every copy", () => {
    const result = loadPieces(
      pieces({
        ...publishedFile({ slug: "same-note" }),
        ...publishedFile({ slug: "same-note" }, "另一篇", "also-same.md"),
      }),
    );

    review({
      content: "两篇记录使用同一个短链",
      expected: ["same-note", "same-note"],
      output: result.errors
        .filter((item) => item.code === "slug-duplicate")
        .map((item) => item.slug)
        .sort(),
    });
  });

  it("rejects alias collisions", () => {
    const result = loadPieces(
      pieces({
        ...publishedFile({ slug: "alpha", aliases: ["beta"] }),
        ...publishedFile({ slug: "beta", aliases: ["about"] }),
        ...publishedFile({ slug: "gamma", aliases: ["shared"] }),
        ...publishedFile({ slug: "delta", aliases: ["shared"] }),
        "draft-alias.md": frontmatter(
          { slug: "draft-alias", status: "draft", aliases: ["alpha"] },
          "",
        ),
      }),
    );

    review({
      content: "别名与短链、保留词或其他别名冲突",
      expected: ["alpha", "beta", "delta", "draft-alias", "gamma"],
      output: result.errors
        .filter((item) => item.code === "alias-conflict")
        .map((item) => item.slug)
        .sort(),
    });
  });

  it("returns empty lists for an empty directory", () => {
    const result = loadPieces(pieces({}));

    review({
      content: "目录里没有记录",
      expected: { pieces: [], errors: [], warnings: [] },
      output: result,
    });
  });

  it("does not read markdown in subdirectories and sorts by slug", () => {
    const result = loadPieces(
      pieces({
        ...publishedFile({ slug: "zebra" }),
        ...publishedFile({ slug: "alpha" }),
        "nested/hidden.md": frontmatter(publishedFields({ slug: "hidden" })),
      }),
    );

    review({
      content: "不读取子目录，并按短链排序",
      expected: ["alpha", "zebra"],
      output: result.pieces.map((piece) => piece.slug),
    });
  });
});
