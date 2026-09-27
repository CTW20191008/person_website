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
  media: string[];
  aliases: string[];
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

export type PublishedTopic = {
  id: string;
  title: string;
  path: string;
};

export type PublishSuccess = {
  ok: true;
  identity: Identity;
  pieces: PublishedPiece[];
  topics: PublishedTopic[];
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
    media: piece.media,
    aliases: piece.aliases,
  };
  if (piece.kind) published.kind = piece.kind;
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
  const titles = new Map(catalog.topics.map((topic) => [topic.id, topic.title]));
  const topics = [...new Set(pieces.map((piece) => piece.category))]
    .sort((left, right) => left.localeCompare(right))
    .map((id) => ({ id, title: titles.get(id) ?? id, path: `/topics/${id}` }));
  const sitemap = [
    "/",
    "/about",
    "/archive",
    ...topics.map((topic) => topic.path),
    ...pieces.map((piece) => piece.path),
    "/feed.xml",
    "/sitemap.xml",
  ];

  return {
    ok: true,
    identity: catalog.identity,
    pieces,
    topics,
    redirects,
    feed,
    sitemap,
    warnings: catalog.warnings,
  };
}
