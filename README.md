# 个人网站

这个仓库把 Markdown 记录读出来，校验之后生成一个可以阅读的静态站点。页面先能读，版式以后再换。

需要 Node.js 20 或更高版本。

## 安装

```bash
npm install
```

这条命令按 `package.json` 安装依赖，并生成 `node_modules/`。`node_modules` 是第三方包的目录，不进入 Git。依赖的具体版本记在 `package-lock.json` 里。

## 本机站点

正式内容放在 `private/site/`，不进入公开仓库：

```
private/site/config/identity.md
private/site/config/topics.yml
private/site/content/pieces/
private/site/content/media/
```

在浏览器里打开站点：

```bash
npm run dev:local
```

然后打开 http://localhost:4321 。

生成静态文件：

```bash
npm run build:local
```

站点写到 `dist/`。有致命错误时命令停住，不会清空已经生成的 `dist/`。草稿缺少标题、摘要、日期或正文时，命令继续，并把警告写进日志。

## 目录

代码按依赖方向分成三块：展示只读发布结果，发布只读内容存储的结果。

```
src/content/     内容存储。读记录、身份、栏目词表，并核对图片是否存在
src/publish/     发布。筛出已发布记录，排序，产出跳转、RSS 数据和站点地图数据
src/present/     展示。把发布结果写成页面、RSS 和站点地图
src/pages/       站点地址。首页、关于、近况、时间线、栏目、单篇、404
fixtures/sample/ 自测读的样例内容
tests/           与上面三块对应的自测
```

一条记录是 `content/pieces/{slug}.md`。身份在 `config/identity.md`，栏目词表在 `config/topics.yml`，图片在 `content/media/`。正式文件放在 `private/site/` 下的同样路径里，不进入公开仓库。自测使用 `fixtures/sample` 里的同一布局。

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
