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
  wordNodeId,
  kanjiJlptBucket,
  wordJlptBucket,
} from "./graph/buildGraph";
import "./App.css";

const DEFAULT_ROOT = "日本語";
const MAX_WORDS_KEY = "word-tree:max-words-per-branch";
const MASTERY_FILTER_KEY = "word-tree:mastery-filter";
const JLPT_FILTER_KEY = "word-tree:jlpt-filter";
const MAX_WORDS_OPTIONS = [5, 8, 12, 20, 40, Infinity];
const DEFAULT_MASTERY_FILTER = { new: true, learning: true, known: true };
const DEFAULT_JLPT_FILTER = { n5: true, n4: true, n3: true, n2: true, n1: true, unrated: true };

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
  const [isSavedPanelOpen, setIsSavedPanelOpen] = useState(false);
  const handleToggleSave = useCallback(() => {
    if (selectedNode?.type === "word") saved.toggleSave(selectedNode.word);
  }, [selectedNode, saved]);

  const groupsApi = useGroups();
  const [isGroupsPanelOpen, setIsGroupsPanelOpen] = useState(false);
  const memberOf = selectedNode?.type === "word" ? groupsApi.groupsForWord(selectedNode.word) : [];
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

  const handleNodeClick = useCallback(
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
      setIsGroupsPanelOpen(false);
    },
    [dataset]
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
          <h1>言葉の木 &mdash; Word Tree</h1>
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
          <div className="saved-panel-wrap">
            <button className="reset-btn" onClick={() => setIsSavedPanelOpen((v) => !v)}>
              Saved ({saved.words.length})
            </button>
            {isSavedPanelOpen && (
              <SavedWordsPanel dataset={dataset} saved={saved} onClose={() => setIsSavedPanelOpen(false)} />
            )}
          </div>
          <div className="groups-panel-wrap">
            <button className="reset-btn" onClick={() => setIsGroupsPanelOpen((v) => !v)}>
              Groups ({groupsApi.groups.length})
            </button>
            {isGroupsPanelOpen && (
              <GroupsPanel
                dataset={dataset}
                groupsApi={groupsApi}
                onSelectWord={handleSelectWord}
                onQuizGroup={startGroupQuiz}
                onClose={() => setIsGroupsPanelOpen(false)}
              />
            )}
          </div>
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
            />
          }
          right={
            <GraphPanel
              graph={graph}
              selectedId={selectedId}
              onNodeClick={handleNodeClick}
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
              groups={groupsApi.groups}
              focusGroupId={focusGroupId}
              onSetFocusGroup={setFocusGroupId}
              maxWords={maxWords}
              onSetMaxWords={handleMaxWordsChange}
            />
          }
        />
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
