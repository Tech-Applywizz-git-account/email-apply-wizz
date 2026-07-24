import { describe, expect, it } from "vitest";

describe("normalizeCaRecord", () => {
  it("builds a normalized record for a mapped team, lowercasing the CA email", async () => {
    const { normalizeCaRecord } = await import("./normalizeCaRecord");
    const result = normalizeCaRecord({
      ca_id: "0441e046-058c-4162-b50f-b6203e89b6de",
      name: "Sai Prasanna",
      email: "SaiPrasanna@ApplyWizz.com",
      designation: "Junior CA",
      system_name: "R03",
      team_name: "Ramakrishnaa Tejavath Team",
    });

    expect(result).toEqual({
      ok: true,
      record: {
        ca_id: "0441e046-058c-4162-b50f-b6203e89b6de",
        ca_name: "Sai Prasanna",
        ca_email: "saiprasanna@applywizz.com",
        team_name: "Ramakrishnaa Tejavath Team",
        manager_name: "Ramakrishnaa Tejavath",
        manager_email: "ramakrishnaa.tejavath@applywizz.ai",
        system_name: "R03",
        designation: "Junior CA",
        is_active: true,
      },
    });
  });

  it("does not rewrite the CA email domain (keeps .com as-is)", async () => {
    const { normalizeCaRecord } = await import("./normalizeCaRecord");
    const result = normalizeCaRecord({
      ca_id: "id-1",
      name: "Test",
      email: "test@applywizz.com",
      team_name: "Balaji Team",
    });
    expect(result).toMatchObject({ ok: true, record: { ca_email: "test@applywizz.com" } });
  });

  it("handles a null system_name", async () => {
    const { normalizeCaRecord } = await import("./normalizeCaRecord");
    const result = normalizeCaRecord({
      ca_id: "id-2",
      name: "Test",
      email: "test@applywizz.ai",
      team_name: "Balaji  Team",
      system_name: null,
    });
    expect(result).toMatchObject({ ok: true, record: { system_name: null } });
  });

  it("returns ok:false with reason unmapped_team for an unknown team", async () => {
    const { normalizeCaRecord } = await import("./normalizeCaRecord");
    expect(
      normalizeCaRecord({ ca_id: "id-3", name: "Test", email: "test@applywizz.ai", team_name: "Some Other Team" }),
    ).toEqual({ ok: false, reason: "unmapped_team" });
  });

  it("returns ok:false with reason missing_ca_id, missing_email, or missing_name", async () => {
    const { normalizeCaRecord } = await import("./normalizeCaRecord");
    expect(normalizeCaRecord({ name: "Test", email: "t@applywizz.ai", team_name: "Balaji Team" })).toEqual({
      ok: false,
      reason: "missing_ca_id",
    });
    expect(normalizeCaRecord({ ca_id: "id-4", email: "t@applywizz.ai", team_name: "Balaji Team" })).toEqual({
      ok: false,
      reason: "missing_name",
    });
    expect(normalizeCaRecord({ ca_id: "id-5", name: "Test", team_name: "Balaji Team" })).toEqual({
      ok: false,
      reason: "missing_email",
    });
  });
});
