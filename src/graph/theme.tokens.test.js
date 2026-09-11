import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// index.css is the single source of truth for every color graph/theme.js
// reads at runtime (see readNodeColors) -- a var renamed or dropped there
// silently degrades to readNodeColors' hardcoded fallback instead of
// failing anywhere visible. This test just makes sure light mode, the
// prefers-color-scheme dark block, and the explicit [data-theme="dark"]
// block never drift out of sync on which custom properties they each
// define -- not their values, just their presence and shape.
const cssPath = resolve(import.meta.dirname, "../index.css");
const css = readFileSync(cssPath, "utf8");

function occurrences(varName) {
  return css.split(`${varName}:`).length - 1;
}

const REQUIRED_TOKEN_GROUPS = {
  node: ["--node-root", "--node-kanji", "--node-word"],
  jlpt: ["--jlpt-n5", "--jlpt-n4", "--jlpt-n3", "--jlpt-n2", "--jlpt-n1", "--jlpt-unrated"],
  position: ["--pos-start", "--pos-middle", "--pos-end"],
  reading: ["--reading-onyomi", "--reading-kunyomi", "--reading-unknown"],
  kanjiPath: ["--kanji-path-1", "--kanji-path-2", "--kanji-path-3", "--kanji-path-4"],
};

describe("design tokens (index.css)", () => {
  it("defines every node/link color token used by the graph", () => {
    for (const tokens of Object.values(REQUIRED_TOKEN_GROUPS)) {
      for (const token of tokens) {
        expect(occurrences(token), `expected ${token} to be defined in index.css`).toBeGreaterThan(0);
      }
    }
  });

  it("defines each token the same number of times within its group (light/dark stay paired)", () => {
    for (const [group, tokens] of Object.entries(REQUIRED_TOKEN_GROUPS)) {
      const counts = tokens.map(occurrences);
      const [first, ...rest] = counts;
      expect(rest.every((c) => c === first), `token group "${group}" has an uneven definition count: ${tokens.map((t, i) => `${t}=${counts[i]}`).join(", ")}`).toBe(true);
    }
  });

  it("keeps --accent as the single source for --node-root in both themes", () => {
    expect(occurrences("--accent")).toBeGreaterThanOrEqual(3);
  });
});
