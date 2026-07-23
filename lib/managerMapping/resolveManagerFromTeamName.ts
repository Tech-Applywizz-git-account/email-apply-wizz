export interface ResolvedManager {
  managerName: string;
  managerEmail: string;
}

export type ResolveManagerResult = { ok: true; manager: ResolvedManager } | { ok: false };

const TEAM_MANAGER_MAP: Readonly<Record<string, ResolvedManager>> = {
  "ramakrishnaa tejavath team": {
    managerName: "Ramakrishnaa Tejavath",
    managerEmail: "ramakrishnaa.tejavath@applywizz.ai",
  },
  "balaji team": {
    managerName: "Balaji",
    managerEmail: "balaji@applywizz.ai",
  },
};

function normalizeTeamName(teamName: string): string {
  return teamName.trim().replace(/\s+/g, " ").toLowerCase();
}

export function resolveManagerFromTeamName(teamName: string): ResolveManagerResult {
  const manager = TEAM_MANAGER_MAP[normalizeTeamName(teamName)];
  return manager ? { ok: true, manager } : { ok: false };
}
