# 个人网站

这个仓库把 Markdown 记录读出来，由一个一直开着的服务提供网站。访客可以直接阅读。作者登录之后才能上传。页面先能读，版式以后再换。

需要 Node.js 20 或更高版本。

## 安装

```bash
npm install
```

这条命令按 `package.json` 安装依赖，并生成 `node_modules/`。`node_modules` 是第三方包的目录，不进入 Git。依赖的具体版本记在 `package-lock.json` 里。

## 本机站点

启动服务，并让它一直开着：

```bash
npm run serve
```

打开 http://localhost:4321 。

改了 `src/` 里的代码之后，服务会自己重新打开，不用停掉再执行一次。页面上保存的资料和文章本来就会立刻读到，也不用重启。

第一次打开时，页面上只创建作者账号，填写账号和密码。创建之后进入首页，不能再注册第二个。访客不用登录就能阅读。

打开「设置」时再填写名字和关于页，并选择栏目。可选的栏目是学习、技术、思考、记录。需要别的名称时，再自己添加。

这些内容由页面写入服务器，不用自己改文件。它们不进入公开仓库。

在自己的编辑器里把一篇记录存成 Markdown。可以照这个写：

```markdown
---
slug: reading
title: 阅读
summary: 先看问题。
kind: essay
status: published
publishedAt: 2026-09-02
category: 学习
---

正文写在这里。
```

`slug` 是地址，用小写英文、数字和连字符，发布后不要改。`category` 填栏目名称，例如 `学习`。`kind` 可以是 `essay`（文章）、`note`（笔记）或 `photo`（照片）。`status` 为 `published` 时读者能看到；写成 `draft` 则只保存，页面上不出现。日期写成 `YYYY-MM-DD`。

照片可以没有正文，但要在文件头写上图片：

```yaml
media:
  - shore.svg
```

登录之后打开「上传」，选择这篇 Markdown。如果文中有图片，在同一页再选择那些图片，文件名要和 `media` 里写的一致。校验通过后，回到首页就能看到。校验不通过时，页面说明原因，并且不会保存。没有登录时不能上传。

## 目录

服务入口收到请求后，交给一件事。这几件事彼此分开：

- **引导**只创建作者账号，填写账号和密码。账号只用来登录，不进入后面的阅读。
- **设置**在打开设置时填写名字、关于页，并选择或添加栏目。
- **上传**在打开上传时提交文章和图片。
- **阅读**不经过上面三件事。内容存储读身份、栏目、记录和图片，发布筛出可公开的记录，展示写成页面。

```mermaid
flowchart TB
  entry[服务入口]
  account[引导：账号和密码]
  settings[设置：名字、关于、栏目]
  upload[上传：文章和图片]
  author[账号]
  config[身份和栏目]
  pieces[记录和图片]
  content[内容存储]
  publish[发布]
  present[展示]

  entry --> account
  entry --> settings
  entry --> upload
  account --> author
  settings --> config
  upload --> pieces
  config --> content
  pieces --> content
  content --> publish
  publish --> present
```

```
src/guide/       服务入口，以及引导（账号和密码）
src/write/       设置（名字、关于、栏目）和上传（文章、图片）
src/content/     内容存储。读身份、栏目、记录，并核对图片是否存在
src/publish/     发布。筛出已发布记录，排序，产出跳转、RSS 和站点地图
src/present/     展示。把发布结果写成阅读页、RSS 和站点地图
tests/           与上面各块对应的自测
```

一条记录保存为 `content/pieces/{slug}.md`。身份在 `config/identity.md`，栏目词表在 `config/topics.yml`，图片在 `content/media/`。本机正式内容在 `private/site/` 下，由页面写入，不进入公开仓库。自测在临时目录里放同一布局，不另留一份样例站点。

有致命错误时，发布停住，不会把半成品写成页面。

## 自测

```bash
npm test
```

测试跑完后，报告写在 `reports/test-report.html`。这个目录不进入 Git，每次运行都会重新生成。

在浏览器中打开报告：

```bash
npm run test:report
```

这条命令先跑测试，再用系统浏览器打开上面的 HTML。若测试失败，浏览器仍会打开，命令的退出码与测试结果一致。也可以在 `npm test` 之后直接打开 `reports/test-report.html`。

每一行是一条用例：

| 列 | 含义 |
| --- | --- |
| 用例号 | `TC-01` 起，按执行顺序编号 |
| 测试内容 | 这条用例在检查什么 |
| 输出 | 程序实际给出的结果。通过时只显示输出。未通过时，同一格里并排显示期望和输出 |
| 执行时长 | 这条用例从开始到核对结果所用的时间 |
| 结果 | 通过，或未通过 |

页首有通过数、未通过数、全部用例的合计执行时长，以及生成时间。未通过的行会标出。
