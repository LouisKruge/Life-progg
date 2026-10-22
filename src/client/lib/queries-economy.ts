import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  AccountView,
  DebtView,
  RedemptionView,
  RewardBudget,
  RewardView,
  ScenarioResult,
  TransactionView,
  VaultData,
  WealthOverview,
} from "@shared/types";
import { api } from "./api";
import { useInvalidateProgress } from "./queries";
import { toast } from "./toast";

const onError = (err: Error) => toast.error(err.message);

// ---------- Rewards Vault ----------

export const useVault = (includeArchived = false) =>
  useQuery({ queryKey: ["vault", includeArchived], queryFn: () => api.get<VaultData>(`/api/vault?includeArchived=${includeArchived}`) });

export type RewardFormValues = {
  name: string;
  description: string;
  imageUrl: string | null;
  category: string;
  creditPrice: number;
  estimatedCostCents: number;
  quantityAvailable: number | null;
  repeatable: boolean;
  isWishlisted: boolean;
};

/** Generic mutation that refreshes all progress-related data and reports errors as toasts. */
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

export const useSaveReward = () =>
  useAction(
    ({ id, values }: { id?: number; values: Partial<RewardFormValues> & { status?: "active" | "archived" } }) =>
      id ? api.patch<RewardView>(`/api/rewards/${id}`, values) : api.post<RewardView>("/api/rewards", values),
    (r, v) => toast.info(v.id ? "Reward updated" : "Reward added", r.name),
  );

export const useDeleteReward = () =>
  useAction(
    (id: number) => api.del<{ deleted: boolean; archived: boolean }>(`/api/rewards/${id}`),
    (r) => toast.info(r.archived ? "Reward archived" : "Reward deleted", r.archived ? "It has redemption history, so it was archived instead." : undefined),
  );

export const useReorderRewards = () => useAction((ids: number[]) => api.post<RewardView[]>("/api/rewards/reorder", { ids }));

type RedeemResult = { redemption: RedemptionView; credits: number; budget: RewardBudget; duplicate: boolean };

export const useRedeem = () =>
  useAction(
    ({ id, requestId }: { id: number; requestId: string }) => api.post<RedeemResult>(`/api/rewards/${id}/redeem`, { requestId }),
    (r) => !r.duplicate && toast.reward(`Redeemed: ${r.redemption.rewardName}`, `−${r.redemption.creditCost} credits · enjoy it`),
  );

export const useCancelRedemption = () =>
  useAction((id: number) => api.post<RedeemResult>(`/api/redemptions/${id}/cancel`), (r) => toast.info("Redemption cancelled", `${r.redemption.creditCost} credits refunded`));

export const useConfirmSpending = () =>
  useAction(
    ({ id, actualCostCents, accountId }: { id: number; actualCostCents?: number; accountId?: number | null }) =>
      api.post<RedeemResult & { overBudget: boolean }>(`/api/redemptions/${id}/confirm`, { actualCostCents, accountId }),
    (r) => (r.overBudget ? toast.error("Spending recorded", "This month's reward allowance is now overspent.") : toast.info("Spending confirmed", r.redemption.rewardName)),
  );

// ---------- Wealth Center ----------

export const useWealth = (month?: string) =>
  useQuery({ queryKey: ["wealth", "overview", month ?? "current"], queryFn: () => api.get<WealthOverview>(`/api/wealth${month ? `?month=${month}` : ""}`) });

export const useTransactions = (month: string) =>
  useQuery({ queryKey: ["wealth", "transactions", month], queryFn: () => api.get<TransactionView[]>(`/api/transactions?month=${month}`) });

export const useAccounts = () => useQuery({ queryKey: ["wealth", "accounts"], queryFn: () => api.get<AccountView[]>("/api/accounts") });

export const useCreateAccount = () =>
  useAction((v: { name: string; type: AccountView["type"]; openingBalanceCents?: number }) => api.post<AccountView>("/api/accounts", v), (a) => toast.info("Account added", a.name));

export const useArchiveAccount = () => useAction(({ id, archived }: { id: number; archived: boolean }) => api.patch<AccountView>(`/api/accounts/${id}`, { archived }));

export const useCreateTransaction = () =>
  useAction(
    (v: { accountId: number; amountCents: number; kind: "deposit" | "withdrawal" | "income" | "expense"; category?: string; description?: string; occurredOn?: string; status?: "confirmed" | "pending" }) =>
      api.post<TransactionView>("/api/transactions", v),
    (t) => toast.info(t.status === "pending" ? "Planned transaction added" : "Transaction recorded", t.description || t.category),
  );

export const useConfirmTransaction = () => useAction((id: number) => api.post<TransactionView>(`/api/transactions/${id}/confirm`), () => toast.info("Marked as cleared"));
export const useDeleteTransaction = () => useAction((id: number) => api.del<unknown>(`/api/transactions/${id}`), () => toast.info("Planned transaction removed"));
export const useCorrectTransaction = () => useAction((id: number) => api.post<TransactionView>(`/api/transactions/${id}/correct`), () => toast.info("Correction added"));

export const useCreateRecurring = () =>
  useAction(
    (v: { accountId: number; name: string; amountCents: number; kind: "income" | "expense" | "deposit" | "withdrawal"; category?: string; dayOfMonth: number }) => api.post("/api/recurring", v),
    () => toast.info("Recurring transaction added", "This month's entry is waiting for your confirmation."),
  );
export const useToggleRecurring = () => useAction(({ id, active }: { id: number; active: boolean }) => api.patch(`/api/recurring/${id}`, { active }));

export const useSetBudget = () => useAction((v: { month: string; category: string; limitCents: number | null }) => api.put("/api/budgets", v));

export const useCreateDebt = () =>
  useAction((v: { name: string; kind?: string; startingBalanceCents: number; interestRateBps?: number; minimumPaymentCents?: number }) => api.post<DebtView>("/api/debts", v), (d) => toast.info("Debt added", d.name));

export const useDebtPayment = () =>
  useAction(
    ({ id, ...body }: { id: number; amountCents: number; fromAccountId?: number | null; note?: string }) => api.post<DebtView>(`/api/debts/${id}/payments`, body),
    (d) => (d.status === "paid_off" ? toast.reward(`Debt-free: ${d.name}`, "Paid off in full.") : toast.info("Repayment recorded", d.name)),
  );

export const useArchiveDebt = () => useAction(({ id, archived }: { id: number; archived: boolean }) => api.patch<DebtView>(`/api/debts/${id}`, { archived }));

export const useScenario = () =>
  useMutation({ mutationFn: (v: { monthlySavingsCents: number; extraDebtPaymentCents?: number }) => api.post<ScenarioResult>("/api/wealth/scenario", v), onError });
