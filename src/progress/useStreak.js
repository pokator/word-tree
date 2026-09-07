import { useState } from "react";

const KEY = "word-tree:streak";
const DAY_MS = 24 * 60 * 60 * 1000;

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / DAY_MS);
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { lastActiveDate: null, streak: 0 };
  } catch {
    return { lastActiveDate: null, streak: 0 };
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable -- streak just won't persist this session
  }
}

/** Computes (and persists) today's streak value once, synchronously, as
 * part of mounting -- not in an effect, since there's nothing to
 * synchronize with an external system beyond this one-time read-modify-
 * write on load. */
function resolveTodaysStreak() {
  const state = load();
  const today = todayString();
  if (state.lastActiveDate === today) return state.streak;

  const gap = state.lastActiveDate ? daysBetween(state.lastActiveDate, today) : null;
  const nextStreak = gap === 1 ? state.streak + 1 : 1;
  save({ lastActiveDate: today, streak: nextStreak });
  return nextStreak;
}

/** A simple daily-use streak, purely a per-device engagement nudge (like
 * Duolingo's) -- not account data, so it's deliberately localStorage-only
 * even when signed in, same as the theme preference. Counts "visited the
 * app today" -- it doesn't require reviewing a minimum number of words. */
export function useStreak() {
  const [streak] = useState(resolveTodaysStreak);
  return streak;
}
