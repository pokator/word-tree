import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..") + "/";
const html = readFileSync(`${root}index.html`, "utf8");
const doc = new DOMParser().parseFromString(html, "text/html");
const meta = (attr, key) =>
  doc.head.querySelector(`meta[${attr}="${key}"]`)?.getAttribute("content");

describe("index.html crawler/link-preview tags", () => {
  it("has a real title and description", () => {
    expect(doc.title).toMatch(/Moto/);
    expect(doc.title.length).toBeGreaterThan(10);
    const description = meta("name", "description");
    expect(description?.length).toBeGreaterThan(50);
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("has Open Graph tags with an absolute 1200x630 image", () => {
    for (const key of ["og:type", "og:url", "og:title", "og:description", "og:image"]) {
      expect(meta("property", key), key).toBeTruthy();
    }
    expect(meta("property", "og:image")).toMatch(/^https:\/\/moto\.souravbanerjee\.com\//);
    expect(meta("property", "og:image:width")).toBe("1200");
    expect(meta("property", "og:image:height")).toBe("630");
  });

  it("has Twitter card tags", () => {
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
    expect(meta("name", "twitter:image")).toBe(meta("property", "og:image"));
  });

  it("has a canonical URL on the production domain", () => {
    expect(doc.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://moto.souravbanerjee.com/",
    );
  });

  it("has valid JSON-LD", () => {
    const ld = JSON.parse(doc.head.querySelector('script[type="application/ld+json"]').textContent);
    expect(ld["@type"]).toBe("WebApplication");
  });

  it("has crawler-visible content without JavaScript", () => {
    expect(html).toMatch(/<noscript>[\s\S]*学校[\s\S]*<\/noscript>/);
  });

  it("loads Umami only on the production domain", () => {
    const umami = doc.head.querySelector('script[src="https://cloud.umami.is/script.js"]');
    expect(umami?.getAttribute("data-website-id")).toBeTruthy();
    expect(umami?.getAttribute("data-domains")).toBe("moto.souravbanerjee.com");
  });
});
