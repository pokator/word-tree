import { useEffect, useState } from "react";
import { probeConnection, exportWords as pushToAnki } from "../anki/ankiConnect";
import { buildAnkiTsv, downloadTextFile } from "../anki/exportFile";
import AccountSync from "./AccountSync";

const CONN_LABEL = {
  checking: "Checking for Anki…",
  connected: "Anki connected",
  "not-connected": "Anki not detected",
};

/**
 * Bookmarks: the words you want to study, available with or without an
 * account (see progress/useSavedWords.js). The account itself lives here
 * too (AccountSync) -- syncing bookmarks across devices is what signing in
 * is for -- and Anki export is one thing you can do with the list, tucked
 * into the footer rather than being the list's reason to exist.
 */
export default function BookmarksPanel({ dataset, saved, onSelectWord, onClose }) {
  const [connState, setConnState] = useState("checking"); // 'checking' | 'connected' | 'not-connected'
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    recheck();
  }, []);

  function recheck() {
    setConnState("checking");
    probeConnection().then((ok) => setConnState(ok ? "connected" : "not-connected"));
  }

  const items = saved.words.map((s) => dataset.WORDS_BY_TEXT[s.item_id]).filter(Boolean);

  async function handleExport() {
    setBusy(true);
    setMessage(null);
    try {
      if (connState === "connected") {
        await pushToAnki(items);
        saved.markExported(items.map((i) => i.word));
        setMessage({ kind: "info", text: `Sent ${items.length} card(s) to Anki.` });
      } else {
        downloadTextFile("moto-export.tsv", buildAnkiTsv(items));
        setMessage({ kind: "info", text: "Downloaded a .tsv file — import it in Anki via File → Import." });
      }
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    }
    setBusy(false);
  }

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

        {items.length === 0 ? (
          <p className="side-panel__hint">
            No bookmarks yet. Open a word&rsquo;s details and press &ldquo;Bookmark&rdquo; to keep it here.
          </p>
        ) : (
          <ul className="saved-panel__list">
            {items.map((w) => {
              const isExported = Boolean(saved.words.find((s) => s.item_id === w.word)?.exported_at);
              return (
                <li key={w.word} className="saved-panel__item">
                  <button type="button" className="saved-panel__item-main" onClick={() => onSelectWord?.(w.word)}>
                    <span className="saved-panel__item-word">{w.word}</span>
                    <span className="saved-panel__item-meaning">{w.meaning}</span>
                  </button>
                  {isExported && <span className="saved-panel__item-badge">In Anki</span>}
                  <button
                    type="button"
                    className="saved-panel__item-remove"
                    onClick={() => saved.toggleSave(w.word)}
                    title="Remove bookmark"
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

      {items.length > 0 && (
        <div className="side-panel__footer saved-panel__export">
          <div className="saved-panel__status">
            <span className={`saved-panel__dot saved-panel__dot--${connState}`} />
            {CONN_LABEL[connState]}
            <button type="button" className="saved-panel__recheck" onClick={recheck}>
              Recheck
            </button>
          </div>
          <button type="button" disabled={busy} onClick={handleExport} className="side-panel__primary-btn">
            {connState === "connected" ? "Send to Anki" : "Export for Anki (.tsv)"}
          </button>
          {message && <p className={`side-panel__message side-panel__message--${message.kind}`}>{message.text}</p>}
          <details className="saved-panel__setup">
            <summary>Set up live Anki export</summary>
            <ol>
              <li>
                In Anki desktop: Tools &rarr; Add-ons &rarr; Get Add-ons&hellip;, enter code <code>2055492159</code>{" "}
                (AnkiConnect), then restart Anki.
              </li>
              <li>
                Tools &rarr; Add-ons &rarr; AnkiConnect &rarr; Config, add this app&rsquo;s origin to{" "}
                <code>webCorsOriginList</code>, save, then restart Anki.
              </li>
              <li>Keep Anki desktop open when you export.</li>
              <li>
                If your browser still blocks the connection (mixed content), use the .tsv download instead &mdash; it
                works everywhere.
              </li>
            </ol>
          </details>
        </div>
      )}
    </>
  );
}
