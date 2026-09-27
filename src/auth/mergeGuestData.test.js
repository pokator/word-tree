import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeGuestData } from "./mergeGuestData";
import {
  GUEST_BOOKMARKS_KEY,
  GUEST_GROUPS_KEY,
  GUEST_PROGRESS_KEY,
  loadGuestBookmarks,
  loadGuestGroups,
} from "../lib/guestStore";

// A tiny in-memory stand-in for the slice of supabase-js the merge uses:
// select().eq() reads, upsert (with onConflict/ignoreDuplicates), and
// insert().select().single(). Enough to assert on the resulting tables
// rather than on a list of mocked calls.
function fakeClient(tables, { failOn } = {}) {
  let nextId = 1;
  const keyOf = (table, row, onConflict) => onConflict.split(",").map((c) => row[c]).join("|");
  return {
    from(table) {
      const rows = (tables[table] ??= []);
      const fail = failOn === table ? { message: `${table} failed` } : null;
      return {
        select() {
          const filters = [];
          const query = {
            eq(col, val) {
              filters.push([col, val]);
              return query;
            },
            then(resolve) {
              resolve(fail ? { data: null, error: fail } : { data: rows.filter((r) => filters.every(([c, v]) => r[c] === v)), error: null });
            },
          };
          return query;
        },
        async upsert(input, { onConflict, ignoreDuplicates } = {}) {
          if (fail) return { error: fail };
          for (const row of [].concat(input)) {
            const i = rows.findIndex((r) => keyOf(table, r, onConflict) === keyOf(table, row, onConflict));
            if (i === -1) rows.push({ ...row });
            else if (!ignoreDuplicates) rows[i] = { ...rows[i], ...row };
          }
          return { error: null };
        },
        insert(row) {
          return {
            select: () => ({
              single: async () => {
                if (fail) return { data: null, error: fail };
                const created = { id: `g${nextId++}`, ...row };
                rows.push(created);
                return { data: created, error: null };
              },
            }),
          };
        },
      };
    },
  };
}

function seedGuest({ bookmarks = [], progress = {}, groups = [] }) {
  localStorage.setItem(GUEST_BOOKMARKS_KEY, JSON.stringify(bookmarks));
  localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(progress));
  localStorage.setItem(GUEST_GROUPS_KEY, JSON.stringify(groups));
}

describe("mergeGuestData", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("does nothing when there's no guest data", async () => {
    const tables = {};
    expect(await mergeGuestData(fakeClient(tables), "u1")).toEqual({ merged: false });
    expect(tables).toEqual({});
  });

  it("unions bookmarks, keeps the further-along mastery, merges groups by name, then clears guest data", async () => {
    seedGuest({
      bookmarks: [{ item_id: "日本", exported_at: null }, { item_id: "本当", exported_at: null }],
      progress: { "word:日本": "known", "word:本当": "new", "kanji:日": "learning" },
      groups: [
        { id: "local-1", name: "N5", words: ["日本", "今日"] },
        { id: "local-2", name: "Travel", words: ["空港"] },
      ],
    });
    const tables = {
      saved_items: [{ user_id: "u1", item_type: "word", item_id: "日本", exported_at: "2026-01-01" }],
      user_progress: [
        { user_id: "u1", item_type: "word", item_id: "日本", status: "learning" },
        { user_id: "u1", item_type: "word", item_id: "本当", status: "known" },
      ],
      groups: [{ id: "acct-n5", user_id: "u1", name: "N5" }],
      group_words: [{ group_id: "acct-n5", word: "日本" }],
    };

    expect(await mergeGuestData(fakeClient(tables), "u1")).toEqual({ merged: true });

    expect(tables.saved_items.map((r) => [r.item_id, r.exported_at])).toEqual([
      ["日本", "2026-01-01"], // account row untouched
      ["本当", null],
    ]);
    const status = Object.fromEntries(tables.user_progress.map((r) => [`${r.item_type}:${r.item_id}`, r.status]));
    expect(status).toEqual({ "word:日本": "known", "word:本当": "known", "kanji:日": "learning" });
    expect(tables.groups.map((g) => g.name)).toEqual(["N5", "Travel"]);
    const travelId = tables.groups.find((g) => g.name === "Travel").id;
    expect(tables.group_words).toEqual([
      { group_id: "acct-n5", word: "日本" },
      { group_id: "acct-n5", word: "今日" },
      { group_id: travelId, word: "空港" },
    ]);
    expect(loadGuestBookmarks()).toEqual([]);
    expect(loadGuestGroups()).toEqual([]);
  });

  it("keeps guest data when any write fails, so the next sign-in retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seedGuest({ bookmarks: [{ item_id: "日本", exported_at: null }], groups: [{ id: "l", name: "N5", words: ["日本"] }] });
    const result = await mergeGuestData(fakeClient({}, { failOn: "group_words" }), "u1");
    expect(result.merged).toBe(false);
    expect(loadGuestBookmarks()).toHaveLength(1);
    expect(loadGuestGroups()).toHaveLength(1);
  });
});
