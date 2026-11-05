"""Prototype: semantic neighbours for Moto's words, from chiVe word vectors.

Offline, one-off, like the jamdict extraction (see data/offline-dataset/README.md).
Nothing here runs in the app; it writes a compact neighbour list the app could
lazy-load for a separate "meaning" mode.

    python3 scripts/semantic/build_neighbours.py path/to/chive-1.3-mc90.txt [OUT_DIR]

OUT_DIR defaults to public/data. It writes:

  frequency.gzjson        {word: chiVe frequency index} for every JMdict word
                          chiVe knows (~82k) -- the commonness signal
  semantic/NNN.gzjson     128 shards of {root: [[neighbour, similarity*100]]},
                          sharded by shardOf() (FNV-1a over code points,
                          mirrored in src/data/semantic.js) so the app only
                          fetches the ~55KB shard for the word being expanded

chiVe (https://github.com/WorksApplications/chiVe, Apache-2.0) is word2vec
trained on CommonCrawl Japanese, tokenised with Sudachi. Its vocabulary is in
corpus-frequency order, so a word's line number doubles as how common it is in
real text -- a continuous signal covering every word, unlike JMdict's `rank`,
which only ~13% of entries have.

What it produces, per root word (every JMdict word chiVe knows that is either
ranked or in chiVe's 60k most frequent words -- the same rule as
hasNeighbours() in src/data/semantic.js): up to 24 neighbours, chosen so the "commonness" dial has
something to show at every setting:

  - candidates are any JMdict word chiVe knows (~82k), not only ranked ones,
    so rarer, more "interesting" words can appear;
  - the top matches are split into three frequency bands (common / everyday /
    rare-ish, by chiVe frequency) and up to 6 / 8 / 10 are kept from each,
    weighted toward the rare end so "adventurous" has plenty to pick from;
  - within a band, picks are diversified (maximal marginal relevance), so the
    list isn't eight near-synonyms of each other;
  - alternate spellings of the root itself, and too many words that merely
    share its kanji (that's what kanji mode is for), are dropped.

Each neighbour is stored as [word, similarity*100]; each word's frequency
index is stored once in frequency.gzjson, so the client can weight by
commonness without the neighbour lists repeating it.
"""

import gzip
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
WORDS = ROOT / "data/offline-dataset/words.json"

BANDS = [(0, 15_000), (15_000, 60_000), (60_000, 10**9)]  # chiVe frequency index
PER_BAND = [6, 8, 10]
ROOT_MAX_FREQ = 60_000  # unranked words this frequent also get neighbours
SHARDS = 128
SHORTLIST = 400  # nearest candidates considered before banding
MIN_SIM = 0.35
MMR_LAMBDA = 0.75  # 1 = pure similarity, lower = more diverse
MAX_SHARED_KANJI = 2  # neighbours sharing a kanji with the root, per band


def is_kanji(ch):
    return "一" <= ch <= "鿿" or "㐀" <= ch <= "䶿" or ch == "々"


def kanji_of(word):
    return {c for c in word if is_kanji(c)}


def shard_of(word):
    """FNV-1a over code points; must match shardOf in src/data/semantic.js."""
    h = 0x811C9DC5
    for ch in word:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h % SHARDS


def write_gzjson(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    # mtime=0 keeps the bytes identical across rebuilds of the same data.
    path.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))


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


def main(vec_path, out_dir=ROOT / "public/data"):
    out_dir = Path(out_dir)
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

    roots = [i for i, w in enumerate(words) if by_word[w].get("rank") is not None or freq[i] < ROOT_MAX_FREQ]
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
                while pool and len(chosen) < PER_BAND[b]:
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
            neighbours[ri] = [[words[c], int(round(float(sims[row, c]) * 100))] for c in picks]
        print(f"  {min(start + chunk, len(roots))}/{len(roots)}", file=sys.stderr)

    write_gzjson(out_dir / "frequency.gzjson", {w: int(f) for w, f in zip(words, freq)})
    shards = [{} for _ in range(SHARDS)]
    for ri, ns in neighbours.items():
        shards[shard_of(words[ri])][words[ri]] = ns
    for n, shard in enumerate(shards):
        write_gzjson(out_dir / f"semantic/{n:03d}.gzjson", shard)
    print(f"wrote frequency for {len(words)} words, neighbours for {len(neighbours)} roots", file=sys.stderr)


if __name__ == "__main__":
    main(*sys.argv[1:3])
