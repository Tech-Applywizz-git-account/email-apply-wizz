import { resolveManagerFromTeamName } from "@/lib/managerMapping/resolveManagerFromTeamName";
import type { CaCapacityApiRecord, NormalizeCaResult } from "@/lib/managerMapping/types";

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeCaRecord(raw: CaCapacityApiRecord): NormalizeCaResult {
  const caId = toTrimmedString(raw.ca_id);
  if (!caId) return { ok: false, reason: "missing_ca_id" };

  const caName = toTrimmedString(raw.name);
  if (!caName) return { ok: false, reason: "missing_name" };

  const rawEmail = toTrimmedString(raw.email);
  if (!rawEmail) return { ok: false, reason: "missing_email" };

  const teamName = toTrimmedString(raw.team_name) ?? "";
  const managerResult = resolveManagerFromTeamName(teamName);
  if (!managerResult.ok) return { ok: false, reason: "unmapped_team" };

  return {
    ok: true,
    record: {
      ca_id: caId,
      ca_name: caName,
      ca_email: rawEmail.toLowerCase(),
      team_name: teamName,
      manager_name: managerResult.manager.managerName,
      manager_email: managerResult.manager.managerEmail,
      system_name: toTrimmedString(raw.system_name),
      designation: toTrimmedString(raw.designation),
      is_active: true,
    },
  };
}
