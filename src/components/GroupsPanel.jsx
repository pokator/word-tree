import { useState } from "react";

export default function GroupsPanel({ dataset, groupsApi, onClose, onSelectWord }) {
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
    <div className="groups-panel">
      <form className="groups-panel__create" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="New group name (e.g. JLPT N4 review)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" disabled={!newName.trim()}>
          Create
        </button>
      </form>

      {groups.length === 0 ? (
        <p className="groups-panel__hint">
          No groups yet. Create one above, then open a word&rsquo;s details to add it.
        </p>
      ) : (
        <ul className="groups-panel__list">
          {groups.map((group) => {
            const isOpen = openGroupId === group.id;
            const items = group.words.map((w) => dataset.WORDS_BY_TEXT[w]).filter(Boolean);
            return (
              <li key={group.id} className="groups-panel__group">
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
                    >
                      {isOpen ? "▾" : "▸"} {group.name}{" "}
                      <span className="groups-panel__count">({group.words.length})</span>
                    </button>
                  )}
                  <button type="button" className="groups-panel__icon-btn" onClick={() => startRename(group)} title="Rename">
                    ✎
                  </button>
                  <button
                    type="button"
                    className="groups-panel__icon-btn"
                    onClick={() => deleteGroup(group.id)}
                    title="Delete group"
                  >
                    ✕
                  </button>
                </div>
                {isOpen && (
                  <ul className="groups-panel__words">
                    {items.length === 0 && <li className="groups-panel__hint">No words in this group yet.</li>}
                    {items.map((w) => (
                      <li key={w.word}>
                        <button type="button" className="groups-panel__word" onClick={() => onSelectWord(w.word)}>
                          {w.word}
                        </button>
                        <span className="groups-panel__meaning">{w.meaning}</span>
                        <button
                          type="button"
                          className="groups-panel__icon-btn"
                          onClick={() => removeWordFromGroup(group.id, w.word)}
                          title="Remove from group"
                        >
                          ✕
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

      <button type="button" className="groups-panel__close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
