import { useCallback, useMemo, useState } from "react";
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
import { useRecentRoots } from "./data/useRecentRoots";
import { useProgress } from "./progress/useProgress";
import { useSavedWords } from "./progress/useSavedWords";
import { useStreak } from "./progress/useStreak";
import { useGroups } from "./groups/useGroups";
import { useAnkiSync } from "./anki/useAnkiSync";
import { useTheme } from "./theme/useTheme";
import { useLayoutMode } from "./lib/useLayoutMode";
import { track, trackOnce } from "./lib/analytics";
import {
  createInitialGraph,
  expandKanji,
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

function jlptBucketToLevel(bucket) {
  if (!bucket || bucket === "unrated") return null;
  const n = Number(bucket.slice(1));
  return Number.isFinite(n) ? n : null;
}

export default function App() {
  const dataset = useWordData();
  const [rootWord, setRootWord] = useState(DEFAULT_ROOT);
  const [graph, setGraph] = useState(null);
  // Bumped when Reset or the tour rebuilds the graph around the same root,
  // so the graph re-frames itself even though its root didn't change.
  const [viewKey, setViewKey] = useState(0);
  const [builtFor, setBuiltFor] = useState(null);
  const [selectedId, setSelectedId] = useState(wordNodeId(DEFAULT_ROOT));
  const [maxWords, setMaxWords] = useState(loadMaxWords);
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
  const readyKey = dataset.loading ? null : `${dataset.source}:${rootWord}`;
  if (readyKey && readyKey !== builtFor) {
    setBuiltFor(readyKey);
    setGraph(createInitialGraph(dataset, rootWord, { isJlptAllowed }));
  }

  const selectedNode = graph?.nodes.get(selectedId) ?? null;

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

  const handleSelectWord = useCallback(
    (word) => {
      setRootWord(word);
      setSelectedId(wordNodeId(word));
      addRecent(word);
    },
    [addRecent]
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

  const handleReset = useCallback(() => {
    setGraph(createInitialGraph(dataset, rootWord, { isJlptAllowed }));
    setSelectedId(wordNodeId(rootWord));
    setViewKey((k) => k + 1);
  }, [dataset, rootWord, isJlptAllowed]);

  // Always forces the graph back to DEFAULT_ROOT (rather than reusing
  // whatever's currently showing) so the tour's steps -- one of which
  // points at "a kanji node", another at the Reset button -- can rely on a
  // known, freshly-collapsed demo state. Doesn't go through
  // handleSelectWord/addRecent -- launching the tour isn't the user
  // searching for 日本語, so it shouldn't pollute their recent-searches list.
  const handleStartTutorial = useCallback(() => {
    setRootWord(DEFAULT_ROOT);
    setSelectedId(wordNodeId(DEFAULT_ROOT));
    setGraph(createInitialGraph(dataset, DEFAULT_ROOT, { isJlptAllowed }));
    setViewKey((k) => k + 1);
    // On a phone the tour's graph steps need the graph on screen, not
    // collapsed behind the definitions.
    setMobileView("explore");
    setTutorialOpen(true);
  }, [dataset, isJlptAllowed]);

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
    maxWords !== 8;

  // A click only selects (shows its definition) -- it never expands the
  // graph on its own, so browsing what's already there never surprises you
  // with new nodes. Expanding is the separate, deliberate action below.
  const handleNodeSelect = useCallback((nodeId) => {
    setSelectedId(nodeId);
  }, []);

  const handleNodeExpand = useCallback(
    (nodeId) => {
      setSelectedId(nodeId);
      // The root starts out expanded, so double-clicking it changes nothing
      // and isn't a first expand.
      const target = graph?.nodes.get(nodeId);
      if (target && !target.expanded) trackOnce("first-expand");
      setGraph((prev) => {
        const node = prev.nodes.get(nodeId);
        if (!node || node.expanded) return prev;
        return node.type === "kanji"
          ? expandKanji(dataset, prev, node.char, maxWords, { isJlptAllowed })
          : expandWord(dataset, prev, node.word, { isJlptAllowed });
      });
    },
    [dataset, graph, maxWords, isJlptAllowed]
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
    [dataset, selectedNode]
  );

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
    if (!graph) return { words: 0, kanji: 0 };
    let words = 0;
    let kanji = 0;
    for (const n of graph.nodes.values()) {
      if (n.type === "word") words++;
      else kanji++;
    }
    return { words, kanji };
  }, [graph]);

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
      componentKanji={componentKanji}
      relatedWords={relatedWords}
      onSelectRelated={graph ? handleSelectRelated : undefined}
      onHoverRelated={graph ? handleHoverRelated : undefined}
      onHoverRelatedEnd={graph ? handleHoverRelatedEnd : undefined}
    />
  );

  const explorePanel = (
    <GraphPanel
      graph={graph}
      viewKey={viewKey}
      selectedId={selectedId}
      onNodeClick={handleNodeSelect}
      onNodeExpand={handleNodeExpand}
      isBookmarked={isBookmarked}
      isDimmed={isNodeDimmed}
      theme={theme}
      onReset={handleReset}
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

      <a
        className="app__credit"
        href="https://souravbanerjee.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        by Sourav Banerjee
      </a>
    </div>
  );
}
