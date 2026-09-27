import type { APIRoute } from "astro";
import { resolveRoute, routeParts } from "../present/render-site.js";
import { loadPublishedSite, siteOrigin } from "../present/site.js";

export function getStaticPaths() {
  return loadPublishedSite().pieces.map((piece) => ({ params: { slug: piece.slug } }));
}

export const GET: APIRoute = ({ params }) => {
  const route = routeParts(
    resolveRoute(loadPublishedSite(), `/${params.slug}`, { siteUrl: siteOrigin }),
  );
  return new Response(route.body, { status: route.status, headers: route.headers });
};
