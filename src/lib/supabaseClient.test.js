import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.hoisted(() => vi.fn(() => ({ tag: "client" })));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

async function freshModule({ configured = true } = {}) {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", configured ? "https://abc.supabase.co" : "");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", configured ? "key" : "");
  return import("./supabaseClient");
}

describe("supabaseClient", () => {
  beforeEach(() => {
    localStorage.clear();
    createClient.mockClear();
    window.history.replaceState(null, "", "/");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates nothing until asked, then creates one client", async () => {
    const mod = await freshModule();
    expect(mod.supabase).toBeNull();
    expect(createClient).not.toHaveBeenCalled();

    const [a, b] = await Promise.all([mod.loadSupabase(), mod.loadSupabase()]);
    expect(a).toBe(b);
    expect(mod.supabase).toBe(a);
    expect(createClient).toHaveBeenCalledTimes(1);
    await expect(mod.supabaseReady).resolves.toBe(a);
  });

  it("stays null when not configured", async () => {
    const mod = await freshModule({ configured: false });
    await expect(mod.loadSupabase()).resolves.toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    localStorage.setItem("sb-abc-auth-token", "{}");
    expect(mod.needsSupabaseNow()).toBe(false);
  });

  it("is needed from the start only with a saved session or a sign-in link", async () => {
    const mod = await freshModule();
    localStorage.setItem("word-tree:theme", "dark");
    window.history.replaceState(null, "", "/explore/学校?mode=meaning&expand=k:学");
    expect(mod.needsSupabaseNow()).toBe(false);

    localStorage.setItem("sb-abc-auth-token", "{}");
    expect(mod.needsSupabaseNow()).toBe(true);
    localStorage.clear();
    expect(mod.needsSupabaseNow()).toBe(false);

    window.history.replaceState(null, "", "/#access_token=abc&type=magiclink");
    expect(mod.needsSupabaseNow()).toBe(true);
    window.history.replaceState(null, "", "/?code=abc");
    expect(mod.needsSupabaseNow()).toBe(true);
  });
});
