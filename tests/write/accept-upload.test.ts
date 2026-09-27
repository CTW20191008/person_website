import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, it } from "vitest";
import { acceptUpload } from "../../src/write/accept-upload.js";
import { parseMultipart } from "../../src/write/multipart.js";
import { handleUploadRequest } from "../../src/write/upload-page.js";
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

function site(files: Record<string, string> = {}): string {
  const made = writeSite(files);
  cleanups.push(made.cleanup);
  return made.dir;
}

function markdown(slug: string, extra = "", body = "先写下问题。"): Buffer {
  return Buffer.from(`---
slug: ${slug}
title: 阅读
summary: 先看问题。
kind: essay
status: published
publishedAt: 2026-09-02
category: learning
${extra}---

${body}
`);
}

describe("accept upload", () => {
  it("writes a markdown file after it passes", () => {
    const dir = site();
    const bytes = markdown("reading");
    const result = acceptUpload(dir, { filename: "notes.md", bytes }, []);

    review({
      content: "校验通过后写入记录，文件名使用短链",
      expected: {
        ok: true,
        slug: "reading",
        status: "published",
        saved: bytes.toString("utf8"),
      },
      output: {
        ok: result.ok,
        slug: result.ok ? result.slug : null,
        status: result.ok ? result.status : null,
        saved: readFileSync(path.join(dir, "content/pieces/reading.md"), "utf8"),
      },
    });
  });

  it("stores an image under the name the piece cites", () => {
    const dir = site();
    const bytes = Buffer.from(`---
slug: shore
title: 岸
summary: 一张照片。
kind: photo
status: published
publishedAt: 2026-09-02
category: learning
media:
  - shore.svg
---
`);
    const image = Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n");
    const result = acceptUpload(
      dir,
      { filename: "shore.md", bytes },
      [{ filename: "shore.svg", bytes: image }],
    );

    review({
      content: "上传的图片按文中的文件名保存",
      expected: { ok: true, image: image.toString("utf8") },
      output: {
        ok: result.ok,
        image: readFileSync(path.join(dir, "content/media/shore.svg"), "utf8"),
      },
    });
  });

  it("does not write when a published piece has no title", () => {
    const dir = site({
      "content/pieces/kept.md": markdown("kept").toString("utf8"),
    });
    const before = readFileSync(path.join(dir, "content/pieces/kept.md"), "utf8");
    const result = acceptUpload(
      dir,
      {
        filename: "reading.md",
        bytes: Buffer.from(markdown("reading").toString("utf8").replace("title: 阅读\n", "")),
      },
      [],
    );

    review({
      content: "已发布记录缺少标题时不写入",
      expected: { ok: false, reason: "title-missing", kept: before, added: false },
      output: {
        ok: result.ok,
        reason: result.ok ? "" : result.errors.map((item) => item.code).join(","),
        kept: readFileSync(path.join(dir, "content/pieces/kept.md"), "utf8"),
        added: existsSync(path.join(dir, "content/pieces/reading.md")),
      },
    });
  });

  it("rejects a reserved upload slug without writing", () => {
    const dir = site();
    const result = acceptUpload(dir, { filename: "upload.md", bytes: markdown("upload") }, []);

    review({
      content: "短链 upload 不能作为记录写入",
      expected: { ok: false, code: "slug-reserved", added: false },
      output: {
        ok: result.ok,
        code: result.ok ? "" : result.errors.map((item) => item.code).join(","),
        added: existsSync(path.join(dir, "content/pieces/upload.md")),
      },
    });
  });

  it("saves a draft and reports the warning", () => {
    const dir = site();
    const bytes = Buffer.from(`---
slug: wip
summary: 还在写。
kind: essay
status: draft
publishedAt: 2026-09-02
category: learning
---

还没写完。
`);
    const result = acceptUpload(dir, { filename: "wip.md", bytes }, []);

    review({
      content: "草稿缺少标题时仍然保存，并给出警告",
      expected: { ok: true, status: "draft", warning: "title-missing", saved: true },
      output: {
        ok: result.ok,
        status: result.ok ? result.status : null,
        warning: result.ok ? result.warnings.map((item) => item.code).join(",") : "",
        saved: existsSync(path.join(dir, "content/pieces/wip.md")),
      },
    });
  });

  it("rejects an image name that leaves the media directory", () => {
    const dir = site();
    const result = acceptUpload(
      dir,
      { filename: "reading.md", bytes: markdown("reading", "media:\n  - shore.svg\n") },
      [{ filename: "../shore.svg", bytes: Buffer.from("x") }],
    );

    review({
      content: "图片文件名不能逃出图片目录",
      expected: { ok: false, code: "media-invalid", added: false },
      output: {
        ok: result.ok,
        code: result.ok ? "" : result.errors[0]?.code ?? "",
        added: existsSync(path.join(dir, "content/pieces/reading.md")),
      },
    });
  });

  it("shows the upload form and a refusal on the page", () => {
    const dir = site();
    const form = handleUploadRequest({
      method: "GET",
      contentType: "",
      body: Buffer.alloc(0),
      rootDir: dir,
    });
    const boundary = "----boundary";
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="markdown"; filename="reading.md"\r\n\r\n${markdown("reading").toString("utf8").replace("title: 阅读\n", "")}\r\n--${boundary}--\r\n`,
    );
    const posted = handleUploadRequest({
      method: "POST",
      contentType: `multipart/form-data; boundary=${boundary}`,
      body,
      rootDir: dir,
    });

    review({
      content: "上传页可以选择文件；失败时页面说明没有写入",
      expected: { form: true, refused: true, added: false },
      output: {
        form: form.html.includes("上传") && form.html.includes('name="markdown"'),
        refused: posted.html.includes("没有写入") && posted.html.includes("缺少标题"),
        added: existsSync(path.join(dir, "content/pieces/reading.md")),
      },
    });
  });

  it("reads the markdown and image parts from the request", () => {
    const boundary = "----boundary";
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="markdown"; filename="reading.md"\r\n\r\nhello\r\n--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="shore.svg"\r\n\r\n<svg></svg>\r\n--${boundary}--\r\n`,
    );
    const parts = parseMultipart(body, `multipart/form-data; boundary=${boundary}`);

    review({
      content: "请求里能取出 Markdown 和图片",
      expected: [
        { name: "markdown", filename: "reading.md", text: "hello" },
        { name: "images", filename: "shore.svg", text: "<svg></svg>" },
      ],
      output: parts.map((part) => ({
        name: part.name,
        filename: part.filename,
        text: part.bytes.toString("utf8"),
      })),
    });
  });
});
