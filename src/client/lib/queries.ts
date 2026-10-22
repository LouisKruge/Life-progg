import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BackupInfo,
  Character,
  CompletionResponse,
  DashboardData,
  LifeCategory,
  Quest,
  QuestInstanceView,
  SavingsGoalView,
  Settings,
  TimelineEvent,
} from "@shared/types";
import { api } from "./api";
import { celebrate } from "./celebrate";
import { toast } from "./toast";

export const keys = {
  settings: ["settings"] as const,
  dashboard: ["dashboard"] as const,
  character: ["character"] as const,
  categories: ["categories"] as const,
  quests: (archived: boolean) => ["quests", archived] as const,
  board: ["quest-board"] as const,
  ledger: ["ledger"] as const,
  timeline: ["timeline"] as const,
  backups: ["backups"] as const,
  savings: ["savings-goals"] as const,
  system: ["system"] as const,
};

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api.get<Settings>("/api/settings") });
export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: () => api.get<DashboardData>("/api/dashboard") });
export const useCharacter = () => useQuery({ queryKey: keys.character, queryFn: () => api.get<Character>("/api/character") });
export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: () => api.get<LifeCategory[]>("/api/categories"), staleTime: Infinity });
export const useQuests = (includeArchived = false) =>
  useQuery({ queryKey: keys.quests(includeArchived), queryFn: () => api.get<Quest[]>(`/api/quests?includeArchived=${includeArchived}`) });
export const useQuestBoard = () =>
  useQuery({
    queryKey: keys.board,
    queryFn: () => api.get<{ date: string; today: QuestInstanceView[]; upcoming: QuestInstanceView[] }>("/api/quest-board"),
  });
export const useLedger = () =>
  useQuery({
    queryKey: keys.ledger,
    queryFn: () => api.get<Array<{ id: number; ledger: "xp" | "credits"; amount: number; sourceType: string; note: string; createdAt: string }>>("/api/ledger"),
  });
export const useTimeline = () => useQuery({ queryKey: keys.timeline, queryFn: () => api.get<TimelineEvent[]>("/api/timeline/recent") });
export const useBackups = () => useQuery({ queryKey: keys.backups, queryFn: () => api.get<BackupInfo[]>("/api/backups") });
export const useSavingsGoals = () => useQuery({ queryKey: keys.savings, queryFn: () => api.get<SavingsGoalView[]>("/api/savings-goals") });
export const useSystem = () => useQuery({ queryKey: keys.system, queryFn: () => api.get<{ dataDir: string | null; version: string }>("/api/system") });

/** Progress data touches many screens, so mutations simply refresh everything that shows it. */
export function useInvalidateProgress() {
  const qc = useQueryClient();
  return () => {
    for (const k of [keys.dashboard, keys.character, keys.board, keys.ledger, keys.timeline, keys.savings]) {
      void qc.invalidateQueries({ queryKey: k });
    }
    // Progress can unlock achievements and skills and change wealth and vault figures.
    for (const prefix of ["quests", "vault", "wealth", "achievements", "skills", "seasons", "timeline-feed", "ai"]) {
      void qc.invalidateQueries({ queryKey: [prefix] });
    }
  };
}

const onError = (err: Error) => toast.error(err.message);

export function useCompleteQuest() {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: ({ instanceId, evidenceNote, confirmed }: { instanceId: number; evidenceNote?: string; confirmed?: boolean }) =>
      api.post<CompletionResponse>(`/api/instances/${instanceId}/complete`, { evidenceNote, confirmed }),
    onSuccess: (res) => {
      if (!res.alreadyCompleted) {
        toast.reward(`+${res.delta.xpGained} XP`, res.delta.creditsGained ? `+${res.delta.creditsGained} credits` : undefined);
        if (res.delta.leveledUp) celebrate({ level: res.delta.levelAfter, rank: res.character.rank });
      }
      invalidate();
    },
    onError,
  });
}

