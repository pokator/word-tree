import { useCallback, useMemo, useState } from "react";
import SearchBar from "./components/SearchBar";
import DetailPanel from "./components/DetailPanel";
import WordTreeGraph from "./components/WordTreeGraph";
import ThemeToggle from "./components/ThemeToggle";
import AuthPanel from "./components/AuthPanel";
import SavedWordsPanel from "./components/SavedWordsPanel";
import { useWordData } from "./data/useWordData";
import { useAuth } from "./auth/useAuth";
import { useProgress } from "./progress/useProgress";
import { useSavedWords } from "./progress/useSavedWords";
import { createInitialGraph, expandKanji, expandWord, wordNodeId } from "./graph/buildGraph";
import "./App.css";

const DEFAULT_ROOT = "日本語";

export default function App() {
  const dataset = useWordData();
  const [rootWord, setRootWord] = useState(DEFAULT_ROOT);
  const [graph, setGraph] = useState(null);
  const [builtFor, setBuiltFor] = useState(null);
  const [selectedId, setSelectedId] = useState(wordNodeId(DEFAULT_ROOT));

  // Rebuild the graph when the dataset becomes ready or the root word
  // changes -- adjusting state during render (React's documented pattern
  // for "reset state when an input changes") rather than in an effect, so
  // there's no extra render with stale data in between.
  const readyKey = dataset.loading ? null : `${dataset.source}:${rootWord}`;
  if (readyKey && readyKey !== builtFor && dataset.WORDS_BY_TEXT[rootWord]) {
    setBuiltFor(readyKey);
    setGraph(createInitialGraph(dataset, rootWord));
  }

  const selectedNode = graph?.nodes.get(selectedId) ?? null;
  const selectedItemId = selectedNode && (selectedNode.type === "kanji" ? selectedNode.char : selectedNode.word);

  const { getStatus, setStatus: setMasteryStatus } = useProgress();
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

  const handleSelectWord = useCallback((word) => {
    setRootWord(word);
    setSelectedId(wordNodeId(word));
  }, []);

  const handleReset = useCallback(() => {
    setGraph(createInitialGraph(dataset, rootWord));
    setSelectedId(wordNodeId(rootWord));
  }, [dataset, rootWord]);

  const handleNodeClick = useCallback(
    (nodeId) => {
      setSelectedId(nodeId);
      setGraph((prev) => {
        const node = prev.nodes.get(nodeId);
        if (!node || node.expanded) return prev;
        return node.type === "kanji"
          ? expandKanji(dataset, prev, node.char)
          : expandWord(dataset, prev, node.word);
      });
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
          <SearchBar words={dataset.WORDS} onSelectWord={handleSelectWord} />
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
            <p className="legend__stats">
              {stats.words} words &middot; {stats.kanji} kanji shown
              {dataset.source === "fallback" && !dataset.loading ? " · offline data" : ""}
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
