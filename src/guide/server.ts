import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  authorCookie,
  clearAuthorCookie,
  createAuthor,
  loadAuthor,
  passwordsMatch,
  readCookie,
  sessionUsername,
  signSession,
} from "../write/author.js";
import { resolveRoute, routeParts } from "../present/render-site.js";
import { loadContent } from "../content/load-content.js";
import { publish } from "../publish/publish.js";
import { addTopic, readSettings, renderSettings, saveIdentity } from "../write/settings.js";
import { handleUploadRequest } from "../write/upload-page.js";

const BODY_LIMIT = 8 * 1024 * 1024;

const css = `
  :root { color: #1c1915; background: #f6f1e7; }
  body { margin: 0; font-family: "Iowan Old Style", "Songti SC", Palatino, serif; line-height: 1.6; }
  main { width: min(40rem, calc(100% - 2.5rem)); margin: 0 auto; padding: 2.5rem 0 4rem; }
  h1 { font-weight: 500; letter-spacing: 0.03em; }
  form { display: grid; gap: 1rem; }
  label { display: grid; gap: 0.35rem; }
  button, input { font: inherit; }
  button { width: fit-content; padding: 0.35rem 0.9rem; }
  a { color: inherit; }
`;

function loginPage(message = "", create = false): string {
  const note = message ? `<p>${message}</p>` : "";
  const title = create ? "创建作者账号" : "登录";
  const button = create ? "创建并登录" : "登录";
  const hint = create ? "<p>这是唯一的作者账号。创建之后，不能再注册第二个。</p>" : "";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    ${hint}
    ${note}
    <form method="post" action="/login">
      <label>账号<input name="username" autocomplete="username" required /></label>
      <label>密码<input type="password" name="password" autocomplete="current-password" required /></label>
      <button type="submit">${button}</button>
    </form>
    <p><a href="/">回到首页</a></p>
  </main>
</body>
</html>
`;
}

function waitingPage(signedIn: boolean): string {
  const next = signedIn
    ? `<p>请先填写资料和栏目。</p><p><a href="/settings">去设置</a></p>`
    : `<p>网站还在准备。</p><p><a href="/login">登录</a></p>`;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" /><title>网站还在准备</title><style>${css}</style></head><body><main><h1>网站还在准备</h1>${next}</main></body></html>`;
}

function html(res: http.ServerResponse, status: number, body: string, cookie?: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (cookie) res.setHeader("Set-Cookie", cookie);
  res.end(body);
}

function redirect(res: http.ServerResponse, location: string, cookie?: string): void {
  res.statusCode = 303;
  res.setHeader("Location", location);
  if (cookie) res.setHeader("Set-Cookie", cookie);
  res.end();
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error("too-large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function mediaFile(rootDir: string, pathname: string): string | undefined {
  const relative = decodeURIComponent(pathname.slice("/media/".length));
  if (relative.includes("..") || relative.includes("\\")) return undefined;
  const root = path.resolve(rootDir, "content", "media");
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return undefined;
  if (!existsSync(file) || !statSync(file).isFile()) return undefined;
  return file;
}

function contentType(file: string): string {
  const ext = path.extname(file);
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export function createSiteServer(rootDir: string, siteUrl = "http://localhost:4321"): http.Server {
  return http.createServer(async (req, res) => {
    try {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;
    const account = loadAuthor(rootDir);
    const username = sessionUsername(readCookie(req.headers.cookie, "author"), account);
    const signedIn = username !== undefined;

    if (pathname === "/login" && method === "GET") {
      html(res, 200, loginPage("", !account));
      return;
    }
    if (pathname === "/login" && method === "POST") {
      const body = await readBody(req);
      const fields = new URLSearchParams(body.toString("utf8"));
      const name = fields.get("username") ?? "";
      const password = fields.get("password") ?? "";
      if (!account) {
        const created = createAuthor(rootDir, name, password);
        if (!created.ok) {
          html(res, 200, loginPage(created.message, true));
          return;
        }
        redirect(res, "/settings", authorCookie(signSession(created.account)));
        return;
      }
      if (name !== account.username || !passwordsMatch(password, account.password)) {
        html(res, 200, loginPage("账号或密码不正确。"));
        return;
      }
      redirect(res, "/", authorCookie(signSession(account)));
      return;
    }
    if (pathname === "/settings") {
      if (!signedIn) {
        redirect(res, "/login");
        return;
      }
      if (method === "POST") {
        const body = await readBody(req);
        const fields = new URLSearchParams(body.toString("utf8"));
        const form = fields.get("form");
        const result =
          form === "topic"
            ? addTopic(rootDir, fields.get("id") ?? "", fields.get("title") ?? "")
            : saveIdentity(rootDir, {
                name: fields.get("name") ?? "",
                now: fields.get("now") ?? "",
                body: fields.get("body") ?? "",
              });
        html(res, 200, renderSettings(readSettings(rootDir), result.ok ? "已保存。" : result.message));
        return;
      }
      html(res, 200, renderSettings(readSettings(rootDir)));
      return;
    }
    if (pathname === "/logout" && (method === "GET" || method === "POST")) {
      redirect(res, "/", clearAuthorCookie());
      return;
    }
    if (pathname === "/upload") {
      if (!signedIn) {
        redirect(res, "/login");
        return;
      }
      const body = method === "GET" ? Buffer.alloc(0) : await readBody(req);
      const handled = handleUploadRequest({
        method,
        contentType: req.headers["content-type"] ?? "",
        body,
        rootDir,
      });
      html(res, handled.status, handled.html);
      return;
    }
    if (pathname.startsWith("/media/") && (method === "GET" || method === "HEAD")) {
      const file = mediaFile(rootDir, pathname);
      if (!file) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType(file));
      if (method === "HEAD") {
        res.end();
        return;
      }
      await pipeline(createReadStream(file), res);
      return;
    }

    const catalog = loadContent(rootDir);
    const published = publish(catalog);
    if (!published.ok) {
      const preparing = published.errors.every((item) =>
        item.code.startsWith("identity-") || item.code.startsWith("topics-"),
      );
      if (preparing) {
        html(res, 200, waitingPage(signedIn));
        return;
      }
      const codes = published.errors.map((item) => item.code).join(", ");
      html(res, 500, `<!DOCTYPE html><html lang="zh-CN"><body><p>发布停住：${codes}</p></body></html>`);
      return;
    }
    const route = resolveRoute(published, pathname, { siteUrl, signedIn });
    const parts = routeParts(route);
    res.statusCode = parts.status;
    for (const [key, value] of Object.entries(parts.headers)) res.setHeader(key, value);
    res.end(parts.body);
    } catch {
      if (!res.headersSent) res.statusCode = 400;
      res.end("没有写入。");
    }
  });
}
