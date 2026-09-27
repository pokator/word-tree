import { useMemo, useState } from "react";
import { buildAnkiTsv, downloadTextFile } from "../anki/exportFile";
import { collectionQuery } from "../anki/ankiSync";
import { buildCollections } from "../bookmarks/collections";
import AccountSync from "./AccountSync";

const STATUS_LABELS = { new: "Not studied", learning: "Learning", known: "Known" };
const KIND_LABELS = { tag: "Your tags", jlpt: "JLPT", kanji: "Shared kanji", from: "Found from" };

function timeAgo(date) {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** Anki is Moto's study engine (see anki/useAnkiSync.js). This is where you
 * connect it, see that it's working, and -- because a failed connection
 * looks the same from the page whatever the cause -- what to check. */
function AnkiSection({ anki, hasBookmarks, onExportTsv }) {
  if (anki.state === "off") {
    return (
      <section className="anki-card" aria-labelledby="anki-title">
        <h3 className="anki-card__title" id="anki-title">
          Study with Anki
        </h3>
        <p className="anki-card__text">
          Moto adds your bookmarks to Anki as cards, and shows on the graph what you&rsquo;ve learned. Needs Anki
          desktop with the AnkiConnect add-on.
        </p>
        <div className="anki-card__actions">
          <button type="button" className="anki-card__btn" onClick={anki.connect}>
            Connect to Anki
          </button>
          {hasBookmarks && (
            <button type="button" className="anki-card__link" onClick={onExportTsv}>
              Or export a file instead
            </button>
          )}
        </div>
        <p className="anki-card__note">
          Your browser may ask to let this site &ldquo;access devices on your local network&rdquo;. That&rsquo;s how it
          reaches Anki on this computer. Allow it.
        </p>
      </section>
    );
  }

  if (anki.state === "checking") {
    return (
      <section className="anki-card" aria-live="polite">
        <p className="anki-card__text">Connecting to Anki…</p>
      </section>
    );
  }

  if (anki.state === "unreachable") {
    return (
      <section className="anki-card anki-card--problem" aria-labelledby="anki-title" aria-live="polite">
        <h3 className="anki-card__title" id="anki-title">
          Can&rsquo;t reach Anki
        </h3>
        <ol className="anki-card__checklist">
          <li>Anki desktop is open on this computer.</li>
          <li>
            AnkiConnect is installed: in Anki, Tools &rarr; Add-ons &rarr; Get Add-ons, code <code>2055492159</code>,
            then restart Anki.
          </li>
          <li>
            This site is allowed: Tools &rarr; Add-ons &rarr; AnkiConnect &rarr; Config, add{" "}
            <code>{window.location.origin}</code> to <code>webCorsOriginList</code>, then restart Anki.
          </li>
          <li>
            Your browser allows local network access for this site (the icon left of the address bar &rarr; Site
            settings).
          </li>
        </ol>
        <div className="anki-card__actions">
          <button type="button" className="anki-card__btn" onClick={anki.check}>
            Try again
          </button>
          <button type="button" className="anki-card__link" onClick={anki.disconnect}>
            Stop using Anki
          </button>
          {hasBookmarks && (
            <button type="button" className="anki-card__link" onClick={onExportTsv}>
              Export a file instead
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="anki-card anki-card--connected" aria-labelledby="anki-title" aria-live="polite">
      <div className="anki-card__status">
        <span className="anki-card__dot" aria-hidden="true" />
        <h3 className="anki-card__title" id="anki-title">
          Anki connected
        </h3>
        <span className="anki-card__meta">
          {anki.syncing ? "Syncing…" : anki.lastSynced ? `Synced ${timeAgo(anki.lastSynced)}` : ""}
        </span>
      </div>
      {anki.error && (
        <p className="anki-card__error" role="alert">
          {anki.error}
        </p>
      )}
      <div className="anki-card__actions">
        <button type="button" className="anki-card__btn" onClick={anki.review}>
          Review{anki.due ? ` ${anki.due} due` : ""}
        </button>
        <button type="button" className="anki-card__link" onClick={anki.syncNow} disabled={anki.syncing}>
          Sync now
        </button>
        <button type="button" className="anki-card__link" onClick={anki.disconnect}>
          Disconnect
        </button>
      </div>
    </section>
  );
}

/**
 * Bookmarks: the words you're studying -- with or without an account (see
 * progress/useSavedWords.js), with or without Anki. The one home for your
 * words: the account (AccountSync), Anki, collections (bookmarks sliced
 * automatically by tag, JLPT level, shared kanji, and where you found them
 * -- see bookmarks/collections.js), and the list itself, each word with
 * the status Anki reports for it.
 */
export default function BookmarksPanel({ dataset, saved, anki, getStatus, userTagsFor, onSelectWord, onClose }) {
  const [activeKey, setActiveKey] = useState(null); // `${kind}:${key}` | null
  const [message, setMessage] = useState(null);

  const collections = useMemo(
    () => buildCollections(dataset, saved.words, userTagsFor),
    [dataset, saved.words, userTagsFor]
  );
  const active = collections.find((c) => `${c.kind}:${c.key}` === activeKey) ?? null;
  const shownIds = active ? new Set(active.words) : null;
  const items = saved.words
    .map((s) => dataset.WORDS_BY_TEXT[s.item_id])
    .filter(Boolean)
    .filter((w) => !shownIds || shownIds.has(w.word));

  function exportTsv() {
    const all = saved.words.map((s) => dataset.WORDS_BY_TEXT[s.item_id]).filter(Boolean);
    downloadTextFile("moto-export.tsv", buildAnkiTsv(all));
    setMessage("Downloaded a .tsv file. Import it in Anki via File → Import.");
  }

  const connected = anki.state === "connected";

  return (
    <>
      <div className="side-panel__header">
        <h2 className="side-panel__title">Bookmarks</h2>
        <button type="button" className="side-panel__close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>

      <div className="side-panel__body">
        <AccountSync />
        <AnkiSection anki={anki} hasBookmarks={saved.words.length > 0} onExportTsv={exportTsv} />
        {message && <p className="side-panel__message side-panel__message--info">{message}</p>}

        {collections.length > 0 && (
          <section className="collections" aria-label="Collections">
            <div className="collections__chips">
              <button
                type="button"
                className={`collections__chip${active ? "" : " is-active"}`}
                aria-pressed={!active}
                onClick={() => setActiveKey(null)}
              >
                All <span className="collections__count">{saved.words.length}</span>
              </button>
              {collections.map((c, i) => {
                const key = `${c.kind}:${c.key}`;
                const showKind = c.kind !== collections[i - 1]?.kind;
                return (
                  <span key={key} className="collections__item">
                    {showKind && <span className="collections__kind">{KIND_LABELS[c.kind]}</span>}
                    <button
                      type="button"
                      className={`collections__chip${activeKey === key ? " is-active" : ""}`}
                      aria-pressed={activeKey === key}
                      onClick={() => setActiveKey(activeKey === key ? null : key)}
                    >
                      {c.label} <span className="collections__count">{c.words.length}</span>
                    </button>
                  </span>
                );
              })}
            </div>
            {active && connected && (
              <button
                type="button"
                className="anki-card__link collections__open"
                onClick={() => anki.browse(collectionQuery(active.ankiTag))}
              >
                Open &ldquo;{active.label}&rdquo; in Anki
              </button>
            )}
          </section>
        )}

        {items.length === 0 ? (
          <p className="side-panel__hint">
            No bookmarks yet. Open a word&rsquo;s details and press &ldquo;Bookmark&rdquo; to keep it here.
          </p>
        ) : (
          <ul className="saved-panel__list">
            {items.map((w) => {
              const status = getStatus("word", w.word);
              const tags = userTagsFor(w.word);
              return (
                <li key={w.word} className="saved-panel__item">
                  <button type="button" className="saved-panel__item-main" onClick={() => onSelectWord?.(w.word)}>
                    <span className="saved-panel__item-word">{w.word}</span>
                    <span className="saved-panel__item-meaning">{w.meaning}</span>
                    {tags.length > 0 && (
                      <span className="saved-panel__item-tags">
                        {tags.map((t) => (
                          <span key={t} className="saved-panel__item-tag">
                            {t}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                  {status && (
                    <span className={`study-status__chip study-status__chip--${status}`}>{STATUS_LABELS[status]}</span>
                  )}
                  <button
                    type="button"
                    className="saved-panel__item-remove"
                    onClick={() => saved.toggleSave(w.word)}
                    title="Remove bookmark (its Anki card is kept)"
                    aria-label={`Remove bookmark for ${w.word}`}
                  >
                    &times;
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
