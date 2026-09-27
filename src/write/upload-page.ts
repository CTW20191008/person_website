import { acceptUpload, explainDiagnostic, type UploadFile, type UploadResult } from "./accept-upload.js";
import { parseMultipart } from "./multipart.js";

const css = `
  :root { color: #1c1915; background: #f6f1e7; }
  body { margin: 0; font-family: "Iowan Old Style", "Songti SC", Palatino, serif; line-height: 1.6; }
  main { width: min(40rem, calc(100% - 2.5rem)); margin: 0 auto; padding: 2.5rem 0 4rem; }
  h1 { font-weight: 500; letter-spacing: 0.03em; }
  form { display: grid; gap: 1rem; }
  label { display: grid; gap: 0.35rem; }
  button { width: fit-content; font: inherit; padding: 0.35rem 0.9rem; }
  a { color: inherit; }
  .note, .warn { color: #5c5346; }
`;

function page(main: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>上传一篇记录</title>
  <style>${css}</style>
</head>
<body>
  <main>
    <h1>上传一篇记录</h1>
    ${main}
    <p><a href="/">回到首页</a></p>
  </main>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const form = `<form method="post" action="/upload" enctype="multipart/form-data">
      <label>Markdown 文件<input type="file" name="markdown" accept=".md,text/markdown" required /></label>
      <label>图片<input type="file" name="images" multiple /></label>
      <p class="note">图片的文件名要和文中 media 路径一致，例如 shore.svg。</p>
      <button type="submit">上传</button>
    </form>`;

export function uploadForm(): string {
  return page(`<p>在自己的编辑器里写好 Markdown，再选择这篇文章和它用到的图片。</p>
    ${form}`);
}

export function uploadReport(result: UploadResult): string {
  if (!result.ok) {
    const items = result.errors
      .map((item) => `<li>${escapeHtml(explainDiagnostic(item))}</li>`)
      .join("");
    return page(`<p>没有写入。</p><ul>${items}</ul>${form}`);
  }
  const warnings = result.warnings
    .map((item) => `<li>${escapeHtml(explainDiagnostic(item))}</li>`)
    .join("");
  const warningBlock = warnings ? `<ul class="warn">${warnings}</ul>` : "";
  if (result.status === "published") {
    return page(
      `<p>已保存。<a href="/${escapeHtml(result.slug)}">查看这篇记录</a></p>${warningBlock}`,
    );
  }
  return page(`<p>已保存为草稿。读者页面上看不到这篇记录。</p>${warningBlock}`);
}

export function handleUploadRequest(input: {
  method: string;
  contentType: string;
  body: Buffer;
  rootDir: string;
}): { status: number; html: string } {
  if (input.method === "GET") return { status: 200, html: uploadForm() };
  if (input.method !== "POST") return { status: 405, html: page("<p>没有写入。</p>") };

  const parts = parseMultipart(input.body, input.contentType);
  const markdown = parts.find((part) => part.name === "markdown" && part.filename);
  if (!markdown?.filename || markdown.bytes.length === 0) {
    return { status: 200, html: page(`<p>没有写入。请选择一篇 Markdown 文件。</p>`) };
  }
  const images: UploadFile[] = parts
    .filter((part) => part.name === "images" && part.filename && part.bytes.length > 0)
    .map((part) => ({ filename: part.filename ?? "", bytes: part.bytes }));
  const result = acceptUpload(
    input.rootDir,
    { filename: markdown.filename, bytes: markdown.bytes },
    images,
  );
  return { status: 200, html: uploadReport(result) };
}
