import {
  createInitialGraph,
  expandKanji,
  expandSemantic,
  expandWord,
  kanjiNodeId,
  revealLink,
  wordNodeId,
} from "./buildGraph.js";
import { DEFAULT_COMMONNESS } from "./commonness.js";

// A graph you built is a root word plus the ordered list of things you did
// to it -- expand a node, or reveal one link from the dictionary panel.
// That list is small, deterministic to replay, and fits in a URL, so any
// graph is shareable as /explore/<root>?expand=k:学,k:校&sel=w:学生.
//
// Op tokens:
//   k:<kanji>[~N|~all][@C]  expand a kanji (again = the next batch of
//                           words); ~N records a batch size other than the
//                           default, so the link replays what you saw even
//                           if the setting changes later; @C does the same
//                           for a Commonness dial (0-100) other than
//                           kanji mode's default
//   w:<word>                expand a word into its kanji
//   s:<word>[~N|~all][@C]   meaning mode: reveal the next batch of the
//                           word's semantic neighbours; @C as above,
//                           against meaning mode's default
//   l:<kanji>/<word>        reveal just that one kanji<->word link
//
// Two more query params describe the view rather than the ops:
//   mode=meaning  the explorer was in meaning mode (expanding a word shows
//                 words related in meaning, not its kanji)
//   start=word    the graph started from the root alone, without its kanji
//                 (a meaning-mode graph kept separate from the kanji one)

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

// <target>[~N|~all][@C], read from the end so a word may contain anything.
const SUFFIXES = /^(.+?)(?:~([1-9]\d{0,2}|all))?(?:@(\d{1,3}))?$/u;

/** Split an op's argument into its target, batch size and commonness. */
export function parseOpArg(arg) {
  const m = SUFFIXES.exec(arg);
  if (!m) return { target: arg, size: undefined, commonness: undefined };
  const c = m[3] === undefined ? undefined : Number(m[3]);
  return { target: m[1], size: m[2], commonness: c !== undefined && c <= 100 ? c : undefined };
}

/** Words whose neighbour lists a replay of `ops` needs loaded first. */
export function semanticOpWords(ops) {
  return ops.filter((op) => op.startsWith("s:")).map((op) => parseOpArg(op.slice(2)).target);
}

/** Whether replaying `ops` needs chiVe frequencies (data/semantic.js). */
export function opsNeedFrequency(ops) {
  return ops.some((op) => op.startsWith("s:") || (op.startsWith("k:") && parseOpArg(op.slice(2)).commonness > 0));
}

/** Rebuild a graph from its root and ops. Ops that no longer apply (a node
 * that isn't there, e.g. under a different JLPT filter) are skipped.
 * `semantic` (data/semantic.js) must already hold whatever
 * semanticOpWords/opsNeedFrequency say these ops need. */
export function replayGraph(
  dataset,
  root,
  ops,
  { maxWords = DEFAULT_MAX_WORDS, isJlptAllowed, semantic, start = "kanji" } = {}
) {
  let graph = createInitialGraph(dataset, root, { isJlptAllowed, withKanji: start !== "word" });
  const freqOf = semantic?.freqOf;
  for (const op of ops) {
    const kind = op.slice(0, 2);
    const arg = op.slice(2);
    if (kind === "k:" || kind === "s:") {
      const { target, size, commonness } = parseOpArg(arg);
      const batch = size === undefined ? maxWords : parseBatch(size) ?? maxWords;
      if (kind === "k:") {
        graph = expandKanji(dataset, graph, target, batch, {
          isJlptAllowed,
          commonness: commonness ?? DEFAULT_COMMONNESS.kanji,
          freqOf,
        });
      } else {
        graph = expandSemantic(dataset, graph, target, batch, {
          isJlptAllowed,
          commonness: commonness ?? DEFAULT_COMMONNESS.meaning,
          semantic,
        });
      }
    } else if (kind === "w:") graph = expandWord(dataset, graph, arg, { isJlptAllowed });
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

/**
 * The op token for expanding `nodeId`, recording the current
 * words-per-branch and Commonness when they differ from the defaults. A
 * word expands into its kanji (w:) in kanji mode, or into its meaning
 * neighbours (s:) in meaning mode; a kanji always expands into its words.
 */
export function expandOp(nodeId, maxWords = DEFAULT_MAX_WORDS, { mode = "kanji", commonness } = {}) {
  const token = nodeIdToToken(nodeId);
  if (!token) return null;
  const semantic = mode === "meaning" && token.startsWith("w:");
  if (token.startsWith("w:") && !semantic) return token;
  const kind = semantic ? "meaning" : "kanji";
  const base = semantic ? `s:${token.slice(2)}` : token;
  const size = maxWords !== DEFAULT_MAX_WORDS ? `~${formatBatch(maxWords)}` : "";
  const c = commonness ?? DEFAULT_COMMONNESS[kind];
  return `${base}${size}${c !== DEFAULT_COMMONNESS[kind] ? `@${c}` : ""}`;
}

/**
 * What a new graph of `root` starts as in `mode`: the root and its kanji, or
 * the root and its first batch of meaning neighbours. Search and Reset both
 * land here, whichever way mode switching is set.
 */
export function freshGraphState(root, mode, { maxWords = DEFAULT_MAX_WORDS, commonness } = {}) {
  return mode === "meaning"
    ? { start: "word", ops: [expandOp(wordNodeId(root), maxWords, { mode: "meaning", commonness })] }
    : { start: "kanji", ops: [] };
}

/** Whether a graph holds only what `mode` itself adds, so it can stand as that
 * mode's own graph when each mode keeps a separate one. */
export function graphFitsMode(ops, start, mode) {
  return mode === "meaning"
    ? start === "word" && ops.every((op) => op.startsWith("s:"))
    : start !== "word" && !ops.some((op) => op.startsWith("s:"));
}

/** The app URL for a graph state; `sel` is the selected node's id. */
export function exploreUrl({ root, ops = [], sel = null, maxWords = DEFAULT_MAX_WORDS, mode = "kanji", start = "kanji" }) {
  const params = new URLSearchParams();
  if (mode === "meaning") params.set("mode", "meaning");
  if (start === "word") params.set("start", "word");
  if (ops.length) params.set("expand", ops.join(","));
  const selToken = sel && sel !== wordNodeId(root) ? nodeIdToToken(sel) : null;
  if (selToken) params.set("sel", selToken);
  if (maxWords !== DEFAULT_MAX_WORDS) params.set("n", formatBatch(maxWords));
  const query = params.toString();
  // URLSearchParams escapes ":" "," "/" and "@" -- all legal in a query and
  // far easier to read (and share) left alone.
  const readable = query
    .replace(/%3A/gi, ":")
    .replace(/%2C/gi, ",")
    .replace(/%2F/gi, "/")
    .replace(/%40/gi, "@")
    .replace(/%7E/gi, "~");
  return `/explore/${encodeURIComponent(root)}${readable ? `?${readable}` : ""}`;
}

const OP = /^(k:.(~([1-9]\d{0,2}|all))?(@\d{1,3})?|w:.+|s:.+|l:.\/.+)$/u;

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
    // Absent unless set, so a plain kanji-mode link parses as it always has.
    mode: params.get("mode") === "meaning" ? "meaning" : undefined,
    start: params.get("start") === "word" ? "word" : undefined,
  };
}
