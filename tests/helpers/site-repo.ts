import { makePiecesDir } from "./pieces-dir.js";

const identity = `---
name: 样例
now: 这是契约测试用的样例。
---

关于这处最小仓库。
`;

const topics = `topics:
  - id: learning
    title: 学习
  - id: writing
    title: 写作
`;

export function writeSite(files: Record<string, string>): {
  dir: string;
  cleanup: () => void;
} {
  return makePiecesDir({
    "config/identity.md": identity,
    "config/topics.yml": topics,
    ...files,
  });
}
