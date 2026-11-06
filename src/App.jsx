import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchBar from "./components/SearchBar";
import DictionaryPanel from "./components/DictionaryPanel";
import GraphPanel from "./components/GraphPanel";
import PaneLayout from "./components/PaneLayout";
import ThemeToggle from "./components/ThemeToggle";
import BookmarksPanel from "./components/BookmarksPanel";
import Tutorial from "./components/Tutorial";
import MobileMenu from "./components/MobileMenu";
import { BookmarkIcon, TutorialIcon } from "./components/icons";
import { useWordData } from "./data/useWordData";
import { useSemantic } from "./data/useSemantic";
import { useRecentRoots } from "./data/useRecentRoots";
import { useProgress } from "./progress/useProgress";
import { useSavedWords } from "./progress/useSavedWords";
import { useStreak } from "./progress/useStreak";
import { useGroups } from "./groups/useGroups";
import { useAnkiSync } from "./anki/useAnkiSync";
import { useTheme } from "./theme/useTheme";
import { useLayoutMode } from "./lib/useLayoutMode";
import { track, trackOnce } from "./lib/events";
import {
  expandOp,
  exploreUrl,
  freshGraphState,
  graphFitsMode,
  opsNeedFrequency,
  parseExploreUrl,
  replayGraph,
  semanticOpWords,
} from "./graph/exploreState";
import { DEFAULT_COMMONNESS } from "./graph/commonness";
import {
  expandKanji,
  expandSemantic,
  expandWord,
  revealLink,
  wordNodeId,
  kanjiNodeId,
  kanjiJlptBucket,
  wordJlptBucket,
} from "./graph/buildGraph";
import { extractKanjiComponents } from "./graph/kanji";
import "./App.css";

const DEFAULT_ROOT = "日本語";
const MAX_WORDS_KEY = "word-tree:max-words-per-branch";
const JLPT_FILTER_KEY = "word-tree:jlpt-filter";
const COLOR_BY_DIFFICULTY_KEY = "word-tree:color-by-difficulty";
const LINK_COLOR_MODE_KEY = "word-tree:link-color-mode";
const LEGACY_COLOR_BY_READING_KEY = "word-tree:color-by-reading";
const COLOR_BY_KANJI_PATH_KEY = "word-tree:color-by-kanji-path";
const COMMONNESS_KEY = "word-tree:commonness";
const MODE_SWITCH_KEY = "word-tree:mode-switch";
const MAX_WORDS_OPTIONS = [5, 8, 12, 20, 40, Infinity];
const DEFAULT_JLPT_FILTER = { n5: true, n4: true, n3: true, n2: true, n1: true, unrated: true };
const EMPTY_SET = new Set();

function loadMaxWords() {
  try {
    const raw = localStorage.getItem(MAX_WORDS_KEY);
    const n = raw === "all" ? Infinity : Number(raw);
    return MAX_WORDS_OPTIONS.includes(n) ? n : 8;
  } catch {
    return 8;
  }
}


// The Status filter is gone; drop its saved setting rather than leave it
// sitting in every returning visitor's storage.
try {
  localStorage.removeItem("word-tree:mastery-filter");
} catch {
  // localStorage unavailable -- nothing to clean up
}

