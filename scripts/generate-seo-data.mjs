// Builds api/_lib/seo-data.gzjson -- the compact data behind the
// server-rendered /kanji/<k> and /word/<w> pages (api/seo.js), derived from
// the canonical dataset in data/offline-dataset/ plus data/joyo.json.
//
// Pages are rendered on request and cached at Vercel's edge rather than
// written out at build time: tens of thousands of static HTML files would
// be re-stored with every deployment, the same trap that once blew through
// the Deployment Storage quota (see data/offline-dataset/README.md).
//
// Run after editing either dataset file:  npm run generate:seo-data
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runnerImport } from "vite";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));

// The app's own on/kun aligner (Color by Reading), so pages and graph agree.
const load = async (p) => (await runnerImport(p, { root: ROOT, configFile: false })).module;
const { kanjiReadingTypes } = await load("./src/graph/readingType.js");
const { extractKanjiComponents } = await load("./src/graph/kanji.js");
const { DEFAULT_RANK } = await load("./src/graph/buildGraph.js");

const WORDS_PER_KANJI = 60; // what a kanji page lists, most common first
const RELATED_KANJI = 12;

const joyo = read("data/joyo.json"); // [{ char, grade }]
const kanjiList = read("data/offline-dataset/kanji.json");
const KANJI = Array.isArray(kanjiList) ? Object.fromEntries(kanjiList.map((k) => [k.char, k])) : kanjiList;
const wordsRaw = read("data/offline-dataset/words.json");
const WORDS = Array.isArray(wordsRaw) ? wordsRaw : Object.values(wordsRaw);
const dataset = { KANJI };

const firstGloss = (w) => (w.senses?.[0]?.gloss ?? [w.meaning ?? ""]).slice(0, 2).join("; ");
// Exactly expandKanji's order (buildGraph.js): by rank, unranked last, ties
// kept in dataset order (Array#sort is stable) -- so a page's word list and
// graph preview show the same words, in the same order, that the explorer
// reveals when you click "Explore".
const byCommonness = (a, b) => (a.rank ?? DEFAULT_RANK) - (b.rank ?? DEFAULT_RANK);

// Which words get their own page: the common ones (JMdict priority-tagged)
// that are built from at least one kanji -- the graph's reason to exist.
const pageWords = new Set(
  WORDS.filter((w) => w.rank != null && w.reading && extractKanjiComponents(w.word).length > 0).map((w) => w.word)
);

const containing = {};
for (const w of WORDS) {
  for (const k of new Set(extractKanjiComponents(w.word))) (containing[k] ??= []).push(w);
}

const kanji = {};
for (const { char, grade } of joyo) {
  const entry = KANJI[char];
  const all = (containing[char] ?? []).slice().sort(byCommonness);
  const words = all.slice(0, WORDS_PER_KANJI).map((w) => {
    const type = kanjiReadingTypes(dataset, w.word, w.reading)[char] ?? "unknown";
    return [w.word, w.reading ?? "", firstGloss(w), type[0], pageWords.has(w.word) ? 1 : 0, w.rank ?? null];
  });
  // Kanji that most often share a word with this one.
  const co = {};
  for (const w of all.slice(0, 400)) {
    for (const k of new Set(extractKanjiComponents(w.word))) if (k !== char && KANJI[k]) co[k] = (co[k] ?? 0) + 1;
  }
  const related = Object.entries(co)
    .sort((a, b) => b[1] - a[1])
    .slice(0, RELATED_KANJI)
    .map(([k]) => k);
  kanji[char] = {
    m: entry.meaning,
    on: entry.onyomi ?? [],
    kun: entry.kunyomi ?? [],
    jlpt: entry.jlpt ?? null,
    grade,
    total: all.length,
    words,
    related,
  };
}

// Word pages also need the non-jōyō kanji they're built from.
const extraKanji = {};
const words = {};
for (const w of WORDS) {
  if (!pageWords.has(w.word)) continue;
  const comps = extractKanjiComponents(w.word);
  const types = kanjiReadingTypes(dataset, w.word, w.reading);
  for (const k of comps) {
    if (!kanji[k] && KANJI[k] && !extraKanji[k]) {
      extraKanji[k] = { m: KANJI[k].meaning, on: KANJI[k].onyomi ?? [], kun: KANJI[k].kunyomi ?? [], jlpt: KANJI[k].jlpt ?? null };
    }
  }
  words[w.word] = {
    r: w.reading,
    rank: w.rank,
    s: (w.senses ?? []).slice(0, 6).map((s) => ({ p: (s.pos ?? []).slice(0, 2), g: (s.gloss ?? []).slice(0, 3) })),
    t: comps.map((k) => (types[k] ?? "unknown")[0]).join(""),
  };
}

const out = { v: 1, updated: new Date().toISOString().slice(0, 10), joyo: joyo.map((j) => j.char), kanji, extraKanji, words };
const raw = Buffer.from(JSON.stringify(out));
const gz = gzipSync(raw, { level: 9 });
mkdirSync(path.join(ROOT, "api/_lib"), { recursive: true });
writeFileSync(path.join(ROOT, "api/_lib/seo-data.gzjson"), gz);
console.log(
  `kanji pages: ${Object.keys(kanji).length}, word pages: ${Object.keys(words).length}, ` +
    `${(raw.length / 1024 / 1024).toFixed(2)}MB -> ${(gz.length / 1024 / 1024).toFixed(2)}MB`
);
