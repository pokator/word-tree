import { useState } from "react";
import { useAuth } from "../auth/useAuth";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";
import { useClickOutside } from "../lib/useClickOutside";

export default function AuthPanel() {
  const { user, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useClickOutside(isOpen, () => setIsOpen(false));

  if (loading) return null; // avoid flashing "Sign in" before the session check resolves

  if (user) {
    return (
      <div className="auth-chip">
        <span className="auth-chip__email">{user.email}</span>
        <button className="auth-chip__signout" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="auth-panel-wrap icon-toolbar" ref={wrapRef}>
      <button
        type="button"
        className="icon-toolbar__btn"
        onClick={() => setIsOpen((v) => !v)}
        aria-pressed={isOpen}
        aria-label="Sign in"
        title="Sign in"
      >
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
          <circle cx="12" cy="8.3" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M5.5 19c1.2-3.3 4-5 6.5-5s5.3 1.7 6.5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {isOpen && <SignInForm onSignedIn={() => setIsOpen(false)} />}
    </div>
  );
}

function SignInForm({ onSignedIn }) {
  const [mode, setMode] = useState("magic-link"); // 'magic-link' | 'password'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(null); // { kind: 'error' | 'info', text }
  const [busy, setBusy] = useState(false);

  if (!isSupabaseConfigured) {
    return (
      <div className="auth-form">
        <p className="auth-form__hint">Sign-in isn&rsquo;t configured yet.</p>
      </div>
    );
  }

  async function sendMagicLink(e) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setBusy(false);
    setStatus(
      error ? { kind: "error", text: error.message } : { kind: "info", text: "Check your email for a sign-in link." }
    );
  }

  async function signIn(e) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setStatus({ kind: "error", text: error.message });
    else onSignedIn();
  }

  async function signUp() {
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    setStatus(
      error
        ? { kind: "error", text: error.message }
        : { kind: "info", text: "Account created -- check your email to confirm, then sign in." }
    );
  }

  return (
    <form className="auth-form" onSubmit={mode === "magic-link" ? sendMagicLink : signIn}>
      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      {mode === "password" && (
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
      )}

      {mode === "magic-link" ? (
        <button type="submit" disabled={busy}>
          Send magic link
        </button>
      ) : (
        <div className="auth-form__row">
          <button type="submit" disabled={busy}>
            Sign in
          </button>
          <button type="button" disabled={busy} onClick={signUp}>
            Sign up
          </button>
        </div>
      )}

      <button
        type="button"
        className="auth-form__switch"
        onClick={() => {
          setMode((m) => (m === "magic-link" ? "password" : "magic-link"));
          setStatus(null);
        }}
      >
        {mode === "magic-link" ? "Use a password instead" : "Use a magic link instead"}
      </button>

      {status && <p className={`auth-form__status auth-form__status--${status.kind}`}>{status.text}</p>}
    </form>
  );
}
