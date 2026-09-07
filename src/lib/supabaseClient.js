import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// When not configured, `supabase` is null and every feature that needs it
// (data fetch, auth, progress, saved words) falls back to its local/guest
// behavior instead of crashing. See src/data/useWordData.js and
// src/progress/useProgress.js for the fallback paths.
export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;
