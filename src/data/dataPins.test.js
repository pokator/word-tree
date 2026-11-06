import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import pins from "./dataPins.json";

// The object id git has for a path at a commit, which changes only if its
// contents do.
const idAt = (commit, path) => execFileSync("git", ["rev-parse", `${commit}:${path}`], { encoding: "utf8" }).trim();

describe("data pins", () => {
  // Production loads these files from jsDelivr at the pinned commit, so
  // regenerating one without moving its pin would leave the site on old data.
  it.each([
    ["dictionary", "public/data/words.gzjson"],
    ["dictionary", "public/data/kanji.gzjson"],
    ["meaning", "public/data/frequency.gzjson"],
    ["meaning", "public/data/semantic"],
  ])("%s pin still has the current %s", (group, path) => {
    expect(idAt(pins[group], path)).toBe(idAt("HEAD", path));
  });
});
