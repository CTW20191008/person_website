import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import {
  SLUG_PATTERN,
  type Diagnostic,
  type DiagnosticCode,
  type Kind,
  type Piece,
  type PieceLoadResult,
  type Status,
} from "./types.js";

const RESERVED = new Set([
  "about",
  "archive",
  "topics",
  "photos",
  "tags",
  "upload",
  "login",
  "logout",
  "settings",
  "feed.xml",
  "sitemap.xml",
]);
const KINDS = new Set<Kind>(["essay", "note", "photo"]);

type ParsedFile = {
  piece: Piece;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  rawSlug?: string;
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isString);
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function diagnostic(
  level: "fatal" | "warning",
  code: DiagnosticCode,
  slug: string,
): Diagnostic {
  return { level, code, slug };
}

function blankPiece(slug: string): Piece {
  return {
    slug,
    status: "draft",
    media: [],
    aliases: [],
    body: "",
  };
}

function parseFile(piecesDir: string, filename: string): ParsedFile {
  const stem = filename.slice(0, -3);
  const raw = readFileSync(path.join(piecesDir, filename), "utf8");

  let data: Record<string, unknown>;
  let body = "";
  try {
    const parsed = matter(raw, {
      engines: {
        yaml: {
          parse: (input: string) =>
            (yaml.load(input, { schema: yaml.CORE_SCHEMA }) ?? {}) as Record<
              string,
              unknown
            >,
        },
      },
    });
    data = (parsed.data ?? {}) as Record<string, unknown>;
    body = parsed.content.trim();
  } catch {
    return {
      piece: blankPiece(SLUG_PATTERN.test(stem) ? stem : ""),
      errors: [diagnostic("fatal", "frontmatter-invalid", stem)],
      warnings: [],
    };
  }

  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const slug = isString(data.slug) && data.slug.length > 0 ? data.slug : "";
  const hasSlug = slug !== "";
  const reportedSlug = hasSlug ? slug : stem;

  if (!hasSlug) {
    errors.push(diagnostic("fatal", "slug-missing", reportedSlug));
  } else {
    if (!SLUG_PATTERN.test(slug)) {
      errors.push(diagnostic("fatal", "slug-invalid", slug));
    }
    if (RESERVED.has(slug)) {
      errors.push(diagnostic("fatal", "slug-reserved", slug));
    }
    if (slug !== stem) {
      errors.push(diagnostic("fatal", "slug-mismatch", slug));
    }
  }

  const statusInvalid =
    data.status !== undefined &&
    data.status !== "draft" &&
    data.status !== "published";
  const status: Status = data.status === "published" ? "published" : "draft";
  if (statusInvalid) {
    errors.push(diagnostic("fatal", "status-invalid", reportedSlug));
  }

  const kindValue = data.kind;
  const kind =
    isString(kindValue) && KINDS.has(kindValue as Kind)
      ? (kindValue as Kind)
      : undefined;
  const kindWasProvided = kindValue !== undefined && kindValue !== "";
  if (!statusInvalid && status === "published" && !kind) {
    errors.push(diagnostic("fatal", "kind-invalid", reportedSlug));
  } else if (!statusInvalid && status !== "published" && kindWasProvided && !kind) {
    warnings.push(diagnostic("warning", "kind-invalid", reportedSlug));
  }

  const publishedAt = isString(data.publishedAt) ? data.publishedAt : undefined;
  if (publishedAt !== undefined && !isRealDate(publishedAt)) {
    errors.push(diagnostic("fatal", "date-invalid", reportedSlug));
  }

  const title = isString(data.title) && data.title.trim() !== "" ? data.title : undefined;
  const summary =
    isString(data.summary) && data.summary.trim() !== "" ? data.summary : undefined;
  const category =
    isString(data.category) && data.category.trim() !== ""
      ? data.category
      : undefined;
  const media = stringList(data.media);

  const markMissing = (code: DiagnosticCode, missing: boolean) => {
    if (!missing || statusInvalid) return;
    const level = status === "published" ? "fatal" : "warning";
    const bucket = status === "published" ? errors : warnings;
    bucket.push(diagnostic(level, code, reportedSlug));
  };

  markMissing("title-missing", !title);
  markMissing("summary-missing", !summary);
  markMissing("published-at-missing", !publishedAt);

  const bodyRequired =
    status === "published"
      ? kind === "essay" || kind === "note"
      : kind === undefined || kind === "essay" || kind === "note";
  if (bodyRequired && body === "") {
    markMissing("body-missing", true);
  }

  if (!statusInvalid && status === "published" && !category) {
    errors.push(diagnostic("fatal", "category-missing", reportedSlug));
  }
  if (!statusInvalid && status === "published" && kind === "photo" && media.length === 0) {
    errors.push(diagnostic("fatal", "media-missing", reportedSlug));
  }

  const piece: Piece = {
    slug,
    status,
    media,
    aliases: stringList(data.aliases),
    body,
  };
  if (title) piece.title = title;
  if (summary) piece.summary = summary;
  if (kind) piece.kind = kind;
  if (publishedAt) piece.publishedAt = publishedAt;
  if (category) piece.category = category;

  return {
    piece,
    errors,
    warnings,
    rawSlug: hasSlug ? slug : undefined,
  };
}

function markCrossFileConflicts(parsed: ParsedFile[]) {
  const counts = new Map<string, number>();
  for (const item of parsed) {
    if (!item.rawSlug) continue;
    counts.set(item.rawSlug, (counts.get(item.rawSlug) ?? 0) + 1);
  }
  const slugSet = new Set(counts.keys());

  const aliasOwners = new Map<string, number>();
  for (const item of parsed) {
    for (const alias of item.piece.aliases) {
      aliasOwners.set(alias, (aliasOwners.get(alias) ?? 0) + 1);
    }
  }

  for (const item of parsed) {
    if (item.rawSlug && (counts.get(item.rawSlug) ?? 0) > 1) {
      item.errors.push(diagnostic("fatal", "slug-duplicate", item.rawSlug));
    }
    const conflict = item.piece.aliases.some(
      (alias) =>
        RESERVED.has(alias) ||
        slugSet.has(alias) ||
        (aliasOwners.get(alias) ?? 0) > 1,
    );
    if (conflict) {
      item.errors.push(
        diagnostic("fatal", "alias-conflict", item.rawSlug ?? item.piece.slug),
      );
    }
  }
}

export function loadPieces(piecesDir: string): PieceLoadResult {
  const filenames = readdirSync(piecesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);

  const parsed = filenames.map((filename) => parseFile(piecesDir, filename));
  markCrossFileConflicts(parsed);

  return {
    pieces: parsed
      .map((item) => item.piece)
      .sort((left, right) => left.slug.localeCompare(right.slug)),
    errors: parsed.flatMap((item) => item.errors),
    warnings: parsed.flatMap((item) => item.warnings),
  };
}
