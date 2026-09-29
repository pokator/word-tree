// Server-rendered, crawlable pages for search: /kanji/<k>, /word/<w>,
// /kanji (index) and /sitemap.xml. Pure functions of the data built by
// scripts/generate-seo-data.mjs, so they're unit-testable and api/seo.js
// is a thin wrapper. Plain HTML + one inline stylesheet, no JavaScript --
// every page links into the interactive graph at /explore/.
//
// Colors and type follow DESIGN.md (ink & paper light, ink-at-night dark).

export const SITE = "https://moto.souravbanerjee.com";

const ON = "o";
const KUN = "k";

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const kanjiPath = (c) => `/kanji/${encodeURIComponent(c)}`;
const wordPath = (w) => `/word/${encodeURIComponent(w)}`;
const explorePath = (root, expand = []) =>
  `/explore/${encodeURIComponent(root)}${expand.length ? `?expand=${expand.map(encodeURIComponent).join(",")}` : ""}`;

/** On'yomi are written in katakana by convention; the dataset stores hiragana. */
export function toKatakana(s) {
  return s.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}
/** Kun'yomi carry a "." between stem and okurigana: い.きる -> い(きる). */
const kunDisplay = (r) => (r.includes(".") ? r.replace(".", "(") + ")" : r);

const gradeLabel = (g) => (g <= 6 ? `grade ${g}` : "secondary school");
const count = (n) => n.toLocaleString("en-US");

function clip(s, max) {
  return s.length <= max ? s : `${s.slice(0, max - 1).replace(/[\s,;]+\S*$/, "")}…`;
}

// ---------------------------------------------------------------- layout

const STYLE = `
:root{--bg:#e7e2d1;--surface:#ded8c4;--border:#c9c2ac;--text:#4a4438;--text-h:#1c1a14;--accent:#c33a2e;--node-kanji:#8a8371;--node-word:#56697c;--link:#b8ad92;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0b0c10;--surface:#16181f;--border:#2a2d38;--text:#a9afc0;--text-h:#f5f6fa;--accent:#ff6a4d;--node-kanji:#a89a7e;--node-word:#6b7182;--link:#3a3e4c;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 "Instrument Sans",system-ui,sans-serif}
a{color:inherit}
h1,h2{font-family:"Shippori Mincho",serif;font-weight:500;color:var(--text-h);margin:0}
h2{font-size:24px;letter-spacing:-.24px;margin:40px 0 16px}
[lang=ja]{font-family:"Hiragino Sans","Noto Sans CJK JP","Noto Sans JP","Yu Gothic",system-ui,sans-serif}
.top{display:flex;align-items:center;gap:16px;padding:16px;border-bottom:1px solid var(--border)}
.top__brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-family:"Shippori Mincho",serif;font-size:22px;color:var(--text-h)}
.top__brand img{width:32px;height:32px}
.top nav{margin-left:auto;display:flex;gap:16px;align-items:center;font-size:15px}
.top nav a{text-decoration:none}
.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:6px}
.btn--small{padding:8px 14px;font-size:14px}
main{max-width:960px;margin:0 auto;padding:24px 16px 64px}
.crumbs{font-size:14px;margin-bottom:16px}
.crumbs a{text-decoration:none;border-bottom:1px solid var(--border)}
.hero{display:grid;grid-template-columns:auto 1fr;gap:24px 32px;align-items:center}
.hero__glyph{font-family:"Shippori Mincho",serif;font-size:128px;line-height:1;color:var(--text-h)}
.hero h1{font-size:36px;line-height:1.2;letter-spacing:-.6px}
.hero h1 small{display:block;font-family:"Instrument Sans",sans-serif;font-size:16px;letter-spacing:0;color:var(--text);margin-top:6px}
.facts{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:16px 0 20px}
.facts dt{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding-top:3px}
.facts dd{margin:0;color:var(--text-h)}
.badge{display:inline-block;border:1px solid var(--border);border-radius:9999px;padding:1px 10px;font-size:13px;margin-right:6px}
.preview{margin:32px 0 0;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden}
.preview svg{display:block;width:100%;height:auto}
.preview figcaption{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid var(--border);font-size:14px;flex-wrap:wrap}
.g-link{stroke:var(--link);stroke-width:1.5}
.g-root{fill:var(--accent)}
.g-kanji{fill:var(--node-kanji)}
.g-word{fill:var(--node-word)}
.g-label{fill:#fff;font-weight:700;text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:2px}
.preview a:hover circle{filter:brightness(1.15)}
.words{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px}
.words li{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px}
.words .w{font-size:20px;color:var(--text-h);text-decoration:none}
.words a.w{border-bottom:1px solid var(--border)}
.words .r{margin-left:8px;font-size:14px}
.words .g{display:block;font-size:14px;margin-top:2px}
.note{font-size:14px;margin:12px 0 0}
.chips{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:0}
.chips a{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:44px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);text-decoration:none;font-size:22px;color:var(--text-h)}
.kcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;list-style:none;padding:0;margin:0}
.kcards a,.kcards div{display:block;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px;text-decoration:none}
.kcards .c{font-family:"Shippori Mincho",serif;font-size:40px;line-height:1.1;color:var(--text-h)}
.kcards .m{display:block;font-size:14px}
.senses{margin:16px 0 0;padding-left:22px}
.senses li{margin-bottom:8px;color:var(--text-h)}
.senses .p{display:block;font-size:13px;color:var(--text)}
.cta{margin-top:40px;padding:24px;border:1px solid var(--border);border-radius:8px;background:var(--surface);display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.cta p{margin:0;color:var(--text-h)}
footer{max-width:960px;margin:0 auto;padding:24px 16px 48px;font-size:13px;border-top:1px solid var(--border)}
@media (max-width:640px){.hero{grid-template-columns:1fr}.hero__glyph{font-size:96px}.hero h1{font-size:28px}.top nav a.hide-sm{display:none}}
`.trim();

