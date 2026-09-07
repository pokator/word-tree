import { useMemo, useState } from "react";
import { containsJapanese } from "../graph/kanji";

const MAX_RESULTS = 8;
const DEFAULT_RANK = 999;

function matchScore(word, q, qLower) {
  if (word.word === q) return 0;
  if (word.word.startsWith(q)) return 1;
  if (word.reading.startsWith(qLower)) return 2;
  if (word.word.includes(q)) return 3;
  if (word.reading.includes(qLower)) return 4;
  return 5; // meaning-only match
}

export default function SearchBar({ words, onSelectWord }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState(null);

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const qLower = q.toLowerCase();
    return words
      .filter((w) => w.word.includes(q) || w.reading.includes(qLower) || w.meaning.toLowerCase().includes(qLower))
      .sort((a, b) => {
        const scoreDiff = matchScore(a, q, qLower) - matchScore(b, q, qLower);
        if (scoreDiff !== 0) return scoreDiff;
        return (a.rank ?? DEFAULT_RANK) - (b.rank ?? DEFAULT_RANK);
      })
      .slice(0, MAX_RESULTS);
  }, [query, words]);

  function choose(word) {
    onSelectWord(word);
    setQuery("");
    setIsOpen(false);
    setError(null);
  }

  function chooseTyped() {
    const q = query.trim();
    if (!q) return;
    if (!containsJapanese(q)) {
      setError("Enter a word with at least one hiragana, katakana, or kanji character.");
      return;
    }
    choose(q);
  }

  const exactMatch = query.trim() && matches.some((w) => w.word === query.trim());

  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search or type any word (e.g. 日本語, 勉強する, nihongo)..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          setError(null);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          if (matches.length > 0) choose(matches[0].word);
          else chooseTyped();
        }}
      />
      {isOpen && query.trim() && (
        <ul className="search-results">
          {matches.map((w) => (
            <li key={w.word} onMouseDown={() => choose(w.word)}>
              <span className="search-results__word">{w.word}</span>
              <span className="search-results__reading">{w.reading}</span>
              <span className="search-results__meaning">{w.meaning}</span>
            </li>
          ))}
          {!exactMatch && (
            <li className="search-results__typed" onMouseDown={chooseTyped}>
              Explore &ldquo;{query.trim()}&rdquo; as typed &rarr;
            </li>
          )}
        </ul>
      )}
      {error && <p className="search-bar__error">{error}</p>}
    </div>
  );
}
