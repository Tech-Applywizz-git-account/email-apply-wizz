import { describe, expect, it } from "vitest";

describe("resolveManagerFromTeamName", () => {
  it("maps 'Ramakrishnaa Tejavath Team' to Ramakrishnaa", async () => {
    const { resolveManagerFromTeamName } = await import("./resolveManagerFromTeamName");
    expect(resolveManagerFromTeamName("Ramakrishnaa Tejavath Team")).toEqual({
      ok: true,
      manager: { managerName: "Ramakrishnaa Tejavath", managerEmail: "ramakrishnaa.tejavath@applywizz.ai" },
    });
  });

  it("maps 'Balaji Team' to Balaji", async () => {
    const { resolveManagerFromTeamName } = await import("./resolveManagerFromTeamName");
    expect(resolveManagerFromTeamName("Balaji Team")).toEqual({
      ok: true,
      manager: { managerName: "Balaji", managerEmail: "balaji@applywizz.ai" },
    });
  });

  it("maps 'Balaji  Team' (double space, as the Router API sometimes returns) to Balaji", async () => {
    const { resolveManagerFromTeamName } = await import("./resolveManagerFromTeamName");
    expect(resolveManagerFromTeamName("Balaji  Team")).toEqual({
      ok: true,
      manager: { managerName: "Balaji", managerEmail: "balaji@applywizz.ai" },
    });
  });

  it("is case-insensitive and trims surrounding whitespace", async () => {
    const { resolveManagerFromTeamName } = await import("./resolveManagerFromTeamName");
    expect(resolveManagerFromTeamName("  BALAJI TEAM  ")).toEqual({
      ok: true,
      manager: { managerName: "Balaji", managerEmail: "balaji@applywizz.ai" },
    });
    expect(resolveManagerFromTeamName("ramakrishnaa tejavath team")).toEqual({
      ok: true,
      manager: { managerName: "Ramakrishnaa Tejavath", managerEmail: "ramakrishnaa.tejavath@applywizz.ai" },
    });
  });

  it("returns ok:false for an unknown team name without guessing a manager", async () => {
    const { resolveManagerFromTeamName } = await import("./resolveManagerFromTeamName");
    expect(resolveManagerFromTeamName("Some Other Team")).toEqual({ ok: false });
    expect(resolveManagerFromTeamName("")).toEqual({ ok: false });
  });
});
