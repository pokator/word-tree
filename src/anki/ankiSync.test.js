import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAnki } from "./fakeAnkiConnect";
import { DECK_NAME } from "./ankiConnect";
import {
  MODEL_NAME,
  dueCount,
  pullStatuses,
  pushBookmarks,
  statusFromCard,
  syncItemsFor,
  tagsFor,
} from "./ankiSync";

const DATASET = {
  WORDS_BY_TEXT: {
    日本語: { word: "日本語", reading: "にほんご", meaning: "Japanese language" },
    本当: { word: "本当", reading: "ほんとう", meaning: "truth; reality" },
  },
  KANJI: {
    日: { char: "日", meaning: "day; sun", jlpt: 5 },
    本: { char: "本", meaning: "book; origin", jlpt: 5 },
    語: { char: "語", meaning: "word; language", jlpt: 5 },
    当: { char: "当", meaning: "hit; right", jlpt: 3 },
  },
};

let anki;
function install(options) {
  anki = createFakeAnki(options);
  vi.stubGlobal("fetch", anki.fetch);
}

describe("tagsFor", () => {
  it("builds collection tags Anki accepts (no spaces, no stray ::)", () => {
    expect(
      tagsFor({ kanji: ["日", "本"], jlpt: "n5", foundFrom: "日本 語", userTags: ["N4 exam", "a::b"] })
    ).toEqual(["moto", "moto::kanji::日", "moto::kanji::本", "moto::jlpt::n5", "moto::from::日本_語", "moto::tag::N4_exam", "moto::tag::a_b"]);
  });
});

describe("statusFromCard", () => {
  it.each([
    [{ type: 0, queue: 0, interval: 0 }, "new"],
    [{ type: 1, queue: 1, interval: -600 }, "learning"], // in learning steps
    [{ type: 2, queue: 2, interval: 5 }, "learning"],
    [{ type: 2, queue: 2, interval: 21 }, "known"],
    [{ type: 2, queue: -1, interval: 40 }, "known"], // suspended but mature
  ])("%j -> %s", (card, expected) => {
    expect(statusFromCard(card)).toBe(expected);
  });
});

describe("pushBookmarks", () => {
  beforeEach(() => install());
  afterEach(() => vi.unstubAllGlobals());

  it("creates the Moto note type and deck, then one tagged note per bookmark", async () => {
    const items = syncItemsFor(DATASET, [{ item_id: "日本語", found_from: "日本語" }, { item_id: "本当", found_from: "日本語" }]);
    expect(await pushBookmarks(items)).toEqual({ added: 2, retagged: 0 });

    expect(anki.state.models[MODEL_NAME]).toEqual(["Word", "Reading", "Meaning", "Kanji"]);
    expect(anki.state.decks.has(DECK_NAME)).toBe(true);
    const [first, second] = anki.state.notes;
    expect(first.fields.Word).toBe("日本語");
    expect(first.fields.Kanji).toContain("<b>日</b>day");
    // Found-from is the word itself for the first -- no self-referencing tag.
    expect(first.tags).toEqual(["moto", "moto::kanji::日", "moto::kanji::本", "moto::kanji::語", "moto::jlpt::n5"]);
    expect(second.tags).toContain("moto::from::日本語");
    expect(second.tags).toContain("moto::jlpt::n3");
  });

  it("is idempotent, and retags only moto:: tags, keeping the user's own", async () => {
    const items = syncItemsFor(DATASET, [{ item_id: "本当", found_from: null }]);
    await pushBookmarks(items);
    anki.state.notes[0].tags.push("my-hand-tag");
    expect(await pushBookmarks(items)).toEqual({ added: 0, retagged: 0 });

    const retagged = syncItemsFor(DATASET, [{ item_id: "本当", found_from: null }], () => ["travel"]);
    expect(await pushBookmarks(retagged)).toEqual({ added: 0, retagged: 1 });
    expect(anki.state.notes).toHaveLength(1);
    expect(anki.state.notes[0].tags).toContain("my-hand-tag");
    expect(anki.state.notes[0].tags).toContain("moto::tag::travel");
  });
});

describe("pullStatuses", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads status from Moto cards and from the first field of the user's other decks", async () => {
    install({
      models: { [MODEL_NAME]: ["Word", "Reading", "Meaning", "Kanji"], "Core 2k": ["Expression", "Meaning"] },
      notes: [
        { modelName: MODEL_NAME, deck: DECK_NAME, fields: { Word: "日本語" }, cards: [{ interval: 3, type: 2, queue: 2 }] },
        // Same word also mature in another deck: the better status wins.
        { modelName: "Core 2k", deck: "Core", fields: { Expression: "日本語", Meaning: "x" }, cards: [{ interval: 60, type: 2, queue: 2 }] },
        { modelName: "Core 2k", deck: "Core", fields: { Expression: "<b>本当</b>", Meaning: "x" }, cards: [{ interval: 0, type: 0, queue: 0 }] },
        // A different word whose Meaning mentions 日本語 must not count.
        { modelName: "Core 2k", deck: "Core", fields: { Expression: "英語", Meaning: "日本語" }, cards: [{ interval: 90, type: 2, queue: 2 }] },
      ],
    });
    const statuses = await pullStatuses(["日本語", "本当", "英語", "未知"]);
    expect(Object.fromEntries(statuses)).toEqual({ 日本語: "known", 本当: "new", 英語: "known" });
  });

  it("counts due Moto cards", async () => {
    install({
      notes: [
        { modelName: "Basic", deck: DECK_NAME, fields: { Front: "a" }, cards: [{ interval: 3, type: 2, queue: 2, due: true }] },
        { modelName: "Basic", deck: DECK_NAME, fields: { Front: "b" }, cards: [{ interval: 3, type: 2, queue: 2, due: false }] },
        { modelName: "Basic", deck: "Other", fields: { Front: "c" }, cards: [{ interval: 3, type: 2, queue: 2, due: true }] },
      ],
    });
    expect(await dueCount()).toBe(1);
  });
});
