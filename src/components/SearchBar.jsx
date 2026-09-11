import { useMemo, useState } from "react";
import { containsJapanese } from "../graph/kanji";
import { searchWords } from "../data/searchWords";

export default function SearchBar({ words, onSelectWord, recents = [], wordsByText = {} }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState(null);

  const matches = useMemo(() => searchWords(words, query), [query, words]);

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

  function submit() {
    if (matches.length > 0) choose(matches[0].word);
    else chooseTyped();
  }

  const exactMatch = query.trim() && matches.some((w) => w.word === query.trim());

  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search (romaji OK)"
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
          submit();
        }}
      />
      <button
        type="button"
        className="search-bar__submit"
        aria-label="Search"
        onMouseDown={(e) => e.preventDefault()}
        onClick={submit}
      >
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <line x1="13.2" y1="13.2" x2="18" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
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
      {isOpen && !query.trim() && recents.length > 0 && (
        <ul className="search-results">
          <li className="search-results__section-label">Recent</li>
          {recents.map((word) => {
            const entry = wordsByText[word];
            return (
              <li key={word} onMouseDown={() => choose(word)}>
                <span className="search-results__word">{word}</span>
                {entry && <span className="search-results__meaning">{entry.meaning}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="search-bar__error">{error}</p>}
    </div>
  );
}
