import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import { loadContent } from "../content/load-content.js";
import { SLUG_PATTERN, type Diagnostic, type DiagnosticCode } from "../content/types.js";
import { publish } from "../publish/publish.js";

export type UploadFile = {
  filename: string;
  bytes: Buffer;
};

export type UploadSuccess = {
  ok: true;
  slug: string;
  status: "draft" | "published";
  warnings: Diagnostic[];
};

export type UploadFailure = {
  ok: false;
  errors: Diagnostic[];
};

export type UploadResult = UploadSuccess | UploadFailure;

const reasons: Record<DiagnosticCode, string> = {
  "frontmatter-invalid": "文件头无法读取",
  "slug-missing": "缺少短链",
  "slug-invalid": "短链只能使用小写英文、数字和连字符",
  "slug-mismatch": "短链与文件名不一致",
  "slug-reserved": "这个短链留给站点页面使用",
  "slug-duplicate": "已经有另一篇记录使用这个短链",
  "alias-conflict": "别名与已有地址冲突",
  "status-invalid": "状态只能是草稿或已发布",
  "kind-invalid": "类型无法识别",
  "date-invalid": "日期须为 YYYY-MM-DD",
  "title-missing": "缺少标题",
  "summary-missing": "缺少摘要",
  "published-at-missing": "缺少发布日",
  "body-missing": "缺少正文",
  "media-missing": "照片至少需要一张图片",
  "category-missing": "缺少栏目",
  "identity-missing": "还没有身份文件",
  "identity-invalid": "身份文件无法读取",
  "identity-name-missing": "身份文件缺少名字",
  "topics-missing": "还没有栏目词表",
  "topics-invalid": "栏目词表无法读取",
  "topics-id-invalid": "栏目编号无法使用",
  "topics-title-missing": "栏目缺少标题",
  "topics-duplicate": "栏目编号重复",
  "category-unknown": "栏目不在词表中",
  "media-invalid": "图片路径无法使用",
  "media-not-found": "缺少文中引用的图片",
};

export function explainDiagnostic(item: Diagnostic): string {
  const reason = reasons[item.code];
  return item.slug ? `${item.slug}：${reason}` : reason;
}

function pieceFilename(markdown: string, uploadName: string): string {
  try {
    const parsed = matter(markdown, {
      engines: {
        yaml: {
          parse: (input: string) =>
            (yaml.load(input, { schema: yaml.CORE_SCHEMA }) ?? {}) as Record<string, unknown>,
        },
      },
    });
    const slug = parsed.data.slug;
    if (typeof slug === "string" && SLUG_PATTERN.test(slug)) return `${slug}.md`;
  } catch {
    return "incoming.md";
  }
  const base = path.basename(uploadName);
  if (/^[a-z0-9][a-z0-9.-]*\.md$/.test(base) && !base.includes("..")) return base;
  return "incoming.md";
}

function imageFilename(filename: string): string | undefined {
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) return undefined;
  const base = path.basename(filename);
  if (base === "" || base === "." || base === ".." || base !== filename) return undefined;
  return base;
}

function stageSite(rootDir: string, temp: string): void {
  const config = path.join(rootDir, "config");
  if (existsSync(config)) cpSync(config, path.join(temp, "config"), { recursive: true });
  const pieces = path.join(rootDir, "content", "pieces");
  const media = path.join(rootDir, "content", "media");
  if (existsSync(pieces)) cpSync(pieces, path.join(temp, "content", "pieces"), { recursive: true });
  else mkdirSync(path.join(temp, "content", "pieces"), { recursive: true });
  if (existsSync(media)) cpSync(media, path.join(temp, "content", "media"), { recursive: true });
  else mkdirSync(path.join(temp, "content", "media"), { recursive: true });
}

export function acceptUpload(
  rootDir: string,
  markdown: UploadFile,
  images: UploadFile[],
): UploadResult {
  const named: Array<{ filename: string; bytes: Buffer }> = [];
  for (const image of images) {
    const filename = imageFilename(image.filename);
    if (!filename || named.some((item) => item.filename === filename)) {
      return {
        ok: false,
        errors: [{ level: "fatal", code: "media-invalid", slug: "" }],
      };
    }
    named.push({ filename, bytes: image.bytes });
  }

  const temp = mkdtempSync(path.join(tmpdir(), "upload-"));
  try {
    stageSite(rootDir, temp);
    const text = markdown.bytes.toString("utf8");
    const filename = pieceFilename(text, markdown.filename);
    writeFileSync(path.join(temp, "content", "pieces", filename), markdown.bytes);
    for (const image of named) {
      writeFileSync(path.join(temp, "content", "media", image.filename), image.bytes);
    }

    const catalog = loadContent(temp);
    const result = publish(catalog);
    if (!result.ok) return { ok: false, errors: result.errors };

    const slug = filename.slice(0, -".md".length);
    const piece = catalog.pieces.find((item) => item.slug === slug);
    if (!piece) {
      return {
        ok: false,
        errors: [{ level: "fatal", code: "slug-missing", slug: "" }],
      };
    }

    mkdirSync(path.join(rootDir, "content", "pieces"), { recursive: true });
    mkdirSync(path.join(rootDir, "content", "media"), { recursive: true });
    writeFileSync(path.join(rootDir, "content", "pieces", `${piece.slug}.md`), markdown.bytes);
    for (const image of named) {
      writeFileSync(path.join(rootDir, "content", "media", image.filename), image.bytes);
    }
    return {
      ok: true,
      slug: piece.slug,
      status: piece.status,
      warnings: catalog.warnings.filter((item) => item.slug === piece.slug),
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