function loadJlptFilter() {
  try {
    const raw = localStorage.getItem(JLPT_FILTER_KEY);
    if (!raw) return DEFAULT_JLPT_FILTER;
    return { ...DEFAULT_JLPT_FILTER, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_JLPT_FILTER;
  }
}

function loadColorByDifficulty() {
  try {
    return localStorage.getItem(COLOR_BY_DIFFICULTY_KEY) === "true";
  } catch {
    return false;
  }
}

// Link coloring is a single mode (previously two independent controls:
// position was always on with no way to turn it off, reading was a
// separate opt-in toggle that replaced it on screen -- see DESIGN.md's
// decisions log) so only one can ever be active, and it defaults to "off"
// now that position is no longer forced on. Reads the old boolean key once
// so anyone who'd already turned Reading coloring on keeps seeing it
// rather than being silently switched back to a mode they didn't pick.
function loadLinkColorMode() {
  try {
    const raw = localStorage.getItem(LINK_COLOR_MODE_KEY);
    if (raw === "off" || raw === "position" || raw === "reading") return raw;
    return localStorage.getItem(LEGACY_COLOR_BY_READING_KEY) === "true" ? "reading" : "off";
  } catch {
    return "off";
  }
}

// Unlike the other graph-coloring toggles (which default off -- they're
// supplementary lenses on the whole graph), this one defaults on: it only
// ever lights up the 1-4 links/kanji belonging to whichever word is
// already selected, the same "accent on the actively-explored path"
// restraint the rest of the graph follows, so it reads as part of the
// core selection interaction rather than an extra layer to opt into.
function loadColorByKanjiPath() {
  try {
    const raw = localStorage.getItem(COLOR_BY_KANJI_PATH_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

// The Commonness dial, one value per mode (their defaults differ -- see
// graph/commonness.js).
function loadCommonness() {
  try {
    const saved = JSON.parse(localStorage.getItem(COMMONNESS_KEY) ?? "{}");
    const valid = (v) => Number.isInteger(v) && v >= 0 && v <= 100;
    return {
      kanji: valid(saved.kanji) ? saved.kanji : DEFAULT_COMMONNESS.kanji,
      meaning: valid(saved.meaning) ? saved.meaning : DEFAULT_COMMONNESS.meaning,
    };
  } catch {
    return { ...DEFAULT_COMMONNESS };
  }
}

// Experiment: what switching between kanji and meaning mode does to the
// graph on screen.
//   "separate" -- each mode has its own graph for the current word; you
//                 swap between them, and each is kept until you search for
//                 another word or reset that graph.
//   "mixed"    -- one graph; the mode only decides what the NEXT expansion
//                 of a word shows (its kanji, or words related in meaning).
function loadModeSwitch() {
  try {
    return localStorage.getItem(MODE_SWITCH_KEY) === "mixed" ? "mixed" : "separate";
  } catch {
    return "separate";
  }
}

const stashKey = (root, mode) => `${root}\n${mode}`;

// Whether all of a word's meaning neighbours are already shown; a word with no
// neighbour list counts as done.
function meaningExpansionDone(node, semanticStore) {
  return node.semanticExpanded || (semanticStore.hasFrequency() && !semanticStore.hasNeighbours(node.word, node.rank));
}

function jlptBucketToLevel(bucket) {
  if (!bucket || bucket === "unrated") return null;
  const n = Number(bucket.slice(1));
  return Number.isFinite(n) ? n : null;
}

// Identifies one graph state -- one history entry (see the URL sync in App).
const graphKey = (root, ops, start = "kanji") => `${root}\n${start}\n${ops.join(",")}`;

// index.html's own title, for the untouched home page.
const HOME_TITLE = typeof document === "undefined" ? "" : document.title;

/** The graph a shared /explore/ link describes, read once on load. */
function readLocation() {
  if (typeof window === "undefined") return null;
  return parseExploreUrl(window.location.pathname, window.location.search);
}

export default function App() {
  const dataset = useWordData();
  const semantic = useSemantic();
  const { store: semanticStore, load: loadSemantic } = semantic;
  const [fromUrl] = useState(readLocation);
  // Kanji mode branches by shared kanji; meaning mode by words used in
  // similar contexts (see data/semantic.js). `start` is how the current
  // graph began: from the root and its kanji, or ("word") the root alone.
  const [mode, setMode] = useState(fromUrl?.mode ?? "kanji");
  const [start, setStart] = useState(fromUrl?.start ?? "kanji");
  const [modeSwitch, setModeSwitch] = useState(loadModeSwitch);
  const [commonness, setCommonness] = useState(loadCommonness);
  // "separate" mode switching: graphs you've left, kept to swap back to --
  // stashKey(root, mode) -> { ops, start, selectedId }. Kept across crossing
  // to another word and back, and dropped by a new search.
  const stashRef = useRef({});
  const [rootWord, setRootWord] = useState(fromUrl?.root ?? DEFAULT_ROOT);
  // What you did to the graph since its root was set (see
  // graph/exploreState.js) -- replayable, so it's also the shareable URL.
  const [ops, setOps] = useState(fromUrl?.ops ?? []);
  // Bumped on back/forward, so the graph rebuilds even for the same root.
  const [navKey, setNavKey] = useState(0);
  // The latest navKey, for an expansion finishing after its data loaded to
  // tell whether the graph it was for is still the one on screen.
  const navKeyRef = useRef(navKey);
  useEffect(() => {
    navKeyRef.current = navKey;
  }, [navKey]);
  // Expansions waiting on semantic data, so a second tap can't apply twice.
  const pendingExpandsRef = useRef(new Set());
  // A word found to have no meaning neighbours when asked for from Kanji mode.
  const [noRelatedFor, setNoRelatedFor] = useState(null);
  const [graph, setGraph] = useState(null);
  // Bumped when Reset or the tour rebuilds the graph around the same root,
  // so the graph re-frames itself even though its root didn't change.
  const [viewKey, setViewKey] = useState(0);
  const [builtFor, setBuiltFor] = useState(null);
  const [selectedId, setSelectedId] = useState(fromUrl?.sel ?? wordNodeId(fromUrl?.root ?? DEFAULT_ROOT));
  // What to select if the selection turns out not to be in the next graph
  // built (see handleSetMode).
  const [selectFallback, setSelectFallback] = useState(null);
  // A shared link's words-per-branch applies to this visit only -- it's
  // not saved over your own setting (that happens in handleSetMaxWords).
  const [maxWords, setMaxWords] = useState(() => fromUrl?.maxWords ?? loadMaxWords());
  const [jlptFilter, setJlptFilter] = useState(loadJlptFilter);
  const [colorByDifficulty, setColorByDifficulty] = useState(loadColorByDifficulty);
  const [linkColorMode, setLinkColorMode] = useState(loadLinkColorMode);
  const [colorByKanjiPath, setColorByKanjiPath] = useState(loadColorByKanjiPath);
  const [focusGroupId, setFocusGroupId] = useState(null);
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const { recents, addRecent } = useRecentRoots();
  const streak = useStreak();
  const { theme, toggle: toggleTheme } = useTheme();
  // "phone" | "rail" | "tablet" | "desktop" -- see lib/useLayoutMode.js.
  const layout = useLayoutMode();
  const isDesktop = layout === "desktop";
  // Which half of the phone layout is expanded (see MobileLayout). Starts on
  // the graph -- exploring is the app's hook; the definition is one tap away.
  const [mobileView, setMobileView] = useState("explore"); // "explore" | "definitions"

  // A word's JLPT bucket is derived from its hardest-tagged kanji (see
  // graph/buildGraph.js) -- there's no stored per-word JLPT field.
  const isJlptAllowed = useCallback(
    (type, idOrWord) => {
      const bucket = type === "kanji" ? kanjiJlptBucket(dataset, idOrWord) : wordJlptBucket(dataset, idOrWord);
      return jlptFilter[bucket] !== false;
    },
    [dataset, jlptFilter]
  );

  // Rebuild the graph when the dataset becomes ready or the root word
  // changes -- adjusting state during render (React's documented pattern
  // for "reset state when an input changes") rather than in an effect, so
  // there's no extra render with stale data in between.
  //
  // A graph with meaning-mode ops (or a non-default Commonness) needs the
  // semantic data first; the effect below fetches it, and the build waits
  // for it (or for it to fail, in which case those ops just do nothing).
  const opWords = semanticOpWords(ops);
  const semanticReady =
    semantic.failed ||
    (opWords.length === 0 && !opsNeedFrequency(ops)) ||
    semanticStore.isLoaded(opWords);
  useEffect(() => {
    if (!semanticReady) loadSemantic(opWords).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanticReady, opWords.join("\n")]);
  const readyKey = dataset.loading || !semanticReady ? null : `${dataset.source}:${rootWord}:${navKey}`;
  if (readyKey && readyKey !== builtFor) {
    setBuiltFor(readyKey);
    const built = replayGraph(dataset, rootWord, ops, { maxWords, isJlptAllowed, semantic: semanticStore, start });
    setGraph(built);
    // A link's sel= can name a node its expansions never revealed.
    if (!built.nodes.has(selectedId)) {
      setSelectedId(built.nodes.has(selectFallback) ? selectFallback : wordNodeId(rootWord));
    }
    setSelectFallback(null);
  }

  // In meaning mode a word's dashed "more to reveal" ring is about its
  // meaning neighbours, not its kanji, so the graph is shown with each
  // word's `expanded` read from that side instead. A word with no
  // neighbour list counts as fully expanded.
  const viewGraph = useMemo(() => {
    if (!graph || mode !== "meaning") return graph;
    const nodes = new Map();
    for (const [id, n] of graph.nodes) {
      nodes.set(id, n.type === "word" ? { ...n, expanded: meaningExpansionDone(n, semanticStore) } : n);
    }
    return { nodes, links: graph.links };
    // semantic.version: what hasNeighbours can answer changes as data loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, mode, semanticStore, semantic.version]);

  const selectedNode = viewGraph?.nodes.get(selectedId) ?? null;

  // The word's own component kanji, shown beside its definitions (see
  // DictionaryPanel). Only reachable once the graph exists, which is only
  // once the dataset has loaded, so dataset.KANJI is always populated here.
  const componentKanji = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "word") return [];
    return extractKanjiComponents(selectedNode.word)
      .map((char) => dataset.KANJI[char])
      .filter(Boolean);
  }, [selectedNode, dataset]);

  // The top 5 most common words sharing this kanji, shown beside its
  // on'yomi/kun'yomi (see DictionaryPanel) -- same "Kanji" column idea as
  // componentKanji above, mirrored for the kanji-entry view. Only available
  // once the full dataset (and its containing-words index) has loaded.
  const relatedWords = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "kanji" || !dataset.WORDS_CONTAINING_KANJI) return [];
    const candidates = dataset.WORDS_CONTAINING_KANJI[selectedNode.char] ?? [];
    return candidates
      .slice()
      .sort((a, b) => (dataset.WORDS_BY_TEXT[a]?.rank ?? 999) - (dataset.WORDS_BY_TEXT[b]?.rank ?? 999))
      .slice(0, 5)
      .map((word) => dataset.WORDS_BY_TEXT[word])
      .filter(Boolean);
  }, [selectedNode, dataset]);
  const selectedItemId = selectedNode && (selectedNode.type === "kanji" ? selectedNode.char : selectedNode.word);
  const selectedJlptLevel = selectedNode
    ? selectedNode.type === "kanji"
      ? (selectedNode.jlpt ?? null)
      : jlptBucketToLevel(wordJlptBucket(dataset, selectedNode.word))
    : null;

  const { getStatus, setStatus: setMasteryStatus, applyStatuses, wordStats } = useProgress();
  const handleSetStatus = useCallback(
    (status) => {
      if (selectedNode) setMasteryStatus(selectedNode.type, selectedItemId, status);
    },
    [selectedNode, selectedItemId, setMasteryStatus]
  );

  const saved = useSavedWords();
  const handleToggleSave = useCallback(() => {
    if (selectedNode?.type === "word") saved.toggleSave(selectedNode.word, { foundFrom: rootWord });
  }, [selectedNode, saved, rootWord]);

  const groupsApi = useGroups();
  const memberOf = selectedNode?.type === "word" ? groupsApi.groupsForWord(selectedNode.word) : [];

  // The side panel slot (Bookmarks). Kept as a keyed slot rather than a
  // boolean so another panel can share it without both ending up open.
  const [activeSidebar, setActiveSidebar] = useState(null); // null | "saved"
  const toggleSidebar = useCallback((key) => {
    setActiveSidebar((prev) => (prev === key ? null : key));
  }, []);
  const closeSidebar = useCallback(() => setActiveSidebar(null), []);
  const handleToggleGroup = useCallback(
    (groupId) => {
      if (selectedNode?.type !== "word") return;
      const group = groupsApi.groups.find((g) => g.id === groupId);
      if (group?.words.includes(selectedNode.word)) {
        groupsApi.removeWordFromGroup(groupId, selectedNode.word);
      } else {
        groupsApi.addWordToGroup(groupId, selectedNode.word);
      }
    },
    [selectedNode, groupsApi]
  );
  const handleCreateGroupWithWord = useCallback(
    (name) => {
      if (selectedNode?.type !== "word") return;
      groupsApi.createGroup(name, { word: selectedNode.word });
    },
    [selectedNode, groupsApi]
  );
  // The graph's small dot marks your bookmarks (it used to mark group
  // membership, before groups became bookmark tags).
  const isBookmarked = useCallback((word) => saved.isSaved(word), [saved]);

  const freshGraph = useCallback(
    (root, forMode) => freshGraphState(root, forMode, { maxWords, commonness: commonness.meaning }),
    [maxWords, commonness.meaning]
  );

  const handleSelectWord = useCallback(
    (word) => {
      const fresh = freshGraph(word, mode);
      stashRef.current = {}; // a new word drops the other mode's graph
      setRootWord(word);
      setStart(fresh.start);
      setOps(fresh.ops);
      // Rebuild from scratch even for the same word, or the old expansions
      // would stay on screen while the URL says there are none.
      setNavKey((k) => k + 1);
      setSelectedId(wordNodeId(word));
      addRecent(word);
    },
    [addRecent, freshGraph, mode]
  );

  // Only the search bar counts as a search -- bookmark clicks also land in
  // handleSelectWord, via handleSelectFromSidebar.
  const handleSearch = useCallback(
    (word) => {
      track("search");
      handleSelectWord(word);
    },
    [handleSelectWord]
  );

  // On desktop the Bookmarks/Groups panel docks beside the graph, so it
  // stays open while you jump between its words. Everywhere else it covers
  // the screen (or most of it) -- picking a word has to close it, or the
  // word you picked loads invisibly underneath.
  const handleSelectFromSidebar = useCallback(
    (word) => {
      handleSelectWord(word);
      if (!isDesktop) closeSidebar();
    },
    [handleSelectWord, isDesktop, closeSidebar]
  );

  // Resets only the graph on screen, back to where the current mode starts;
  // with separate mode graphs, the other mode's graph is kept.
  const handleReset = useCallback(() => {
    const fresh = freshGraph(rootWord, mode);
    setStart(fresh.start);
    setOps(fresh.ops);
    setSelectedId(wordNodeId(rootWord));
    setNavKey((k) => k + 1);
    setViewKey((k) => k + 1);
  }, [rootWord, mode, freshGraph]);

  const handleSetMode = useCallback(
    (next) => {
      if (next === mode) return;
      track("mode-switch");
      // Warm the cache: meaning mode needs frequencies and the root's shard.
      if (next === "meaning") loadSemantic([rootWord]).catch(() => {});
      setMode(next);
      if (modeSwitch === "mixed") return; // same graph; only the next expansion changes
      // A graph holding both modes' branches (from a shared link) isn't this
      // mode's own graph, so swapping back starts this mode fresh instead.
      stashRef.current[stashKey(rootWord, mode)] = graphFitsMode(ops, start, mode) ? { ops, start, selectedId } : undefined;
      const saved = stashRef.current[stashKey(rootWord, next)] ?? {
        ...freshGraph(rootWord, next),
        selectedId: wordNodeId(rootWord),
      };
      setStart(saved.start);
      setOps(saved.ops);
      // A word you've picked out stays selected if the other graph has it too;
      // otherwise that graph comes back with its own selection.
      if (selectedId === wordNodeId(rootWord)) setSelectedId(saved.selectedId);
      else setSelectFallback(saved.selectedId);
      setNavKey((k) => k + 1);
      setViewKey((k) => k + 1);
    },
    [mode, modeSwitch, ops, start, selectedId, rootWord, freshGraph, loadSemantic]
  );

  const handleSetModeSwitch = useCallback(
    (value) => {
      setModeSwitch(value);
      stashRef.current = {};
      // Separate graphs take effect now: a graph already mixing both modes
      // can't stay on screen as this mode's own.
      if (value === "separate" && !graphFitsMode(ops, start, mode)) {
        const fresh = freshGraph(rootWord, mode);
        setStart(fresh.start);
        setOps(fresh.ops);
        setSelectedId(wordNodeId(rootWord));
        setNavKey((k) => k + 1);
        setViewKey((k) => k + 1);
      }
      try {
        localStorage.setItem(MODE_SWITCH_KEY, value);
      } catch {
        // localStorage unavailable -- setting just won't persist this session
      }
    },
    [ops, start, mode, rootWord, freshGraph]
  );

  const handleSetCommonness = useCallback(
    (value) => {
      const next = { ...commonness, [mode]: value };
      setCommonness(next);
      // Kanji mode only needs frequencies once the dial leaves Familiar.
      if (value > 0) loadSemantic([]).catch(() => {});
      try {
        localStorage.setItem(COMMONNESS_KEY, JSON.stringify(next));
      } catch {
        // localStorage unavailable -- setting just won't persist this session
      }
    },
    [commonness, mode, loadSemantic]
  );

  // Always forces the graph back to DEFAULT_ROOT (rather than reusing
  // whatever's currently showing) so the tour's steps -- one of which
  // points at "a kanji node", another at the Reset button -- can rely on a
  // known, freshly-collapsed demo state. Doesn't go through
  // handleSelectWord/addRecent -- launching the tour isn't the user
  // searching for 日本語, so it shouldn't pollute their recent-searches list.
  const handleStartTutorial = useCallback(() => {
    stashRef.current = {};
    setMode("kanji");
    setStart("kanji");
    setRootWord(DEFAULT_ROOT);
    setOps([]);
    setSelectedId(wordNodeId(DEFAULT_ROOT));
    setNavKey((k) => k + 1);
    setViewKey((k) => k + 1);
    // On a phone the tour's graph steps need the graph on screen, not
    // collapsed behind the definitions.
    setMobileView("explore");
    setTutorialOpen(true);
  }, []);

  const handleMaxWordsChange = useCallback((rawValue) => {
    const next = rawValue === "all" ? Infinity : Number(rawValue);
    setMaxWords(next);
    try {
      localStorage.setItem(MAX_WORDS_KEY, rawValue);
    } catch {
      // localStorage unavailable -- setting just won't persist this session
    }
  }, []);


  const handleToggleJlptFilter = useCallback((bucket) => {
    setJlptFilter((prev) => {
      const next = { ...prev, [bucket]: !prev[bucket] };
      try {
        localStorage.setItem(JLPT_FILTER_KEY, JSON.stringify(next));
      } catch {
        // localStorage unavailable -- setting just won't persist this session
      }
      return next;
    });
  }, []);

  const handleToggleColorByDifficulty = useCallback(() => {
    setColorByDifficulty((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLOR_BY_DIFFICULTY_KEY, String(next));
      } catch {
        // localStorage unavailable -- setting just won't persist this session
      }
      return next;
    });
  }, []);

  const handleSetLinkColorMode = useCallback((mode) => {
    setLinkColorMode(mode);
    try {
      localStorage.setItem(LINK_COLOR_MODE_KEY, mode);
    } catch {
      // localStorage unavailable -- setting just won't persist this session
    }
  }, []);

  const handleToggleColorByKanjiPath = useCallback(() => {
    setColorByKanjiPath((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLOR_BY_KANJI_PATH_KEY, String(next));
      } catch {
        // localStorage unavailable -- setting just won't persist this session
      }
      return next;
    });
  }, []);

  const isNodeDimmed = useCallback(
    (node) => {
      // Study status never dims the graph -- that's Anki's side of the app
      // (see DESIGN.md, 2026-09-27); only what you're exploring does.
      if (node.type === "word") {
        if (focusGroupId) {
          const group = groupsApi.groups.find((g) => g.id === focusGroupId);
          if (group && !group.words.includes(node.word)) return true;
        }
      }
      if (!isJlptAllowed(node.type, node.type === "kanji" ? node.char : node.word)) return true;
      return false;
    },
    [focusGroupId, groupsApi.groups, isJlptAllowed]
  );

  const jlptFilterActive = Object.values(jlptFilter).some((v) => !v);
  const filtersActive =
    jlptFilterActive ||
    focusGroupId !== null ||
    maxWords !== 8 ||
    commonness[mode] !== DEFAULT_COMMONNESS[mode];

  // Keep the address bar on the graph you're looking at, so copying it (or
  // Share) gives someone else the same graph. A new root and each change to
  // the graph (an expansion, a revealed link, a reset) is a new history
  // entry, so Back steps back through what you did; merely selecting a
  // node, or a words-per-branch change, just updates the current entry.
  const shownRef = useRef(fromUrl ? graphKey(fromUrl.root, fromUrl.ops, fromUrl.start) : null);
  const graphUrl = exploreUrl({ root: rootWord, ops, sel: selectedId, maxWords, mode, start });
  useEffect(() => {
    if (dataset.loading) return;
    const here = decodeURI(window.location.pathname + window.location.search);
    // The untouched home page stays "/".
    if (window.location.pathname === "/" && rootWord === DEFAULT_ROOT && ops.length === 0 && mode === "kanji") return;
    if (decodeURI(graphUrl) === here) return;
    const key = graphKey(rootWord, ops, start);
    const leavingHome = window.location.pathname === "/";
    if (leavingHome || (shownRef.current !== null && shownRef.current !== key)) {
      window.history.pushState(null, "", graphUrl);
    } else {
      window.history.replaceState(null, "", graphUrl);
    }
    shownRef.current = key;
  }, [dataset.loading, graphUrl, rootWord, ops, mode, start]);

  const leavingGraphRef = useRef(null);
  useEffect(() => {
    leavingGraphRef.current = { rootWord, mode, ops, start, selectedId, modeSwitch };
  });
  useEffect(() => {
    function onPopState() {
      const state = readLocation();
      const root = state?.root ?? DEFAULT_ROOT;
      // Back into the other mode leaves this graph the same way a swap does.
      const left = leavingGraphRef.current;
      if (left.modeSwitch === "separate" && left.mode !== (state?.mode ?? "kanji") && graphFitsMode(left.ops, left.start, left.mode)) {
        stashRef.current[stashKey(left.rootWord, left.mode)] = {
          ops: left.ops,
          start: left.start,
          selectedId: left.selectedId,
        };
      }
      shownRef.current = graphKey(root, state?.ops ?? [], state?.start);
      setRootWord(root);
      setOps(state?.ops ?? []);
      setMode(state?.mode ?? "kanji");
      setStart(state?.start ?? "kanji");
      setSelectedId(state?.sel ?? wordNodeId(root));
      // That entry's words-per-branch (for expanding further), or your own.
      setMaxWords(state?.maxWords ?? loadMaxWords());
      setNavKey((k) => k + 1);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // A tab title per word, for history and bookmarks; home keeps its own.
  useEffect(() => {
    const home = window.location.pathname === "/" && rootWord === DEFAULT_ROOT && ops.length === 0;
    document.title = home ? HOME_TITLE : `${rootWord} — explore on Moto (元)`;
  }, [rootWord, ops.length]);

  // An installed (home-screen) app has no address bar to copy from.
  const handleShare = useCallback(async () => {
    const url = window.location.origin + graphUrl;
    track("share");
    if (navigator.share) {
      try {
        await navigator.share({ title: `${rootWord} — Moto (元)`, url });
        return "shared";
      } catch (err) {
        if (err?.name === "AbortError") return null; // closed the share sheet
        // Refused or unavailable right now -- copy instead.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      return "failed";
    }
  }, [graphUrl, rootWord]);

  // A click only selects (shows its definition) -- it never expands the
  // graph on its own, so browsing what's already there never surprises you
  // with new nodes. Expanding is the separate, deliberate action below.
  const handleNodeSelect = useCallback((nodeId) => {
    setSelectedId(nodeId);
  }, []);

  // `forMode` is the kind of expansion: the current mode's, unless the
  // dictionary panel asks for the other one (see handleCrossMode).
  const handleNodeExpand = useCallback(
    (nodeId, forMode = mode) => {
      setSelectedId(nodeId);
      // The graph on screen is about to be replaced by one still loading.
      if (!semanticReady) return;
      // The root starts out expanded, so double-clicking it changes nothing
      // and isn't a first expand.
      const target = graph?.nodes.get(nodeId);
      if (!target) return;
      const bySense = forMode === "meaning" && target.type === "word";
      if (bySense ? meaningExpansionDone(target, semanticStore) : target.expanded) return;
      // By what's expanding, not the mode: a kanji shows the same words either way.
      const dial = bySense ? commonness.meaning : commonness.kanji;
      const apply = () => {
        trackOnce("first-expand");
        // k:学, k:学~40, k:学@60, w:学校, s:学校@70
        setOps((o) => [...o, expandOp(nodeId, maxWords, { mode: forMode, commonness: dial })]);
        setGraph((prev) => {
          const node = prev?.nodes.get(nodeId);
          if (!node) return prev;
          if (bySense) {
            return expandSemantic(dataset, prev, node.word, maxWords, {
              isJlptAllowed,
              commonness: dial,
              semantic: semanticStore,
            });
          }
          if (node.expanded) return prev;
          return node.type === "kanji"
            ? expandKanji(dataset, prev, node.char, maxWords, {
                isJlptAllowed,
                commonness: dial,
                freqOf: semanticStore.freqOf,
              })
            : expandWord(dataset, prev, node.word, { isJlptAllowed });
        });
      };
      // Meaning neighbours, or a kanji reveal off the Familiar end of the
      // dial, need the semantic data; fetch it first (it's cached after).
      if (!bySense && !(target.type === "kanji" && dial > 0)) {
        apply();
        return;
      }
      const pendingKey = `${forMode}:${nodeId}`;
      if (pendingExpandsRef.current.has(pendingKey)) return;
      pendingExpandsRef.current.add(pendingKey);
      loadSemantic(bySense ? [target.word] : []).then(
        () => {
          pendingExpandsRef.current.delete(pendingKey);
          // You've moved on to another graph; this expansion isn't for it.
          if (navKeyRef.current !== navKey) return;
          // Only now, with frequencies loaded, can a word turn out to have none.
          if (bySense && meaningExpansionDone(target, semanticStore)) setNoRelatedFor(nodeId);
          else apply();
        },
        () => {
          pendingExpandsRef.current.delete(pendingKey);
        }
      );
    },
    [dataset, graph, mode, navKey, semanticReady, commonness, maxWords, isJlptAllowed, semanticStore, loadSemantic]
  );

  // The way across to the other mode from a word. With one graph that's just
  // the other kind of expansion, in place. With separate graphs it opens the
  // word in the other mode's graph: the same swap as the mode switch for the
  // root, or a new graph around any other word (which Back returns from).
  // `selectId` is what to select there instead of the word.
  const handleCrossMode = useCallback(
    (word, selectId) => {
      const next = mode === "meaning" ? "kanji" : "meaning";
      const nodeId = wordNodeId(word);
      const cross = () => {
        if (modeSwitch === "mixed") {
          handleNodeExpand(nodeId, next);
          return;
        }
        if (word === rootWord) {
          handleSetMode(next);
        } else {
          track("mode-switch");
          const fresh = freshGraph(word, next);
          stashRef.current[stashKey(rootWord, mode)] = graphFitsMode(ops, start, mode)
            ? { ops, start, selectedId }
            : undefined;
          setMode(next);
          setRootWord(word);
          setStart(fresh.start);
          setOps(fresh.ops);
          setSelectedId(nodeId);
          setNavKey((k) => k + 1);
          setViewKey((k) => k + 1);
          addRecent(word);
        }
        if (selectId) setSelectedId(selectId);
      };
      if (next === "kanji") {
        cross();
        return;
      }
      // Whether the word has any neighbours isn't known until frequencies
      // load, and it shouldn't leave this graph for a lone node if it doesn't.
      const rank = graph?.nodes.get(nodeId)?.rank;
      loadSemantic([word]).then(
        () => {
          if (navKeyRef.current !== navKey) return;
          if (semanticStore.hasNeighbours(word, rank)) cross();
          else setNoRelatedFor(nodeId);
        },
        () => {}
      );
    },
    [
      mode,
      modeSwitch,
      rootWord,
      ops,
      start,
      selectedId,
      graph,
      navKey,
      semanticStore,
      loadSemantic,
      handleNodeExpand,
      handleSetMode,
      freshGraph,
      addRecent,
    ]
  );

  // Clicking a card in the dictionary panel's "Kanji" (word view) or
  // "Related words" (kanji view) column reveals just that one link -- see
  // revealLink -- and selects the clicked side, without touching anything
  // else already on the graph. Distinct from handleSelectWord (search bar),
  // which re-centers the whole graph on a new root; this stays within the
  // current graph, same as clicking a node directly.
  const handleSelectRelated = useCallback(
    (type, key) => {
      if (!selectedNode) return;
      // A separate meaning graph holds only words, so a word's kanji is
      // somewhere to go rather than something to add here.
      if (modeSwitch === "separate" && mode === "meaning" && type === "kanji" && selectedNode.type === "word") {
        handleCrossMode(selectedNode.word, kanjiNodeId(key));
        return;
      }
      const link =
        type === "kanji" && selectedNode.type === "word"
          ? { kanjiChar: key, word: selectedNode.word }
          : type === "word" && selectedNode.type === "kanji"
            ? { kanjiChar: selectedNode.char, word: key }
            : null;
      if (link && graph && revealLink(dataset, graph, link) !== graph) {
        setOps((o) => [...o, `l:${link.kanjiChar}/${link.word}`]);
      }
      setGraph((prev) => {
        if (!prev) return prev;
        if (type === "kanji" && selectedNode.type === "word") {
          return revealLink(dataset, prev, { kanjiChar: key, word: selectedNode.word });
        }
        if (type === "word" && selectedNode.type === "kanji") {
          return revealLink(dataset, prev, { kanjiChar: selectedNode.char, word: key });
        }
        return prev;
      });
      setSelectedId(type === "kanji" ? kanjiNodeId(key) : wordNodeId(key));
    },
    [dataset, graph, selectedNode, modeSwitch, mode, handleCrossMode]
  );

  // The dictionary panel's way across to the other mode from the selected
  // word, when there's something to show there: a word with no kanji or no
  // meaning neighbours has nowhere to go, and with one graph, nor does one
  // whose other expansion is already on screen.
  const rawSelected = graph?.nodes.get(selectedId);
  // Meaning mode has nothing to show for this word, which a lone node or a
  // double-click doing nothing wouldn't explain on its own.
  const noRelatedWords =
    (mode === "meaning" || noRelatedFor === selectedId) &&
    rawSelected?.type === "word" &&
    semanticStore.hasFrequency() &&
    !semanticStore.hasNeighbours(rawSelected.word, rawSelected.rank);
  let crossLabel = null;
  if (rawSelected?.type === "word") {
    if (mode === "kanji") {
      if (!semantic.failed && !meaningExpansionDone(rawSelected, semanticStore)) crossLabel = "Related in meaning";
    } else if (componentKanji.length > 0 && (modeSwitch === "separate" || !rawSelected.expanded)) {
      crossLabel = "See its kanji";
    }
  }

  // Hovering one of those cards highlights where it relates to on the graph
  // (the current node it would attach to, plus the card's own node if
  // already revealed) -- see hintedIds below -- rather than making the user
  // guess what a click will do.
  const [hoverRelated, setHoverRelated] = useState(null); // { type, key } | null
  const handleHoverRelated = useCallback((type, key) => setHoverRelated({ type, key }), []);
  const handleHoverRelatedEnd = useCallback(() => setHoverRelated(null), []);
  const hintedIds = useMemo(() => {
    if (!hoverRelated || !selectedId) return EMPTY_SET;
    const targetId = hoverRelated.type === "kanji" ? kanjiNodeId(hoverRelated.key) : wordNodeId(hoverRelated.key);
    return new Set([selectedId, targetId]);
  }, [hoverRelated, selectedId]);


  const userTagsFor = useCallback(
    (word) => groupsApi.groupsForWord(word).map((g) => g.name),
    [groupsApi]
  );
  const statusFor = useCallback((word) => getStatus("word", word), [getStatus]);
  const anki = useAnkiSync({
    dataset,
    bookmarks: saved.words,
    bookmarksLoading: saved.loading,
    userTagsFor,
    statusFor,
    applyStatuses,
  });
  const ankiConnected = anki.state === "connected";

  const stats = useMemo(() => {
    if (!graph) return { words: 0, kanji: 0, semanticFailed: semantic.failed };
    let words = 0;
    let kanji = 0;
    for (const n of graph.nodes.values()) {
      if (n.type === "word") words++;
      else kanji++;
    }
    return { words, kanji, semanticFailed: semantic.failed };
  }, [graph, semantic.failed]);

  const definitionsPanel = (
    <DictionaryPanel
      node={selectedNode}
      loading={dataset.loading}
      status={selectedNode && getStatus(selectedNode.type, selectedItemId)}
      onSetStatus={handleSetStatus}
      isSaved={selectedNode?.type === "word" && saved.isSaved(selectedNode.word)}
      onToggleSave={handleToggleSave}
      ankiConnected={ankiConnected}
      groups={groupsApi.groups}
      memberOf={memberOf}
      onToggleGroup={handleToggleGroup}
      onCreateGroup={handleCreateGroupWithWord}
      jlptLevel={selectedJlptLevel}
      wordStats={wordStats}
      streak={streak}
      onExpand={graph && selectedNode ? () => handleNodeExpand(selectedId) : undefined}
      crossLabel={crossLabel}
      onCross={crossLabel ? () => handleCrossMode(selectedNode.word) : undefined}
      mode={mode}
      componentKanji={componentKanji}
      relatedWords={relatedWords}
      onSelectRelated={graph ? handleSelectRelated : undefined}
      onHoverRelated={graph ? handleHoverRelated : undefined}
      onHoverRelatedEnd={graph ? handleHoverRelatedEnd : undefined}
    />
  );

  const explorePanel = (
    <GraphPanel
      graph={viewGraph}
      mode={mode}
      onSetMode={handleSetMode}
      modeSwitch={modeSwitch}
      onSetModeSwitch={handleSetModeSwitch}
      deadEndWord={noRelatedWords ? rawSelected.word : null}
      crossLabel={crossLabel}
      onCross={crossLabel ? () => handleCrossMode(selectedNode.word) : undefined}
      commonness={commonness[mode]}
      onSetCommonness={handleSetCommonness}
      viewKey={viewKey}
      layoutSlot={modeSwitch === "separate" ? `${rootWord}:${mode}` : rootWord}
      selectedId={selectedId}
      onNodeClick={handleNodeSelect}
      onNodeExpand={handleNodeExpand}
      isBookmarked={isBookmarked}
      isDimmed={isNodeDimmed}
      theme={theme}
      onReset={handleReset}
      onShare={handleShare}
      stats={stats}
      datasetSource={dataset.source}
      datasetLoading={dataset.loading}
      isFiltersPanelOpen={isFiltersPanelOpen}
      onToggleFiltersPanel={() => setIsFiltersPanelOpen((v) => !v)}
      onCloseFiltersPanel={() => setIsFiltersPanelOpen(false)}
      filtersActive={filtersActive}
      jlptFilter={jlptFilter}
      onToggleJlpt={handleToggleJlptFilter}
      colorByDifficulty={colorByDifficulty}
      onToggleColorByDifficulty={handleToggleColorByDifficulty}
      linkColorMode={linkColorMode}
      onSetLinkColorMode={handleSetLinkColorMode}
      colorByKanjiPath={colorByKanjiPath}
      onToggleColorByKanjiPath={handleToggleColorByKanjiPath}
      groups={groupsApi.groups}
      focusGroupId={focusGroupId}
      onSetFocusGroup={setFocusGroupId}
      maxWords={maxWords}
      onSetMaxWords={handleMaxWordsChange}
      hintedIds={hintedIds}
      active={layout !== "phone" || mobileView === "explore"}
    />
  );

  return (
    <div className="app" data-layout={layout} data-view={mobileView}>
      <header className="app__header" inert={tutorialOpen}>
        <div className="app__title">
          <h1>
            <img src={theme === "dark" ? "/moto_logo_dark.svg" : "/moto_logo_light.svg"} alt="" className="app__logo" />
            <span className="app__title-text">Moto</span>
          </h1>
        </div>
        <SearchBar words={dataset.WORDS} onSelectWord={handleSearch} recents={recents} wordsByText={dataset.WORDS_BY_TEXT} />
        {!isDesktop ? (
          <MobileMenu
            savedCount={saved.words.length}
            onOpenSaved={() => setActiveSidebar("saved")}
            onTutorial={handleStartTutorial}
            tutorialDisabled={dataset.loading}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        ) : (
          <div className="app__controls">
            <div className="icon-toolbar">
              <button
                type="button"
                className="icon-toolbar__btn"
                onClick={handleStartTutorial}
                disabled={dataset.loading}
                aria-label="Tutorial"
                title={dataset.loading ? "Loading dictionary…" : "Take a tour of the app"}
              >
                <TutorialIcon />
              </button>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <button
                type="button"
                className={`icon-toolbar__btn${activeSidebar === "saved" ? " is-active" : ""}`}
                onClick={() => toggleSidebar("saved")}
                data-tutorial="bookmarks-btn"
                aria-pressed={activeSidebar === "saved"}
                aria-label={`Bookmarks (${saved.words.length})`}
                title="Bookmarks"
              >
                <BookmarkIcon />
                {saved.words.length > 0 && <span className="icon-toolbar__badge">{saved.words.length}</span>}
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="app__main" inert={tutorialOpen}>
        <PaneLayout
          mode={layout}
          view={mobileView}
          onChangeView={setMobileView}
          node={selectedNode}
          storageKey="main"
          defaultPct={40}
          min={26}
          max={62}
          left={definitionsPanel}
          right={explorePanel}
        />
        {activeSidebar && layout === "tablet" && (
          <div className="side-panel-scrim" onClick={closeSidebar} aria-hidden="true" />
        )}
        {activeSidebar && (
          <aside className="side-panel" aria-label="Bookmarks">
            {activeSidebar === "saved" && (
              <BookmarksPanel
                dataset={dataset}
                saved={saved}
                anki={anki}
                getStatus={getStatus}
                userTagsFor={userTagsFor}
                onSelectWord={handleSelectFromSidebar}
                onClose={closeSidebar}
              />
            )}
          </aside>
        )}
      </main>


      {tutorialOpen && <Tutorial layout={layout} onClose={() => setTutorialOpen(false)} />}

      <div className="app__credit">
        <a href="/kanji">Kanji list</a>
        <span aria-hidden="true"> · </span>
        <a href="https://www.souravbanerjee.com" target="_blank" rel="noopener noreferrer">
          by Sourav Banerjee
        </a>
      </div>
    </div>
  );
}
