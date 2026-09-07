// Fallback export path for when AnkiConnect isn't reachable: a plain
// tab-separated file. Anki's File -> Import reads this format with zero
// setup, unlike a real .apkg which would need a browser-side SQLite/zip
// writer -- too much weight for a fallback whose whole job is "the good
// path isn't available."

export function buildAnkiTsv(words) {
  return words.map((w) => `${w.word}\t${w.reading} — ${w.meaning}`).join("\n");
}

export function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
