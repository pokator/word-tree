import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAnki } from "./fakeAnkiConnect";
import { DECK_NAME } from "./ankiConnect";
import {
  MODEL_NAME,
  collectionQuery,
  dueCount,
  noteFields,
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
    expect(await pushBookmarks(items)).toMatchObject({ added: 2, retagged: 0 });

    expect(anki.state.models[MODEL_NAME]).toEqual(["Word", "Reading", "Meaning", "Kanji"]);
    expect(anki.state.decks.has(DECK_NAME)).toBe(true);
    const [first, second] = anki.state.notes;
    expect(first.fields.Word).toBe("日本語");
    expect(first.fields.Kanji).toContain('<b class="moto-k-char">日</b>');
    // Found-from is the word itself for the first -- no self-referencing tag.
    expect(first.tags).toEqual(["moto", "moto::kanji::日", "moto::kanji::本", "moto::kanji::語", "moto::jlpt::n5"]);
    expect(second.tags).toContain("moto::from::日本語");
    expect(second.tags).toContain("moto::jlpt::n3");
  });

  it("is idempotent, and retags only moto:: tags, keeping the user's own", async () => {
    const items = syncItemsFor(DATASET, [{ item_id: "本当", found_from: null }]);
    await pushBookmarks(items);
    anki.state.notes[0].tags.push("my-hand-tag");
    expect(await pushBookmarks(items)).toMatchObject({ added: 0, retagged: 0 });

    const retagged = syncItemsFor(DATASET, [{ item_id: "本当", found_from: null }], () => ["travel"]);
    expect(await pushBookmarks(retagged)).toMatchObject({ added: 0, retagged: 1 });
    expect(anki.state.notes).toHaveLength(1);
    expect(anki.state.notes[0].tags).toContain("my-hand-tag");
    expect(anki.state.notes[0].tags).toContain("moto::tag::travel");
  });
});

describe("noteFields", () => {
  const AGERU = {
    word: "上げる",
    reading: "あげる",
    meaning: "to raise, to elevate; to give",
    senses: [
      { gloss: ["to raise", "to elevate"], pos: ["Ichidan verb", "transitive verb"] },
      {
        gloss: ["to give"],
        pos: ["Ichidan verb", "transitive verb"],
        misc: ["polite (teineigo) language"],
        info: ["to someone of equal status"],
      },
    ],
  };

  it("numbers senses, bolds each gloss, and keeps usage notes beside it", () => {
    const { Meaning } = noteFields(AGERU);
    expect(Meaning).toContain('<ol class="moto-senses">');
    expect(Meaning).toContain("<b>to raise; to elevate</b>");
    expect(Meaning).toContain("<b>to give</b>");
    expect(Meaning).toContain("polite (teineigo) language, to someone of equal status");
  });

  it("prints a part of speech only where it changes between senses", () => {
    expect(noteFields(AGERU).Meaning.match(/moto-pos/g)).toHaveLength(1);
    const changing = {
      word: "x",
      senses: [
        { gloss: ["a"], pos: ["adverb (fukushi)"] },
        { gloss: ["b"], pos: ["noun (common) (futsuumeishi)"] },
      ],
    };
    expect(noteFields(changing).Meaning).toContain(">adverb<");
    expect(noteFields(changing).Meaning).toContain(">noun<");
  });

  it("shortens dictionary-schema labels, collapsing ones that become the same", () => {
    const { Meaning } = noteFields({
      word: "x",
      senses: [{ gloss: ["a"], pos: ["Godan verb with 'ru' ending", "Godan verb with 'su' ending", "unclassified"] }],
    });
    expect(Meaning).toContain(">Godan verb, unclassified<");
  });

  it("shows a loanword's origin, and a lone sense without a list", () => {
    const { Meaning } = noteFields({ word: "パン", senses: [{ gloss: ["bread"], pos: [], origin: "Portuguese" }] });
    expect(Meaning).toBe('<b>bread</b><div class="moto-note">From Portuguese</div>');
  });

  it("falls back to the flat meaning when an entry has no senses", () => {
    expect(noteFields({ word: "x", meaning: "one; two" }).Meaning).toBe(
      '<ol class="moto-senses"><li><b>one</b></li><li><b>two</b></li></ol>'
    );
    expect(noteFields({ word: "x" }).Meaning).toBe("");
  });

  it("lists every meaning, on'yomi and kun'yomi of each kanji, omitting what's missing", () => {
    const { Kanji } = noteFields({ word: "上校" }, [
      { char: "上", meaning: "Above; Up", onyomi: ["じょう", "しょう"], kunyomi: ["うえ", "あ.げる"] },
      { char: "校", meaning: "School", onyomi: ["こう"], kunyomi: [] },
    ]);
    expect(Kanji).toContain("Above; Up");
    const reading = (r) => `<span class="moto-k-reading">${r}</span>`;
    expect(Kanji).toContain(`<span class="moto-k-label">On</span>${reading("じょう")}、${reading("しょう")}`);
    expect(Kanji).toContain(`<span class="moto-k-label">Kun</span>${reading("うえ")}、${reading("あ.げる")}`);
    expect(Kanji.match(/moto-k-label/g)).toHaveLength(3);
  });

  it("escapes dictionary text", () => {
    const { Meaning } = noteFields({ word: "x", senses: [{ gloss: ['a <b> "c"'], pos: [] }] });
    expect(Meaning).toBe("<b>a &lt;b&gt; &quot;c&quot;</b>");
  });
});

