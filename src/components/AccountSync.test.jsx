import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/context";

const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("../lib/supabaseClient", () => ({ isSupabaseConfigured: true, supabase: { auth } }));

const { default: AccountSync } = await import("./AccountSync");

function renderAs(user) {
  return render(
    <AuthContext.Provider value={{ user, session: null, loading: false }}>
      <AccountSync />
    </AuthContext.Provider>
  );
}

describe("AccountSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.signInWithOtp.mockResolvedValue({ error: null });
    auth.verifyOtp.mockResolvedValue({ error: null });
  });

  it("emails a code, then verifies the typed code for that address", async () => {
    renderAs(null);
    await userEvent.type(screen.getByLabelText("Email"), "me@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "me@example.com",
      options: expect.objectContaining({ shouldCreateUser: true }),
    });

    const codeInput = await screen.findByLabelText("Sign-in code");
    expect(screen.getByRole("button", { name: /Resend code in \d+s/ })).toBeDisabled();
    await userEvent.type(codeInput, "12a34 56");
    expect(codeInput).toHaveValue("123456"); // non-digits dropped
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: "me@example.com", token: "123456", type: "email" });
  });

  it("explains a rejected code in plain words and stays on the code step", async () => {
    auth.verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    renderAs(null);
    await userEvent.type(screen.getByLabelText("Email"), "me@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.type(await screen.findByLabelText("Sign-in code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn't work");
    expect(screen.getByLabelText("Sign-in code")).toBeInTheDocument();
  });

  it("when signed in, shows who's synced and signs out", async () => {
    renderAs({ id: "u1", email: "me@example.com" });
    expect(screen.getByText("me@example.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("locks the form after a correct code until sign-in completes", async () => {
    renderAs(null);
    await userEvent.type(screen.getByLabelText("Email"), "me@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.type(await screen.findByLabelText("Sign-in code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("button", { name: "Signing in…" })).toBeDisabled();
  });

  it("keeps every digit of a pasted code with spaces", async () => {
    renderAs(null);
    await userEvent.type(screen.getByLabelText("Email"), "me@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    const input = await screen.findByLabelText("Sign-in code");
    await userEvent.click(input);
    await userEvent.paste(" 123 456");
    expect(input).toHaveValue("123456");
  });

  it("starts over at the email step after signing out", async () => {
    const view = renderAs(null);
    await userEvent.type(screen.getByLabelText("Email"), "me@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByLabelText("Sign-in code");
    const rerender = (user) =>
      view.rerender(
        <AuthContext.Provider value={{ user, session: null, loading: false }}>
          <AccountSync />
        </AuthContext.Provider>
      );
    rerender({ id: "u1", email: "me@example.com" });
    rerender(null);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sign-in code")).not.toBeInTheDocument();
  });

  it("doesn't call a bad email address a bad code", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { message: "Unable to validate email address: invalid format" } });
    renderAs(null);
    await userEvent.type(screen.getByLabelText("Email"), "me@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid format");
  });
});
