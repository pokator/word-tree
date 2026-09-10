// Regenerates public/data/{words,kanji}.json.gz from the canonical source in
// data/offline-dataset/ (see data/offline-dataset/README.md for provenance).
// The source files live outside public/ so Vite doesn't copy their raw,
// uncompressed bytes into every build's static output -- only the much
// smaller .gz files ship. Run after editing the source dataset:
//   npm run generate:offline-gz
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Deliberately NOT a ".gz" extension: static file servers (Vercel included)
// pattern-match a trailing ".gz" and transparently set
// Content-Encoding: gzip, which makes `fetch()` auto-decompress the body
// before our code ever sees it -- double-decompressing that with
// DecompressionStream then fails. ".gzjson" is inert to that heuristic, so
// the bytes we fetch are always the raw compressed payload.
for (const name of ["words.json", "kanji.json"]) {
  const src = path.join(ROOT, "data/offline-dataset", name);
  const dest = path.join(ROOT, "public/data", `${name.replace(/\.json$/, "")}.gzjson`);
  const raw = readFileSync(src);
  const gz = gzipSync(raw, { level: 9 });
  writeFileSync(dest, gz);
  console.log(`${name}: ${(raw.length / 1024 / 1024).toFixed(2)}MB -> ${(gz.length / 1024 / 1024).toFixed(2)}MB`);
}
