import { useCallback, useMemo, useState } from "react";
import SearchBar from "./components/SearchBar";
import DetailPanel from "./components/DetailPanel";
import WordTreeGraph from "./components/WordTreeGraph";
import ThemeToggle from "./components/ThemeToggle";
import AuthPanel from "./components/AuthPanel";
import SavedWordsPanel from "./components/SavedWordsPanel";
import GroupsPanel from "./components/GroupsPanel";
import FiltersPanel from "./components/FiltersPanel";
import ReviewMode from "./components/ReviewMode";
import ProgressStats from "./components/ProgressStats";
import { useWordData } from "./data/useWordData";
import { useRecentRoots } from "./data/useRecentRoots";
import { useAuth } from "./auth/useAuth";
import { useProgress } from "./progress/useProgress";
import { useSavedWords } from "./progress/useSavedWords";
import { useStreak } from "./progress/useStreak";
import { useGroups } from "./groups/useGroups";
import { createInitialGraph, expandKanji, expandWord, wordNodeId } from "./graph/buildGraph";
import "./App.css";

const DEFAULT_ROOT = "日本語";
const MAX_WORDS_KEY = "word-tree:max-words-per-branch";
const MASTERY_FILTER_KEY = "word-tree:mastery-filter";
const MAX_WORDS_OPTIONS = [5, 8, 12, 20, 40, Infinity];
const DEFAULT_MASTERY_FILTER = { new: true, learning: true, known: true };

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

export default function App() {
  const dataset = useWordData();
  const [rootWord, setRootWord] = useState(DEFAULT_ROOT);
  const [graph, setGraph] = useState(null);
  const [builtFor, setBuiltFor] = useState(null);
  const [selectedId, setSelectedId] = useState(wordNodeId(DEFAULT_ROOT));
  const [maxWords, setMaxWords] = useState(loadMaxWords);
  const [masteryFilter, setMasteryFilter] = useState(loadMasteryFilter);
  const [focusGroupId, setFocusGroupId] = useState(null);
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState(false);
  const [reviewSession, setReviewSession] = useState(null); // { title, words } | null

  const { recents, addRecent } = useRecentRoots();
  const streak = useStreak();

  // Rebuild the graph when the dataset becomes ready or the root word
  // changes -- adjusting state during render (React's documented pattern
  // for "reset state when an input changes") rather than in an effect, so
  // there's no extra render with stale data in between.
  const readyKey = dataset.loading ? null : `${dataset.source}:${rootWord}`;
  if (readyKey && readyKey !== builtFor) {
    setBuiltFor(readyKey);
    setGraph(createInitialGraph(dataset, rootWord));
  }

  const selectedNode = graph?.nodes.get(selectedId) ?? null;
  const selectedItemId = selectedNode && (selectedNode.type === "kanji" ? selectedNode.char : selectedNode.word);

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
    setGraph(createInitialGraph(dataset, rootWord));
    setSelectedId(wordNodeId(rootWord));
  }, [dataset, rootWord]);

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

  const isNodeDimmed = useCallback(
    (node) => {
      if (node.type !== "word") return false;
      const status = getStatus("word", node.word) ?? "new";
      if (!masteryFilter[status]) return true;
      if (focusGroupId) {
        const group = groupsApi.groups.find((g) => g.id === focusGroupId);
        if (group && !group.words.includes(node.word)) return true;
      }
      return false;
    },
    [getStatus, masteryFilter, focusGroupId, groupsApi.groups]
  );

  const filtersActive =
    !masteryFilter.new || !masteryFilter.learning || !masteryFilter.known || focusGroupId !== null || maxWords !== 8;

  const handleNodeClick = useCallback(
    (nodeId) => {
      setSelectedId(nodeId);
      setGraph((prev) => {
        const node = prev.nodes.get(nodeId);
        if (!node || node.expanded) return prev;
        return node.type === "kanji"
          ? expandKanji(dataset, prev, node.char, maxWords)
          : expandWord(dataset, prev, node.word);
      });
    },
    [dataset, maxWords]
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
          <p>Explore how Japanese words share meaning through their kanji components.</p>
        </div>
        <div className="app__controls">
          <SearchBar words={dataset.WORDS} onSelectWord={handleSelectWord} recents={recents} wordsByText={dataset.WORDS_BY_TEXT} />

          <div className="filters-panel-wrap">
            <button
              className={`reset-btn filters-btn${filtersActive ? " is-active" : ""}`}
              onClick={() => setIsFiltersPanelOpen((v) => !v)}
            >
              Filters
              {filtersActive && <span className="filters-btn__badge" />}
            </button>
            {isFiltersPanelOpen && (
              <FiltersPanel
                masteryFilter={masteryFilter}
                onToggleMastery={handleToggleMasteryFilter}
                groups={groupsApi.groups}
                focusGroupId={focusGroupId}
                onSetFocusGroup={setFocusGroupId}
                maxWords={maxWords}
                onSetMaxWords={handleMaxWordsChange}
                onClose={() => setIsFiltersPanelOpen(false)}
              />
            )}
          </div>

          <button
            className="reset-btn"
            onClick={startGlobalReview}
            title="Review words you've marked New or Learning"
          >
            Review ({wordStats.new + wordStats.learning})
          </button>

          <button className="reset-btn" onClick={handleReset} title="Collapse back to just the root word">
            Reset
          </button>
          <ThemeToggle />
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
        {graph ? (
          <WordTreeGraph
            graph={graph}
            selectedId={selectedId}
            onNodeClick={handleNodeClick}
            getStatus={getStatus}
            isInGroup={isInGroup}
            isDimmed={isNodeDimmed}
          />
        ) : (
          <div className="graph-container graph-container--loading">Loading word data&hellip;</div>
        )}
        <aside className="app__sidebar">
          <DetailPanel
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
          />
          <div className="legend">
            <div className="legend__row">
              <span className="legend__swatch legend__swatch--root" /> root word
            </div>
            <div className="legend__row">
              <span className="legend__swatch legend__swatch--word" /> word
            </div>
            <div className="legend__row">
              <span className="legend__swatch legend__swatch--kanji" /> kanji component
            </div>
            <ProgressStats wordStats={wordStats} streak={streak} />
            <p className="legend__stats">
              {stats.words} words &middot; {stats.kanji} kanji shown
              {dataset.source === "local" && !dataset.loading ? " · local dataset" : ""}
              {dataset.source === "tiny-fallback" && !dataset.loading ? " · offline demo data" : ""}
            </p>
          </div>
        </aside>
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
