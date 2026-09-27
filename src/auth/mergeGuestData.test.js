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
// Hosted Supabase's default API row cap -- a read silently stops here.
const MAX_ROWS = 1000;

function fakeClient(tables, { failOn, onWrite } = {}) {
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
              filters.push([col, (v) => v === val]);
              return query;
            },
            in(col, vals) {
              filters.push([col, (v) => vals.includes(v)]);
              return query;
            },
            then(resolve) {
              resolve(fail ? { data: null, error: fail } : { data: rows.filter((r) => filters.every(([c, match]) => match(r[c]))).slice(0, MAX_ROWS), error: null });
            },
          };
          return query;
        },
        async upsert(input, { onConflict, ignoreDuplicates } = {}) {
          if (fail) return { error: fail };
          onWrite?.(table);
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

  it("keeps (and then merges) a bookmark made while the merge was running", async () => {
    seedGuest({ bookmarks: [{ item_id: "A", exported_at: null }] });
    const tables = {};
    let injected = false;
    const client = fakeClient(tables, {
      onWrite: () => {
        if (injected) return;
        injected = true;
        // The app is still in guest mode mid-merge -- a click lands here.
        localStorage.setItem(
          GUEST_BOOKMARKS_KEY,
          JSON.stringify([...loadGuestBookmarks(), { item_id: "B", exported_at: null }])
        );
      },
    });
    expect(await mergeGuestData(client, "u1")).toEqual({ merged: true });
    expect(tables.saved_items.map((r) => r.item_id)).toEqual(["A", "B"]);
    expect(loadGuestBookmarks()).toEqual([]);
  });

  it("never lets a guest status overwrite a further-along account one, however big the account", async () => {
    seedGuest({ progress: { "word:日本": "new" } });
    // 1500 unrelated rows ahead of the one that matters: a whole-table read
    // capped at 1000 wouldn't see it.
    const tables = {
      user_progress: [
        ...Array.from({ length: 1500 }, (_, i) => ({ user_id: "u1", item_type: "word", item_id: `w${i}`, status: "new" })),
        { user_id: "u1", item_type: "word", item_id: "日本", status: "known" },
      ],
    };
    await mergeGuestData(fakeClient(tables), "u1");
    expect(tables.user_progress.find((r) => r.item_id === "日本").status).toBe("known");
  });

  it("ignores malformed guest data instead of throwing", async () => {
    localStorage.setItem(GUEST_PROGRESS_KEY, "null");
    localStorage.setItem(GUEST_GROUPS_KEY, JSON.stringify([{ name: "N5" }, null, { words: ["x"] }]));
    const tables = {};
    await expect(mergeGuestData(fakeClient(tables), "u1")).resolves.toEqual({ merged: true });
    expect(tables.groups.map((g) => g.name)).toEqual(["N5"]);
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
