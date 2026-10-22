import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, CreditCard, Landmark, PiggyBank, Plus, Repeat, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import type { AccountType, DebtView, ProjectionPoint, ScenarioResult, TransactionView } from "@shared/types";
import {
  useArchiveDebt,
  useConfirmTransaction,
  useCorrectTransaction,
  useCreateAccount,
  useCreateDebt,
  useCreateRecurring,
  useCreateTransaction,
  useDebtPayment,
  useDeleteTransaction,
  useScenario,
  useSetBudget,
  useToggleRecurring,
  useTransactions,
  useWealth,
} from "@/lib/queries-economy";
import { useSettings } from "@/lib/queries";
import { formatDate, formatMoney, parseMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader, QueryError } from "./common";
import { SavingsEntryDialog, SavingsSetupDialog } from "./Dashboard";

type Tab = "overview" | "transactions" | "budget" | "debts" | "planning";
const TABS: Tab[] = ["overview", "transactions", "budget", "debts", "planning"];

function useMoney() {
  const { data: s } = useSettings();
  return { money: (c: number) => formatMoney(c, s?.currency ?? "ZAR", s?.locale ?? "en-ZA"), currency: s?.currency ?? "ZAR", locale: s?.locale ?? "en-ZA" };
}

/** Parses an optional money field; returns undefined when empty and NaN when invalid. */
function cents(input: string): number | undefined {
  const v = parseMoney(input);
  return v === null ? undefined : v;
}
const validPositive = (v: number | undefined) => v !== undefined && Number.isFinite(v) && v > 0;

export function WealthCenterPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [month, setMonth] = useState<string | undefined>(undefined);
  const { data, error, refetch } = useWealth(month);
  if (error) return <QueryError error={error} retry={refetch} />;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Wealth Center"
        title="Money, made visible"
        description="Actual balances count only confirmed transactions. Scheduled items wait for your confirmation, and every projection is labelled as an estimate."
      />
      <div className="flex items-center justify-between">
        <div className="flex rounded-md border border-border p-0.5 text-sm" role="tablist" aria-label="Wealth sections">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded px-4 py-1.5 capitalize", tab === t ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t}
            </button>
          ))}
        </div>
        {(tab === "transactions" || tab === "budget") && data && (
          <Input type="month" aria-label="Month" value={data.month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-44 [color-scheme:dark]" />
        )}
      </div>
      {!data ? (
        <Skeleton className="h-96" />
      ) : tab === "overview" ? (
        <Overview data={data} />
      ) : tab === "transactions" ? (
        <Transactions month={data.month} accounts={data.accounts} recurring={data.recurring} />
      ) : tab === "budget" ? (
        <Budget data={data} />
      ) : tab === "debts" ? (
        <Debts debts={data.debts} accounts={data.accounts} />
      ) : (
        <Planning data={data} />
      )}
    </div>
  );
}

