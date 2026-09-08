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
import { useQuickEntry } from "./data/useQuickEntry";
import { useRecentRoots } from "./data/useRecentRoots";
import { isSupabaseConfigured } from "./lib/supabaseClient";
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

  // While the full dataset is still loading (the slow path: Supabase's
  // ~230-request paginated fetch, see useWordData.js), a single fast query
  // for just the current root word lets the Dictionary panel show a real
  // definition well before the Explore graph is able to render at all --
  // decoupling the two instead of making the definition wait on the graph.
  const quick = useQuickEntry(dataset.loading ? rootWord : null);
  const quickGraph = useMemo(() => {
    if (!isSupabaseConfigured || graph || quick.loading) return null;
    const miniDataset = { WORDS_BY_TEXT: quick.entry ? { [rootWord]: quick.entry } : {}, KANJI: quick.kanjiByChar };
    return createInitialGraph(miniDataset, rootWord);
  }, [graph, quick, rootWord]);

  const selectedNode = graph?.nodes.get(selectedId) ?? quickGraph?.nodes.get(selectedId) ?? null;
  const isQuickLoading = !graph && isSupabaseConfigured && dataset.loading && quick.loading;

  // The word's own component kanji, shown beside its definitions (see
  // DictionaryPanel) -- read from the quick lookup's tiny kanji set while
  // the full dataset is still loading, same source the entry itself came
  // from, so the two are never out of sync with each other.
  const componentKanji = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "word") return [];
    const kanjiSource = graph ? dataset.KANJI : quick.kanjiByChar;
    return extractKanjiComponents(selectedNode.word)
      .map((char) => kanjiSource[char])
      .filter(Boolean);
  }, [selectedNode, graph, dataset, quick]);

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
              loading={isQuickLoading}
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
              datasetProgress={dataset.progress}
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
              hintedIds={hintedIds}
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
