// Classifies, for each kanji component of a word, whether the word's
// reading uses that kanji's on'yomi (Chinese-derived) or kun'yomi (native
// Japanese) reading -- computed once per word node (see buildGraph.js's
// wordNode) since resolving even ONE kanji's reading correctly requires
// aligning the WHOLE word's reading against ALL of its component kanji at
// once, not just the one a given kanji->word link happens to point at.
//
// This is a best-effort furigana-style aligner, not a linguistically
// complete one: it accounts for the two sound changes (onbin) common enough
// in real compounds to matter for classification --
//   - rendaku (voicing), e.g. 花 "か" -> "が" in 花瓶 (かびん)
//   - sokuon reduction (small tsu), e.g. 学 "がく" -> "がっ" in 学校 (がっこう)
// -- but not rarer vowel-fusion shifts or irregular/jukujikun readings
// (e.g. 今日 -> きょう), which fall back to "unknown" rather than risk a
// wrong guess.
import { isKanji, extractKanjiComponents } from "./kanji";

const RENDAKU = {
  か: "が", き: "ぎ", く: "ぐ", け: "げ", こ: "ご",
  さ: "ざ", し: "じ", す: "ず", せ: "ぜ", そ: "ぞ",
  た: "だ", ち: "ぢ", つ: "づ", て: "で", と: "ど",
  は: "ば", ひ: "び", ふ: "ぶ", へ: "べ", ほ: "ぼ",
};
const SOKUON_SOURCES = new Set(["く", "き", "ち", "つ"]);

// Kunyomi entries carry stem/okurigana split by "." (た.べる -> stem "た")
// and a leading/trailing "-" marking a reading only used attached to
// another word (e.g. 日's "-び" as in 誕生日) -- already the surface form we
// want, just strip the marker. A handful of onyomi entries carry the same
// "-" marker for a combining form.
function stripDash(reading) {
  return reading.replace(/^-|-$/g, "");
}

function componentReadings(dataset, char) {
  const entry = dataset.KANJI?.[char];
  if (!entry) return [];
  const onyomi = (entry.onyomi ?? []).map((r) => ({ base: stripDash(r), type: "onyomi" }));
  const kunyomi = (entry.kunyomi ?? []).map((r) => ({ base: stripDash(r.split(".")[0]), type: "kunyomi" }));
  return [...onyomi, ...kunyomi].filter((c) => c.base.length > 0);
}

// Every surface form `base` could actually appear as at this position in
// the word -- the literal reading, plus rendaku/sokuon variants when this
// occurrence's position allows them (rendaku needs a preceding component,
// sokuon needs a following one).
function surfaceForms(base, { canRendaku, canSokuon }) {
  const forms = new Set([base]);
  const first = base[0];
  const last = base[base.length - 1];
  if (canRendaku && RENDAKU[first]) forms.add(RENDAKU[first] + base.slice(1));
  if (canSokuon && SOKUON_SOURCES.has(last)) {
    const reduced = base.slice(0, -1) + "っ";
    forms.add(reduced);
    if (canRendaku && RENDAKU[first]) forms.add(RENDAKU[first] + reduced.slice(1));
  }
  return forms;
}

/**
 * Best-effort alignment of a word's reading against its kanji components.
 * Returns a plain object mapping each unique kanji character in `word` to
 * "onyomi" | "kunyomi" | "unknown" (no dictionary entry, no reading, or no
 * combination of known readings fully explains the word's reading).
 *
 * Kana in the word (okurigana, particles) must match the reading literally
 * at the aligned position; kanji are matched against their on'yomi/kun'yomi
 * candidates (see surfaceForms). Search is a small backtracking DP over
 * (word position, reading position) -- feasibility from a given pair never
 * depends on which readings were chosen earlier, so failures are memoized
 * and the whole thing stays fast even though it's exponential-looking.
 */
export function kanjiReadingTypes(dataset, word, reading) {
  const result = {};
  if (word && reading) {
    const chars = Array.from(word);
    const failed = new Set();

    const search = (pos, readPos, assigned) => {
      if (pos === chars.length) return readPos === reading.length ? assigned : null;
      const key = `${pos}:${readPos}`;
      if (failed.has(key)) return null;

      const ch = chars[pos];
      if (!isKanji(ch)) {
        if (reading[readPos] === ch) {
          const outcome = search(pos + 1, readPos + 1, assigned);
          if (outcome) return outcome;
        }
        failed.add(key);
        return null;
      }

      const canRendaku = pos > 0;
      const canSokuon = pos < chars.length - 1;
      for (const { base, type } of componentReadings(dataset, ch)) {
        for (const surface of surfaceForms(base, { canRendaku, canSokuon })) {
          if (!surface || !reading.startsWith(surface, readPos)) continue;
          const next = assigned.has(ch) ? assigned : new Map(assigned).set(ch, type);
          const outcome = search(pos + 1, readPos + surface.length, next);
          if (outcome) return outcome;
        }
      }
      failed.add(key);
      return null;
    };

    const solved = search(0, 0, new Map());
    if (solved) {
      for (const [char, type] of solved) result[char] = type;
    }
  }

  for (const char of extractKanjiComponents(word)) {
    if (!result[char]) result[char] = "unknown";
  }
  return result;
}

export const READING_TYPE_ORDER = ["onyomi", "kunyomi", "unknown"];