export function useUndoQuest() {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: (instanceId: number) => api.post<CompletionResponse>(`/api/instances/${instanceId}/undo`),
    onSuccess: (res) => {
      toast.info("Completion undone", `${res.delta.xpGained} XP · ${res.delta.creditsGained} credits`);
      invalidate();
    },
    onError,
  });
}

export function useSkipQuest() {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: ({ instanceId, skipped }: { instanceId: number; skipped: boolean }) =>
      api.post<QuestInstanceView>(`/api/instances/${instanceId}/skip`, { skipped }),
    onSuccess: invalidate,
    onError,
  });
}

export type QuestFormValues = Omit<Quest, "id" | "status" | "isDemo" | "createdAt" | "updatedAt">;

export function useSaveQuest() {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: Partial<QuestFormValues> }) =>
      id ? api.patch<Quest>(`/api/quests/${id}`, values) : api.post<Quest>("/api/quests", values),
    onSuccess: (q, vars) => {
      toast.info(vars.id ? "Quest updated" : "Quest created", q.title);
      invalidate();
    },
    onError,
  });
}

export function useArchiveQuest() {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) => api.post<Quest>(`/api/quests/${id}/archive`, { archived }),
    onSuccess: (q) => {
      toast.info(q.status === "archived" ? "Quest archived" : "Quest restored", q.title);
      invalidate();
    },
    onError,
  });
}

export function useRescheduleQuest() {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: ({ id, dueDate }: { id: number; dueDate: string }) => api.post<Quest>(`/api/quests/${id}/reschedule`, { dueDate }),
    onSuccess: (q) => {
      toast.info("Quest rescheduled", q.title);
      invalidate();
    },
    onError,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: (patch: Partial<Settings> & { anthropicApiKey?: string | null }) => api.patch<Settings>("/api/settings", patch),
    onSuccess: (s) => {
      qc.setQueryData(keys.settings, s);
      invalidate();
    },
    onError,
  });
}

export function useOnboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => api.post<Settings>("/api/onboarding", input),
    onSuccess: (s) => {
      qc.setQueryData(keys.settings, s);
      void qc.invalidateQueries();
    },
    onError,
  });
}

export function useSavingsEntry() {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: ({ goalId, amountCents, description }: { goalId: number; amountCents: number; description?: string }) =>
      api.post<SavingsGoalView>(`/api/savings-goals/${goalId}/entries`, { amountCents, description }),
    onSuccess: () => {
      toast.info("Savings updated", "Recorded as a confirmed transaction.");
      invalidate();
    },
    onError,
  });
}

export function useCreateSavingsGoal() {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: (input: { name: string; targetCents: number; monthlyContributionCents: number | null; startingBalanceCents?: number }) =>
      api.post<SavingsGoalView>("/api/savings-goals", input),
    onSuccess: (g) => {
      toast.info("Savings goal created", g.name);
      invalidate();
    },
    onError,
  });
}

export function useDemoData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: "load" | "remove") => (action === "load" ? api.post("/api/demo-data") : api.del("/api/demo-data")),
    onSuccess: (_r, action) => {
      toast.info(action === "load" ? "Demo data loaded" : "Demo data removed");
      void qc.invalidateQueries();
    },
    onError,
  });
}

export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BackupInfo>("/api/backups"),
    onSuccess: (b) => {
      toast.info("Backup created", b.fileName);
      void qc.invalidateQueries({ queryKey: keys.backups });
    },
    onError,
  });
}

export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileName: string) => api.post<{ restored: string; safetyBackup: string }>("/api/backups/restore", { fileName }),
    onSuccess: (r) => {
      toast.info("Backup restored", `Safety copy saved as ${r.safetyBackup}`);
      void qc.invalidateQueries();
    },
    onError,
  });
}

export function useImportJson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => api.post<{ restored: string; safetyBackup: string; rows: number }>("/api/import", data),
    onSuccess: (r) => {
      toast.info(`Imported ${r.rows} records`, `Previous data saved as ${r.safetyBackup}`);
      void qc.invalidateQueries();
    },
    onError,
  });
}
