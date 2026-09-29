// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import handler, { loadSeoData } from "../../api/seo.js";
import { esc, renderKanjiPage, renderWordPage, SITE, toKatakana } from "./render.js";

const data = loadSeoData();

function get(query) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  handler({ url: `/api/seo?${query}` }, res);
  return res;
}
const one = (html, re) => html.match(re)?.[1];
// What a browser or crawler reads out of an attribute or title.
const text = (s) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

describe("SEO data", () => {
  it("covers every jōyō kanji", () => {
    const joyo = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../data/joyo.json"), "utf8"));
    expect(joyo).toHaveLength(2136);
    expect(data.joyo).toEqual(joyo.map((j) => j.char));
    for (const c of data.joyo) expect(data.kanji[c].words.length, c).toBeGreaterThan(0);
  });
});

describe("kanji pages", () => {
  it("renders a full, indexable page", () => {
    const res = get("kind=kanji&key=%E7%94%9F"); // 生, still encoded
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toMatch(/text\/html/);
    expect(res.headers["Cache-Control"]).toMatch(/s-maxage=\d+/);
    const html = res.body;
    expect(text(one(html, /<title>([^<]+)/))).toMatch(/^生 kanji: meaning, readings & [\d,]+ words/);
    expect(one(html, /rel="canonical" href="([^"]+)/)).toBe(`${SITE}/kanji/%E7%94%9F`);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("セイ"); // on'yomi shown in katakana
    expect(html).toMatch(/Words that use the on'yomi/);
    expect(html).toContain('href="/word/%E5%AD%A6%E7%94%9F"'); // 学生 has a page
    expect(html).toContain('href="/explore/%E7%94%9F?expand=k%3A%E7%94%9F"');
    expect(html).toMatch(/CC BY-SA 4\.0/); // JMdict/KANJIDIC licence attribution
    JSON.parse(one(html, /<script type="application\/ld\+json">([^<]+)/));
  });

  it("accepts a doubly-encoded or raw key", () => {
    expect(get("kind=kanji&key=%25E7%2594%259F").statusCode).toBe(200);
    expect(get("kind=kanji&key=生").statusCode).toBe(200);
  });

  it("keeps every description within 160 characters", () => {
    for (const c of data.joyo) {
      const d = text(one(renderKanjiPage(data, c), /name="description" content="([^"]+)/));
      expect(d.length, c).toBeLessThanOrEqual(160);
    }
  }, 60000); // renders every kanji page, graph layout included

  it("never 500s on a key that ends mid-astral-kanji once truncated", () => {
    const res = get(`kind=word&key=${"a".repeat(39)}${encodeURIComponent("𠮟")}`);
    expect(res.statusCode).toBe(404);
    expect(res.headers["Content-Type"]).toMatch(/text\/html/);
  });

  it("404s (noindex, escaped) for kanji without a page", () => {
    const res = get(`kind=kanji&key=${encodeURIComponent("<b>x")}`);
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('name="robots" content="noindex"');
    expect(res.body).not.toContain("<b>x");
    expect(res.body).toContain("&lt;b&gt;x");
  });
});

describe("word pages", () => {
  it("renders senses, kanji breakdown and related words", () => {
    const res = get(`kind=word&key=${encodeURIComponent("学校")}`);
    expect(res.statusCode).toBe(200);
    const html = res.body;
    expect(one(html, /<title>([^<]+)/)).toBe("学校 (がっこう) meaning: school | Moto");
    expect(html).toContain('href="/kanji/%E5%AD%A6"');
    expect(html).toContain('href="/kanji/%E6%A0%A1"');
    expect(html).toMatch(/Words that share its kanji/);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("keeps descriptions short across a sample of words", () => {
    const words = Object.keys(data.words);
    for (let i = 0; i < words.length; i += 97) {
      const d = text(one(renderWordPage(data, words[i]), /name="description" content="([^"]+)/));
      expect(d.length, words[i]).toBeLessThanOrEqual(160);
    }
  });

  it("labels each kanji's reading even when a kanji repeats", () => {
    // 民主主義: 主 appears twice; 義 must still read its own letter.
    const html = get(`kind=word&key=${encodeURIComponent("民主主義")}`).body;
    const cards = [...html.matchAll(/<span class="c" lang="ja">(.)<\/span>.*?Read with its ([^<·]+?) here/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(cards).toEqual(["民:on'yomi", "主:on'yomi", "義:on'yomi"]);
  });

  it("404s for an uncommon word", () => {
    expect(get(`kind=word&key=${encodeURIComponent("存在しない語")}`).statusCode).toBe(404);
  });
});

describe("index and sitemap", () => {
  it("the index links every jōyō kanji", () => {
    const html = get("kind=kanji").body;
    expect(html.match(/href="\/kanji\/%/g)).toHaveLength(2136);
  });

  it("the sitemap lists home, index, every kanji and word page", () => {
    const res = get("kind=sitemap");
    expect(res.headers["Content-Type"]).toMatch(/application\/xml/);
    const locs = [...res.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toHaveLength(2 + 2136 + Object.keys(data.words).length);
    expect(locs.length).toBeLessThanOrEqual(50000); // the sitemap protocol's cap
    expect(locs.every((u) => u.startsWith(`${SITE}/`))).toBe(true);
    expect(new Set(locs).size).toBe(locs.length);
  });
});

describe("helpers", () => {
  it("escapes HTML", () => {
    expect(esc(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });
  it("writes on'yomi in katakana", () => {
    expect(toKatakana("しょう")).toBe("ショウ");
  });
});
