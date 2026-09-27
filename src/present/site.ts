import path from "node:path";
import { loadContent } from "../content/load-content.js";
import { publish, type PublishSuccess } from "../publish/publish.js";

export function siteRoot(): string {
  const configured = process.env.SITE_ROOT;
  if (configured && configured.length > 0) return path.resolve(configured);
  return path.resolve("fixtures/sample");
}

export const siteOrigin = "http://localhost:4321";

export function loadPublishedSite(rootDir = siteRoot()): PublishSuccess {
  const result = publish(loadContent(rootDir));
  if (!result.ok) {
    const codes = result.errors.map((error) => error.code).join(", ");
    throw new Error(`发布停住：${codes}`);
  }
  return result;
}
