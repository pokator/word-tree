"""Prototype: semantic neighbours for Moto's words, from chiVe word vectors.

Offline, one-off, like the jamdict extraction (see data/offline-dataset/README.md).
Nothing here runs in the app; it writes a compact neighbour list the app could
lazy-load for a separate "meaning" mode.

    python3 scripts/semantic/build_neighbours.py path/to/chive-1.3-mc90.txt OUT_DIR

chiVe (https://github.com/WorksApplications/chiVe, Apache-2.0) is word2vec
trained on CommonCrawl Japanese, tokenised with Sudachi. Its vocabulary is in
corpus-frequency order, so a word's line number doubles as how common it is in
real text -- a continuous signal covering every word, unlike JMdict's `rank`,
which only ~13% of entries have.

What it produces, per root word (every JMdict word with a `rank` that chiVe
knows, ~27k): up to 24 neighbours, chosen so the "commonness" dial has
something to show at every setting:

  - candidates are any JMdict word chiVe knows (~82k), not only ranked ones,
    so rarer, more "interesting" words can appear;
  - the top matches are split into three frequency bands (common / everyday /
    rare-ish, by chiVe frequency) and up to 8 are kept from each;
  - within a band, picks are diversified (maximal marginal relevance), so the
    list isn't eight near-synonyms of each other;
  - alternate spellings of the root itself, and too many words that merely
    share its kanji (that's what kanji mode is for), are dropped.

Each neighbour is stored as [word index, similarity*100]; each word's
frequency index is stored once, so the client can filter/weight by
commonness without the neighbour lists repeating it.
"""

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
WORDS = ROOT / "data/offline-dataset/words.json"

BANDS = [(0, 15_000), (15_000, 60_000), (60_000, 10**9)]  # chiVe frequency index
PER_BAND = 8
SHORTLIST = 400  # nearest candidates considered before banding
MIN_SIM = 0.35
MMR_LAMBDA = 0.75  # 1 = pure similarity, lower = more diverse
MAX_SHARED_KANJI = 2  # neighbours sharing a kanji with the root, per band


def is_kanji(ch):
    return "一" <= ch <= "鿿" or "㐀" <= ch <= "䶿" or ch == "々"


def kanji_of(word):
    return {c for c in word if is_kanji(c)}


def load_vectors(path, wanted):
    vecs, freq, words = [], [], []
    with open(path, encoding="utf-8") as f:
        f.readline()
        for i, line in enumerate(f):
            sp = line.find(" ")
            w = line[:sp]
            if w in wanted:
                words.append(w)
                freq.append(i)
                vecs.append(np.array(line[sp + 1 :].split(), dtype=np.float32))
    m = np.vstack(vecs)
    m /= np.linalg.norm(m, axis=1, keepdims=True)
    return words, np.array(freq), m


def main(vec_path, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    entries = json.loads(WORDS.read_text(encoding="utf-8"))
    by_word = {}
    for e in entries:
        by_word.setdefault(e["word"], e)

    words, freq, m = load_vectors(vec_path, set(by_word))
    print(f"{len(words)} JMdict words have vectors", file=sys.stderr)
    index = {w: i for i, w in enumerate(words)}
    # Same JMdict entry under another spelling: identical reading + senses.
    entry_key = [(by_word[w].get("reading"), by_word[w].get("meaning")) for w in words]
    kanji_sets = [kanji_of(w) for w in words]
    band_of = np.searchsorted([b[1] for b in BANDS], freq, side="right")

    roots = [i for i, w in enumerate(words) if by_word[w].get("rank") is not None]
    print(f"{len(roots)} roots", file=sys.stderr)

    neighbours = {}
    chunk = 512
    for start in range(0, len(roots), chunk):
        ids = roots[start : start + chunk]
        sims = m[ids] @ m.T
        top = np.argpartition(-sims, SHORTLIST, axis=1)[:, :SHORTLIST]
        for row, ri in enumerate(ids):
            cand = top[row][np.argsort(-sims[row, top[row]])]
            picks = []
            for b in range(len(BANDS)):
                pool = [
                    c
                    for c in cand
                    if c != ri
                    and band_of[c] == b
                    and sims[row, c] >= MIN_SIM
                    and entry_key[c] != entry_key[ri]
                    and words[c] not in words[ri]  # a piece of the root itself
                ]
                chosen, shared = [], 0
                while pool and len(chosen) < PER_BAND:
                    if chosen:
                        red = (m[pool] @ m[chosen].T).max(axis=1)
                        score = MMR_LAMBDA * sims[row, pool] - (1 - MMR_LAMBDA) * red
                    else:
                        score = sims[row, pool]
                    c = pool.pop(int(np.argmax(score)))
                    overlap = bool(kanji_sets[c] & kanji_sets[ri])
                    if overlap and shared >= MAX_SHARED_KANJI:
                        continue
                    shared += overlap
                    if any(entry_key[c] == entry_key[p] for p in chosen):
                        continue
                    chosen.append(c)
                picks += chosen
            picks.sort(key=lambda c: -sims[row, c])
            neighbours[ri] = [[int(c), int(round(float(sims[row, c]) * 100))] for c in picks]
        print(f"  {min(start + chunk, len(roots))}/{len(roots)}", file=sys.stderr)

    used = sorted({ri for ri in neighbours} | {c for ns in neighbours.values() for c, _ in ns})
    remap = {old: new for new, old in enumerate(used)}
    out = {
        "source": "chiVe 1.3 mc90 (Works Applications, Apache-2.0)",
        "bands": [b[0] for b in BANDS],
        "words": [words[i] for i in used],
        "freq": [int(freq[i]) for i in used],
        "neighbours": {str(remap[r]): [[remap[c], s] for c, s in ns] for r, ns in neighbours.items()},
    }
    (out_dir / "neighbours.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(used)} words, {len(neighbours)} roots", file=sys.stderr)


if __name__ == "__main__":
    main(*sys.argv[1:3])
