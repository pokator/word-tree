// Writes the shard format build_neighbours.py does, so tests can supply their
// own small dictionaries. `lists` is {word: [[word, similarity*100], ...]} and
// `vocab` is the frequency file's words in order.
export function encodeShard(lists, vocab) {
  const out = [];
  const varint = (value) => {
    while (value >= 128) {
      out.push((value & 127) | 128);
      value = Math.floor(value / 128);
    }
    out.push(value);
  };
  for (const [word, list] of Object.entries(lists)) {
    if (!list.length) continue;
    varint(vocab.indexOf(word));
    varint(list.length);
    for (const [neighbour, similarity] of list) {
      varint(vocab.indexOf(neighbour));
      out.push(similarity);
    }
  }
  return Uint8Array.from(out);
}
