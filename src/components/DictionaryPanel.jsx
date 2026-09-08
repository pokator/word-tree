import { useState } from "react";
import ProgressStats from "./ProgressStats";

const MASTERY_LABELS = { new: "New", learning: "Learning", known: "Known" };

// Fallback for word entries that predate structured `senses` (the tiny
// emergency fixture, or any stale cached data) -- same flat-string split
// this panel used before senses existed.
function splitMeanings(meaning) {
  return (meaning ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function GroupMembership({ word, groups, memberOf, onToggleGroup, onCreateGroup }) {
  const [newName, setNewName] = useState("");
  const memberIds = new Set(memberOf.map((g) => g.id));

  function handleCreate(e) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateGroup(trimmed, word);
    setNewName("");
  }

  return (
    <div className="group-membership">
      <span className="dictionary-panel__section-label">Groups</span>
      {groups.length > 0 && (
        <div className="group-membership__list">
          {groups.map((g) => (
            <label key={g.id} className="group-membership__item">
              <input type="checkbox" checked={memberIds.has(g.id)} onChange={() => onToggleGroup(g.id)} />
              {g.name}
            </label>
          ))}
        </div>
      )}
      <form className="group-membership__create" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="+ New group..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
      </form>
    </div>
  );
}

function MasteryControl({ status, onSetStatus }) {
  return (
    <div className="mastery-control" role="group" aria-label="Mastery status">
      {Object.entries(MASTERY_LABELS).map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`mastery-control__btn${status === value ? " is-active" : ""}`}
          onClick={() => onSetStatus(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SaveToggle({ canSave, isSaved, onToggleSave }) {
  if (!canSave) {
    return <p className="save-toggle__hint">Sign in to save words for export.</p>;
  }
  return (
    <button
      type="button"
      className={`save-toggle${isSaved ? " is-active" : ""}`}
      onClick={onToggleSave}
      aria-pressed={isSaved}
    >
      {isSaved ? "Saved for Anki" : "Save for Anki"}
    </button>
  );
}

function JlptBadge({ level }) {
  if (!level) return null;
  return (
    <span className="jlpt-badge" title="JLPT level">
      N{level}
    </span>
  );
}

function CommonBadge({ isCommon }) {
  if (!isCommon) return null;
  return (
    <span className="common-badge" title="JMdict tags this as a common word">
      Common word
    </span>
  );
}

/** One sense's body -- part of speech, gloss(es), usage-register notes,
 * loanword origin -- shared between the numbered (2+ senses) and plain
 * (1 sense) renderings so they never drift apart. */
function SenseBody({ sense }) {
  const notes = [...(sense.misc ?? []), ...(sense.info ?? [])];
  return (
    <>
      {sense.pos?.length > 0 && <div className="dictionary-panel__sense-pos">{sense.pos.join(", ")}</div>}
      <div className="dictionary-panel__sense-gloss">{sense.gloss.join("; ")}</div>
      {notes.length > 0 && <div className="dictionary-panel__sense-note">{notes.join(", ")}</div>}
      {sense.origin && <div className="dictionary-panel__sense-origin">From {sense.origin}</div>}
    </>
  );
}

function Senses({ senses, meanings }) {
  if (senses?.length > 1) {
    return (
      <ol className="dictionary-panel__senses">
        {senses.map((s, i) => (
          <li key={i}>
            <SenseBody sense={s} />
          </li>
        ))}
      </ol>
    );
  }
  if (senses?.length === 1) {
    return (
      <div className="dictionary-panel__senses dictionary-panel__senses--single">
        <SenseBody sense={senses[0]} />
      </div>
    );
  }
  // No structured senses -- fall back to the flat meaning string.
  if (meanings.length > 1) {
    return (
      <ol className="dictionary-panel__senses">
        {meanings.map((m) => (
          <li key={m}>
            <div className="dictionary-panel__sense-gloss">{m}</div>
          </li>
        ))}
      </ol>
    );
  }
  if (meanings.length === 1) {
    return (
      <div className="dictionary-panel__senses dictionary-panel__senses--single">
        <div className="dictionary-panel__sense-gloss">{meanings[0]}</div>
      </div>
    );
  }
  return null;
}

/**
 * The primary content view -- this app's "dictionary": look a word up (or
 * click a node in the graph) and land here first. The graph is the
 * secondary, exploratory tool alongside it (see GraphPanel), not the other
 * way around -- see README's "Using it" section for the intended loop.
 */
export default function DictionaryPanel({
  node,
  status,
  onSetStatus,
  canSave,
  isSaved,
  onToggleSave,
  groups = [],
  memberOf = [],
  onToggleGroup,
  onCreateGroup,
  jlptLevel,
  wordStats,
  streak,
}) {
  if (!node) {
    return (
      <div className="dictionary-panel dictionary-panel--empty">
        <p className="dictionary-panel__empty-title">Search a word to get started</p>
        <p className="dictionary-panel__empty-hint">
          Or click a node in the graph &rarr; kanji reveal the words that share them, words reveal their own kanji.
        </p>
      </div>
    );
  }

  const isKanji = node.type === "kanji";
  const headword = isKanji ? node.char : node.word;
  const isMissing = !isKanji && node.isUnlisted;
  const isCommon = !isKanji && node.rank !== undefined && node.rank !== null;
  const hasReadings = isKanji && (node.onyomi?.length > 0 || node.kunyomi?.length > 0);

  return (
    <div className="dictionary-panel" key={node.id}>
      <div className="dictionary-panel__entry">
        <div className="dictionary-panel__headword-row">
          <h2 className="dictionary-panel__headword">{headword}</h2>
          <CommonBadge isCommon={isCommon} />
          <JlptBadge level={jlptLevel} />
        </div>
        {!isKanji && node.reading && <div className="dictionary-panel__reading">{node.reading}</div>}

        {isMissing ? (
          <p className="dictionary-panel__missing">Not in the dictionary &mdash; exploring by its kanji only.</p>
        ) : (
          <Senses senses={node.senses} meanings={splitMeanings(node.meaning)} />
        )}

        {hasReadings && (
          <div className="dictionary-panel__readings">
            {node.onyomi.length > 0 && (
              <div className="dictionary-panel__reading-row">
                <span className="dictionary-panel__label">On&rsquo;yomi</span>
                <span>{node.onyomi.join("、")}</span>
              </div>
            )}
            {node.kunyomi.length > 0 && (
              <div className="dictionary-panel__reading-row">
                <span className="dictionary-panel__label">Kun&rsquo;yomi</span>
                <span>{node.kunyomi.join("、")}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="dictionary-panel__actions">
        <MasteryControl status={status} onSetStatus={onSetStatus} />
        {!isKanji && <SaveToggle canSave={canSave} isSaved={isSaved} onToggleSave={onToggleSave} />}
      </div>

      {wordStats && <ProgressStats wordStats={wordStats} streak={streak} />}

      {!isKanji && onToggleGroup && (
        <GroupMembership
          word={node.word}
          groups={groups}
          memberOf={memberOf}
          onToggleGroup={onToggleGroup}
          onCreateGroup={onCreateGroup}
        />
      )}
    </div>
  );
}
