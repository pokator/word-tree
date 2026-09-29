// Serves the crawlable pages -- /kanji, /kanji/<k>, /word/<w>, /sitemap.xml
// (routed here by vercel.json rewrites). Rendered on request from one
// compact data file and cached at Vercel's edge until the next deploy, so
// deployments don't carry ~28k prebuilt HTML files (see
// scripts/generate-seo-data.mjs for why that matters).
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  renderKanjiIndex,
  renderKanjiPage,
  renderNotFound,
  renderSitemap,
  renderWordPage,
} from "../src/seo/render.js";

let data;
export function loadSeoData() {
  data ??= JSON.parse(gunzipSync(readFileSync(new URL("./_lib/seo-data.gzjson", import.meta.url))).toString("utf8"));
  return data;
}

// Rewrites may hand the key over still percent-encoded (or twice).
function decodeKey(raw) {
  let key = raw ?? "";
  for (let i = 0; i < 2 && /%[0-9a-f]{2}/i.test(key); i++) {
    try {
      key = decodeURIComponent(key);
    } catch {
      break;
    }
  }
  return key.normalize("NFC").trim();
}

const CACHE = "public, max-age=3600, s-maxage=31536000, stale-while-revalidate=604800";

export default function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const kind = url.searchParams.get("kind");
  const key = decodeKey(url.searchParams.get("key"));
  const d = loadSeoData();

  let status = 200;
  let type = "text/html; charset=utf-8";
  let body;
  if (kind === "sitemap") {
    type = "application/xml; charset=utf-8";
    body = renderSitemap(d);
  } else if (kind === "kanji" && !key) {
    body = renderKanjiIndex(d);
  } else if (kind === "kanji" || kind === "word") {
    body = kind === "kanji" ? renderKanjiPage(d, key) : renderWordPage(d, key);
    if (!body) {
      status = 404;
      body = renderNotFound(kind, key.slice(0, 40));
    }
  } else {
    status = 404;
    body = renderNotFound("word", "");
  }

  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", status === 200 ? CACHE : "public, max-age=300, s-maxage=3600");
  res.end(body);
}
