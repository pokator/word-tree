import { useCallback, useMemo, useState } from "react";
import { buildAnkiTsv, downloadTextFile } from "../anki/exportFile";
import { collectionQuery } from "../anki/ankiSync";
import { buildCollections } from "../bookmarks/collections";
import { useAuth } from "../auth/useAuth";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import AccountSync from "./AccountSync";
import AnkiSetupHelp from "./AnkiSetupHelp";

const STATUS_LABELS = { new: "Not studied", learning: "Learning", known: "Known" };
const KIND_LABELS = { tag: "Your tags", jlpt: "JLPT", kanji: "Shared kanji", from: "Found from" };

function timeAgo(date) {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function SyncIcon({ spinning }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      aria-hidden="true"
      className={`pod__sync-icon${spinning ? " is-spinning" : ""}`}
    >
      <path d="M15.5 7.5A6 6 0 0 0 4.6 6.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4.5 12.5a6 6 0 0 0 10.9 1.3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M15.8 3.8v3.9h-3.9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.2 16.2v-3.9h3.9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A finished connection, folded down to one line: a status dot, a label
 * that expands the full card, a sync button, and any quick action (Anki's
 * Review). */
function Pod({ tone = "ok", label, expanded, onToggle, onSync, syncing, syncLabel, children }) {
  return (
    <div className={`pod pod--${tone}${expanded ? " is-expanded" : ""}`}>
      <button type="button" className="pod__main" aria-expanded={expanded} onClick={onToggle}>
        <span className="pod__dot" aria-hidden="true" />
        <span className="pod__label">{label}</span>
      </button>
      {children}
      <button type="button" className="pod__sync" onClick={onSync} disabled={syncing} aria-label={syncLabel} title={syncLabel}>
        <SyncIcon spinning={syncing} />
      </button>
    </div>
  );
}

/** Anki is Moto's study engine (see anki/useAnkiSync.js). This is where you
 * connect it, see that it's working, and -- because a failed connection
 * looks the same from the page whatever the cause -- what to check. */
function AnkiSection({ anki, hasBookmarks, onExportTsv, onHelp }) {
  const helpLink = (
    <button type="button" className="anki-card__link" onClick={onHelp}>
      How to set up AnkiConnect
    </button>
  );

  if (anki.state === "off") {
    return (
      <section className="anki-card" aria-labelledby="anki-title">
        <h3 className="anki-card__title" id="anki-title">
          Study with Anki
        </h3>
        <p className="anki-card__text">
          Moto adds the words you bookmark to Anki as cards, and shows what you&rsquo;ve learned. Needs Anki desktop
          with the AnkiConnect add-on.
        </p>
        <div className="anki-card__actions">
          <button type="button" className="anki-card__btn" onClick={anki.connect}>
            Connect to Anki
          </button>
          {helpLink}
        </div>
        {hasBookmarks && (
          <button type="button" className="anki-card__link anki-card__export" onClick={onExportTsv}>
            Or export a file instead
          </button>
        )}
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
          <li>AnkiConnect is installed (add-on code 2055492159).</li>
          <li>
            <code>{window.location.origin}</code> is in AnkiConnect&rsquo;s <code>webCorsOriginList</code>.
          </li>
          <li>Your browser allows local network access for this site (site settings, left of the address bar).</li>
        </ol>
        <div className="anki-card__actions">
          <button type="button" className="anki-card__btn" onClick={anki.check}>
            Try again
          </button>
          {helpLink}
        </div>
        <div className="anki-card__actions">
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

  // Connected: this is the expanded view of the Anki pod.
  return (
    <section className="anki-card anki-card--connected" aria-labelledby="anki-title" aria-live="polite">
      <div className="anki-card__status">
        <h3 className="anki-card__title" id="anki-title">
          Anki connected
        </h3>
        <span className="anki-card__meta">
          {anki.syncing ? "Syncing…" : anki.lastSynced ? `Synced ${timeAgo(anki.lastSynced)}` : "Up to date"}
        </span>
      </div>
      <p className="anki-card__text">
        New bookmarks are added to the <strong>元</strong> deck as you make them.
      </p>
      {anki.error && (
        <p className="anki-card__error" role="alert">
          {anki.error}
        </p>
      )}
      <div className="anki-card__actions">
        {helpLink}
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
 *
 * Once signed in and connected, the account and Anki fold into small pods
 * on one row at the top -- status at a glance, a sync button each, Review
 * on Anki's -- and expand back into their full cards on tap. Anything not
 * set up yet (or broken) stays a full card, since it needs attention.
 */
export default function BookmarksPanel({
  dataset,
  saved,
  anki,
  getStatus,
  userTagsFor,
  onSelectWord,
  onClose,
}) {
  const { user, refresh } = useAuth();
  const [activeKey, setActiveKey] = useState(null); // `${kind}:${key}` | null
  const [message, setMessage] = useState(null);
  const [expanded, setExpanded] = useState(null); // null | "account" | "anki"
  const [helpOpen, setHelpOpen] = useState(false);
  // Stable, so the dialog's focus/Escape effect runs once per opening.
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const [refreshing, setRefreshing] = useState(false);

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

  // Changes save to the account as you make them; this pulls in anything
  // saved from another device since this page loaded.
  function refreshAccount() {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 700);
  }

  const connected = anki.state === "connected";
  const signedIn = isSupabaseConfigured && Boolean(user);
  const toggle = (key) => setExpanded((prev) => (prev === key ? null : key));
  const ankiLabel = anki.syncing
    ? "Anki · syncing…"
    : anki.error
      ? "Anki · needs attention"
      : `Anki${anki.due ? ` · ${anki.due} to review` : " · up to date"}`;

  return (
    <>
      <div className="side-panel__header">
        <h2 className="side-panel__title">Bookmarks</h2>
        <button type="button" className="side-panel__close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>

      <div className="side-panel__body">
        {(signedIn || connected) && (
          <div className="pods" role="group" aria-label="Sync status">
            {signedIn && (
              <Pod
                label={user.email}
                expanded={expanded === "account"}
                onToggle={() => toggle("account")}
                onSync={refreshAccount}
                syncing={refreshing}
                syncLabel="Load changes from your other devices"
              />
            )}
            {connected && (
              <Pod
                tone={anki.error ? "warn" : "ok"}
                label={ankiLabel}
                expanded={expanded === "anki"}
                onToggle={() => toggle("anki")}
                onSync={anki.syncNow}
                syncing={anki.syncing}
                syncLabel="Sync with Anki"
              >
                <button type="button" className="pod__action" onClick={anki.review}>
                  Review
                </button>
              </Pod>
            )}
          </div>
        )}

        {(!signedIn || expanded === "account") && <AccountSync />}
        {(!connected || expanded === "anki") && (
          <AnkiSection
            anki={anki}
            hasBookmarks={saved.words.length > 0}
            onExportTsv={exportTsv}
            onHelp={() => setHelpOpen(true)}
          />
        )}
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
      {helpOpen && <AnkiSetupHelp onClose={closeHelp} />}
    </>
  );
}
