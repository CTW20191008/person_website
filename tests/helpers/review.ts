import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect } from "vitest";

export type ReviewInput = {
  content: string;
  expected: unknown;
  output: unknown;
};

type ReviewRecord = ReviewInput & {
  id: string;
  passed: boolean;
  durationMs: number;
};

const records: ReviewRecord[] = [];
let caseStartedAt = 0;

export function beginCase(): void {
  caseStartedAt = performance.now();
}

function show(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}

function takeDuration(): number {
  return caseStartedAt === 0 ? 0 : performance.now() - caseStartedAt;
}

export function review(input: ReviewInput): void {
  const id = `TC-${String(records.length + 1).padStart(2, "0")}`;
  const durationMs = takeDuration();
  let passed = true;
  try {
    expect(input.output).toEqual(input.expected);
  } catch (error) {
    passed = false;
    records.push({ id, ...input, passed, durationMs });
    throw error;
  }
  records.push({ id, ...input, passed, durationMs });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs.toFixed(1)} 毫秒`;
  return `${(durationMs / 1000).toFixed(2)} 秒`;
}

function comparisonCell(record: ReviewRecord): string {
  const output = `<pre>${escapeHtml(show(record.output))}</pre>`;
  if (record.passed) return `<td class="values">${output}</td>`;
  return `<td class="values"><div class="pair">
        <div><div class="label">期望</div><pre>${escapeHtml(show(record.expected))}</pre></div>
        <div><div class="label">输出</div>${output}</div>
      </div></td>`;
}

export function renderReviewReport(rows: ReviewRecord[], generatedAt: string): string {
  const passed = rows.filter((record) => record.passed).length;
  const failed = rows.length - passed;
  const totalMs = rows.reduce((sum, record) => sum + record.durationMs, 0);
  const body = rows
    .map((record) => {
      const status = record.passed ? "通过" : "未通过";
      return `<tr class="${record.passed ? "pass" : "fail"}">
        <td class="id">${record.id}</td>
        <td>${escapeHtml(record.content)}</td>
        ${comparisonCell(record)}
        <td class="duration">${formatDuration(record.durationMs)}</td>
        <td class="result">${status}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>记录读取测试报告</title>
  <style>
    body { margin: 2rem; font-family: "Iowan Old Style", "Songti SC", serif; color: #1c1915; background: #f6f1e7; }
    h1 { font-weight: 500; letter-spacing: 0.04em; }
    p { color: #5c5346; }
    table { width: 100%; border-collapse: collapse; background: #fffdf8; }
    th, td { border-bottom: 1px solid #e4dccb; padding: 0.75rem; vertical-align: top; text-align: left; }
    th { font-family: "Avenir Next", "PingFang SC", sans-serif; font-size: 0.85rem; letter-spacing: 0.06em; }
    td.id, td.duration, td.result { white-space: nowrap; font-family: "Avenir Next", "PingFang SC", sans-serif; }
    td.duration { font-variant-numeric: tabular-nums; }
    pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 0.82rem; }
    .label { margin-bottom: 0.35rem; font-family: "Avenir Next", "PingFang SC", sans-serif; font-size: 0.72rem; letter-spacing: 0.08em; color: #8a7e6d; }
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    tr.fail { background: #f8e6e1; }
    tr.pass .result { color: #2f6b4f; }
    tr.fail .result { color: #9d2c2c; font-weight: 600; }
  </style>
</head>
<body>
  <h1>记录读取测试报告</h1>
  <p>${passed} 通过，${failed} 未通过，共 ${rows.length} 条。执行时长 ${formatDuration(totalMs)}。生成时间 ${generatedAt}。</p>
  <table>
    <thead>
      <tr><th>用例号</th><th>测试内容</th><th>输出</th><th>执行时长</th><th>结果</th></tr>
    </thead>
    <tbody>
      ${body}
    </tbody>
  </table>
</body>
</html>
`;
}

export function writeReviewReport(): void {
  const html = renderReviewReport(records, new Date().toISOString());
  const reportPath = path.resolve("reports/test-report.html");
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, html);
}
