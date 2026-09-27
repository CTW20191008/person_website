import { describe, expect, it } from "vitest";
import { renderReviewReport } from "./review.js";

describe("review report", () => {
  it("shows output alone when a case passes, and both sides when it fails", () => {
    const html = renderReviewReport(
      [
        {
          id: "TC-01",
          content: "通过样例",
          expected: "PASS_SAME",
          output: "PASS_SAME",
          passed: true,
          durationMs: 1.25,
        },
        {
          id: "TC-02",
          content: "失败样例",
          expected: "FAIL_EXPECTED",
          output: "FAIL_OUTPUT",
          passed: false,
          durationMs: 1500,
        },
      ],
      "2026-09-27T00:00:00.000Z",
    );

    const passRow = html.slice(html.indexOf("TC-01"), html.indexOf("TC-02"));
    expect(passRow.split("PASS_SAME").length - 1).toBe(1);
    expect(passRow).not.toContain("期望");
    expect(passRow).toContain("1.3 毫秒");
    expect(html).toContain("FAIL_EXPECTED");
    expect(html).toContain("FAIL_OUTPUT");
    expect(html).toContain("执行时长 1.50 秒");
    expect(html).toContain(">未通过<");
  });
});
