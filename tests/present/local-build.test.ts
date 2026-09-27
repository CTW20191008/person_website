import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, it } from "vitest";
import { planLocalBuild, runLocalBuild } from "../../src/present/local-build.js";
import { makePiecesDir } from "../helpers/pieces-dir.js";
import { beginCase, review, writeReviewReport } from "../helpers/review.js";
import { writeSite } from "../helpers/site-repo.js";

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

function keep(made: { dir: string; cleanup: () => void }): string {
  cleanups.push(made.cleanup);
  return made.dir;
}

function capture(run: () => void): string[] {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    run();
  } finally {
    console.error = original;
  }
  return lines;
}

const reading = `---
slug: reading
title: 阅读
summary: 先看问题。
kind: essay
status: published
publishedAt: 2026-09-02
category: learning
---

先写下问题。
`;

const missingTitle = `---
slug: reading
summary: 先看问题。
kind: essay
status: published
publishedAt: 2026-09-02
category: learning
---

先写下问题。
`;

const draft = `---
slug: wip
summary: 还在写。
kind: essay
status: draft
publishedAt: 2026-09-02
category: learning
---

还没写完。
`;

const reservedDraft = `---
slug: about
title: 草稿
summary: 摘要
kind: essay
status: draft
publishedAt: 2026-09-02
category: learning
---

正文
`;

describe("local build", () => {
  it("stops before building when a published piece has no title", () => {
    const dir = keep(writeSite({ "content/pieces/reading.md": missingTitle }));
    const marker = path.join(dir, "already-public.txt");
    writeFileSync(marker, "已公开");
    const calls: string[] = [];
    const lines = capture(() => {
      runLocalBuild(dir, (root) => {
        calls.push(root);
        writeFileSync(marker, "被替换");
      });
    });

    review({
      content: "致命错误时不启动构建，已有站点保持原样",
      expected: { called: 0, marker: "已公开", stopped: true, code: true },
      output: {
        called: calls.length,
        marker: readFileSync(marker, "utf8"),
        stopped: lines.some((line) => line.includes("发布停住")),
        code: lines.some((line) => line.includes("title-missing")),
      },
    });
  });

  it("builds after warning about an incomplete draft", () => {
    const dir = keep(
      writeSite({
        "content/pieces/reading.md": reading,
        "content/pieces/wip.md": draft,
      }),
    );
    const calls: string[] = [];
    const lines = capture(() => {
      runLocalBuild(dir, (root) => {
        calls.push(root);
      });
    });
    const plan = planLocalBuild(dir);

    review({
      content: "草稿缺标题时给出警告，并继续构建",
      expected: { proceed: true, called: [dir], warning: "警告 wip：title-missing" },
      output: {
        proceed: plan.proceed,
        called: calls,
        warning: lines.find((line) => line.startsWith("警告 ")) ?? null,
      },
    });
  });

  it("stops when a draft uses a reserved slug", () => {
    const dir = keep(writeSite({ "content/pieces/about.md": reservedDraft }));
    const calls: string[] = [];
    capture(() => {
      runLocalBuild(dir, (root) => {
        calls.push(root);
      });
    });

    review({
      content: "草稿使用保留短链时不启动构建",
      expected: 0,
      output: calls.length,
    });
  });

  it("reports a missing identity and topic list", () => {
    const dir = keep(makePiecesDir({}));
    const plan = planLocalBuild(dir);

    review({
      content: "缺少身份或栏目词表时不构建",
      expected: { proceed: false, codes: ["identity-missing", "topics-missing"] },
      output: {
        proceed: plan.proceed,
        codes: plan.proceed ? [] : plan.errors.map((error) => error.code).sort(),
      },
    });
  });
});