type Overview = NonNullable<ReturnType<typeof useWealth>["data"]>;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-label">{label}</div>
        <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
        {hint && <div className="mt-1 text-xs text-subtle-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function Overview({ data }: { data: Overview }) {
  const { money, currency } = useMoney();
  const [accountOpen, setAccountOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [entryGoal, setEntryGoal] = useState<number | null>(null);
  const s = data.summary;
  const ef = data.emergencyFund;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Net worth (actual)" value={money(data.netWorthCents)} hint="Confirmed balances minus debt" />
        <Stat label="Total debt" value={money(data.totalDebtCents)} />
        <Stat label={`Income · ${data.month}`} value={money(s.incomeCents)} hint={s.pendingIncomeCents ? `+ ${money(s.pendingIncomeCents)} expected, not yet confirmed` : undefined} />
        <Stat label={`Expenses · ${data.month}`} value={money(s.expensesCents)} hint={s.pendingExpensesCents ? `+ ${money(s.pendingExpensesCents)} scheduled, not yet confirmed` : undefined} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-5">
          <CardHeader><CardTitle className="flex items-center gap-2"><Landmark className="size-3.5" /> Accounts</CardTitle><Button size="sm" variant="secondary" onClick={() => setAccountOpen(true)}><Plus /> Account</Button></CardHeader>
          <CardContent className="pt-3">
            {data.accounts.length === 0 ? (
              <EmptyState icon={Landmark} title="No accounts yet">Add the accounts you want to track. Nothing connects to your bank; you record what happens.</EmptyState>
            ) : (
              <ul className="divide-y divide-border/60">
                {data.accounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="flex-1">
                      <span className="flex items-center gap-2">{a.name}{a.isProtected && <ShieldCheck className="size-3.5 text-muted-foreground" aria-label="Protected" />}</span>
                      <span className="text-xs capitalize text-subtle-foreground">{a.type}{a.pendingCents ? ` · ${money(a.pendingCents)} pending` : ""}</span>
                    </span>
                    <span className="font-medium tabular-nums">{money(a.balanceCents)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-subtle-foreground">Protected accounts (savings, emergency) can never fund rewards or go below zero.</p>
          </CardContent>
        </Card>

        <Card className="col-span-12 xl:col-span-7">
          <CardHeader><CardTitle>Savings projection</CardTitle><span className="text-[10px] tracking-wider text-subtle-foreground uppercase">Estimate · planned contributions</span></CardHeader>
          <CardContent className="h-64 pt-2"><ProjectionChart series={data.projection} money={money} /></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 lg:col-span-4">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-3.5" /> Emergency fund</CardTitle></CardHeader>
          <CardContent className="pt-3">
            {ef.targetCents > 0 ? (
              <>
                <div className="flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums">{money(ef.balanceCents)}</span><span className="text-sm text-muted-foreground">of {money(ef.targetCents)}</span></div>
                <ProgressBar value={ef.balanceCents / ef.targetCents} className="mt-3 h-2" label="Emergency fund progress" />
                <p className="mt-2 text-xs text-subtle-foreground">{ef.months} months × {money(ef.monthlyExpensesCents)} average expenses. Uses accounts of type “emergency”.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Record some expenses (or recurring debit orders) and add an “emergency” account to see a target.</p>
            )}
          </CardContent>
        </Card>
        <Card className="col-span-12 lg:col-span-8">
          <CardHeader><CardTitle className="flex items-center gap-2"><PiggyBank className="size-3.5" /> Savings goals</CardTitle><Button size="sm" variant="secondary" onClick={() => setGoalOpen(true)}><Plus /> Goal</Button></CardHeader>
          <CardContent className="pt-3">
            {data.savingsGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No savings goals yet.</p>
            ) : (
              <ul className="space-y-4">
                {data.savingsGoals.map((g) => (
                  <li key={g.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{g.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground tabular-nums">{money(g.savedCents)} / {money(g.targetCents)}</span>
                        <Button size="sm" variant="ghost" onClick={() => setEntryGoal(g.id)}>Record</Button>
                      </span>
                    </div>
                    <ProgressBar value={g.savedCents / g.targetCents} className="mt-1.5 h-1.5" label={`${g.name} progress`} />
                    <div className="mt-1 text-[11px] text-subtle-foreground">{g.savedCents >= g.targetCents ? "Reached" : g.projectedCompletion ? `Projected ${g.projectedCompletion} (estimate)` : "Set a monthly plan for a projection"}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} currency={currency} />
      <SavingsSetupDialog open={goalOpen} onOpenChange={setGoalOpen} />
      {entryGoal !== null && <SavingsEntryDialog open onOpenChange={(o) => !o && setEntryGoal(null)} goalId={entryGoal} currency={currency} />}
    </div>
  );
}

function ProjectionChart({ series, money }: { series: ProjectionPoint[]; money: (c: number) => string }) {
  if (series.every((p) => p.savingsCents === 0)) return <p className="text-sm text-muted-foreground">Add savings and a monthly savings target (Settings → Monthly plan) to see a projection.</p>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={series.map((p) => ({ ...p, value: p.savingsCents / 100 }))} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="proj" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d4d4d8" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#d4d4d8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1b1d21" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#8b8e96", fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} width={70} tick={{ fill: "#8b8e96", fontSize: 11 }} tickFormatter={(v: number) => `R${Math.round(v / 1000)}k`} />
        <Tooltip contentStyle={{ background: "#1b1d21", border: "1px solid #303238", borderRadius: 8, fontSize: 12 }} formatter={(v) => [money(Number(v) * 100), "Projected savings"]} />
        <Area type="monotone" dataKey="value" stroke="#d4d4d8" strokeDasharray="5 4" strokeWidth={2} fill="url(#proj)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function AccountDialog({ open, onOpenChange, currency }: { open: boolean; onOpenChange: (o: boolean) => void; currency: string }) {
  const create = useCreateAccount();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("cheque");
  const [opening, setOpening] = useState("");
  const o = cents(opening);
  const valid = name.trim() && (o === undefined || Number.isFinite(o));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add account" description="Record the balance as it is today. You'll log changes as they happen.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate({ name: name.trim(), type, openingBalanceCents: o }, { onSuccess: () => { onOpenChange(false); setName(""); setOpening(""); } }); }}>
          <Field label="Name" htmlFor="ac-name"><Input id="ac-name" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FNB Cheque" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="ac-type">
              <NativeSelect id="ac-type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                <option value="cheque">Cheque / everyday</option>
                <option value="savings">Savings (protected)</option>
                <option value="emergency">Emergency fund (protected)</option>
                <option value="investment">Investment</option>
                <option value="cash">Cash</option>
              </NativeSelect>
            </Field>
            <Field label={`Current balance (${currency})`} htmlFor="ac-open"><Input id="ac-open" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!valid || create.isPending}>Add account</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Transactions({ month, accounts, recurring }: { month: string; accounts: Overview["accounts"]; recurring: Overview["recurring"] }) {
  const { money, locale } = useMoney();
  const { data: txs } = useTransactions(month);
  const confirmTx = useConfirmTransaction();
  const del = useDeleteTransaction();
  const correct = useCorrectTransaction();
  const toggle = useToggleRecurring();
  const [addOpen, setAddOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [correcting, setCorrecting] = useState<TransactionView | null>(null);
  const pending = (txs ?? []).filter((t) => t.status === "pending");
  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 xl:col-span-8">
        <CardHeader><CardTitle>Transactions · {month}</CardTitle><Button size="sm" onClick={() => setAddOpen(true)} disabled={!accounts.length}><Plus /> Transaction</Button></CardHeader>
        <CardContent className="pt-3">
          {pending.length > 0 && <p className="mb-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">{pending.length} scheduled item{pending.length > 1 ? "s" : ""} waiting. Scheduled payments are never assumed to have cleared — confirm each one when it actually happens.</p>}
          {!txs ? <Skeleton className="h-40" /> : txs.length === 0 ? (
            <EmptyState icon={CreditCard} title="No transactions this month">{accounts.length ? "Record income, expenses and transfers as they happen." : "Add an account on the Overview tab first."}</EmptyState>
          ) : (
            <ul className="divide-y divide-border/60">
              {txs.map((t) => (
                <li key={t.id} className={cn("flex items-center gap-3 py-2.5 text-sm", t.status === "pending" && "text-muted-foreground")}>
                  <span className="w-20 shrink-0 text-xs text-subtle-foreground">{formatDate(t.occurredOn, locale, { day: "numeric", month: "short" })}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{t.description || t.category || t.kind}</span>
                    <span className="text-xs text-subtle-foreground">{t.accountName} · {t.category || t.kind}{t.recurringId ? " · recurring" : ""}</span>
                  </span>
                  {t.status === "pending" && <Badge variant="outline">Scheduled</Badge>}
                  <span className={cn("w-28 text-right font-medium tabular-nums", t.amountCents < 0 ? "text-muted-foreground" : "text-foreground")}>{t.amountCents > 0 ? "+" : ""}{money(t.amountCents)}</span>
                  <span className="flex w-20 justify-end gap-1">
                    {t.status === "pending" ? (
                      <>
                        <Button size="icon-sm" variant="ghost" aria-label="Confirm it cleared" onClick={() => confirmTx.mutate(t.id)}><Check /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Remove scheduled item" onClick={() => del.mutate(t.id)}><Trash2 /></Button>
                      </>
                    ) : t.kind !== "correction" && t.kind !== "opening_balance" ? (
                      <Button size="icon-sm" variant="ghost" aria-label="Add correction" onClick={() => setCorrecting(t)}><RotateCcw /></Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card className="col-span-12 xl:col-span-4">
        <CardHeader><CardTitle className="flex items-center gap-2"><Repeat className="size-3.5" /> Recurring</CardTitle><Button size="sm" variant="secondary" onClick={() => setRecurringOpen(true)} disabled={!accounts.length}><Plus /> Add</Button></CardHeader>
        <CardContent className="pt-3">
          {recurring.length === 0 ? <p className="text-sm text-muted-foreground">Salary, rent, debit orders and transfers. Each month creates scheduled entries for you to confirm.</p> : (
            <ul className="space-y-2">
              {recurring.map((r) => (
                <li key={r.id} className={cn("flex items-center gap-3 text-sm", !r.active && "opacity-50")}>
                  <span className="flex-1"><span className="block">{r.name}</span><span className="text-xs text-subtle-foreground">Day {r.dayOfMonth} · {r.kind}</span></span>
                  <span className="tabular-nums text-xs">{money(r.amountCents)}</span>
                  <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: r.id, active: !r.active })}>{r.active ? "Pause" : "Resume"}</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <TransactionDialog open={addOpen} onOpenChange={setAddOpen} accounts={accounts} />
      <RecurringDialog open={recurringOpen} onOpenChange={setRecurringOpen} accounts={accounts} />
      <ConfirmDialog open={correcting !== null} onOpenChange={(o) => !o && setCorrecting(null)} title="Add a correction?" description="A reversing entry is added today. The original stays in your history." confirmLabel="Add correction" onConfirm={() => correcting && correct.mutate(correcting.id)} />
    </div>
  );
}

const KINDS = [
  { v: "expense", l: "Expense" },
  { v: "income", l: "Income" },
  { v: "deposit", l: "Deposit / transfer in" },
  { v: "withdrawal", l: "Withdrawal / transfer out" },
] as const;

function TransactionDialog({ open, onOpenChange, accounts }: { open: boolean; onOpenChange: (o: boolean) => void; accounts: Overview["accounts"] }) {
  const create = useCreateTransaction();
  const { currency } = useMoney();
  const [f, setF] = useState({ accountId: "", kind: "expense" as (typeof KINDS)[number]["v"], amount: "", category: "", description: "", date: "", pending: false });
  const amt = cents(f.amount);
  const accountId = Number(f.accountId || accounts[0]?.id);
  const valid = accountId && validPositive(amt);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Record a transaction" description="Enter amounts as positive numbers; the type decides the direction.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate({ accountId, amountCents: amt!, kind: f.kind, category: f.category.trim() || undefined, description: f.description.trim() || undefined, occurredOn: f.date || undefined, status: f.pending ? "pending" : "confirmed" }, { onSuccess: () => { onOpenChange(false); setF({ ...f, amount: "", description: "" }); } }); }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account" htmlFor="tx-acc"><NativeSelect id="tx-acc" value={f.accountId || String(accounts[0]?.id ?? "")} onChange={(e) => setF({ ...f, accountId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</NativeSelect></Field>
            <Field label="Type" htmlFor="tx-kind"><NativeSelect id="tx-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</NativeSelect></Field>
            <Field label={`Amount (${currency})`} htmlFor="tx-amt"><Input id="tx-amt" autoFocus inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Date" htmlFor="tx-date"><Input id="tx-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="[color-scheme:dark]" /></Field>
            <Field label="Category" htmlFor="tx-cat"><Input id="tx-cat" maxLength={40} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="e.g. Groceries" /></Field>
            <Field label="Description" htmlFor="tx-desc"><Input id="tx-desc" maxLength={200} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.pending} onChange={(e) => setF({ ...f, pending: e.target.checked })} className="accent-[#d4d4d8]" /> Planned only (not yet happened)</label>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!valid || create.isPending}>Record</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecurringDialog({ open, onOpenChange, accounts }: { open: boolean; onOpenChange: (o: boolean) => void; accounts: Overview["accounts"] }) {
  const create = useCreateRecurring();
  const { currency } = useMoney();
  const [f, setF] = useState({ accountId: "", kind: "expense" as (typeof KINDS)[number]["v"], name: "", amount: "", category: "", day: "1" });
  const amt = cents(f.amount);
  const accountId = Number(f.accountId || accounts[0]?.id);
  const valid = accountId && f.name.trim() && validPositive(amt) && Number(f.day) >= 1 && Number(f.day) <= 28;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Recurring transaction" description="Creates a scheduled entry each month. You confirm it once it clears.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate({ accountId, kind: f.kind, name: f.name.trim(), amountCents: amt!, category: f.category.trim() || undefined, dayOfMonth: Number(f.day) }, { onSuccess: () => onOpenChange(false) }); }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" htmlFor="rc-name"><Input id="rc-name" autoFocus maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Salary" /></Field>
            <Field label="Account" htmlFor="rc-acc"><NativeSelect id="rc-acc" value={f.accountId || String(accounts[0]?.id ?? "")} onChange={(e) => setF({ ...f, accountId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</NativeSelect></Field>
            <Field label="Type" htmlFor="rc-kind"><NativeSelect id="rc-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</NativeSelect></Field>
            <Field label={`Amount (${currency})`} htmlFor="rc-amt"><Input id="rc-amt" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Category" htmlFor="rc-cat"><Input id="rc-cat" maxLength={40} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
            <Field label="Day of month (1–28)" htmlFor="rc-day"><Input id="rc-day" type="number" min={1} max={28} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!valid || create.isPending}>Add</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Budget({ data }: { data: Overview }) {
  const { money } = useMoney();
  const setBudget = useSetBudget();
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState("");
  const l = cents(limit);
  const lines = data.summary.budget;
  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 xl:col-span-8">
        <CardHeader><CardTitle>Budget · {data.month}</CardTitle><span className="text-xs text-muted-foreground">Last month's limits carry forward automatically</span></CardHeader>
        <CardContent className="space-y-4 pt-3">
          {lines.length === 0 ? <p className="text-sm text-muted-foreground">No budget lines yet. Add a category limit on the right.</p> : lines.map((b) => {
            const used = b.limitCents ? b.spentCents / b.limitCents : 0;
            return (
              <div key={b.category}>
                <div className="flex items-center justify-between text-sm">
                  <span>{b.category}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {money(b.spentCents)}{b.limitCents !== null && <> of {money(b.limitCents)}</>}{b.plannedCents > 0 && <span className="text-subtle-foreground"> · {money(b.plannedCents)} scheduled</span>}
                    {b.limitCents !== null && <button className="ml-3 text-subtle-foreground hover:text-foreground" onClick={() => setBudget.mutate({ month: data.month, category: b.category, limitCents: null })}>Remove limit</button>}
                  </span>
                </div>
                {b.limitCents !== null && <ProgressBar value={used} className="mt-1.5 h-1.5" barClassName={used > 1 ? "from-warning via-warning to-warning" : undefined} label={`${b.category} budget used`} />}
                {used > 1 && <div className="mt-1 text-[11px] text-warning">Over by {money(b.spentCents - (b.limitCents ?? 0))}</div>}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card className="col-span-12 xl:col-span-4">
        <CardHeader><CardTitle>Set a limit</CardTitle></CardHeader>
        <CardContent className="pt-3">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (category.trim() && validPositive(l)) setBudget.mutate({ month: data.month, category: category.trim(), limitCents: l! }, { onSuccess: () => { setCategory(""); setLimit(""); } }); }}>
            <Field label="Category" htmlFor="bg-cat"><Input id="bg-cat" list="bg-cats" maxLength={40} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Groceries" /></Field>
            <datalist id="bg-cats">{lines.map((b) => <option key={b.category} value={b.category} />)}</datalist>
            <Field label="Monthly limit" htmlFor="bg-lim"><Input id="bg-lim" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
            <Button type="submit" className="w-full" disabled={!category.trim() || !validPositive(l)}>Save limit</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Debts({ debts, accounts }: { debts: DebtView[]; accounts: Overview["accounts"] }) {
  const { money, currency } = useMoney();
  const [addOpen, setAddOpen] = useState(false);
  const [paying, setPaying] = useState<DebtView | null>(null);
  const archive = useArchiveDebt();
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setAddOpen(true)}><Plus /> Debt</Button></div>
      {debts.length === 0 ? <EmptyState icon={CreditCard} title="No debts tracked">Add loans, credit cards or store accounts to plan the way to debt-free.</EmptyState> : (
        <div className="grid gap-4 md:grid-cols-2">
          {debts.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <CardTitle>{d.name}</CardTitle>
                {d.status === "paid_off" ? <Badge variant="solid">Paid off</Badge> : <span className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => setPaying(d)}>Record payment</Button><Button size="sm" variant="ghost" onClick={() => archive.mutate({ id: d.id, archived: true })}>Archive</Button></span>}
              </CardHeader>
              <CardContent className="pt-3">
                <div className="flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums">{money(d.balanceCents)}</span><span className="text-sm text-muted-foreground">of {money(d.startingBalanceCents)}</span></div>
                <ProgressBar value={1 - d.balanceCents / d.startingBalanceCents} className="mt-3 h-2" label={`${d.name} repaid`} />
                <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  <div><dt className="text-subtle-foreground">Interest</dt><dd className="tabular-nums">{(d.interestRateBps / 100).toFixed(2)}%</dd></div>
                  <div><dt className="text-subtle-foreground">Minimum</dt><dd className="tabular-nums">{money(d.minimumPaymentCents)}</dd></div>
                  <div><dt className="text-subtle-foreground">Payoff (estimate)</dt><dd>{d.status === "paid_off" ? "Done" : d.payoff ? `${d.payoff.month} · ${d.payoff.months} mo` : "Payment doesn't cover interest"}</dd></div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <DebtDialog open={addOpen} onOpenChange={setAddOpen} currency={currency} />
      <PaymentDialog debt={paying} onClose={() => setPaying(null)} accounts={accounts} currency={currency} />
    </div>
  );
}

function DebtDialog({ open, onOpenChange, currency }: { open: boolean; onOpenChange: (o: boolean) => void; currency: string }) {
  const create = useCreateDebt();
  const [f, setF] = useState({ name: "", balance: "", rate: "", minimum: "" });
  const bal = cents(f.balance);
  const min = cents(f.minimum);
  const rate = f.rate ? Math.round(Number(f.rate.replace(",", ".")) * 100) : 0;
  const valid = f.name.trim() && validPositive(bal) && Number.isFinite(rate) && rate >= 0 && rate <= 10_000 && (min === undefined || Number.isFinite(min));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a debt" description="Current outstanding balance, interest rate and the minimum monthly payment.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate({ name: f.name.trim(), startingBalanceCents: bal!, interestRateBps: rate, minimumPaymentCents: min ?? 0 }, { onSuccess: () => { onOpenChange(false); setF({ name: "", balance: "", rate: "", minimum: "" }); } }); }}>
          <Field label="Name" htmlFor="db-name"><Input id="db-name" autoFocus maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Credit card" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={`Balance (${currency})`} htmlFor="db-bal"><Input id="db-bal" inputMode="decimal" value={f.balance} onChange={(e) => setF({ ...f, balance: e.target.value })} /></Field>
            <Field label="Interest % / year" htmlFor="db-rate"><Input id="db-rate" inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} placeholder="e.g. 11.75" /></Field>
            <Field label="Minimum / month" htmlFor="db-min"><Input id="db-min" inputMode="decimal" value={f.minimum} onChange={(e) => setF({ ...f, minimum: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!valid || create.isPending}>Add debt</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ debt, onClose, accounts, currency }: { debt: DebtView | null; onClose: () => void; accounts: Overview["accounts"]; currency: string }) {
  const pay = useDebtPayment();
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState("");
  if (!debt) return null;
  const amt = cents(amount);
  const valid = validPositive(amt) && amt! <= debt.balanceCents;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Repayment: ${debt.name}`} description="Record a payment that has actually been made.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) pay.mutate({ id: debt.id, amountCents: amt!, fromAccountId: from ? Number(from) : null }, { onSuccess: () => { onClose(); setAmount(""); } }); }}>
          <Field label={`Amount (${currency})`} htmlFor="pm-amt" hint={amount && !valid ? "Must be above zero and not more than the balance." : undefined}><Input id="pm-amt" autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Paid from (optional)" htmlFor="pm-from">
            <NativeSelect id="pm-from" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Don't record an account transaction</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </NativeSelect>
          </Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid || pay.isPending}>Record payment</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Planning({ data }: { data: Overview }) {
  const { money, currency } = useMoney();
  const scenario = useScenario();
  const [monthly, setMonthly] = useState(data.plan.monthlySavingsTargetCents ? String(data.plan.monthlySavingsTargetCents / 100) : "");
  const [extra, setExtra] = useState("");
  const m = cents(monthly);
  const x = cents(extra);
  const valid = m !== undefined && Number.isFinite(m) && m >= 0 && (x === undefined || (Number.isFinite(x) && x >= 0));
  const r: ScenarioResult | undefined = scenario.data;
  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 xl:col-span-4">
        <CardHeader><CardTitle>What if...</CardTitle></CardHeader>
        <CardContent className="pt-3">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) scenario.mutate({ monthlySavingsCents: m!, extraDebtPaymentCents: x }); }}>
            <Field label={`I save per month (${currency})`} htmlFor="sc-m"><Input id="sc-m" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="5 000" /></Field>
            <Field label={`Extra debt payment per month (${currency})`} htmlFor="sc-x"><Input id="sc-x" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0" /></Field>
            <Button type="submit" className="w-full" disabled={!valid || scenario.isPending}>Run scenario</Button>
            <p className="text-xs text-subtle-foreground">Scenarios are forecasts only. Nothing is saved or changed.</p>
          </form>
        </CardContent>
      </Card>
      <Card className="col-span-12 xl:col-span-8">
        <CardHeader><CardTitle>Forecast</CardTitle><span className="text-[10px] tracking-wider text-subtle-foreground uppercase">Estimate</span></CardHeader>
        <CardContent className="pt-3">
          {!r ? <p className="text-sm text-muted-foreground">Enter a monthly amount and run the scenario to see when each goal and debt would be done.</p> : (
            <div className="space-y-5">
              <div>
                <div className="text-label mb-2">Savings goals</div>
                {r.goals.length === 0 ? <p className="text-sm text-muted-foreground">No savings goals.</p> : r.goals.map((g) => (
                  <div key={g.id} className="flex justify-between border-b border-border/60 py-2 text-sm"><span>{g.name}</span><span className="text-muted-foreground">{g.months === 0 ? "Already reached" : g.month ? `${g.month} · ${g.months} months` : "Not reachable at this rate"}</span></div>
                ))}
              </div>
              <div>
                <div className="text-label mb-2">Debts</div>
                {r.debts.length === 0 ? <p className="text-sm text-muted-foreground">No active debts.</p> : r.debts.map((d) => (
                  <div key={d.id} className="flex justify-between border-b border-border/60 py-2 text-sm"><span>{d.name}</span><span className="text-muted-foreground">{d.month ? `${d.month} · ${d.months} months · ${money(d.totalInterestCents ?? 0)} interest` : "Payment doesn't cover interest"}</span></div>
                ))}
              </div>
              <div className="h-48"><ProjectionChart series={r.series} money={money} /></div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
