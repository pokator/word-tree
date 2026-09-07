import { useCallback, useMemo, useState } from "react";
import SearchBar from "./components/SearchBar";
import DetailPanel from "./components/DetailPanel";
import WordTreeGraph from "./components/WordTreeGraph";
import { createInitialGraph, expandKanji, expandWord, wordNodeId } from "./graph/buildGraph";
import "./App.css";

const DEFAULT_ROOT = "日本語";

export default function App() {
  const [rootWord, setRootWord] = useState(DEFAULT_ROOT);
  const [graph, setGraph] = useState(() => createInitialGraph(DEFAULT_ROOT));
  const [selectedId, setSelectedId] = useState(wordNodeId(DEFAULT_ROOT));

  const selectedNode = graph.nodes.get(selectedId) ?? null;

  const handleSelectWord = useCallback((word) => {
    setRootWord(word);
    setGraph(createInitialGraph(word));
    setSelectedId(wordNodeId(word));
  }, []);

  const handleReset = useCallback(() => {
    setGraph(createInitialGraph(rootWord));
    setSelectedId(wordNodeId(rootWord));
  }, [rootWord]);

  const handleNodeClick = useCallback((nodeId) => {
    setSelectedId(nodeId);
    setGraph((prev) => {
      const node = prev.nodes.get(nodeId);
      if (!node || node.expanded) return prev;
      return node.type === "kanji" ? expandKanji(prev, node.char) : expandWord(prev, node.word);
    });
  }, []);

  const stats = useMemo(() => {
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
          <SearchBar onSelectWord={handleSelectWord} />
          <button className="reset-btn" onClick={handleReset} title="Collapse back to just the root word">
            Reset
          </button>
        </div>
      </header>

      <main className="app__main">
        <WordTreeGraph graph={graph} selectedId={selectedId} onNodeClick={handleNodeClick} />
        <aside className="app__sidebar">
          <DetailPanel node={selectedNode} />
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
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
