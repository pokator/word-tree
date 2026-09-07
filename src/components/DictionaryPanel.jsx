import { useState } from "react";
import ProgressStats from "./ProgressStats";

const MASTERY_LABELS = { new: "New", learning: "Learning", known: "Known" };

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
  const meanings = splitMeanings(node.meaning);
  const isMissing = !isKanji && node.isUnlisted;
  const hasReadings = isKanji && (node.onyomi?.length > 0 || node.kunyomi?.length > 0);

  return (
    <div className="dictionary-panel" key={node.id}>
      <div className="dictionary-panel__entry">
        <div className="dictionary-panel__headword-row">
          <h2 className="dictionary-panel__headword">{headword}</h2>
          <JlptBadge level={jlptLevel} />
        </div>
        {!isKanji && node.reading && <div className="dictionary-panel__reading">{node.reading}</div>}

        {isMissing ? (
          <p className="dictionary-panel__missing">Not in the dictionary &mdash; exploring by its kanji only.</p>
        ) : meanings.length > 1 ? (
          <ol className="dictionary-panel__meanings">
            {meanings.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ol>
        ) : (
          meanings.length === 1 && <p className="dictionary-panel__meanings dictionary-panel__meanings--single">{meanings[0]}</p>
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
