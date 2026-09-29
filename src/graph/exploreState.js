import { createInitialGraph, expandKanji, expandWord, kanjiNodeId, revealLink, wordNodeId } from "./buildGraph.js";

// A graph you built is a root word plus the ordered list of things you did
// to it -- expand a node, or reveal one link from the dictionary panel.
// That list is small, deterministic to replay, and fits in a URL, so any
// graph is shareable as /explore/<root>?expand=k:学,k:校&sel=w:学生.
//
// Op tokens:
//   k:<kanji>[~N|~all] expand a kanji (again = the next batch of words);
//                      ~N records a batch size other than the default, so
//                      the link replays what you saw even if the setting
//                      changes later
//   w:<word>           expand a word into its kanji
//   l:<kanji>/<word>   reveal just that one kanji<->word link

export const DEFAULT_MAX_WORDS = 8;

/** Graph node id (kanji:学 / word:学校) <-> its short URL token (k:学 / w:学校). */
export function nodeIdToToken(id) {
  if (id.startsWith("kanji:")) return `k:${id.slice(6)}`;
  if (id.startsWith("word:")) return `w:${id.slice(5)}`;
  return null;
}
export function tokenToNodeId(token) {
  if (token.startsWith("k:")) return kanjiNodeId(token.slice(2));
  if (token.startsWith("w:")) return wordNodeId(token.slice(2));
  return null;
}

/** Rebuild a graph from its root and ops. Ops that no longer apply (a node
 * that isn't there, e.g. under a different JLPT filter) are skipped. */
export function replayGraph(dataset, root, ops, { maxWords = DEFAULT_MAX_WORDS, isJlptAllowed } = {}) {
  let graph = createInitialGraph(dataset, root, { isJlptAllowed });
  for (const op of ops) {
    const kind = op.slice(0, 2);
    const arg = op.slice(2);
    if (kind === "k:") {
      const [char, size] = arg.split("~");
      const batch = size === undefined ? maxWords : parseBatch(size) ?? maxWords;
      graph = expandKanji(dataset, graph, char, batch, { isJlptAllowed });
    }
    else if (kind === "w:") graph = expandWord(dataset, graph, arg, { isJlptAllowed });
    else if (kind === "l:") {
      const slash = arg.indexOf("/");
      if (slash > 0) graph = revealLink(dataset, graph, { kanjiChar: arg.slice(0, slash), word: arg.slice(slash + 1) });
    }
  }
  return graph;
}

const formatBatch = (n) => (n === Infinity ? "all" : String(n));
function parseBatch(s) {
  if (s === "all") return Infinity;
  const n = Number.parseInt(s, 10);
  return String(n) === s && n >= 1 && n <= 100 ? n : null;
}

/** The op token for expanding `nodeId` with the current words-per-branch. */
export function expandOp(nodeId, maxWords = DEFAULT_MAX_WORDS) {
  const token = nodeIdToToken(nodeId);
  return token?.startsWith("k:") && maxWords !== DEFAULT_MAX_WORDS ? `${token}~${formatBatch(maxWords)}` : token;
}

/** The app URL for a graph state; `sel` is the selected node's id. */
export function exploreUrl({ root, ops = [], sel = null, maxWords = DEFAULT_MAX_WORDS }) {
  const params = new URLSearchParams();
  if (ops.length) params.set("expand", ops.join(","));
  const selToken = sel && sel !== wordNodeId(root) ? nodeIdToToken(sel) : null;
  if (selToken) params.set("sel", selToken);
  if (maxWords !== DEFAULT_MAX_WORDS) params.set("n", formatBatch(maxWords));
  const query = params.toString();
  // URLSearchParams escapes ":" "," and "/" -- all legal in a query and
  // far easier to read (and share) left alone.
  const readable = query.replace(/%3A/gi, ":").replace(/%2C/gi, ",").replace(/%2F/gi, "/");
  return `/explore/${encodeURIComponent(root)}${readable ? `?${readable}` : ""}`;
}

const OP = /^(k:.(~([1-9]\d{0,2}|all))?|w:.+|l:.\/.+)$/u;

/** Parse an /explore/ URL back into state, or null for any other path. */
export function parseExploreUrl(pathname, search = "") {
  const m = /^\/explore\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  let root;
  try {
    root = decodeURIComponent(m[1]).trim();
  } catch {
    return null;
  }
  if (!root) return null;
  const params = new URLSearchParams(search);
  const ops = (params.get("expand") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => OP.test(s))
    .slice(0, 200); // a sane cap on what one link can make the page do
  const sel = params.get("sel");
  const n = parseBatch(params.get("n") ?? "");
  return {
    root,
    ops,
    sel: sel && /^(k:.|w:.+)$/u.test(sel) ? tokenToNodeId(sel) : null,
    maxWords: n,
  };
}
