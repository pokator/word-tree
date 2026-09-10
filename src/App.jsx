import { useCallback, useMemo, useState } from "react";
import SearchBar from "./components/SearchBar";
import DictionaryPanel from "./components/DictionaryPanel";
import GraphPanel from "./components/GraphPanel";
import SplitPane from "./components/SplitPane";
import ThemeToggle from "./components/ThemeToggle";
import AuthPanel from "./components/AuthPanel";
import SavedWordsPanel from "./components/SavedWordsPanel";
import GroupsPanel from "./components/GroupsPanel";
import ReviewMode from "./components/ReviewMode";
import { useWordData } from "./data/useWordData";
import { useRecentRoots } from "./data/useRecentRoots";
import { useAuth } from "./auth/useAuth";
import { useProgress } from "./progress/useProgress";
import { useSavedWords } from "./progress/useSavedWords";
import { useStreak } from "./progress/useStreak";
import { useGroups } from "./groups/useGroups";
import { useTheme } from "./theme/useTheme";
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
const MASTERY_FILTER_KEY = "word-tree:mastery-filter";
const JLPT_FILTER_KEY = "word-tree:jlpt-filter";
const COLOR_BY_DIFFICULTY_KEY = "word-tree:color-by-difficulty";
const MAX_WORDS_OPTIONS = [5, 8, 12, 20, 40, Infinity];
const DEFAULT_MASTERY_FILTER = { new: true, learning: true, known: true };
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

