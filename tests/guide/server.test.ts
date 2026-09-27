import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, it } from "vitest";
import { createSiteServer } from "../../src/guide/server.js";
import { beginCase, review, writeReviewReport } from "../helpers/review.js";
import { writeSite } from "../helpers/site-repo.js";

const cleanups: Array<() => void> = [];
const servers: Server[] = [];

beforeEach(() => {
  beginCase();
});

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  for (const cleanup of cleanups) cleanup();
  cleanups.length = 0;
});

afterAll(() => {
  writeReviewReport();
});

function site(): string {
  const made = writeSite({
    "config/author.yml": "username: author\npassword: secret\n",
  });
  cleanups.push(made.cleanup);
  return made.dir;
}

function siteWithoutAuthor(): string {
  const made = writeSite({});
  cleanups.push(made.cleanup);
  return made.dir;
}

async function listen(rootDir: string): Promise<string> {
  const server = createSiteServer(rootDir);
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function cookieFrom(response: Response): string {
  return response.headers.getSetCookie?.()[0]?.split(";")[0] ?? "";
}

const essay = `---
slug: reading
title: 阅读
summary: 先看问题。
kind: essay
status: published
publishedAt: 2026-09-02
category: learning
---

先写下问题。
`;

describe("site server", () => {
  it("lets a visitor read and hides upload", async () => {
    const origin = await listen(site());
    const home = await fetch(origin);
    const upload = await fetch(`${origin}/upload`, { redirect: "manual" });
    const html = await home.text();

    review({
      content: "访客可以阅读，未登录时上传会转到登录页",
      expected: { login: true, upload: false, status: 303, location: "/login" },
      output: {
        login: html.includes('href="/login"'),
        upload: html.includes('href="/upload"'),
        status: upload.status,
        location: upload.headers.get("location"),
      },
    });
  });

  it("rejects a wrong password", async () => {
    const origin = await listen(site());
    const response = await fetch(`${origin}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "username=author&password=nope",
      redirect: "manual",
    });
    const html = await response.text();

    review({
      content: "密码错误时留在登录页",
      expected: { status: 200, message: true, cookie: false },
      output: {
        status: response.status,
        message: html.includes("账号或密码不正确"),
        cookie: cookieFrom(response).startsWith("author="),
      },
    });
  });

  it("lets the author log in and upload", async () => {
    const dir = site();
    const origin = await listen(dir);
    const login = await fetch(`${origin}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "username=author&password=secret",
      redirect: "manual",
    });
    const cookie = cookieFrom(login);
    const form = await fetch(`${origin}/upload`, { headers: { cookie } });
    const formHtml = await form.text();
    const boundary = "----boundary";
    const uploaded = await fetch(`${origin}/upload`, {
      method: "POST",
      headers: { cookie, "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: `--${boundary}\r\nContent-Disposition: form-data; name="markdown"; filename="reading.md"\r\n\r\n${essay}\r\n--${boundary}--\r\n`,
    });
    const saved = await uploaded.text();
    const home = await fetch(origin);

    review({
      content: "作者登录后可以上传，访客首页能看到这篇文章",
      expected: {
        to: "/",
        form: true,
        saved: true,
        file: true,
        home: true,
      },
      output: {
        to: login.headers.get("location"),
        form: formHtml.includes("上传一篇记录"),
        saved: saved.includes("已保存"),
        file: existsSync(path.join(dir, "content/pieces/reading.md")),
        home: (await home.text()).includes("阅读"),
      },
    });
  });

  it("creates the author on the page, then saves identity and a topic", async () => {
    const dir = siteWithoutAuthor();
    const origin = await listen(dir);
    const form = await fetch(`${origin}/login`);
    const created = await fetch(`${origin}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "username=author&password=secret",
      redirect: "manual",
    });
    const cookie = cookieFrom(created);
    const saved = await fetch(`${origin}/settings`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: "form=identity&name=阿禾&now=在写&body=关于阿禾",
    });
    const topic = await fetch(`${origin}/settings`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: "form=topic&id=notes&title=记录",
    });
    const blocked = await fetch(`${origin}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "form=identity&name=别人&now=&body=",
      redirect: "manual",
    });

    review({
      content: "第一次在页面创建作者，登录后保存资料和栏目",
      expected: {
        create: true,
        to: "/settings",
        name: true,
        topic: true,
        blocked: 303,
      },
      output: {
        create: (await form.text()).includes("创建作者账号"),
        to: created.headers.get("location"),
        name: readFileSync(path.join(dir, "config/identity.md"), "utf8").includes("阿禾") &&
          (await saved.text()).includes("已保存"),
        topic: readFileSync(path.join(dir, "config/topics.yml"), "utf8").includes("notes") &&
          (await topic.text()).includes("记录"),
        blocked: blocked.status,
      },
    });
  });
});
