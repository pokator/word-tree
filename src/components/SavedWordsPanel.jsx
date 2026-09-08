import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { probeConnection, exportWords as pushToAnki } from "../anki/ankiConnect";
import { buildAnkiTsv, downloadTextFile } from "../anki/exportFile";

const CONN_LABEL = {
  checking: "Checking for Anki…",
  connected: "Anki connected",
  "not-connected": "Anki not detected",
};

export default function SavedWordsPanel({ dataset, saved, onSelectWord, onClose }) {
  const { user } = useAuth();
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
        <h2 className="side-panel__title">Saved words</h2>
        <button type="button" className="side-panel__close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>

      <div className="side-panel__body">
        {!user ? (
          <p className="side-panel__hint">Sign in to save words for export.</p>
        ) : (
          <>
            <div className="saved-panel__status">
              <span className={`saved-panel__dot saved-panel__dot--${connState}`} />
              {CONN_LABEL[connState]}
              <button type="button" className="saved-panel__recheck" onClick={recheck}>
                Recheck
              </button>
            </div>

            {items.length === 0 ? (
              <p className="side-panel__hint">
                No saved words yet. Open a word&rsquo;s details and click &ldquo;Save for Anki&rdquo;.
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
                      {isExported && <span className="saved-panel__item-badge">Exported</span>}
                      <button
                        type="button"
                        className="saved-panel__item-remove"
                        onClick={() => saved.toggleSave(w.word)}
                        title="Remove from saved"
                        aria-label={`Remove ${w.word} from saved`}
                      >
                        &times;
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {message && <p className={`side-panel__message side-panel__message--${message.kind}`}>{message.text}</p>}

            <details className="saved-panel__setup">
              <summary>Set up live Anki export</summary>
              <ol>
                <li>
                  In Anki desktop: Tools &rarr; Add-ons &rarr; Get Add-ons&hellip;, enter code{" "}
                  <code>2055492159</code> (AnkiConnect), then restart Anki.
                </li>
                <li>
                  Tools &rarr; Add-ons &rarr; AnkiConnect &rarr; Config, add this app&rsquo;s origin to{" "}
                  <code>webCorsOriginList</code>, save, then restart Anki.
                </li>
                <li>Keep Anki desktop open when you export.</li>
                <li>
                  If your browser still blocks the connection (mixed content), use the .tsv download instead
                  &mdash; it works everywhere.
                </li>
              </ol>
            </details>
          </>
        )}
      </div>

      {user && (
        <div className="side-panel__footer">
          <button type="button" disabled={busy || items.length === 0} onClick={handleExport} className="side-panel__primary-btn">
            {connState === "connected" ? "Send to Anki" : "Download .tsv for Anki"}
          </button>
        </div>
      )}
    </>
  );
}
