import { marked } from "marked";
import type { PublishSuccess, PublishedPiece } from "../publish/publish.js";

const HOME_LIMIT = 10;

export type ResolvedRoute =
  | { status: 200; contentType: string; body: string }
  | { status: 301; location: string }
  | { status: 404; contentType: string; body: string };

export type RenderOptions = {
  siteUrl?: string;
  homeLimit?: number;
  signedIn?: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMarkdown(value: string): string {
  if (value.trim() === "") return "";
  return marked(value, { async: false });
}

function mediaUrl(mediaPath: string): string {
  return `/media/${mediaPath.split("/").map(encodeURIComponent).join("/")}`;
}

const css = `
  :root { color: #1c1915; background: #f6f1e7; }
  body { margin: 0; font-family: "Iowan Old Style", "Songti SC", Palatino, serif; line-height: 1.6; }
  header, main { width: min(40rem, calc(100% - 2.5rem)); margin: 0 auto; }
  header { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; padding: 1.75rem 0 1rem; }
  .name { font-size: 1.35rem; text-decoration: none; color: inherit; }
  nav { display: flex; gap: 1rem; font-family: "Avenir Next", "PingFang SC", sans-serif; font-size: 0.92rem; }
  nav a { color: #5c5346; }
  main { padding-bottom: 4rem; }
  h1 { font-weight: 500; letter-spacing: 0.03em; }
  time, .summary { color: #5c5346; }
  article { font-size: 1.05rem; }
  article img, figure img { max-width: 100%; height: auto; }
  ol { list-style: none; padding: 0; }
  li { padding: 0.9rem 0; border-top: 1px solid #e4dccb; }
  li a { color: inherit; }
  .more { font-family: "Avenir Next", "PingFang SC", sans-serif; }
`;

function page(result: PublishSuccess, title: string, main: string, signedIn = false): string {
  const fullTitle = title === result.identity.name ? title : `${title} — ${result.identity.name}`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(fullTitle)}</title>
  <style>${css}</style>
</head>
<body>
  <header>
    <a class="name" href="/">${escapeHtml(result.identity.name)}</a>
    <nav>
      <a href="/archive">时间线</a>
      <a href="/about">关于</a>
      ${signedIn ? `<a href="/upload">上传</a><a href="/settings">设置</a><a href="/logout">退出</a>` : `<a href="/login">登录</a>`}
    </nav>
  </header>
  <main>
    ${main}
  </main>
</body>
</html>
`;
}

function pieceItem(piece: PublishedPiece): string {
  return `<li>
    <a href="${escapeHtml(piece.path)}">${escapeHtml(piece.title)}</a>
    <div><time datetime="${escapeHtml(piece.publishedAt)}">${escapeHtml(piece.publishedAt)}</time></div>
    <p class="summary">${escapeHtml(piece.summary)}</p>
  </li>`;
}

function pieceList(pieces: PublishedPiece[]): string {
  if (pieces.length === 0) return "<p>还没有公开发表的记录。</p>";
  return `<ol>${pieces.map(pieceItem).join("\n")}</ol>`;
}

function renderHome(result: PublishSuccess, homeLimit: number, signedIn = false): string {
  const shown = result.pieces.slice(0, homeLimit);
  const more =
    result.pieces.length > shown.length
      ? `<p class="more"><a href="/archive">全部记录</a></p>`
      : "";
  return page(
    result,
    result.identity.name,
    `${pieceList(shown)}
    ${more}`,
    signedIn,
  );
}

function renderAbout(result: PublishSuccess, signedIn = false): string {
  return page(result, "关于", renderMarkdown(result.identity.body), signedIn);
}

function renderArchive(result: PublishSuccess, signedIn = false): string {
  return page(result, "时间线", `<h1>时间线</h1>${pieceList(result.pieces)}`, signedIn);
}

function renderTopic(result: PublishSuccess, id: string, signedIn = false): string | undefined {
  const topic = result.topics.find((item) => item.id === id);
  if (!topic) return undefined;
  const pieces = result.pieces.filter((piece) => piece.category === id);
  return page(result, topic.title, `<h1>${escapeHtml(topic.title)}</h1>${pieceList(pieces)}`, signedIn);
}

function renderPiece(result: PublishSuccess, piece: PublishedPiece, signedIn = false): string {
  const images = piece.media
    .map(
      (item) =>
        `<figure><img src="${escapeHtml(mediaUrl(item))}" alt="" /></figure>`,
    )
    .join("\n");
  return page(
    result,
    piece.title,
    `<h1>${escapeHtml(piece.title)}</h1>
    <time datetime="${escapeHtml(piece.publishedAt)}">${escapeHtml(piece.publishedAt)}</time>
    <p class="summary">${escapeHtml(piece.summary)}</p>
    <article>${piece.html}</article>
    ${images}`,
    signedIn,
  );
}

function renderNotFound(result: PublishSuccess, signedIn = false): string {
  return page(
    result,
    "没有这一页",
    `<h1>没有这一页</h1><p><a href="/">回到首页</a></p>`,
    signedIn,
  );
}

function renderFeed(result: PublishSuccess, siteUrl: string): string {
  const origin = siteUrl.replace(/\/$/, "");
  const items = result.feed
    .map((entry) => {
      const link = `${origin}${entry.path}`;
      const pubDate = new Date(`${entry.publishedAt}T00:00:00Z`).toUTCString();
      return `<item>
      <title>${escapeHtml(entry.title)}</title>
      <link>${escapeHtml(link)}</link>
      <guid>${escapeHtml(link)}</guid>
      <pubDate>${escapeHtml(pubDate)}</pubDate>
      <description>${escapeHtml(entry.summary)}</description>
      <content:encoded><![CDATA[${entry.html.replaceAll("]]>", "]]]]><![CDATA[>")}]]></content:encoded>
    </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeHtml(result.identity.name)}</title>
    <link>${escapeHtml(`${origin}/`)}</link>
    <description>${escapeHtml(result.identity.name)}</description>
    ${items}
  </channel>
