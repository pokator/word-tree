import { describe, expect, it } from "vitest";
import { nodeRadius } from "./layout";
import { layoutUntidiness, organizeLayout } from "./organizeLayout";

const word = (w, extra = {}) => [`word:${w}`, { id: `word:${w}`, type: "word", word: w, ...extra }];
const kanji = (c) => [`kanji:${c}`, { id: `kanji:${c}`, type: "kanji", char: c }];
const link = (a, b, kind) => ({ source: a, target: b, ...(kind ? { kind } : {}) });

function star(rootWord, hubs, leavesPerHub) {
  const nodes = [word(rootWord, { isRoot: true })];
  const links = [];
  hubs.forEach((h) => {
    nodes.push(kanji(h));
    links.push(link(`word:${rootWord}`, `kanji:${h}`));
    for (let i = 0; i < leavesPerHub; i++) {
      const w = `${h}語${i}`;
      nodes.push(word(w));
      links.push(link(`kanji:${h}`, `word:${w}`));
    }
  });
  return { nodes, links };
}
const graphOf = ({ nodes, links }) => ({ nodes: new Map(nodes), links });

const SHAPES = {
  "one node": () => graphOf({ nodes: [word("語", { isRoot: true })], links: [] }),
  "a small star": () => graphOf(star("日本語", ["日", "本", "語"], 0)),
  "three full hubs": () => graphOf(star("日本語", ["日", "本", "語"], 8)),
  "a big hub": () => graphOf(star("語", ["語"], 40)),
  "hubs sharing words": () => {
    const g = star("学校", ["学", "校"], 8);
    for (const w of ["小学校", "中学校", "高校"]) {
      g.nodes.push(word(w));
      g.links.push(link("kanji:学", `word:${w}`), link("kanji:校", `word:${w}`));
    }
    return graphOf(g);
  },
  "a meaning web": () => {
    const words = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛"];
    const nodes = [word("根", { isRoot: true }), ...words.map((w) => word(w))];
    const links = words.map((w) => link("word:根", `word:${w}`, "semantic"));
    words.forEach((w, i) => {
      links.push(link(`word:${w}`, `word:${words[(i + 1) % words.length]}`, "semantic"));
    });
    return graphOf({ nodes, links });
  },
  "a triangle with the root": () =>
    graphOf({
      nodes: [word("根", { isRoot: true }), word("甲"), word("乙")],
      links: [link("word:根", "word:甲"), link("word:根", "word:乙"), link("word:甲", "word:乙")],
    }),
  // 新郎 and 新婦 are linked, and their neighbour lists overlap by this much.
  "linked words sharing many others": () => {
    const others = Array.from({ length: 16 }, (_, i) => `他${i}`);
    const nodes = [word("新郎", { isRoot: true }), word("新婦"), word("末", {}), ...others.map((w) => word(w))];
    const links = [link("word:新郎", "word:新婦"), link("word:新婦", "word:末")];
    for (const w of others) links.push(link("word:新郎", `word:${w}`), link("word:新婦", `word:${w}`));
    return graphOf({ nodes, links });
  },
  "a word with a pipe in it": () => {
    const g = star("日|語", ["日", "語"], 3);
    g.nodes.push(word("日語"));
    g.links.push(link("kanji:日", "word:日語"), link("kanji:語", "word:日語"));
    return graphOf(g);
  },
  "a long chain": () => {
    const chain = ["一", "二", "三", "四", "五", "六"];
    const nodes = [word("根", { isRoot: true }), ...chain.map((w) => word(w))];
    const links = chain.map((w, i) => link(i ? `word:${chain[i - 1]}` : "word:根", `word:${w}`));
    return graphOf({ nodes, links });
  },
  "a node nothing links to": () =>
    graphOf({ nodes: [word("根", { isRoot: true }), word("甲"), word("離")], links: [link("word:根", "word:甲")] }),
};

function bubbleOverlaps(graph, positions) {
  const ids = [...graph.nodes.keys()];
  const found = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = positions.get(ids[i]);
      const b = positions.get(ids[j]);
      const needed = nodeRadius(graph.nodes.get(ids[i])) + nodeRadius(graph.nodes.get(ids[j]));
      if (Math.hypot(a.x - b.x, a.y - b.y) < needed) found.push(`${ids[i]}/${ids[j]}`);
    }
  }
  return found;
}

