import { gzipSync } from "node:zlib";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { meaningFromSenses, restoreMeaning, slimWord } from "./datasetFormat";

const FULL = {
  word: "七十",
  reading: "しちじゅう",
  meaning: "seventy, 70",
  senses: [{ gloss: ["seventy", "70"], pos: ["numeric"] }],
  rank: 3,
};
const KANA_ONLY = { word: "ああ", meaning: "like that, so" };

describe("datasetFormat", () => {
  it("drops meaning only when senses can rebuild it, and restores it exactly", () => {
    expect(slimWord(FULL)).not.toHaveProperty("meaning");
    expect(slimWord(KANA_ONLY)).toEqual(KANA_ONLY);
    expect(restoreMeaning(slimWord(FULL))).toEqual(FULL);
  });

  it("joins glosses with commas and senses with semicolons", () => {
    expect(meaningFromSenses([{ gloss: ["a", "b"] }, { gloss: ["c"] }])).toBe("a, b; c");
  });
});

describe("datasetWorker", () => {
  const KANJI = { 七: { char: "七", meaning: "seven" } };
  const body = (data) => gzipSync(Buffer.from(JSON.stringify(data)));
  const files = { "kanji.gzjson": body(KANJI), "words.gzjson": body([slimWord(FULL)]) };

  beforeAll(async () => {
    await import("./datasetWorker.js");
  });
  afterEach(() => vi.unstubAllGlobals());

  // The worker module listens on `self` (the jsdom window here) and answers
  // through self.postMessage.
  function run(message, fetchImpl) {
    const fetchMock = vi.fn(fetchImpl);
    vi.stubGlobal("fetch", fetchMock);
    return new Promise((resolve) => {
      vi.spyOn(self, "postMessage").mockImplementationOnce((reply) => resolve({ reply, fetchMock }));
      self.dispatchEvent(new MessageEvent("message", { data: message }));
    });
  }
  const serve = (url) => new Response(files[url.split("/").pop()]);

  it("loads from the CDN and restores meaning", async () => {
    const { reply, fetchMock } = await run({ baseUrl: "/", cdnBaseUrl: "https://cdn.test/" }, async (url) => serve(url));
    expect(reply.ok).toBe(true);
    expect(reply.WORDS).toEqual([FULL]);
    expect(reply.KANJI).toEqual(KANJI);
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
      "https://cdn.test/data/kanji.gzjson",
      "https://cdn.test/data/words.gzjson",
    ]);
  });

  it("falls back to its own origin when the CDN fails", async () => {
    const { reply, fetchMock } = await run({ baseUrl: "/", cdnBaseUrl: "https://cdn.test/" }, async (url) =>
      url.startsWith("https://cdn.test/") ? new Response("", { status: 503 }) : serve(url),
    );
    expect(reply.ok).toBe(true);
    expect(reply.WORDS).toEqual([FULL]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/data/words.gzjson");
  });

  it("uses only its own origin without a CDN", async () => {
    const { reply, fetchMock } = await run({ baseUrl: "/" }, async (url) => serve(url));
    expect(reply.ok).toBe(true);
    expect(fetchMock.mock.calls.every(([url]) => url.startsWith("/data/"))).toBe(true);
  });
});
