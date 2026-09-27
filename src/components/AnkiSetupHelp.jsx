import { useEffect, useRef, useState } from "react";

const ADDON_CODE = "2055492159";

/** The webCorsOriginList line to paste into AnkiConnect's config -- with
 * this exact site's origin, since that's the one thing users can't guess.
 * http://localhost stays in (it's AnkiConnect's default entry). */
function corsSnippet(origin) {
  const origins = [...new Set(["http://localhost", origin])];
  return `"webCorsOriginList": [\n${origins.map((o) => `    "${o}"`).join(",\n")}\n]`;
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked -- the text is right there to select by hand
    }
  }
  return (
    <button type="button" className="anki-help__copy" onClick={copy} aria-label={label}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Step-by-step AnkiConnect setup, opened from the Bookmarks panel's Anki
 * section. The CORS step is where people get stuck -- AnkiConnect refuses
 * requests from any site not listed in its config -- so it shows the exact
 * lines to paste, with this site's origin already filled in.
 */
export default function AnkiSetupHelp({ onClose }) {
  const origin = window.location.origin;
  const dialogRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);

  return (
    <div className="anki-help__backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="anki-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="anki-help-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="anki-help__header">
          <h3 id="anki-help-title" className="anki-help__title">
            Set up AnkiConnect
          </h3>
          <button type="button" className="side-panel__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <ol className="anki-help__steps">
          <li>
            Install and open <strong>Anki desktop</strong> (apps.ankiweb.net). Moto talks to it on this computer.
          </li>
          <li>
            In Anki, go to <strong>Tools → Add-ons → Get Add-ons…</strong>, enter this code, then restart Anki:
            <span className="anki-help__code-row">
              <code className="anki-help__code">{ADDON_CODE}</code>
              <CopyButton text={ADDON_CODE} label="Copy add-on code" />
            </span>
          </li>
          <li>
            Go to <strong>Tools → Add-ons</strong>, select <strong>AnkiConnect</strong>, and press{" "}
            <strong>Config</strong>. Find the <code>webCorsOriginList</code> entry and replace it with:
            <span className="anki-help__snippet-wrap">
              <pre className="anki-help__snippet">{corsSnippet(origin)}</pre>
              <CopyButton text={corsSnippet(origin)} label="Copy webCorsOriginList setting" />
            </span>
            Save, then restart Anki. This tells AnkiConnect to accept requests from Moto; it refuses any site that
            isn&rsquo;t listed.
          </li>
          <li>
            Back here, press <strong>Connect to Anki</strong>. If your browser asks to let this site access devices on
            your local network, allow it. That&rsquo;s how it reaches Anki on this computer.
          </li>
        </ol>
        <p className="anki-help__note">
          Keep Anki open while you use Moto. Bookmarked words are added as cards in the <strong>元</strong> deck.
        </p>
      </div>
    </div>
  );
}