describe("organizeLayout", () => {
  describe.each(Object.keys(SHAPES))("%s", (name) => {
    const graph = SHAPES[name]();
    const positions = organizeLayout(graph, { width: 800, height: 600 });

    it("places every node at a real position", () => {
      expect([...positions.keys()].sort()).toEqual([...graph.nodes.keys()].sort());
      for (const p of positions.values()) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
    });

    it("leaves no bubbles overlapping", () => {
      expect(bubbleOverlaps(graph, positions)).toEqual([]);
    });

    it("comes out the same every time", () => {
      const again = organizeLayout(SHAPES[name](), { width: 800, height: 600 });
      expect([...again]).toEqual([...positions]);
    });
  });

  it("keeps trees free of crossings and of lines behind nodes", () => {
    for (const name of ["a small star", "three full hubs", "a long chain"]) {
      const graph = SHAPES[name]();
      expect([name, layoutUntidiness(graph, organizeLayout(graph))]).toEqual([name, 0]);
    }
  });

  it("keeps a 40-word fan free of crossings, with at most one line grazing a neighbour", () => {
    const graph = SHAPES["a big hub"]();
    expect(layoutUntidiness(graph, organizeLayout(graph))).toBeLessThanOrEqual(2);
  });

  it("gives each hub's words a side of their own", () => {
    const graph = SHAPES["three full hubs"]();
    const positions = organizeLayout(graph);
    const hubs = ["日", "本", "語"];
    for (const h of hubs) {
      for (let i = 0; i < 8; i++) {
        const leaf = positions.get(`word:${h}語${i}`);
        const distanceTo = (other) => {
          const hub = positions.get(`kanji:${other}`);
          return Math.hypot(leaf.x - hub.x, leaf.y - hub.y);
        };
        for (const other of hubs) if (other !== h) expect(distanceTo(h)).toBeLessThan(distanceTo(other));
      }
    }
  });

  it("puts a shared word between the nodes it connects, not out past one of them", () => {
    const graph = SHAPES["hubs sharing words"]();
    const positions = organizeLayout(graph);
    const a = positions.get("kanji:学");
    const b = positions.get("kanji:校");
    const span = Math.hypot(a.x - b.x, a.y - b.y);
    for (const w of ["小学校", "中学校", "高校"]) {
      const p = positions.get(`word:${w}`);
      expect(Math.hypot(p.x - a.x, p.y - a.y)).toBeLessThan(span);
      expect(Math.hypot(p.x - b.x, p.y - b.y)).toBeLessThan(span);
    }
    // Three shared words and the root compete for one gap, so a couple of
    // crossings are the price; lines behind nodes (worth 2 each) would add more.
    expect(layoutUntidiness(graph, positions)).toBeLessThanOrEqual(2);
  });

  it("untangles a ring of words linked to each other and the root", () => {
    const graph = SHAPES["a meaning web"]();
    expect(layoutUntidiness(graph, organizeLayout(graph))).toBe(0);
  });

  it("makes a tall viewport's graph taller than wide", () => {
    const graph = SHAPES["three full hubs"]();
    const positions = [...organizeLayout(graph, { width: 390, height: 640 }).values()];
    const spread = (axis) => Math.max(...positions.map((p) => p[axis])) - Math.min(...positions.map((p) => p[axis]));
    expect(spread("y")).toBeGreaterThan(spread("x"));
  });

  it("doesn't let one big branch push the rest of the graph far away", () => {
    // 学校 -> 学 -> 小学校 -> 小 and its words, beside 校 and its words.
    const g = star("学校", ["学", "校"], 8);
    g.nodes.push(word("小学校"), kanji("小"));
    g.links.push(link("kanji:学", "word:小学校"), link("kanji:校", "word:小学校"), link("word:小学校", "kanji:小"));
    for (let i = 0; i < 8; i++) {
      g.nodes.push(word(`小語${i}`));
      g.links.push(link("kanji:小", `word:小語${i}`));
    }
    const graph = graphOf(g);
    const positions = [...organizeLayout(graph, { width: 800, height: 700 }).values()];
    const spread = (axis) => Math.max(...positions.map((p) => p[axis])) - Math.min(...positions.map((p) => p[axis]));
    expect(spread("x")).toBeLessThan(1100);
    expect(spread("y")).toBeLessThan(1100);
  });

  // Well past any graph people build. Not a speed target (real ones take about
  // 0.1s), but a loop that never ends would hang the page on a click.
  it("finishes on a huge graph", () => {
    const hubs = "一二三四五六七八九十".split("");
    const positions = organizeLayout(graphOf(star("根", hubs, 40)), { width: 800, height: 700 });
    expect(positions.size).toBe(411);
  }, 30000);

  it("keeps linked words sharing many others compact", () => {
    const graph = SHAPES["linked words sharing many others"]();
    const positions = [...organizeLayout(graph, { width: 800, height: 700 }).values()];
    const spread = (axis) => Math.max(...positions.map((p) => p[axis])) - Math.min(...positions.map((p) => p[axis]));
    expect(spread("x")).toBeLessThan(900);
    expect(spread("y")).toBeLessThan(900);
  });

  it("stays finite with no viewport to fit", () => {
    const positions = organizeLayout(SHAPES["three full hubs"](), { width: 0, height: 0 });
    for (const p of positions.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  it("copes with an empty graph", () => {
    expect(organizeLayout({ nodes: new Map(), links: [] }).size).toBe(0);
  });
});
