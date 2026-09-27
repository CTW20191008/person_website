import { symlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, it } from "vitest";
import { loadContent } from "../../src/content/load-content.js";
import type { Diagnostic } from "../../src/content/types.js";
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

function identityFile(fields: Record<string, string | undefined>, body = "关于正文"): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    lines.push(`${key}: ${value}`);
  }
  lines.push("---", body);
  return `${lines.join("\n")}\n`;
}

function pieceFile(
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

function publishedPiece(
  overrides: Record<string, string | string[] | undefined> = {},
  body = "正文",
): Record<string, string> {
  return pieceFile(
    {
      slug: "how-to-read",
      title: "如何读一篇论文",
      summary: "先看问题",
      kind: "essay",
      status: "published",
      publishedAt: "2026-09-01",
      category: "learning",
      ...overrides,
    },
    body,
  );
}

const namedIdentity = identityFile({ name: "某人" });
const learningTopics = "topics:\n  - id: learning\n    title: 学习\n";
const emptyTopics = "topics: []\n";

function fatal(code: Diagnostic["code"], slug = ""): Diagnostic {
  return { level: "fatal", code, slug };
}

function warn(code: Diagnostic["code"], slug: string): Diagnostic {
  return { level: "warning", code, slug };
}

describe("loadContent", () => {
  it("reads name, now, links, and about text", () => {
    const result = loadContent(
      site({
        "config/identity.md": `---
name: 某人
now: 正在读书
links:
  - label: 笔记
    url: https://example.com/notes
  - label: 邮箱
    url: mailto:me@example.com
---
  关于正文
`,
        "config/topics.yml": emptyTopics,
      }),
    );

    review({
      content: "读出身份里的名字、近况、链接和关于正文",
      expected: {
        name: "某人",
        now: "正在读书",
        links: [
          { label: "笔记", url: "https://example.com/notes" },
          { label: "邮箱", url: "mailto:me@example.com" },
        ],
        body: "关于正文",
        errors: [],
      },
      output: {
        name: result.identity?.name ?? null,
        now: result.identity?.now ?? null,
        links: result.identity?.links ?? null,
        body: result.identity?.body ?? null,
        errors: result.errors,
      },
    });
  });

  it("uses empty now and links when they are omitted", () => {
    const result = loadContent(
      site({
        "config/identity.md": identityFile({ name: "某人" }, ""),
        "config/topics.yml": emptyTopics,
      }),
    );

    review({
      content: "省略近况、链接和关于正文时使用空值",
      expected: { now: "", links: [], body: "", errors: [] },
      output: {
        now: result.identity?.now ?? null,
        links: result.identity?.links ?? null,
        body: result.identity?.body ?? null,
        errors: result.errors,
      },
    });
  });

  it("trims the name and link text", () => {
    const result = loadContent(
      site({
        "config/identity.md": `---
name: "  某人  "
links:
  - label: "  笔记  "
    url: "  https://example.com  "
---
`,
        "config/topics.yml": emptyTopics,
      }),
    );

    review({
      content: "名字和链接去掉首尾空白",
      expected: {
        name: "某人",
        links: [{ label: "笔记", url: "https://example.com" }],
      },
      output: {
        name: result.identity?.name ?? null,
        links: result.identity?.links ?? null,
      },
    });
  });

  it("fails when the identity file is missing", () => {
    const result = loadContent(site({ "config/topics.yml": emptyTopics }));

    review({
      content: "没有身份文件",
      expected: { identity: null, errors: [fatal("identity-missing")] },
      output: { identity: result.identity ?? null, errors: result.errors },
    });
  });

  it("fails when identity frontmatter is not YAML", () => {
    const result = loadContent(
      site({
        "config/identity.md": "---\nname: [\n---\n",
        "config/topics.yml": emptyTopics,
      }),
    );

    review({
      content: "身份文件头不是合法 YAML",
      expected: { identity: null, errors: [fatal("identity-invalid")] },
      output: { identity: result.identity ?? null, errors: result.errors },
    });
  });

  it("fails when the name is missing", () => {
    const result = loadContent(
      site({
        "config/identity.md": "---\nnow: 正在读书\n---\n",
        "config/topics.yml": emptyTopics,
      }),
    );

    review({
      content: "身份没有名字",
      expected: { identity: null, errors: [fatal("identity-name-missing")] },
      output: { identity: result.identity ?? null, errors: result.errors },
    });
  });

  it("fails when the name is blank", () => {
    const result = loadContent(
      site({
        "config/identity.md": identityFile({ name: '"   "' }),
        "config/topics.yml": emptyTopics,
      }),
    );

    review({
      content: "身份名字为空白",
      expected: { identity: null, errors: [fatal("identity-name-missing")] },
      output: { identity: result.identity ?? null, errors: result.errors },
    });
  });

  it("fails when links are not a list", () => {
    const result = loadContent(
      site({
        "config/identity.md": identityFile({ name: "某人", links: "hello" }),
        "config/topics.yml": emptyTopics,
      }),
    );

    review({
      content: "身份链接不是列表",
      expected: { identity: null, errors: [fatal("identity-link-invalid")] },
      output: { identity: result.identity ?? null, errors: result.errors },
    });
  });

  it("fails when a link is missing a label or url", () => {
    const result = loadContent(
      site({
        "config/identity.md": `---
name: 某人
links:
  - label: 只有名字
---
`,
        "config/topics.yml": emptyTopics,
      }),
    );

    review({
      content: "身份链接缺少名称或地址",
      expected: { identity: null, errors: [fatal("identity-link-invalid")] },
      output: { identity: result.identity ?? null, errors: result.errors },
    });
  });

  it("fails when now is not text", () => {
    const result = loadContent(
      site({
        "config/identity.md": identityFile({ name: "某人", now: "1" }),
        "config/topics.yml": emptyTopics,
      }),
    );

    review({
      content: "近况不是文字",
      expected: { identity: null, errors: [fatal("identity-invalid")] },
      output: { identity: result.identity ?? null, errors: result.errors },
    });
  });

  it("reads topics sorted by id", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": `topics:
  - id: writing
    title: 写作
  - id: learning
    title: 学习
`,
      }),
    );

    review({
      content: "读出栏目并按 id 排序",
      expected: {
        topics: [
          { id: "learning", title: "学习" },
          { id: "writing", title: "写作" },
        ],
        errors: [],
      },
      output: { topics: result.topics, errors: result.errors },
    });
  });

  it("accepts an empty topic list", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": emptyTopics,
      }),
    );

    review({
      content: "栏目词表可以为空",
      expected: { topics: [], errors: [] },
      output: { topics: result.topics, errors: result.errors },
    });
  });

  it("fails when the topic file is missing", () => {
    const result = loadContent(site({ "config/identity.md": namedIdentity }));

    review({
      content: "没有栏目词表",
      expected: { topics: [], errors: [fatal("topics-missing")] },
      output: { topics: result.topics, errors: result.errors },
    });
  });

  it("fails when the topic file is not YAML", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": "topics: [\n",
      }),
    );

    review({
      content: "栏目词表不是合法 YAML",
      expected: { topics: [], errors: [fatal("topics-invalid")] },
      output: { topics: result.topics, errors: result.errors },
    });
  });

  it("fails when topics is not a list", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": "topics: learning\n",
      }),
    );

    review({
      content: "栏目词表顶层不是列表",
      expected: { topics: [], errors: [fatal("topics-invalid")] },
      output: { topics: result.topics, errors: result.errors },
    });
  });

  it.each(["Hello", "bad_name", "has.dot", "-bad", "bad-"])(
    "rejects an illegal topic id %s",
    (id) => {
      const result = loadContent(
        site({
          "config/identity.md": namedIdentity,
          "config/topics.yml": `topics:\n  - id: ${JSON.stringify(id)}\n    title: 学习\n`,
        }),
      );

      review({
        content: `栏目 id ${id} 不符合规则`,
        expected: { topics: [], errors: [fatal("topics-id-invalid", id)] },
        output: { topics: result.topics, errors: result.errors },
      });
    },
  );

  it("fails when a topic has no id", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": "topics:\n  - title: 学习\n",
      }),
    );

    review({
      content: "栏目没有 id",
      expected: { topics: [], errors: [fatal("topics-id-invalid")] },
      output: { topics: result.topics, errors: result.errors },
    });
  });

  it("fails when a topic title is blank", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": "topics:\n  - id: learning\n    title: \"   \"\n",
      }),
    );

    review({
      content: "栏目标题为空白",
      expected: { topics: [], errors: [fatal("topics-title-missing", "learning")] },
      output: { topics: result.topics, errors: result.errors },
    });
  });

  it("fails when two topics share an id", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": `topics:
  - id: learning
    title: 学习
  - id: learning
    title: 再学
`,
      }),
    );

    review({
      content: "两个栏目使用同一个 id",
      expected: {
        topics: [],
        errors: [fatal("topics-duplicate", "learning"), fatal("topics-duplicate", "learning")],
      },
      output: { topics: result.topics, errors: result.errors },
    });
  });

  it("fills a missing author from the identity name", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": learningTopics,
        ...publishedPiece(),
        ...pieceFile({
          slug: "draft-note",
          title: "草稿",
          summary: "还在写",
          kind: "note",
          status: "draft",
          category: "learning",
        }),
      }),
    );

    review({
      content: "省略的作者使用身份里的名字",
      expected: [
        { slug: "draft-note", author: "某人" },
        { slug: "how-to-read", author: "某人" },
      ],
      output: result.pieces.map((piece) => ({ slug: piece.slug, author: piece.author ?? null })),
    });
  });

  it("keeps an author written on the piece", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": learningTopics,
        ...publishedPiece({ author: "别人" }),
      }),
    );

    review({
      content: "记录里写了作者时不覆盖",
      expected: "别人",
      output: result.pieces[0]?.author ?? null,
    });
  });

  it("does not invent an author when identity cannot be read", () => {
    const result = loadContent(
      site({
        "config/topics.yml": learningTopics,
        ...publishedPiece(),
      }),
    );

    review({
      content: "身份没读出来时不编造作者",
      expected: { author: null, errors: [fatal("identity-missing")] },
      output: {
        author: result.pieces[0]?.author ?? null,
        errors: result.errors.filter((item) => item.code === "identity-missing"),
      },
    });
  });

  it("rejects a published category outside the word list", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": learningTopics,
        ...publishedPiece({ category: "elsewhere" }),
      }),
    );

    review({
      content: "已发布记录使用了词表外的栏目",
      expected: { errors: [fatal("category-unknown", "how-to-read")], warnings: [] },
      output: { errors: result.errors, warnings: result.warnings },
    });
  });

  it("warns when a draft uses an unknown category", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": learningTopics,
        ...pieceFile({
          slug: "draft-note",
          title: "草稿",
          summary: "还在写",
          kind: "note",
          status: "draft",
          publishedAt: "2026-09-01",
          category: "elsewhere",
        }),
      }),
    );

    review({
      content: "草稿使用词表外的栏目时只警告",
      expected: { errors: [], warnings: [warn("category-unknown", "draft-note")] },
      output: { errors: result.errors, warnings: result.warnings },
    });
  });

  it("does not warn when a draft omits its category", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": learningTopics,
        ...pieceFile({
          slug: "draft-note",
          title: "草稿",
          summary: "还在写",
          kind: "note",
          status: "draft",
          publishedAt: "2026-09-01",
        }),
      }),
    );

    review({
      content: "草稿没写栏目时不警告",
      expected: { errors: [], warnings: [] },
      output: { errors: result.errors, warnings: result.warnings },
    });
  });

  it("does not add category errors when the word list itself failed", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        ...publishedPiece(),
      }),
    );

    review({
      content: "词表读失败时不再追加栏目未知",
      expected: [fatal("topics-missing")],
      output: result.errors,
    });
  });

  it("reads identity and topics when there are no pieces", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": learningTopics,
      }),
    );

    review({
      content: "没有记录目录时仍读出身份和栏目",
      expected: { name: "某人", topics: ["learning"], pieces: [] },
      output: {
        name: result.identity?.name ?? null,
        topics: result.topics.map((topic) => topic.id),
        pieces: result.pieces,
      },
    });
  });

  it("accepts a media file that exists", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": learningTopics,
        ...publishedPiece({ media: ["shore.jpg"] }),
        "content/media/shore.jpg": "image",
      }),
    );

    review({
      content: "已发布文章引用的图片存在",
      expected: { errors: [], warnings: [] },
      output: { errors: result.errors, warnings: result.warnings },
    });
  });

  it("accepts a media file in a subdirectory", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": learningTopics,
        ...publishedPiece({ media: ["album/shore.jpg"] }),
        "content/media/album/shore.jpg": "image",
      }),
    );

    review({
      content: "图片可以放在媒体目录的子目录里",
      expected: { errors: [], warnings: [] },
      output: { errors: result.errors, warnings: result.warnings },
    });
  });

  it("rejects a published piece that cites a missing file", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": learningTopics,
        ...publishedPiece({ media: ["shore.jpg"] }),
      }),
    );

    review({
      content: "已发布记录引用了不存在的图片",
      expected: { errors: [fatal("media-not-found", "how-to-read")], warnings: [] },
      output: { errors: result.errors, warnings: result.warnings },
    });
  });

  it("warns when a draft cites a missing file", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": learningTopics,
        ...pieceFile({
          slug: "draft-note",
          title: "草稿",
          summary: "还在写",
          kind: "note",
          status: "draft",
          publishedAt: "2026-09-01",
          category: "learning",
          media: ["shore.jpg"],
        }),
      }),
    );

    review({
      content: "草稿引用了不存在的图片时只警告",
      expected: { errors: [], warnings: [warn("media-not-found", "draft-note")] },
      output: { errors: result.errors, warnings: result.warnings },
    });
  });

  it.each(["../secret.txt", "/etc/passwd", "album\\shore.jpg"])(
    "rejects an illegal media path %s",
    (mediaPath) => {
      const result = loadContent(
        site({
          "config/identity.md": namedIdentity,
          "config/topics.yml": learningTopics,
          ...pieceFile({
            slug: "draft-note",
            title: "草稿",
            summary: "还在写",
            kind: "note",
            status: "draft",
            publishedAt: "2026-09-01",
            category: "learning",
            media: [mediaPath],
          }),
        }),
      );

      review({
        content: `图片路径 ${mediaPath} 不能离开媒体目录`,
        expected: { errors: [fatal("media-invalid", "draft-note")], warnings: [] },
        output: { errors: result.errors, warnings: result.warnings },
      });
    },
  );

  it("rejects a media path that resolves outside the media directory", () => {
    const root = site({
      "config/identity.md": namedIdentity,
      "config/topics.yml": learningTopics,
      ...publishedPiece({ media: ["linked.txt"] }),
      "content/secret.txt": "outside",
      "content/media/.keep": "",
    });
    symlinkSync(path.join("..", "secret.txt"), path.join(root, "content", "media", "linked.txt"));
    const result = loadContent(root);

    review({
      content: "解析后离开媒体目录的图片路径失败",
      expected: { errors: [fatal("media-invalid", "how-to-read")], warnings: [] },
      output: { errors: result.errors, warnings: result.warnings },
    });
  });

  it("treats a directory as a missing media file", () => {
    const result = loadContent(
      site({
        "config/identity.md": namedIdentity,
        "config/topics.yml": learningTopics,
        ...publishedPiece({ media: ["album"] }),
        "content/media/album/.keep": "",
      }),
    );

    review({
      content: "图片路径指向目录时视为文件不存在",
      expected: { errors: [fatal("media-not-found", "how-to-read")], warnings: [] },
      output: { errors: result.errors, warnings: result.warnings },
    });
  });
});
