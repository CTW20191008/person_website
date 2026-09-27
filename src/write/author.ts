import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const SESSION_MS = 14 * 24 * 60 * 60 * 1000;

export type AuthorAccount = {
  username: string;
  password: string;
};

export function createAuthor(
  rootDir: string,
  username: string,
  password: string,
): { ok: true; account: AuthorAccount } | { ok: false; message: string } {
  if (loadAuthor(rootDir)) return { ok: false, message: "作者账号已经有了。" };
  const name = username.trim();
  if (name === "" || password === "") return { ok: false, message: "请填写账号和密码。" };
  const account = { username: name, password };
  mkdirSync(path.join(rootDir, "config"), { recursive: true });
  writeFileSync(
    path.join(rootDir, "config", "author.yml"),
    yaml.dump(account, { lineWidth: 120 }),
  );
  return { ok: true, account };
}

export function loadAuthor(rootDir: string): AuthorAccount | undefined {
  const file = path.join(rootDir, "config", "author.yml");
  if (!existsSync(file)) return undefined;
  let parsed: unknown;
  try {
    parsed = yaml.load(readFileSync(file, "utf8"), { schema: yaml.CORE_SCHEMA });
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  const username = typeof record.username === "string" ? record.username.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";
  if (username === "" || password === "") return undefined;
  return { username, password };
}

export function passwordsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function signSession(account: AuthorAccount, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ u: account.username, exp: now + SESSION_MS }),
  ).toString("base64url");
  const sig = createHmac("sha256", account.password).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function sessionUsername(
  token: string | undefined,
  account: AuthorAccount | undefined,
  now = Date.now(),
): string | undefined {
  if (!token || !account) return undefined;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", account.password).update(payload).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return undefined;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      u?: unknown;
      exp?: unknown;
    };
    if (data.u !== account.username) return undefined;
    if (typeof data.exp !== "number" || data.exp < now) return undefined;
    return account.username;
  } catch {
    return undefined;
  }
}

export function authorCookie(token: string): string {
  return `author=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`;
}

export function clearAuthorCookie(): string {
  return "author=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}
