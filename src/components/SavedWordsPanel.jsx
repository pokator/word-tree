import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { probeConnection, exportWords as pushToAnki } from "../anki/ankiConnect";
import { buildAnkiTsv, downloadTextFile } from "../anki/exportFile";

export default function SavedWordsPanel({ dataset, saved, onClose }) {
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

  if (!user) {
    return (
      <div className="saved-panel">
        <p className="saved-panel__hint">Sign in to save words for export.</p>
      </div>
    );
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
        setMessage({ kind: "info", text: "Downloaded a .tsv file -- import it in Anki via File → Import." });
      }
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    }
    setBusy(false);
  }

  return (
    <div className="saved-panel">
      <div className="saved-panel__status">
        <span className={`saved-panel__dot saved-panel__dot--${connState}`} />
        {connState === "checking" && "Checking for Anki..."}
        {connState === "connected" && "Anki connected"}
        {connState === "not-connected" && "Anki not detected"}
        <button type="button" className="saved-panel__recheck" onClick={recheck}>
          Recheck
        </button>
      </div>

      {items.length === 0 ? (
        <p className="saved-panel__hint">
          No saved words yet. Open a word&rsquo;s details and click &ldquo;Save for Anki&rdquo;.
        </p>
      ) : (
        <ul className="saved-panel__list">
          {items.map((w) => (
            <li key={w.word}>
              <span className="saved-panel__word">{w.word}</span>
              <span className="saved-panel__meaning">{w.meaning}</span>
              {saved.words.find((s) => s.item_id === w.word)?.exported_at && (
                <span className="saved-panel__exported">exported</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <button type="button" disabled={busy || items.length === 0} onClick={handleExport} className="saved-panel__export">
        {connState === "connected" ? "Send to Anki" : "Download .tsv for Anki"}
      </button>

      {message && <p className={`saved-panel__message saved-panel__message--${message.kind}`}>{message.text}</p>}

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
            If your browser still blocks the connection (mixed content), use the .tsv download
            instead -- it works everywhere.
          </li>
        </ol>
      </details>

      <button type="button" className="saved-panel__close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