describe("upgrading what's already in Anki", () => {
  afterEach(() => vi.unstubAllGlobals());

  // Exactly what earlier versions wrote, as read back from a real collection.
  const OLD_CSS = `.card { font-family: "Hiragino Sans", "Noto Sans CJK JP", "Yu Gothic", sans-serif; text-align: center; color: #1c1a14; background: #e7e2d1; }
.night_mode .card { color: #f5f6fa; background: #0b0c10; }
.moto-word { font-size: 56px; margin: 24px 0 8px; }
.moto-reading { font-size: 26px; margin-top: 12px; }
.moto-meaning { font-size: 20px; margin-top: 8px; }
.moto-kanji { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 16px; margin-top: 20px; font-size: 15px; opacity: 0.85; }
.moto-kanji b { font-size: 22px; font-weight: 500; margin-right: 4px; }`;
  const oldNote = (fields = {}) => ({
    modelName: MODEL_NAME,
    deck: DECK_NAME,
    tags: ["moto", "moto::kanji::本", "moto::kanji::当", "moto::jlpt::n3"],
    fields: {
      Word: "本当",
      Reading: "ほんとう",
      Meaning: "truth; reality",
      Kanji: "<span><b>本</b>book</span><span><b>当</b>hit</span>",
      ...fields,
    },
    cards: [{ interval: 40, type: 2, queue: 2 }],
  });
  const MODELS = { [MODEL_NAME]: ["Word", "Reading", "Meaning", "Kanji"] };
  const ITEMS = () => syncItemsFor(DATASET, [{ item_id: "本当" }]);

  it("restyles an untouched note type, making the word bold", async () => {
    install({ models: MODELS, styles: { [MODEL_NAME]: OLD_CSS } });
    await pushBookmarks(ITEMS());
    expect(anki.state.styles[MODEL_NAME]).toMatch(/\.moto-word \{[^}]*font-weight: 700/);
  });

  it("leaves a note type the user restyled alone", async () => {
    install({ models: MODELS, styles: { [MODEL_NAME]: ".card { color: pink; }" } });
    await pushBookmarks(ITEMS());
    expect(anki.state.styles[MODEL_NAME]).toBe(".card { color: pink; }");
    expect(anki.state.calls).not.toContain("updateModelStyling");
  });

  it("refreshes old notes in place, keeping the card and its history", async () => {
    install({ models: MODELS, notes: [oldNote()] });
    const { noteId } = anki.state.notes[0];
    expect(await pushBookmarks(ITEMS())).toMatchObject({ added: 0, refreshed: 1 });
    expect(anki.state.notes).toHaveLength(1);
    const [note] = anki.state.notes;
    expect(note.noteId).toBe(noteId);
    expect(note.cards[0]).toMatchObject({ interval: 40, type: 2 });
    expect(note.fields.Meaning).toContain("<b>truth</b>");
    expect(note.fields.Kanji).toContain("moto-k-char");
  });

  it("recognises an old field whose entities Anki's editor normalised", async () => {
    const dataset = { ...DATASET, WORDS_BY_TEXT: { 本当: { word: "本当", reading: "ほんとう", meaning: 'say "hi"' } } };
    install({ models: MODELS, notes: [oldNote({ Meaning: 'say "hi"' })] });
    await pushBookmarks(syncItemsFor(dataset, [{ item_id: "本当" }]));
    expect(anki.state.notes[0].fields.Meaning).toContain("<b>say &quot;hi&quot;</b>");
  });

  it("keeps a field the user edited, while refreshing the one they didn't", async () => {
    install({ models: MODELS, notes: [oldNote({ Meaning: "my own definition" })] });
    await pushBookmarks(ITEMS());
    const { fields } = anki.state.notes[0];
    expect(fields.Meaning).toBe("my own definition");
    expect(fields.Kanji).toContain("moto-k-char");
  });

  it("does nothing on the next sync", async () => {
    install({ models: MODELS, notes: [oldNote()] });
    await pushBookmarks(ITEMS());
    anki.state.calls.length = 0;
    expect((await pushBookmarks(ITEMS())).refreshed).toBe(0);
    expect(anki.state.calls).not.toContain("multi");
  });
});

