import { useMemo, useState } from "react";
import { WORDS } from "../data/japaneseData";

export default function SearchBar({ onSelectWord }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return WORDS.filter(
      (w) => w.word.includes(query.trim()) || w.reading.includes(q) || w.meaning.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query]);

  function choose(word) {
    onSelectWord(word);
    setQuery("");
    setIsOpen(false);
  }

  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search a word (e.g. 日本語, nihongo, Japan)..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches.length > 0) choose(matches[0].word);
        }}
      />
      {isOpen && matches.length > 0 && (
        <ul className="search-results">
          {matches.map((w) => (
            <li key={w.word} onMouseDown={() => choose(w.word)}>
              <span className="search-results__word">{w.word}</span>
              <span className="search-results__reading">{w.reading}</span>
              <span className="search-results__meaning">{w.meaning}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
