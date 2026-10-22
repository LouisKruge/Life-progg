// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { QuestInstanceView } from "../../src/shared/types";
import { QuestRow } from "../../src/client/components/quests/QuestRow";

function item(overrides: Partial<QuestInstanceView["quest"]> = {}): QuestInstanceView {
  return {
    instanceId: 7,
    periodKey: "2026-10-22",
    scheduledDate: "2026-10-22",
    status: "pending",
    completion: null,
    quest: {
      id: 3, title: "Read 15 pages", description: "", categoryId: null, kind: "standard", difficulty: "easy",
      xpReward: 50, creditReward: 5, frequency: "daily", recurrenceDays: [], completionRequirements: "",
      verification: "none", dueDate: null, isOptional: false, status: "active", isDemo: false,
      createdAt: "2026-10-22T08:00:00Z", updatedAt: "2026-10-22T08:00:00Z", ...overrides,
    },
  };
}

function renderRow(i: QuestInstanceView) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ul><QuestRow item={i} /></ul>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("QuestRow", () => {
  it("shows the quest and its rewards", () => {
    renderRow(item());
    expect(screen.getByText("Read 15 pages")).toBeInTheDocument();
    expect(screen.getByText("+50 XP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete Read 15 pages" })).toHaveAttribute("aria-pressed", "false");
  });

  it("completes via the API with the anti-CSRF header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ alreadyCompleted: false, delta: { xpGained: 50, creditsGained: 5, levelBefore: 1, levelAfter: 1, leveledUp: false }, character: { rank: "Initiate" } }), { status: 200 }),
    );
    renderRow(item());
    await userEvent.click(screen.getByRole("button", { name: "Complete Read 15 pages" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/instances/7/complete");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ "X-Level-One": "1" });
  });

  it("asks for a note instead of completing blindly when evidence is required", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    renderRow(item({ verification: "note" }));
    await userEvent.click(screen.getByRole("button", { name: "Complete Read 15 pages" }));
    expect(await screen.findByLabelText("What did you do?")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
