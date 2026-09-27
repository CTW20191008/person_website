import { marked } from "marked";
import type { ContentCatalog, Diagnostic, Identity, Kind } from "../content/types.js";

export type PublishedPiece = {
  slug: string;
  path: string;
  title: string;
  summary: string;
  publishedAt: string;
  category: string;
  html: string;
  kind?: Kind;
  created?: string;
  updated?: string;
  tags: string[];
  media: string[];
  aliases: string[];
  series?: string;
  language: string;
  translationGroup?: string;
  author?: string;
};

export type Redirect = {
  from: string;
  to: string;
};

export type FeedEntry = {
  title: string;
  path: string;
  publishedAt: string;
  summary: string;
  html: string;
};

export type PublishSuccess = {
  ok: true;
  identity: Identity;
  pieces: PublishedPiece[];
  redirects: Redirect[];
  feed: FeedEntry[];
  sitemap: string[];
  warnings: Diagnostic[];
};

export type PublishFailure = {
  ok: false;
  errors: Diagnostic[];
};

export type PublishResult = PublishSuccess | PublishFailure;

function renderHtml(body: string): string {
  if (body.trim() === "") return "";
  return marked(body, { async: false });
}

function toPublished(piece: ContentCatalog["pieces"][number]): PublishedPiece {
  const published: PublishedPiece = {
    slug: piece.slug,
    path: `/${piece.slug}`,
    title: piece.title ?? "",
    summary: piece.summary ?? "",
    publishedAt: piece.publishedAt ?? "",
    category: piece.category ?? "",
    html: renderHtml(piece.body),
    tags: piece.tags,
    media: piece.media,
    aliases: piece.aliases,
    language: piece.language,
  };
  if (piece.kind) published.kind = piece.kind;
  if (piece.created) published.created = piece.created;
  if (piece.updated) published.updated = piece.updated;
  if (piece.series) published.series = piece.series;
  if (piece.translationGroup) published.translationGroup = piece.translationGroup;
  if (piece.author) published.author = piece.author;
  return published;
}

export function publish(catalog: ContentCatalog): PublishResult {
  if (catalog.errors.length > 0 || catalog.identity === undefined) {
    return { ok: false, errors: catalog.errors };
  }

  const pieces = catalog.pieces
    .filter((piece) => piece.status === "published")
    .map(toPublished)
    .sort((left, right) => {
      const byDate = right.publishedAt.localeCompare(left.publishedAt);
      if (byDate !== 0) return byDate;
      return left.slug.localeCompare(right.slug);
    });

  const redirects = pieces.flatMap((piece) =>
    piece.aliases.map((alias) => ({ from: alias, to: piece.path })),
  );
  const feed = pieces.map((piece) => ({
    title: piece.title,
    path: piece.path,
    publishedAt: piece.publishedAt,
    summary: piece.summary,
    html: piece.html,
  }));
  const topicIds = [...new Set(pieces.map((piece) => piece.category))].sort((left, right) =>
    left.localeCompare(right),
  );
  const sitemap = [
    "/",
    "/about",
    "/now",
    "/archive",
    ...topicIds.map((id) => `/topics/${id}`),
    ...pieces.map((piece) => piece.path),
    "/feed.xml",
    "/sitemap.xml",
  ];

  return {
    ok: true,
    identity: catalog.identity,
    pieces,
    redirects,
    feed,
    sitemap,
    warnings: catalog.warnings,
  };
}
