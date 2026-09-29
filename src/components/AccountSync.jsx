import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";
import { track } from "../lib/analytics";

// Supabase refuses a second code for the same address within a minute
// (auth.email.max_frequency) -- the resend button waits it out rather than
// letting the user hit that error.
const RESEND_COOLDOWN_S = 60;
const CODE_LENGTH = 6;

function friendlyError(error, step) {
  const msg = error?.message ?? "";
  if (step === "code" && /expired|invalid/i.test(msg)) return "That code didn't work. Check it, or send a new one.";
  if (/rate limit|security purposes/i.test(msg)) return "Too many tries. Wait a minute, then send a new code.";
  return msg || "Something went wrong. Try again.";
}

/**
 * Sign-in, living inside the Bookmarks panel rather than as its own header
 * button: the reason to have an account is to keep bookmarks (and mastery,
 * groups) across devices, so that's where it's offered. Passwordless and
 * link-free -- enter an email, type the 6-digit code it receives. Signing up
 * and signing in are the same two steps; a new address just gets an
 * account. Nothing depends on an email link landing on the right device or
 * URL, which is what broke the old magic-link flow.
 */
export default function AccountSync() {
  const { user, loading } = useAuth();
  const [step, setStep] = useState("email"); // "email" | "code"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  // verifyOtp resolving isn't the end of signing in -- AuthProvider still
  // merges guest data before publishing the user. Until then the form stays
  // locked, so the (now used-up) code can't be submitted a second time.
  const [verified, setVerified] = useState(false);

  // Whenever the signed-in account changes (sign-in, sign-out), start the
  // form over -- otherwise signing out from an open panel would land back
  // on "Check your email" with the old code still filled in.
  const userId = user?.id ?? null;
  const [formFor, setFormFor] = useState(userId);
  if (formFor !== userId) {
    setFormFor(userId);
    setStep("email");
    setCode("");
    setError(null);
    setCooldown(0);
    setVerified(false);
    setBusy(false);
  }

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!isSupabaseConfigured || loading) return null;

  if (user) {
    return (
      <div className="account-sync account-sync--signed-in">
        <span className="account-sync__synced">
          Synced as <strong className="account-sync__email">{user.email}</strong>
        </span>
        <button type="button" className="account-sync__link" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  async function sendCode(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (err) {
      setError(friendlyError(err, "email"));
      return;
    }
    setStep("code");
    setCode("");
    setCooldown(RESEND_COOLDOWN_S);
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
    // On success AuthProvider picks the session up (merging anything
    // bookmarked as a guest first) and this re-renders as signed in.
    if (err) {
      setBusy(false);
      setError(friendlyError(err, "code"));
    } else {
      setVerified(true);
      track("sign-in");
    }
  }

  if (step === "code") {
    return (
      <form className="account-sync" onSubmit={verify} aria-labelledby="account-sync-title">
        <h3 className="account-sync__title" id="account-sync-title">
          Check your email
        </h3>
        <p className="account-sync__hint" id="account-sync-code-hint">
          Enter the {CODE_LENGTH}-digit code sent to <strong>{email.trim()}</strong>.
        </p>
        <div className="account-sync__row">
          <label className="visually-hidden" htmlFor="account-sync-code">
            Sign-in code
          </label>
          <input
            id="account-sync-code"
            className="account-sync__code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern={`[0-9]{${CODE_LENGTH}}`}
            placeholder="123456"
            aria-describedby={error ? "account-sync-code-hint account-sync-error" : "account-sync-code-hint"}
            aria-invalid={Boolean(error)}
            value={code}
            // No maxLength: the browser would truncate a paste like
            // " 123456" to 6 raw characters before the spaces are
            // stripped here, silently losing a digit.
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
            disabled={verified}
            autoFocus
            required
          />
          <button
            type="submit"
            className="account-sync__btn"
            disabled={busy || verified || code.length !== CODE_LENGTH}
          >
            {verified ? "Signing in…" : busy ? "Checking…" : "Sign in"}
          </button>
        </div>
        {error && (
          <p className="account-sync__error" id="account-sync-error" role="alert">
            {error}
          </p>
        )}
        {!verified && (
          <div className="account-sync__links">
            <button type="button" className="account-sync__link" onClick={sendCode} disabled={busy || cooldown > 0}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
            <button
              type="button"
              className="account-sync__link"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
            >
              Use a different email
            </button>
          </div>
        )}
        <p className="visually-hidden" aria-live="polite">
          {verified ? "Signing in" : busy ? "Checking code" : ""}
        </p>
      </form>
    );
  }

  return (
    <form className="account-sync" onSubmit={sendCode} aria-labelledby="account-sync-title">
      <h3 className="account-sync__title" id="account-sync-title">
        Keep your bookmarks everywhere
      </h3>
      <p className="account-sync__hint" id="account-sync-email-hint">
        Sign in to sync bookmarks and progress across devices. We&rsquo;ll email you a code. No password needed.
      </p>
      <div className="account-sync__row">
        <label className="visually-hidden" htmlFor="account-sync-email">
          Email
        </label>
        <input
          id="account-sync-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-describedby={error ? "account-sync-email-hint account-sync-error" : "account-sync-email-hint"}
          aria-invalid={Boolean(error)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" className="account-sync__btn" disabled={busy || !email.trim()}>
          {busy ? "Sending…" : "Send code"}
        </button>
      </div>
      {error && (
        <p className="account-sync__error" id="account-sync-error" role="alert">
          {error}
        </p>
      )}
      <p className="visually-hidden" aria-live="polite">
        {busy ? "Sending code" : ""}
      </p>
    </form>
  );
}
