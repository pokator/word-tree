import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, loadSupabase, needsSupabaseNow, supabaseReady } from "../lib/supabaseClient";
import { AuthContext } from "./context";
import { mergeGuestData } from "./mergeGuestData";

export function AuthProvider({ children }) {
  // With no saved session there's nothing to wait for: they're a guest until
  // they sign in, and the client only loads when they go to.
  const [state, setState] = useState(() => ({
    user: null,
    session: null,
    loading: needsSupabaseNow(),
  }));

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    let merge = { userId: null, promise: null };
    let latest = 0;
    let subscription = null;
    let client = null;

    // A signed-in user is only published once anything built up while
    // signed out has been folded into their account -- every data hook
    // (bookmarks, progress, groups) keys its fetch off `user`, so this
    // ordering is what makes their first load already include it. Later
    // events for the same user (token refreshes) share the one in-flight
    // merge rather than publishing ahead of it.
    async function publish(session) {
      const seq = ++latest;
      const user = session?.user ?? null;
      if (user) {
        if (merge.userId !== user.id) {
          // A merge that throws must not strand the app in "loading" --
          // the guest data stays put for the next sign-in, and the user is
          // signed in regardless.
          const promise = mergeGuestData(client, user.id).catch((err) => {
            console.error("Merging guest data failed:", err);
          });
          merge = { userId: user.id, promise };
        }
        await merge.promise;
      } else {
        merge = { userId: null, promise: null };
      }
      // A newer event (e.g. sign-out) may have landed while this one was
      // waiting on the merge -- it wins.
      if (cancelled || seq !== latest) return;
      // supabase-js re-emits SIGNED_IN (with a fresh user object) every
      // time the tab regains focus. Keeping the existing object for the
      // same account stops every data hook keyed on `user` from refetching
      // -- which would briefly drop anything whose save was still in flight.
      setState((prev) =>
        prev.user && user && prev.user.id === user.id
          ? { ...prev, session, loading: false }
          : { session, user, loading: false }
      );
    }

    // supabase-js warns against awaiting other Supabase calls inside this
    // callback (it holds an internal lock while it runs), so the merge is
    // deferred to a fresh task rather than awaited here. Subscribes whenever
    // the client turns up, whoever loaded it (this, or the sign-in form).
    supabaseReady.then((ready) => {
      if (cancelled) return;
      client = ready;
      ({
        data: { subscription },
      } = client.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => publish(session), 0);
      }));
    });

    if (needsSupabaseNow()) {
      // A saved session can't be read without the client, so carry on as a
      // guest rather than leave the app in "loading".
      loadSupabase().catch((err) => {
        console.error("Loading sign-in failed:", err);
        if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
      });
    }

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  // Bumped by refresh() -- the account-backed data hooks (bookmarks,
  // progress, tags) refetch whenever it changes, which is how the Bookmarks
  // panel's account pod pulls in changes made on another device. Saving
  // needs no equivalent: every change is written as it happens.
  const [syncVersion, setSyncVersion] = useState(0);
  const refresh = useCallback(() => setSyncVersion((v) => v + 1), []);
  const value = useMemo(() => ({ ...state, syncVersion, refresh }), [state, syncVersion, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
