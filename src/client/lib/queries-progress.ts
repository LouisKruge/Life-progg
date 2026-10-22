import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AchievementView, SeasonView, SkillTreeView, TimelinePage } from "@shared/types";
import { api } from "./api";
import { useInvalidateProgress } from "./queries";
import { toast } from "./toast";

const onError = (err: Error) => toast.error(err.message);

function useAction<TVars, TResult>(fn: (v: TVars) => Promise<TResult>, success?: (r: TResult, v: TVars) => void) {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      success?.(r, v);
      invalidate();
    },
    onError,
  });
}

export const useAchievements = () => useQuery({ queryKey: ["achievements"], queryFn: () => api.get<AchievementView[]>("/api/achievements") });
export const useSkills = () => useQuery({ queryKey: ["skills"], queryFn: () => api.get<SkillTreeView[]>("/api/skills") });

export interface UnseenUnlock {
  kind: "achievement" | "skill";
  id: number;
  name: string;
  detail: string;
  tier?: string;
}
// Shares the "achievements" prefix so every progress mutation re-checks for new unlocks.
export const useUnseenUnlocks = () => useQuery({ queryKey: ["achievements", "unseen"], queryFn: () => api.get<UnseenUnlock[]>("/api/unlocks/unseen") });

export function useMarkUnlocksSeen() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.post("/api/unlocks/seen"), onSuccess: () => qc.setQueryData(["achievements", "unseen"], []) });
}

export const useCreateCustomAchievement = () =>
  useAction((v: { name: string; description: string; category: AchievementView["category"]; tier: AchievementView["tier"] }) => api.post<AchievementView>("/api/achievements", v), (a) => toast.info("Achievement added", a.name));
export const useUnlockAchievement = () => useAction(({ id, evidence }: { id: number; evidence: string }) => api.post<AchievementView>(`/api/achievements/${id}/unlock`, { evidence }));
export const useDeleteAchievement = () => useAction((id: number) => api.del(`/api/achievements/${id}`), () => toast.info("Achievement removed"));

export const useSeasons = () => useQuery({ queryKey: ["seasons"], queryFn: () => api.get<SeasonView[]>("/api/seasons") });

export type SeasonFormValues = { name: string; startDate: string; endDate?: string; theme?: string; celebration?: string; goals?: Array<{ title: string; isPrimary?: boolean }>; activate?: boolean };
export const useCreateSeason = () => useAction((v: SeasonFormValues) => api.post<SeasonView>("/api/seasons", v), (s) => toast.info(s.status === "active" ? "Season started" : "Season planned", s.name));
export const useUpdateSeason = () => useAction(({ id, ...v }: { id: number } & Partial<SeasonFormValues>) => api.patch<SeasonView>(`/api/seasons/${id}`, v), () => toast.info("Season updated"));
export const useSeasonAction = () =>
  useAction(
    ({ id, action }: { id: number; action: "activate" | "complete" | "archive" | "unarchive" }) =>
      action === "activate" || action === "complete"
        ? api.post<SeasonView>(`/api/seasons/${id}/${action}`)
        : api.post<SeasonView>(`/api/seasons/${id}/archive`, { archived: action === "archive" }),
    (s, v) => (v.action === "complete" ? toast.reward(`Season complete: ${s.name}`, s.celebration ? `Time to celebrate: ${s.celebration}` : "Well done.") : toast.info(`Season ${v.action === "activate" ? "started" : v.action + "d"}`, s.name)),
  );
export const useAddSeasonGoal = () => useAction(({ seasonId, ...v }: { seasonId: number; title: string; isPrimary?: boolean }) => api.post<SeasonView>(`/api/seasons/${seasonId}/goals`, v));
export const useUpdateSeasonGoal = () =>
  useAction(({ id, ...v }: { id: number; title?: string; isPrimary?: boolean; status?: "open" | "achieved" | "dropped" }) => api.patch<SeasonView>(`/api/season-goals/${id}`, v));
export const useSaveReview = () =>
  useAction(({ seasonId, ...v }: { seasonId: number; wins: string; challenges: string; nextFocus: string; rating: number | null }) => api.put<SeasonView>(`/api/seasons/${seasonId}/review`, v), () => toast.info("Weekly review saved"));

export interface TimelineFilter {
  types: string[];
  categoryId: number | null;
  from: string | null;
  to: string | null;
}
export const useTimelineFeed = (f: TimelineFilter) =>
  useQuery({
    queryKey: ["timeline-feed", f],
    queryFn: () => {
      const p = new URLSearchParams({ limit: "500" });
      if (f.types.length) p.set("types", f.types.join(","));
      if (f.categoryId) p.set("categoryId", String(f.categoryId));
      if (f.from) p.set("from", f.from);
      if (f.to) p.set("to", f.to);
      return api.get<TimelinePage>(`/api/timeline?${p}`);
    },
  });
export const useAddNote = () => useAction((v: { title: string; detail?: string; kind?: "note" | "event" }) => api.post("/api/timeline/notes", v), () => toast.info("Added to your timeline"));
export const useDeleteNote = () => useAction((id: number) => api.del(`/api/timeline/${id}`));
export const useSnapshot = () => useAction(() => api.post("/api/timeline/snapshot", {}), () => toast.info("Snapshot saved", "Look back on it any time in the timeline."));
