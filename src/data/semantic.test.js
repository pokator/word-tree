import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { createSemanticStore, decodeShard, SHARDS, shardOf } from "./semantic";
import { encodeShard } from "./semanticTestUtils";

describe("shardOf", () => {
  // Values from shard_of in scripts/semantic/build_neighbours.py -- the two
  // must agree or the app looks for a word in the wrong file.
  it("matches the build script", () => {
    expect(["学校", "桜", "𠮟る", "日本語"].map(shardOf)).toEqual([936, 987, 831, 846]);
  });
});

describe("decodeShard", () => {
  it("reads ids that take several bytes", () => {
    const vocab = Array.from({ length: 20_000 }, (_, i) => `w${i}`);
    const lists = { w19999: [["w0", 80], ["w300", 100]], w5: [["w19999", 35]] };
    expect(Object.fromEntries(decodeShard(encodeShard(lists, vocab), vocab))).toEqual(lists);
  });
});

describe("createSemanticStore", () => {
  const FREQUENCY = { 学校: 366, 生徒: 900, 孤語: 200_000 };
  const vocab = Object.keys(FREQUENCY);
  const shard = (word, lists) => [`data/semantic/${String(shardOf(word)).padStart(4, "0")}.gzbin`, encodeShard(lists, vocab)];
  function fakeFetch(files) {
    return vi.fn(async (url) => {
      const path = url.replace(/^.*?data\//, "data/");
      if (!(path in files)) throw new Error(`404 ${url}`);
      return files[path];
    });
  }
  const frequencyOnly = () => fakeFetch({ "data/frequency.gzjson": FREQUENCY });

  it("loads frequency and the shards a word needs, once", async () => {
    const fetchJson = frequencyOnly();
    const fetchBytes = fakeFetch(Object.fromEntries([shard("学校", { 学校: [["生徒", 70]] })]));
    const store = createSemanticStore({ fetchJson, fetchBytes });
    expect(store.neighboursOf("学校")).toBeUndefined();
    await store.load(["学校"]);
    await store.load(["学校"]);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(store.freqOf("学校")).toBe(366);
    expect(store.neighboursOf("学校")).toEqual([["生徒", 70]]);
    expect(store.isLoaded(["学校"])).toBe(true);
  });

  it("gives every word it knows the benefit of the doubt until its shard loads", async () => {
    const fetchBytes = fakeFetch(Object.fromEntries([shard("孤語", {}), shard("学校", { 学校: [["生徒", 70]] })]));
    const store = createSemanticStore({ fetchJson: frequencyOnly(), fetchBytes });
    await store.load();
    expect(store.hasNeighbours("学校")).toBe(true);
    expect(store.hasNeighbours("孤語")).toBe(true);
    expect(store.hasNeighbours("知らない")).toBe(false);

    await store.load(["孤語", "学校"]);
    expect(store.hasNeighbours("学校")).toBe(true);
    expect(store.hasNeighbours("孤語")).toBe(false); // its row is absent: an empty list
    expect(store.neighboursOf("孤語")).toEqual([]);
  });

  it("falls back to the next base and can retry after a failure", async () => {
    const fetchJson = vi.fn(async (url) => {
      if (url.startsWith("https://cdn/")) throw new Error("blocked");
      return FREQUENCY;
    });
    const store = createSemanticStore({ bases: ["https://cdn/", "/"], fetchJson });
    await store.load();
    expect(store.freqOf("学校")).toBe(366);

    const failing = createSemanticStore({ fetchJson: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({}) });
    await expect(failing.load()).rejects.toThrow("offline");
    await expect(failing.load()).resolves.toBeDefined();
  });

  it("can retry a shard that failed", async () => {
    const fetchBytes = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(encodeShard({ 学校: [["生徒", 70]] }, vocab));
    const store = createSemanticStore({ fetchJson: frequencyOnly(), fetchBytes });
    await expect(store.load(["学校"])).rejects.toThrow("offline");
    await store.load(["学校"]);
    expect(store.neighboursOf("学校")).toEqual([["生徒", 70]]);
  });
});

describe("the data this repo ships", () => {
  const dir = "public/data";
  const frequency = JSON.parse(gunzipSync(readFileSync(`${dir}/frequency.gzjson`)).toString("utf8"));
  const vocab = Object.keys(frequency);
  const rowsOf = (word) => {
    const name = `${String(shardOf(word)).padStart(4, "0")}.gzbin`;
    return decodeShard(gunzipSync(readFileSync(`${dir}/semantic/${name}`)), vocab);
  };

  it("has every shard, and nothing else", () => {
    expect(readdirSync(`${dir}/semantic`).sort()).toEqual(
      Array.from({ length: SHARDS }, (_, n) => `${String(n).padStart(4, "0")}.gzbin`)
    );
  });

  it("numbers words most frequent first, as the shards assume", () => {
    expect(vocab.every((w, i) => i === 0 || frequency[vocab[i - 1]] <= frequency[w])).toBe(true);
  });

  it("gives rarer words neighbours, and keeps common words' lists", () => {
    // 広東語 is far past the frequency cutoff the lists used to have.
    expect(frequency["広東語"]).toBeGreaterThan(60_000);
    expect(rowsOf("広東語").get("広東語").slice(0, 2)).toEqual([["台湾語", 79], ["中国語", 79]]);
    expect(rowsOf("学校").get("学校").length).toBeGreaterThan(0);
    expect(rowsOf("学校").get("学校").every(([w, similarity]) => frequency[w] != null && similarity <= 100)).toBe(true);
  });
});