describe("pushBookmarks resilience", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports words Anki refuses instead of dropping them silently", async () => {
    install({
      models: { [MODEL_NAME]: ["Word", "Reading", "Meaning", "Kanji"] },
      // Not matchable as a Moto note by its Word (e.g. corrupted), but still
      // a duplicate to Anki's own check.
      notes: [{ modelName: MODEL_NAME, deck: DECK_NAME, fields: { Word: "日本語" }, tags: [] }],
    });
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url, init) => {
      const body = JSON.parse(init.body);
      if (body.action === "findNotes") return { json: async () => ({ result: [], error: null }) };
      return realFetch(url, init);
    });
    const result = await pushBookmarks(syncItemsFor(DATASET, [{ item_id: "日本語" }, { item_id: "本当" }]));
    expect(result).toMatchObject({ added: 1, rejected: ["日本語"] });
  });

  it("recognises a Moto note the user reformatted in Anki, and still adds other bookmarks", async () => {
    install({
      models: { [MODEL_NAME]: ["Word", "Reading", "Meaning", "Kanji"] },
      notes: [{ modelName: MODEL_NAME, deck: DECK_NAME, fields: { Word: "<b>日本語</b>" }, tags: ["moto"] }],
    });
    const items = syncItemsFor(DATASET, [{ item_id: "日本語" }, { item_id: "本当" }]);
    const result = await pushBookmarks(items);
    expect(result.added).toBe(1);
    expect(anki.state.notes.map((n) => n.fields.Word)).toEqual(["<b>日本語</b>", "本当"]);
  });

  it("skips words it's told to (marked known)", async () => {
    install();
    const items = syncItemsFor(DATASET, [{ item_id: "日本語" }, { item_id: "本当" }]);
    expect(await pushBookmarks(items, { skipWords: new Set(["本当"]) })).toMatchObject({ added: 1, retagged: 0 });
    expect(anki.state.notes.map((n) => n.fields.Word)).toEqual(["日本語"]);
  });

  it("doesn't retag forever over a case-only difference", async () => {
    install({
      models: { [MODEL_NAME]: ["Word", "Reading", "Meaning", "Kanji"] },
      notes: [{ modelName: MODEL_NAME, deck: DECK_NAME, fields: { Word: "本当" }, tags: [] }],
    });
    const items = syncItemsFor(DATASET, [{ item_id: "本当" }], () => ["Verbs"]);
    await pushBookmarks(items);
    anki.state.notes[0].tags = anki.state.notes[0].tags.map((t) => t.replace("Verbs", "verbs"));
    expect((await pushBookmarks(items)).retagged).toBe(0);
  });
});

describe("collectionQuery", () => {
  it("quotes the tag so search syntax in a user tag stays literal", () => {
    expect(collectionQuery("moto::tag::N4_(hard)")).toBe('"tag:moto::tag::N4_(hard)"');
    expect(tagsFor({ userTags: ['say "hi"*'] })).toContain("moto::tag::say__hi__");
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
    const { statuses, foreign } = await pullStatuses(["日本語", "本当", "英語", "未知"]);
    expect(Object.fromEntries(statuses)).toEqual({ 日本語: "known", 本当: "new", 英語: "known" });
    expect(foreign).toEqual(new Set(["日本語", "本当", "英語"]));
  });

  it("matches words behind furigana and &nbsp;, and only fetches cards for real matches", async () => {
    install({
      models: { Sentences: ["Sentence", "Translation"], Vocab: ["Expression", "Meaning"] },
      notes: [
        { modelName: "Vocab", deck: "V", fields: { Expression: "日本語[にほんご]" }, cards: [{ interval: 40, type: 2, queue: 2 }] },
        { modelName: "Vocab", deck: "V", fields: { Expression: "日本&nbsp;" }, cards: [{ interval: 30, type: 2, queue: 2 }] },
        ...Array.from({ length: 300 }, (_, i) => ({
          modelName: "Sentences",
          deck: "S",
          fields: { Sentence: `日本の${i}番目の文`, Translation: "x" },
          cards: [{ interval: 90, type: 2, queue: 2 }],
        })),
      ],
    });
    const { statuses } = await pullStatuses(["日本語", "日本"]);
    expect(Object.fromEntries(statuses)).toEqual({ 日本語: "known", 日本: "known" });
    // Sentences merely containing 日本 never reach cardsInfo.
    const cardsInfoCalls = anki.state.calls.filter((a) => a === "cardsInfo").length;
    expect(cardsInfoCalls).toBe(1);
  });

  it("stays under Anki's search-depth limit with many words and note types", async () => {
    const models = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`Type${i}`, [`Field${i}`, "Back"]]));
    install({ models, notes: [{ modelName: "Type7", deck: "D", fields: { Field7: "日本語" }, cards: [{ interval: 30, type: 2, queue: 2 }] }] });
    const words = ["日本語", ...Array.from({ length: 60 }, (_, i) => `語${i}`)];
    const { statuses } = await pullStatuses(words);
    expect(statuses.get("日本語")).toBe("known");
  });

  it("counts cards Anki would show today, new ones included", async () => {
    install({
      notes: [{ modelName: "Basic", deck: DECK_NAME, fields: { Front: "a" }, cards: [{ interval: 0, type: 0, queue: 0 }] }],
    });
    expect(await dueCount()).toBe(1);
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