function page({ title, description, path, body, jsonLd, noindex = false }) {
  const url = SITE + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(url)}">`}
<meta name="theme-color" content="#e7e2d1" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0c10" media="(prefers-color-scheme: dark)">
<link rel="icon" type="image/svg+xml" href="/moto_logo_light.svg">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Moto (元)">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/og-image.png?v=2">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600&family=Shippori+Mincho:wght@500&display=swap" rel="stylesheet">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
<script defer src="/m/s.js" data-website-id="60fcf70a-8ca9-4bbf-80c4-7c25e47668b5" data-host-url="/m" data-domains="moto.souravbanerjee.com"></script>
<style>${STYLE}</style>
</head>
<body>
<header class="top">
<a class="top__brand" href="/"><img src="/moto_logo_light.svg" alt="" width="32" height="32">Moto <span lang="ja">元</span></a>
<nav><a href="/kanji" class="hide-sm">Kanji</a><a class="btn btn--small" href="/">Open the explorer</a></nav>
</header>
<main>
${body}
</main>
<footer>
<p>Moto is a free Japanese dictionary you explore as a graph: every word opens into its kanji, and every kanji into the words that share it.</p>
<p>Dictionary data from <a href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project">JMdict</a> and <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project">KANJIDIC2</a> by the <a href="https://www.edrdg.org/">Electronic Dictionary Research and Development Group</a>, used under <a href="https://www.edrdg.org/edrdg/licence.html">CC BY-SA 4.0</a>.</p>
</footer>
</body>
</html>`;
}

// ----------------------------------------------------------- graph preview

/** A still of the graph: `center` in the middle, `ring` around it, and
 * optionally each ring node's own `leaves` further out. Nodes link to pages. */
function graphSvg({ center, ring, width = 720, height = 420 }) {
  const cx = width / 2;
  const cy = height / 2;
  const hasLeaves = ring.some((n) => n.leaves?.length);
  const r1 = hasLeaves ? 95 : cy - 48;
  const r2 = cy - 36;
  const stretch = 1.45; // the canvas is wider than tall -- use it
  const links = [];
  const nodes = [];
  const radius = (label, type) => (type === "root" ? 34 : type === "kanji" ? 24 : Math.min(18 + label.length * 4, 32));
  const fmt = (n) => n.toFixed(1);

  const node = (x, y, label, type, href) => {
    const r = radius(label, type);
    const size = type === "root" ? (label.length > 2 ? 16 : 22) : type === "word" && label.length > 2 ? Math.max(11, 17 - label.length) : 17;
    const shape = `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${r}" class="g-${type}"/><text x="${fmt(x)}" y="${fmt(y)}" class="g-label" font-size="${size}" lang="ja">${esc(label)}</text>`;
    nodes.push(href ? `<a href="${esc(href)}">${shape}</a>` : shape);
  };

  ring.forEach((n, i) => {
    const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r1 * stretch;
    const y = cy + Math.sin(a) * r1;
    links.push(`<line x1="${cx}" y1="${cy}" x2="${fmt(x)}" y2="${fmt(y)}" class="g-link"/>`);
    const leaves = n.leaves ?? [];
    const spread = Math.min(1.1, (Math.PI * 2) / ring.length);
    leaves.forEach((leaf, j) => {
      const b = a + (leaves.length === 1 ? 0 : (j / (leaves.length - 1) - 0.5) * spread);
      const lx = cx + Math.cos(b) * r2 * stretch;
      const ly = cy + Math.sin(b) * r2;
      links.push(`<line x1="${fmt(x)}" y1="${fmt(y)}" x2="${fmt(lx)}" y2="${fmt(ly)}" class="g-link"/>`);
      node(lx, ly, leaf.label, leaf.type, leaf.href);
    });
    node(x, y, n.label, n.type, n.href);
  });
  node(cx, cy, center, "root", null);

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Word graph around ${esc(center)}">${links.join("")}${nodes.join("")}</svg>`;
}