function loadMasteryFilter() {
  try {
    const raw = localStorage.getItem(MASTERY_FILTER_KEY);
    if (!raw) return DEFAULT_MASTERY_FILTER;
    return { ...DEFAULT_MASTERY_FILTER, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_MASTERY_FILTER;
  }
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

function jlptBucketToLevel(bucket) {
  if (!bucket || bucket === "unrated") return null;
  const n = Number(bucket.slice(1));
  return Number.isFinite(n) ? n : null;
}

export default function App() {
  const dataset = useWordData();
  const [rootWord, setRootWord] = useState(DEFAULT_ROOT);
  const [graph, setGraph] = useState(null);
  const [builtFor, setBuiltFor] = useState(null);
  const [selectedId, setSelectedId] = useState(wordNodeId(DEFAULT_ROOT));
  const [maxWords, setMaxWords] = useState(loadMaxWords);
  const [masteryFilter, setMasteryFilter] = useState(loadMasteryFilter);
  const [jlptFilter, setJlptFilter] = useState(loadJlptFilter);
  const [colorByDifficulty, setColorByDifficulty] = useState(loadColorByDifficulty);
  const [focusGroupId, setFocusGroupId] = useState(null);
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState(false);
  const [reviewSession, setReviewSession] = useState(null); // { title, words } | null

  const { recents, addRecent } = useRecentRoots();
  const streak = useStreak();
  const { theme, toggle: toggleTheme } = useTheme();

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

  const { getStatus, setStatus: setMasteryStatus, wordStats, wordsByStatus } = useProgress();
  const handleSetStatus = useCallback(
    (status) => {
      if (selectedNode) setMasteryStatus(selectedNode.type, selectedItemId, status);
    },
    [selectedNode, selectedItemId, setMasteryStatus]
  );

  const { user } = useAuth();
  const saved = useSavedWords();
  const handleToggleSave = useCallback(() => {
    if (selectedNode?.type === "word") saved.toggleSave(selectedNode.word);
  }, [selectedNode, saved]);

  const groupsApi = useGroups();
  const memberOf = selectedNode?.type === "word" ? groupsApi.groupsForWord(selectedNode.word) : [];

  // Saved and Groups share one side panel slot -- opening one always closes
  // the other, rather than tracking two independent booleans that could
  // both end up true. null closes the panel entirely.
  const [activeSidebar, setActiveSidebar] = useState(null); // null | "saved" | "groups"
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
      groupsApi.createGroup(name);
      // createGroup is fire-and-forget (Supabase round-trip for signed-in
      // users) -- rather than plumb the new id back through, just let the
      // user tick the checkbox once it appears; still saves them a step
      // versus creating then re-opening the word to add it.
    },
    [selectedNode, groupsApi]
  );
  const isInGroup = useCallback((word) => groupsApi.groups.some((g) => g.words.includes(word)), [groupsApi.groups]);

  const handleSelectWord = useCallback(
    (word) => {
      setRootWord(word);
      setSelectedId(wordNodeId(word));
      addRecent(word);
    },
    [addRecent]
  );

  const handleReset = useCallback(() => {
    setGraph(createInitialGraph(dataset, rootWord, { isJlptAllowed }));
    setSelectedId(wordNodeId(rootWord));
  }, [dataset, rootWord, isJlptAllowed]);

  const handleMaxWordsChange = useCallback((rawValue) => {
    const next = rawValue === "all" ? Infinity : Number(rawValue);
    setMaxWords(next);
    try {
      localStorage.setItem(MAX_WORDS_KEY, rawValue);
    } catch {
      // localStorage unavailable -- setting just won't persist this session
    }
  }, []);

  const handleToggleMasteryFilter = useCallback((status) => {
    setMasteryFilter((prev) => {
      const next = { ...prev, [status]: !prev[status] };
      try {
        localStorage.setItem(MASTERY_FILTER_KEY, JSON.stringify(next));
      } catch {
        // localStorage unavailable -- setting just won't persist this session
      }
      return next;
    });
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

  const isNodeDimmed = useCallback(
    (node) => {
      if (node.type === "word") {
        const status = getStatus("word", node.word) ?? "new";
        if (!masteryFilter[status]) return true;
        if (focusGroupId) {
          const group = groupsApi.groups.find((g) => g.id === focusGroupId);
          if (group && !group.words.includes(node.word)) return true;
        }
      }
      if (!isJlptAllowed(node.type, node.type === "kanji" ? node.char : node.word)) return true;
      return false;
    },
    [getStatus, masteryFilter, focusGroupId, groupsApi.groups, isJlptAllowed]
  );

  const jlptFilterActive = Object.values(jlptFilter).some((v) => !v);
  const filtersActive =
    !masteryFilter.new ||
    !masteryFilter.learning ||
    !masteryFilter.known ||
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
      setGraph((prev) => {
        const node = prev.nodes.get(nodeId);
        if (!node || node.expanded) return prev;
        return node.type === "kanji"
          ? expandKanji(dataset, prev, node.char, maxWords, { isJlptAllowed })
          : expandWord(dataset, prev, node.word, { isJlptAllowed });
      });
    },
    [dataset, maxWords, isJlptAllowed]
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

  const handleGradeReview = useCallback(
    (word, grade) => {
      setMasteryStatus("word", word, grade === "good" ? "known" : "learning");
    },
    [setMasteryStatus]
  );

  const startGlobalReview = useCallback(() => {
    const pool = [...wordsByStatus.new, ...wordsByStatus.learning]
      .map((w) => dataset.WORDS_BY_TEXT[w])
      .filter(Boolean);
    setReviewSession({ title: "Review", words: pool });
  }, [wordsByStatus, dataset]);

  const startGroupQuiz = useCallback(
    (group) => {
      const pool = group.words.map((w) => dataset.WORDS_BY_TEXT[w]).filter(Boolean);
      setReviewSession({ title: `Quiz: ${group.name}`, words: pool });
      closeSidebar();
    },
    [dataset, closeSidebar]
  );

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

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__title">
          <h1>元 &mdash; Moto</h1>
        </div>
        <SearchBar words={dataset.WORDS} onSelectWord={handleSelectWord} recents={recents} wordsByText={dataset.WORDS_BY_TEXT} />
        <div className="app__controls">
          <button
            className="reset-btn"
            onClick={startGlobalReview}
            title="Review words you've marked New or Learning"
          >
            Review ({wordStats.new + wordStats.learning})
          </button>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button
            type="button"
            className={`icon-btn${activeSidebar === "saved" ? " is-active" : ""}`}
            onClick={() => toggleSidebar("saved")}
            aria-pressed={activeSidebar === "saved"}
            aria-label={`Saved words (${saved.words.length})`}
            title="Saved words"
          >
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
              <path
                d="M6.5 3.75h11a.75.75 0 0 1 .75.75v16l-6.25-3.6-6.25 3.6v-16a.75.75 0 0 1 .75-.75Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
            {saved.words.length > 0 && <span className="icon-btn__badge">{saved.words.length}</span>}
          </button>
          <button
            type="button"
            className={`icon-btn${activeSidebar === "groups" ? " is-active" : ""}`}
            onClick={() => toggleSidebar("groups")}
            aria-pressed={activeSidebar === "groups"}
            aria-label={`Groups (${groupsApi.groups.length})`}
            title="Groups"
          >
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
              <path
                d="M4 6.75A1.25 1.25 0 0 1 5.25 5.5h4.19a1.25 1.25 0 0 1 .93.42l1.4 1.58h7.02a1.25 1.25 0 0 1 1.25 1.25v9A1.25 1.25 0 0 1 18.75 19H5.25A1.25 1.25 0 0 1 4 17.75Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
            {groupsApi.groups.length > 0 && <span className="icon-btn__badge">{groupsApi.groups.length}</span>}
          </button>
          <AuthPanel />
        </div>
      </header>

      <main className="app__main">
        <SplitPane
          storageKey="main"
          defaultPct={40}
          min={26}
          max={62}
          left={
            <DictionaryPanel
              node={selectedNode}
              loading={dataset.loading}
              status={selectedNode && getStatus(selectedNode.type, selectedItemId)}
              onSetStatus={handleSetStatus}
              canSave={Boolean(user)}
              isSaved={selectedNode?.type === "word" && saved.isSaved(selectedNode.word)}
              onToggleSave={handleToggleSave}
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
          }
          right={
            <GraphPanel
              graph={graph}
              selectedId={selectedId}
              onNodeClick={handleNodeSelect}
              onNodeExpand={handleNodeExpand}
              getStatus={getStatus}
              isInGroup={isInGroup}
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
              masteryFilter={masteryFilter}
              onToggleMastery={handleToggleMasteryFilter}
              jlptFilter={jlptFilter}
              onToggleJlpt={handleToggleJlptFilter}
              colorByDifficulty={colorByDifficulty}
              onToggleColorByDifficulty={handleToggleColorByDifficulty}
              groups={groupsApi.groups}
              focusGroupId={focusGroupId}
              onSetFocusGroup={setFocusGroupId}
              maxWords={maxWords}
              onSetMaxWords={handleMaxWordsChange}
              hintedIds={hintedIds}
            />
          }
        />
        {activeSidebar && (
          <aside className="side-panel" aria-label={activeSidebar === "saved" ? "Saved words" : "Groups"}>
            {activeSidebar === "saved" && (
              <SavedWordsPanel dataset={dataset} saved={saved} onSelectWord={handleSelectWord} onClose={closeSidebar} />
            )}
            {activeSidebar === "groups" && (
              <GroupsPanel
                dataset={dataset}
                groupsApi={groupsApi}
                onSelectWord={handleSelectWord}
                onQuizGroup={startGroupQuiz}
                onClose={closeSidebar}
              />
            )}
          </aside>
        )}
      </main>

      {reviewSession && (
        <ReviewMode
          title={reviewSession.title}
          words={reviewSession.words}
          onGrade={handleGradeReview}
          onExit={() => setReviewSession(null)}
        />
      )}
    </div>
  );
}
