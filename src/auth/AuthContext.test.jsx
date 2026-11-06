import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "./useAuth";

const client = vi.hoisted(() => ({ onChange: null, unsubscribe: vi.fn() }));
const auth = vi.hoisted(() => ({
  ready: null,
  resolveReady: null,
  needsNow: false,
  load: vi.fn(),
}));

vi.mock("./mergeGuestData", () => ({ mergeGuestData: vi.fn(() => Promise.resolve()) }));
vi.mock("../lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  get supabaseReady() {
    return auth.ready;
  },
  needsSupabaseNow: () => auth.needsNow,
  loadSupabase: auth.load,
}));

const { AuthProvider } = await import("./AuthContext");

const fakeClient = {
  auth: {
    onAuthStateChange: (cb) => {
      client.onChange = cb;
      return { data: { subscription: { unsubscribe: client.unsubscribe } } };
    },
  },
};

function Show() {
  const { user, loading } = useAuth();
  return <p>{loading ? "loading" : (user?.email ?? "guest")}</p>;
}
const mount = () =>
  render(
    <AuthProvider>
      <Show />
    </AuthProvider>
  );

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.onChange = null;
    auth.ready = new Promise((resolve) => {
      auth.resolveReady = resolve;
    });
    auth.needsNow = false;
    auth.load.mockImplementation(() => {
      auth.resolveReady(fakeClient);
      return Promise.resolve(fakeClient);
    });
  });

  it("treats a visitor with no saved session as a guest, without fetching the client", () => {
    mount();
    expect(screen.getByText("guest")).toBeInTheDocument();
    expect(auth.load).not.toHaveBeenCalled();
  });

  it("restores a saved session, showing loading until the client answers", async () => {
    auth.needsNow = true;
    mount();
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(auth.load).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(client.onChange).toBeTruthy());
    act(() => client.onChange("INITIAL_SESSION", { user: { id: "u1", email: "me@example.com" } }));
    expect(await screen.findByText("me@example.com")).toBeInTheDocument();
  });

  it("picks up a guest's sign-in once the panel has loaded the client", async () => {
    mount();
    expect(screen.getByText("guest")).toBeInTheDocument();
    await act(async () => auth.resolveReady(fakeClient));
    await waitFor(() => expect(client.onChange).toBeTruthy());
    act(() => client.onChange("SIGNED_IN", { user: { id: "u1", email: "me@example.com" } }));
    expect(await screen.findByText("me@example.com")).toBeInTheDocument();
  });

  it("falls back to a guest if the client won't load", async () => {
    auth.needsNow = true;
    auth.load.mockRejectedValue(new Error("offline"));
    mount();
    expect(await screen.findByText("guest")).toBeInTheDocument();
  });

  it("stops listening on unmount, even if the client arrives afterwards", async () => {
    const { unmount } = mount();
    unmount();
    await act(async () => auth.resolveReady(fakeClient));
    expect(client.onChange).toBeNull();
  });
});
