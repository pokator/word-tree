import { describe, expect, it } from "vitest";
import { buildCollections } from "./collections";
import { tagsFor } from "../anki/ankiSync";

const DATASET = {
  WORDS_BY_TEXT: { 日本: {}, 日本語: {}, 毎日: {}, 本当: {} },
  KANJI: {
    日: { jlpt: 5 },
    本: { jlpt: 5 },
    語: { jlpt: 5 },
    毎: { jlpt: 5 },
    当: { jlpt: 3 },
  },
};

describe("buildCollections", () => {
  const bookmarks = [
    { item_id: "日本", found_from: "日本語" },
    { item_id: "日本語", found_from: "日本語" },
    { item_id: "毎日", found_from: "日本語" },
    { item_id: "本当", found_from: null },
    { item_id: "gone", found_from: null }, // no longer in the dictionary
  ];
  const cols = buildCollections(DATASET, bookmarks, (w) => (w === "本当" ? ["N3 exam"] : []));
  const find = (kind, key) => cols.find((c) => c.kind === kind && c.key === key);

  it("slices bookmarks by tag, JLPT, shared kanji, and found-from, in that order", () => {
    expect(cols.map((c) => `${c.kind}:${c.key}`)).toEqual([
      "tag:N3 exam",
      "jlpt:n5",
      "jlpt:n3",
      "kanji:日",
      "kanji:本",
      "from:日本語",
    ]);
    expect(find("kanji", "日").words).toEqual(["日本", "日本語", "毎日"]);
    // The word a search started from isn't "found from" itself.
    expect(find("from", "日本語").words).toEqual(["日本", "毎日"]);
  });

  it("skips kanji that only one bookmark uses", () => {
    expect(find("kanji", "語")).toBeUndefined();
    expect(find("kanji", "毎")).toBeUndefined();
  });

  it("names each collection by the exact Anki tag its cards carry", () => {
    const cardTags = tagsFor({ kanji: ["本", "当"], jlpt: "n3", userTags: ["N3 exam"] });
    expect(cardTags).toContain(find("tag", "N3 exam").ankiTag);
    expect(cardTags).toContain(find("jlpt", "n3").ankiTag);
    expect(cardTags).toContain(find("kanji", "本").ankiTag);
  });
});
