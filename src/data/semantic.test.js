import { describe, expect, it, vi } from "vitest";
import { createSemanticStore, shardOf } from "./semantic";

describe("shardOf", () => {
  // Values from shard_of in scripts/semantic/build_neighbours.py -- the two
  // must agree or the app looks for a word in the wrong file.
  it("matches the build script", () => {
    expect(["学校", "桜", "𠮟る", "日本語"].map(shardOf)).toEqual([40, 91, 63, 78]);
  });
});

describe("createSemanticStore", () => {
  function fakeFetch(files) {
    return vi.fn(async (url) => {
      const path = url.replace(/^.*?data\//, "data/");
      if (!(path in files)) throw new Error(`404 ${url}`);
      return files[path];
    });
  }
  const shard = `data/semantic/${String(shardOf("学校")).padStart(3, "0")}.gzjson`;

  it("loads frequency and the shards a word needs, once", async () => {
    const fetchJson = fakeFetch({ "data/frequency.gzjson": { 学校: 366, 生徒: 900 }, [shard]: { 学校: [["生徒", 70]] } });
    const store = createSemanticStore({ fetchJson });
    expect(store.neighboursOf("学校")).toBeUndefined();
    await store.load(["学校"]);
    await store.load(["学校"]);
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(store.freqOf("学校")).toBe(366);
    expect(store.neighboursOf("学校")).toEqual([["生徒", 70]]);
    expect(store.isLoaded(["学校"])).toBe(true);
  });

  it("knows which words have neighbour lists", async () => {
    const store = createSemanticStore({ fetchJson: fakeFetch({ "data/frequency.gzjson": { 学校: 366, 稀語: 200_000 } }) });
    await store.load();
    expect(store.hasNeighbours("学校")).toBe(true);
    expect(store.hasNeighbours("稀語")).toBe(false); // rare and unranked
    expect(store.hasNeighbours("稀語", 12)).toBe(true); // ranked words always do
    expect(store.hasNeighbours("知らない")).toBe(false);
  });

  it("falls back to the next base and can retry after a failure", async () => {
    const fetchJson = vi.fn(async (url) => {
      if (url.startsWith("https://cdn/")) throw new Error("blocked");
      return { 学校: 366 };
    });
    const store = createSemanticStore({ bases: ["https://cdn/", "/"], fetchJson });
    await store.load();
    expect(store.freqOf("学校")).toBe(366);

    const failing = createSemanticStore({ fetchJson: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({}) });
    await expect(failing.load()).rejects.toThrow("offline");
    await expect(failing.load()).resolves.toBeDefined();
  });
});
