import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";

// Not a behavioral test suite -- a regression tripwire. If a change breaks
// mounting the app entirely (a bad import, a hook called outside its
// provider, a render-time crash), this fails loudly instead of only
// surfacing as a blank page in manual QA.
describe("App", () => {
  it("renders the header, search bar, and graph panel without crashing", async () => {
    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    expect(screen.getByRole("heading", { name: /元/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    expect(await screen.findByText(/Explore/)).toBeInTheDocument();
  });
});
