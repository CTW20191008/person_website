import type { APIRoute } from "astro";
import { resolveRoute, routeParts } from "../present/render-site.js";
import { loadPublishedSite, siteOrigin } from "../present/site.js";

export const GET: APIRoute = () => {
  const route = routeParts(resolveRoute(loadPublishedSite(), "/archive", { siteUrl: siteOrigin }));
  return new Response(route.body, { status: route.status, headers: route.headers });
};
