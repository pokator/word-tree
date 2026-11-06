const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// The client is a big part of the JS bundle, and a guest never needs it until
// they open sign-in, so it's a separate chunk fetched by loadSupabase().
//
// `supabase` is null until then, and also when Supabase isn't configured, where
// every feature that needs it falls back to its local/guest behavior instead of
// crashing (see src/progress/useProgress.js). It's a live binding, so anything
// holding a signed-in user can use it directly: a user only exists once the
// client has loaded.
export let supabase = null;

let resolveReady;
/** Resolves with the client once something has loaded it. */
export const supabaseReady = new Promise((resolve) => {
  resolveReady = resolve;
});

let loading = null;

/** Fetches and creates the client once; rejects if the chunk won't load. */
export function loadSupabase() {
  if (!isSupabaseConfigured) return Promise.resolve(null);
  loading ??= import("@supabase/supabase-js").then(
    ({ createClient }) => {
      supabase = createClient(url, anonKey);
      resolveReady(supabase);
      return supabase;
    },
    (err) => {
      loading = null; // let a later call retry
      throw err;
    }
  );
  return loading;
}

/**
 * Whether this visit needs the client from the start: there's a saved session
 * to restore, or the URL carries the result of an emailed sign-in link. Looks
 * for the client's own storage key, sb-<project>-auth-token.
 */
export function needsSupabaseNow() {
  if (!isSupabaseConfigured) return false;
  if (/[#&?](access_token|code|error_description)=/.test(window.location.hash + window.location.search)) return true;
  try {
    return Object.keys(localStorage).some((key) => /^sb-.+-auth-token/.test(key));
  } catch {
    return false; // no storage means no saved session either
  }
}
