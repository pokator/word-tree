import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";
import { AuthContext } from "./context";
import { mergeGuestData } from "./mergeGuestData";

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    user: null,
    session: null,
    loading: isSupabaseConfigured,
  });

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    let merge = { userId: null, promise: null };
    let latest = 0;

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
        if (merge.userId !== user.id) merge = { userId: user.id, promise: mergeGuestData(supabase, user.id) };
        await merge.promise;
      } else {
        merge = { userId: null, promise: null };
      }
      // A newer event (e.g. sign-out) may have landed while this one was
      // waiting on the merge -- it wins.
      if (!cancelled && seq === latest) setState({ session, user, loading: false });
    }

    // supabase-js warns against awaiting other Supabase calls inside this
    // callback (it holds an internal lock while it runs), so the merge is
    // deferred to a fresh task rather than awaited here.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => publish(session), 0);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
