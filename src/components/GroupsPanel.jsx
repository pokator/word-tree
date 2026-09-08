import { useState } from "react";

export default function GroupsPanel({ dataset, groupsApi, onClose, onSelectWord, onQuizGroup }) {
  const { groups, createGroup, renameGroup, deleteGroup, removeWordFromGroup } = groupsApi;
  const [newName, setNewName] = useState("");
  const [openGroupId, setOpenGroupId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    createGroup(newName);
    setNewName("");
  }

  function startRename(group) {
    setRenamingId(group.id);
    setRenameValue(group.name);
  }

  function commitRename(groupId) {
    if (renameValue.trim()) renameGroup(groupId, renameValue);
    setRenamingId(null);
  }

  return (
    <>
      <div className="side-panel__header">
        <h2 className="side-panel__title">Groups</h2>
        <button type="button" className="side-panel__close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>

      <div className="side-panel__body">
        <form className="groups-panel__create" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="New group name (e.g. JLPT N4 review)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="groups-panel__create-btn" disabled={!newName.trim()} aria-label="Create group">
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <line x1="10" y1="4" x2="10" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </form>

        {groups.length === 0 ? (
          <p className="side-panel__hint">No groups yet. Create one above, then open a word&rsquo;s details to add it.</p>
        ) : (
          <ul className="groups-panel__list">
            {groups.map((group) => {
              const isOpen = openGroupId === group.id;
              const items = group.words.map((w) => dataset.WORDS_BY_TEXT[w]).filter(Boolean);
              return (
                <li key={group.id} className={`groups-panel__group${isOpen ? " is-open" : ""}`}>
                  <div className="groups-panel__group-row">
                    {renamingId === group.id ? (
                      <input
                        type="text"
                        className="groups-panel__rename-input"
                        value={renameValue}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(group.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(group.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="groups-panel__group-name"
                        onClick={() => setOpenGroupId(isOpen ? null : group.id)}
                        aria-expanded={isOpen}
                      >
                        <svg
                          className="groups-panel__chevron"
                          viewBox="0 0 20 20"
                          width="13"
                          height="13"
                          aria-hidden="true"
                        >
                          <path
                            d="M7 5l5 5-5 5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="groups-panel__group-name-text">{group.name}</span>
                        <span className="groups-panel__count">{group.words.length}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="groups-panel__quiz-btn"
                      onClick={() => onQuizGroup(group)}
                      disabled={group.words.length === 0}
                      title={group.words.length === 0 ? "Add words to this group first" : "Quiz this group"}
                    >
                      Quiz
                    </button>
                    <button
                      type="button"
                      className="groups-panel__icon-btn"
                      onClick={() => startRename(group)}
                      title="Rename"
                      aria-label={`Rename ${group.name}`}
                    >
                      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                        <path
                          d="M13.5 3.5l3 3-8.5 8.5H5v-3l8.5-8.5Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="groups-panel__icon-btn"
                      onClick={() => deleteGroup(group.id)}
                      title="Delete group"
                      aria-label={`Delete ${group.name}`}
                    >
                      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                        <path
                          d="M5 6h10M8.5 6V4.5h3V6M6.5 6l.6 9h5.8l.6-9"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                  {isOpen && (
                    <ul className="groups-panel__words">
                      {items.length === 0 && <li className="groups-panel__words-empty">No words in this group yet.</li>}
                      {items.map((w) => (
                        <li key={w.word} className="groups-panel__word-row">
                          <button type="button" className="groups-panel__word" onClick={() => onSelectWord(w.word)}>
                            <span className="groups-panel__word-text">{w.word}</span>
                            <span className="groups-panel__meaning">{w.meaning}</span>
                          </button>
                          <button
                            type="button"
                            className="groups-panel__icon-btn"
                            onClick={() => removeWordFromGroup(group.id, w.word)}
                            title="Remove from group"
                            aria-label={`Remove ${w.word} from ${group.name}`}
                          >
                            &times;
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