</rss>
`;
}

function renderSitemap(result: PublishSuccess, siteUrl: string): string {
  const origin = siteUrl.replace(/\/$/, "");
  const urls = result.sitemap
    .map((item) => `<url><loc>${escapeHtml(`${origin}${item === "/" ? "/" : item}`)}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls}
</urlset>
`;
}

function normalize(pathname: string): string {
  if (pathname === "") return "/";
  const withSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (withSlash.length > 1 && withSlash.endsWith("/")) return withSlash.slice(0, -1);
  return withSlash;
}

export function resolveRoute(
  result: PublishSuccess,
  pathname: string,
  options: RenderOptions = {},
): ResolvedRoute {
  const path = normalize(pathname);
  const siteUrl = options.siteUrl ?? "https://example.com";
  const homeLimit = options.homeLimit ?? HOME_LIMIT;
  const signedIn = options.signedIn ?? false;
  const html = "text/html; charset=utf-8";
  const xml = "application/xml; charset=utf-8";
  const redirect = result.redirects.find((item) => `/${item.from}` === path);
  if (redirect) return { status: 301, location: redirect.to };

  if (path === "/") return { status: 200, contentType: html, body: renderHome(result, homeLimit, signedIn) };
  if (path === "/about") return { status: 200, contentType: html, body: renderAbout(result, signedIn) };
  if (path === "/archive") return { status: 200, contentType: html, body: renderArchive(result, signedIn) };
  if (path === "/feed.xml") return { status: 200, contentType: xml, body: renderFeed(result, siteUrl) };
  if (path === "/sitemap.xml") {
    return { status: 200, contentType: xml, body: renderSitemap(result, siteUrl) };
  }
  if (path.startsWith("/topics/")) {
    const body = renderTopic(result, path.slice("/topics/".length), signedIn);
    if (body) return { status: 200, contentType: html, body };
  }
  const piece = result.pieces.find((item) => item.path === path);
  if (piece) return { status: 200, contentType: html, body: renderPiece(result, piece, signedIn) };
  return { status: 404, contentType: html, body: renderNotFound(result, signedIn) };
}

export function routeParts(route: ResolvedRoute): {
  status: number;
  body: string;
  headers: Record<string, string>;
} {
  if (route.status === 301) {
    return { status: 301, body: "", headers: { Location: route.location } };
  }
  return {
    status: route.status,
    body: route.body,
    headers: { "Content-Type": route.contentType },
  };
}
