import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import { loadPieces } from "./load-pieces.js";
import {
  findTopic,
  SLUG_PATTERN,
  type ContentCatalog,
  type Diagnostic,
  type DiagnosticCode,
  type Identity,
  type Piece,
  type Topic,
} from "./types.js";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function diagnostic(code: DiagnosticCode, slug = ""): Diagnostic {
  return { level: "fatal", code, slug };
}

function warning(code: DiagnosticCode, slug: string): Diagnostic {
  return { level: "warning", code, slug };
}

function readYaml(file: string): unknown {
  const raw = readFileSync(file, "utf8");
  return yaml.load(raw, { schema: yaml.CORE_SCHEMA });
}

function loadIdentity(rootDir: string): {
  identity?: Identity;
  errors: Diagnostic[];
} {
  const file = path.join(rootDir, "config", "identity.md");
  if (!existsSync(file) || !statSync(file).isFile()) {
    return { errors: [diagnostic("identity-missing")] };
  }

  let data: Record<string, unknown>;
  let body = "";
  try {
    const parsed = matter(readFileSync(file, "utf8"), {
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
    return { errors: [diagnostic("identity-invalid")] };
  }

  const errors: Diagnostic[] = [];
  const name = isString(data.name) ? data.name.trim() : "";
  if (name === "") errors.push(diagnostic("identity-name-missing"));

  if (errors.length > 0) return { errors };
  return {
    identity: { name, body },
    errors,
  };
}

function loadTopics(rootDir: string): { topics: Topic[]; errors: Diagnostic[] } {
  const file = path.join(rootDir, "config", "topics.yml");
  if (!existsSync(file) || !statSync(file).isFile()) {
    return { topics: [], errors: [diagnostic("topics-missing")] };
  }

  let parsed: unknown;
  try {
    parsed = readYaml(file);
  } catch {
    return { topics: [], errors: [diagnostic("topics-invalid")] };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { topics: [], errors: [diagnostic("topics-invalid")] };
  }
  const list = (parsed as Record<string, unknown>).topics;
  if (!Array.isArray(list)) {
    return { topics: [], errors: [diagnostic("topics-invalid")] };
  }

  const errors: Diagnostic[] = [];
  const topics: Topic[] = [];
  const idCounts = new Map<string, number>();

  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(diagnostic("topics-id-invalid"));
      continue;
    }
    const record = item as Record<string, unknown>;
    const rawId = isString(record.id) ? record.id : "";
    const idOk = SLUG_PATTERN.test(rawId);
    if (!idOk) errors.push(diagnostic("topics-id-invalid", rawId));
    const title = isString(record.title) ? record.title.trim() : "";
    if (idOk && title === "") errors.push(diagnostic("topics-title-missing", rawId));
    if (idOk) idCounts.set(rawId, (idCounts.get(rawId) ?? 0) + 1);
    if (idOk && title !== "") topics.push({ id: rawId, title });
  }

  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rawId = (item as Record<string, unknown>).id;
    if (!isString(rawId) || !SLUG_PATTERN.test(rawId)) continue;
    if ((idCounts.get(rawId) ?? 0) > 1) {
      errors.push(diagnostic("topics-duplicate", rawId));
    }
  }

  if (errors.length > 0) return { topics: [], errors };
  topics.sort((left, right) => left.id.localeCompare(right.id));
  return { topics, errors };
}

function checkCategories(
  pieces: Piece[],
  topics: Topic[],
  topicsOk: boolean,
): { errors: Diagnostic[]; warnings: Diagnostic[] } {
  if (!topicsOk) return { errors: [], warnings: [] };
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  for (const piece of pieces) {
    if (piece.category === undefined) continue;
    const matched = findTopic(topics, piece.category);
    if (matched) {
      piece.category = matched.id;
      continue;
    }
    const item =
      piece.status === "published"
        ? diagnostic("category-unknown", piece.slug)
        : warning("category-unknown", piece.slug);
    (item.level === "fatal" ? errors : warnings).push(item);
  }
  return { errors, warnings };
}

function isIllegalMediaPath(value: string): boolean {
  if (value.trim() === "") return true;
  if (value.includes("\\") || value.includes("..")) return true;
  if (path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) return true;
  return false;
}

function classifyMedia(mediaRoot: string, mediaPath: string): "ok" | "invalid" | "missing" {
  if (isIllegalMediaPath(mediaPath)) return "invalid";
  const target = path.resolve(mediaRoot, mediaPath);
  const lexical = path.relative(mediaRoot, target);
  if (lexical.startsWith("..") || path.isAbsolute(lexical)) return "invalid";
  if (!existsSync(mediaRoot)) return "missing";

  let realRoot: string;
  try {
    realRoot = realpathSync(mediaRoot);
  } catch {
    return "missing";
  }
  let realTarget: string;
  try {
    realTarget = realpathSync(target);
  } catch {
    return "missing";
  }
  const resolved = path.relative(realRoot, realTarget);
  if (resolved.startsWith("..") || path.isAbsolute(resolved)) return "invalid";
  try {
    if (!statSync(realTarget).isFile()) return "missing";
  } catch {
    return "missing";
  }
  return "ok";
}

function checkMedia(
  rootDir: string,
  pieces: Piece[],
): { errors: Diagnostic[]; warnings: Diagnostic[] } {
  const mediaRoot = path.resolve(rootDir, "content", "media");
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  for (const piece of pieces) {
    for (const mediaPath of piece.media) {
      const kind = classifyMedia(mediaRoot, mediaPath);
      if (kind === "ok") continue;
      if (kind === "invalid") {
        errors.push(diagnostic("media-invalid", piece.slug));
        continue;
      }
      const item =
        piece.status === "published"
          ? diagnostic("media-not-found", piece.slug)
          : warning("media-not-found", piece.slug);
      (item.level === "fatal" ? errors : warnings).push(item);
    }
  }
  return { errors, warnings };
}

export function loadContent(rootDir: string): ContentCatalog {
  const identityResult = loadIdentity(rootDir);
  const topicsResult = loadTopics(rootDir);
  const piecesDir = path.join(rootDir, "content", "pieces");
  const pieceResult =
    existsSync(piecesDir) && statSync(piecesDir).isDirectory()
      ? loadPieces(piecesDir)
      : { pieces: [], errors: [], warnings: [] };

  const pieces = pieceResult.pieces;
  const categories = checkCategories(
    pieces,
    topicsResult.topics,
    topicsResult.errors.length === 0,
  );
  const media = checkMedia(rootDir, pieces);

  return {
    identity: identityResult.identity,
    topics: topicsResult.topics,
    pieces,
    errors: [
      ...identityResult.errors,
      ...topicsResult.errors,
      ...pieceResult.errors,
      ...categories.errors,
      ...media.errors,
    ],
    warnings: [
      ...pieceResult.warnings,
      ...categories.warnings,
      ...media.warnings,
    ],
  };
}
