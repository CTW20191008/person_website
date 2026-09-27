import { loadContent } from "../content/load-content.js";
import type { Diagnostic } from "../content/types.js";
import { publish } from "../publish/publish.js";

export type LocalBuildPlan =
  | { proceed: false; errors: Diagnostic[] }
  | { proceed: true; warnings: Diagnostic[] };

export function planLocalBuild(rootDir: string): LocalBuildPlan {
  const result = publish(loadContent(rootDir));
  if (!result.ok) return { proceed: false, errors: result.errors };
  return { proceed: true, warnings: result.warnings };
}

export function formatSiteLog(plan: LocalBuildPlan): string[] {
  if (!plan.proceed) {
    const codes = plan.errors.map((error) => error.code).join(", ");
    return [`发布停住：${codes}`];
  }
  return plan.warnings.map((warning) => `警告 ${warning.slug}：${warning.code}`);
}

export function runLocalBuild(rootDir: string, build: (rootDir: string) => void): boolean {
  const plan = planLocalBuild(rootDir);
  for (const line of formatSiteLog(plan)) console.error(line);
  if (!plan.proceed) return false;
  build(rootDir);
  return true;
}