// -------------------------------------------------------------- kanji page

function wordItem([word, reading, gloss, , hasPage]) {
  const w = hasPage
    ? `<a class="w" href="${wordPath(word)}" lang="ja">${esc(word)}</a>`
    : `<span class="w" lang="ja">${esc(word)}</span>`;
  return `<li>${w}<span class="r" lang="ja">${esc(reading)}</span><span class="g">${esc(gloss)}</span></li>`;
}

export function renderKanjiPage(data, char) {
  const k = data.kanji[char];
  if (!k) return null;
  const on = k.on.map((r) => toKatakana(r.replace(/^-|-$/g, "")));
  const kun = k.kun.map(kunDisplay);
  const byType = { [ON]: [], [KUN]: [], u: [] };
  for (const w of k.words) (byType[w[3]] ?? byType.u).push(w);
  const explore = explorePath(char, [`k:${char}`]);

  const title = `${char} kanji: meaning, readings & ${count(k.total)} words | Moto`;
  const readingsText = [
    on.length ? `On'yomi: ${on.slice(0, 3).join(", ")}.` : "",
    kun.length ? `Kun'yomi: ${kun.slice(0, 3).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const description = clip(
    `${char} means ${k.m.toLowerCase().replace(/;/g, ",")}. ${readingsText} ${k.jlpt ? `JLPT N${k.jlpt}, ` : ""}jōyō ${gradeLabel(k.grade)}. See the words built from ${char}, grouped by reading.`,
    160
  );

  const preview = graphSvg({
    center: char,
    ring: k.words.slice(0, 12).map((w) => ({ label: w[0], type: "word", href: w[4] ? wordPath(w[0]) : null })),
  });

  const section = (heading, list) =>
    list.length ? `<h2>${heading}</h2><ul class="words">${list.map(wordItem).join("")}</ul>` : "";

  const related = k.related
    .filter((c) => data.kanji[c])
    .map((c) => `<li><a href="${kanjiPath(c)}" lang="ja" title="${esc(data.kanji[c].m)}">${esc(c)}</a></li>`)
    .join("");

  const body = `
<nav class="crumbs"><a href="/kanji">Kanji</a> › ${k.grade <= 6 ? `Grade ${k.grade}` : "Secondary school"}</nav>
<section class="hero">
<div class="hero__glyph" lang="ja" aria-hidden="true">${esc(char)}</div>
<div>
<h1><span lang="ja">${esc(char)}</span>: ${esc(k.m)}<small>Kanji meaning, readings, and the words that use it</small></h1>
<dl class="facts">
${on.length ? `<dt>On'yomi</dt><dd lang="ja">${esc(on.join("、"))}</dd>` : ""}
${kun.length ? `<dt>Kun'yomi</dt><dd lang="ja">${esc(kun.join("、"))}</dd>` : ""}
<dt>Level</dt><dd>${k.jlpt ? `<span class="badge">JLPT N${k.jlpt}</span>` : ""}<span class="badge">Jōyō, ${gradeLabel(k.grade)}</span></dd>
<dt>Words</dt><dd>${count(k.total)} in the dictionary</dd>
</dl>
<a class="btn" href="${explore}">Explore ${esc(char)} in the word graph →</a>
</div>
</section>
<figure class="preview">
${preview}
<figcaption><span>The most common words built from <span lang="ja">${esc(char)}</span>. In Moto, tap any of them to keep branching out.</span><a href="${explore}">Open this graph</a></figcaption>
</figure>
${section(`Words that use the on'yomi${on.length ? ` <span lang="ja">(${esc(on.join("・"))})</span>` : ""}`, byType[ON])}
${section("Words that use a kun'yomi", byType[KUN])}
${section("Other readings", byType.u)}
${k.total > k.words.length ? `<p class="note">Showing the ${k.words.length} most common of ${count(k.total)} words. <a href="${explore}">See them all in the graph.</a></p>` : ""}
${related ? `<h2>Kanji that often appear with <span lang="ja">${esc(char)}</span></h2><ul class="chips">${related}</ul>` : ""}
<section class="cta"><p>Every word here opens into its own kanji. Follow the branches in Moto.</p><a class="btn" href="${explore}">Explore ${esc(char)} →</a></section>`;

  return page({
    title,
    description,
    path: kanjiPath(char),
    body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: char,
      description: k.m,
      inDefinedTermSet: { "@type": "DefinedTermSet", name: "Jōyō kanji", url: `${SITE}/kanji` },
      url: SITE + kanjiPath(char),
    },
  });
}

// --------------------------------------------------------------- word page

const TYPE_LABEL = { o: "on'yomi", k: "kun'yomi", u: "reading" };

export function renderWordPage(data, word) {
  const w = data.words[word];
  if (!w) return null;
  const known = (c) => data.kanji[c] ?? data.extraKanji[c];
  // w.t has one reading-type letter per kanji component, in order.
  const comps = Array.from(word).filter((c) => /\p{Script=Han}/u.test(c));
  const typeOf = {};
  comps.forEach((c, i) => (typeOf[c] ??= w.t[i] ?? "u"));
  const chars = [...new Set(comps)].filter(known);
  const gloss = w.s.flatMap((s) => s.g).slice(0, 3).join("; ");

  // Other common words sharing each kanji, for the preview and the list.
  const siblings = Object.fromEntries(
    chars.map((c) => [c, (data.kanji[c]?.words ?? []).filter((x) => x[0] !== word).slice(0, 8)])
  );
  const related = [];
  const seen = new Set([word]);
  for (const c of chars) {
    for (const x of siblings[c]) {
      if (seen.has(x[0])) continue;
      seen.add(x[0]);
      related.push(x);
    }
  }

  const expand = chars.filter((c) => data.kanji[c]).map((c) => `k:${c}`);
  const explore = explorePath(word, expand);
  const built = chars.map((c) => `${c} (${(known(c).m.split(";")[0] || "").trim().toLowerCase()})`).join(" + ");
  const title = `${word} (${w.r}) meaning: ${clip(gloss, 50)} | Moto`;
  const description = clip(
    `${word} (${w.r}): ${gloss}.${built ? ` Built from ${built}.` : ""}${related.length ? ` Related words: ${related.slice(0, 3).map((x) => x[0]).join(", ")}.` : ""}`,
    160
  );

  const preview = graphSvg({
    center: word,
    ring: chars.map((c) => ({
      label: c,
      type: "kanji",
      href: data.kanji[c] ? kanjiPath(c) : null,
      leaves: siblings[c]
        .slice(0, chars.length > 2 ? 3 : 5)
        .map((x) => ({ label: x[0], type: "word", href: x[4] ? wordPath(x[0]) : null })),
    })),
  });

  const kcards = chars
    .map((c) => {
      const k = known(c);
      const inner = `<span class="c" lang="ja">${esc(c)}</span><span class="m">${esc(k.m)}</span><span class="m">Read with its ${TYPE_LABEL[typeOf[c]] ?? "reading"} here${k.jlpt ? ` · JLPT N${k.jlpt}` : ""}</span>`;
      return `<li>${data.kanji[c] ? `<a href="${kanjiPath(c)}">${inner}</a>` : `<div>${inner}</div>`}</li>`;
    })
    .join("");

  const senses = w.s
    .map((s) => `<li>${esc(s.g.join("; "))}${s.p.length ? `<span class="p">${esc(s.p.join(", "))}</span>` : ""}</li>`)
    .join("");

  const first = chars.find((c) => data.kanji[c]);
  const body = `
<nav class="crumbs"><a href="/kanji">Kanji</a>${first ? ` › <a href="${kanjiPath(first)}" lang="ja">${esc(first)}</a>` : ""} › <span lang="ja">${esc(word)}</span></nav>
<section class="hero">
<div class="hero__glyph" lang="ja" aria-hidden="true" style="font-size:${word.length > 3 ? 56 : word.length > 2 ? 80 : 104}px">${esc(word)}</div>
<div>
<h1><span lang="ja">${esc(word)}</span> <span lang="ja">(${esc(w.r)})</span><small>${esc(gloss)}</small></h1>
<ol class="senses">${senses}</ol>
<p><a class="btn" href="${explore}">Explore ${esc(word)} in the word graph →</a></p>
</div>
</section>
${chars.length ? `<figure class="preview">
${preview}
<figcaption><span><span lang="ja">${esc(word)}</span>, its kanji, and other words that share them.</span><a href="${explore}">Open this graph</a></figcaption>
</figure>` : ""}
${kcards ? `<h2>Kanji in <span lang="ja">${esc(word)}</span></h2><ul class="kcards">${kcards}</ul>` : ""}
${related.length ? `<h2>Words that share its kanji</h2><ul class="words">${related.slice(0, 18).map(wordItem).join("")}</ul>` : ""}
<section class="cta"><p>See how <span lang="ja">${esc(word)}</span> connects to the rest of Japanese.</p><a class="btn" href="${explore}">Explore ${esc(word)} →</a></section>`;

  return page({
    title,
    description,
    path: wordPath(word),
    body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: word,
      alternateName: w.r,
      description: gloss,
      url: SITE + wordPath(word),
    },
  });
}

// ------------------------------------------------------------- kanji index

export function renderKanjiIndex(data) {
  const groups = {};
  for (const c of data.joyo) (groups[data.kanji[c].grade] ??= []).push(c);
  const body = `
<h1 style="font-size:40px;letter-spacing:-1px">The ${count(data.joyo.length)} jōyō kanji</h1>
<p>Every kanji on Japan's official list for everyday use, by the school year it's taught in. Each page has its meanings and readings, and the words built from it, grouped by on'yomi and kun'yomi.</p>
${Object.entries(groups)
  .map(
    ([g, list]) =>
      `<h2>${Number(g) <= 6 ? `Grade ${g}` : "Secondary school"} <small style="font-family:'Instrument Sans',sans-serif;font-size:14px">${list.length} kanji</small></h2><ul class="chips">${list
        .map((c) => `<li><a href="${kanjiPath(c)}" lang="ja" title="${esc(data.kanji[c].m)}">${esc(c)}</a></li>`)
        .join("")}</ul>`
  )
  .join("")}
<section class="cta"><p>Or start from any word and watch it branch into its kanji.</p><a class="btn" href="/">Open the explorer →</a></section>`;
  return page({
    title: `Jōyō kanji list: all ${count(data.joyo.length)} kanji with meanings, readings & words | Moto`,
    description: `All ${count(data.joyo.length)} jōyō kanji by school grade, each with its meanings, on'yomi and kun'yomi readings, and the common words built from it.`,
    path: "/kanji",
    body,
  });
}

export function renderNotFound(kind, key) {
  const body = `
<h1 style="font-size:36px">No page for <span lang="ja">${esc(key)}</span> yet</h1>
<p>${kind === "kanji" ? "Kanji pages cover the 2,136 jōyō kanji." : "Word pages cover common words."} You can still explore <span lang="ja">${esc(key)}</span> in the graph.</p>
<p><a class="btn" href="${explorePath(key)}">Explore ${esc(key)} →</a></p>`;
  return page({ title: `${key} | Moto`, description: `Explore ${key} in Moto's word graph.`, path: "/", body, noindex: true });
}

// ----------------------------------------------------------------- sitemap

export function renderSitemap(data) {
  const urls = [
    `${SITE}/`,
    `${SITE}/kanji`,
    ...data.joyo.map((c) => SITE + kanjiPath(c)),
    ...Object.keys(data.words).map((w) => SITE + wordPath(w)),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join("\n")}
</urlset>
`;
}
