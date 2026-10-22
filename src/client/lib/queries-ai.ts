import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiConversationView, AiDataScope, AiProposalView, PlannerOutput } from "@shared/types";
import { api } from "./api";
import { useInvalidateProgress } from "./queries";
import { toast } from "./toast";

export interface AiStatusView {
  enabled: boolean;
  hasApiKey: boolean;
  model: string;
  scopes: AiDataScope[];
  tools: Array<{ name: string; scope: AiDataScope; writes: boolean }>;
}

export const useAiStatus = () => useQuery({ queryKey: ["ai", "status"], queryFn: () => api.get<AiStatusView>("/api/ai/status") });
export const usePlanner = () => useQuery({ queryKey: ["quests", "planner"], queryFn: () => api.get<PlannerOutput>("/api/ai/planner") });
export const useConversations = () =>
  useQuery({ queryKey: ["ai", "conversations"], queryFn: () => api.get<Array<{ id: number; title: string; mode: string; updatedAt: string }>>("/api/ai/conversations") });
export const useConversation = (id: number | null) =>
  useQuery({ queryKey: ["ai", "conversation", id], queryFn: () => api.get<AiConversationView>(`/api/ai/conversations/${id}`), enabled: id !== null });

export function useSendMessage() {
  const qc = useQueryClient();
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: (v: { conversationId?: number; text: string; mode?: "chat" | "daily_focus" | "weekly_review" }) => api.post<AiConversationView>("/api/ai/messages", v),
    onSuccess: (conv) => {
      qc.setQueryData(["ai", "conversation", conv.id], conv);
      void qc.invalidateQueries({ queryKey: ["ai", "conversations"] });
      invalidate(); // a daily focus updates the dashboard
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDecideProposal(conversationId: number | null) {
  const qc = useQueryClient();
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: ({ id, approve }: { id: number; approve: boolean }) => api.post<AiProposalView>(`/api/ai/proposals/${id}`, { approve }),
    onSuccess: (p) => {
      if (p.status === "approved") toast.reward("Approved", p.resultNote);
      else if (p.status === "failed") toast.error("Couldn't apply it", p.resultNote);
      else toast.info("Proposal rejected");
      void qc.invalidateQueries({ queryKey: ["ai", "conversation", conversationId] });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => api.del(`/api/ai/conversations/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["ai"] }) });
}
