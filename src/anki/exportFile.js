// Fallback export path for when AnkiConnect isn't reachable: a plain
// tab-separated file. Anki's File -> Import reads this format with zero
// setup, unlike a real .apkg which would need a browser-side SQLite/zip
// writer -- too much weight for a fallback whose whole job is "the good
// path isn't available."

import { componentKanjiFor, noteFields } from "./ankiSync";

// Fields carry HTML (with attribute quotes), so they're quoted and any
// inner quote doubled, as Anki's importer expects.
const quoted = (field) => `"${field.replace(/"/g, '""')}"`;

/** Front and back for Anki's Basic note type, with the same content as a
 * synced card. The header lines tell Anki's importer the file holds HTML,
 * so the formatting survives without touching the import dialog. */
export function buildAnkiTsv(words, dataset) {
  const rows = words.map((w) => {
    const { Word, Reading, Meaning, Kanji } = noteFields(w, componentKanjiFor(dataset, w.word));
    const back = `<div>${Reading}</div><div>${Meaning}</div>${Kanji ? `<hr>${Kanji}` : ""}`;
    return `${quoted(`<b>${Word}</b>`)}\t${quoted(back)}`;
  });
  return ["#separator:Tab", "#html:true", ...rows].join("\n");
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
