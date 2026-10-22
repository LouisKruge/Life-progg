import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Check, Coins, Gift, MoreHorizontal, Pencil, Plus, Star, Trash2, Undo2, Wallet } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { RedemptionView, RewardView } from "@shared/types";
import {
  useAccounts,
  useCancelRedemption,
  useConfirmSpending,
  useDeleteReward,
  useRedeem,
  useReorderRewards,
  useSaveReward,
  useVault,
  type RewardFormValues,
} from "@/lib/queries-economy";
import { useSettings } from "@/lib/queries";
import { formatDateTime, formatMoney, parseMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PageHeader, QueryError } from "./common";

const CATEGORIES = ["experience", "food", "leisure", "outdoors", "self-care", "purchase", "social"];
type Tab = "shop" | "wishlist" | "history";

export function RewardsVaultPage() {
  const [tab, setTab] = useState<Tab>("shop");
  const [showArchived, setShowArchived] = useState(false);
  const { data, error, refetch } = useVault(showArchived);
  const { data: settings } = useSettings();
  const [editing, setEditing] = useState<RewardView | null | "new">(null);
  const [redeeming, setRedeeming] = useState<RewardView | null>(null);
  const currency = settings?.currency ?? "ZAR";
  const locale = settings?.locale ?? "en-ZA";
  const money = (c: number) => formatMoney(c, currency, locale);

  if (error) return <QueryError error={error} retry={refetch} />;

  const rewards = data?.rewards ?? [];
  const shown = tab === "wishlist" ? rewards.filter((r) => r.isWishlisted) : rewards;
  const b = data?.budget;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Rewards Vault"
        title="Real-life rewards"
        description="Enjoyment is part of the system. Credits have no cash value and can't be bought; paid rewards also need room in your monthly allowance, and never touch savings."
        actions={<Button onClick={() => setEditing("new")}><Plus /> Reward</Button>}
      />

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 md:col-span-4">
          <CardContent className="pt-5">
            <div className="text-label flex items-center gap-2"><Coins className="size-3.5" /> Credit wallet</div>
            <div className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">{data ? <AnimatedNumber value={data.credits} /> : "—"}</div>
            <p className="mt-3 text-xs text-muted-foreground">Earned from quests only. No real monetary value.</p>
          </CardContent>
        </Card>
        <Card className="col-span-12 md:col-span-8">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div className="text-label flex items-center gap-2"><Wallet className="size-3.5" /> Reward allowance · {b?.month}</div>
              {settings?.monthlyRewardAllowanceCents == null && <span className="text-xs text-warning">Not set: paid rewards are locked. Set it in Settings.</span>}
            </div>
            {b && (
              <>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tabular-nums">{money(Math.max(0, b.availableCents))}</span>
                  <span className="text-sm text-muted-foreground">available of {money(b.allowanceCents)}</span>
                </div>
                <ProgressBar value={b.allowanceCents ? (b.reservedCents + b.spentCents) / b.allowanceCents : 0} className="mt-4 h-2" label="Allowance used" />
                <div className="mt-2 flex gap-6 text-xs text-muted-foreground">
                  <span>Reserved {money(b.reservedCents)}</span>
                  <span>Confirmed spent {money(b.spentCents)}</span>
                  {b.availableCents < 0 && <span className="text-warning">Over by {money(-b.availableCents)}</span>}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex rounded-md border border-border p-0.5 text-sm" role="tablist" aria-label="Vault sections">
          {(["shop", "wishlist", "history"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded px-4 py-1.5 capitalize", tab === t ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t}
            </button>
          ))}
        </div>
        {tab !== "history" && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Show archived <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Show archived rewards" />
          </label>
        )}
      </div>

      {!data ? (
        <Skeleton className="h-60" />
      ) : tab === "history" ? (
        <RedemptionHistory redemptions={data.redemptions} money={money} locale={locale} timezone={settings?.timezone} />
      ) : shown.length === 0 ? (
        <EmptyState icon={tab === "wishlist" ? Star : Gift} title={tab === "wishlist" ? "Your wishlist is empty" : "The vault is empty"} action={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Add a reward</Button>}>
          {tab === "wishlist" ? "Star a reward to keep it in view." : "Add real-life treats and experiences: a gaming evening, a favourite takeaway, a cinema trip."}
        </EmptyState>
      ) : (
        <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AnimatePresence initial={false}>
            {shown.map((r, i) => (
              <RewardCard key={r.id} reward={r} credits={data.credits} money={money} first={i === 0} last={i === shown.length - 1} order={shown.map((x) => x.id)} onEdit={() => setEditing(r)} onRedeem={() => setRedeeming(r)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <RewardEditor reward={editing} onClose={() => setEditing(null)} currency={currency} />
      <RedeemDialog reward={redeeming} credits={data?.credits ?? 0} available={b?.availableCents ?? 0} money={money} onClose={() => setRedeeming(null)} />
    </div>
  );
}

const menuItem = "flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-sm text-muted-foreground outline-none data-[highlighted]:bg-surface-3 data-[highlighted]:text-foreground";

function RewardCard({ reward: r, credits, money, first, last, order, onEdit, onRedeem }: { reward: RewardView; credits: number; money: (c: number) => string; first: boolean; last: boolean; order: number[]; onEdit: () => void; onRedeem: () => void }) {
  const save = useSaveReward();
  const del = useDeleteReward();
  const reorder = useReorderRewards();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const move = (dir: -1 | 1) => {
    const ids = [...order];
    const i = ids.indexOf(r.id);
    [ids[i], ids[i + dir]] = [ids[i + dir]!, ids[i]!];
    reorder.mutate(ids);
  };
  const archived = r.status === "archived";
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}>
      <Card className={cn("flex h-full flex-col overflow-hidden", archived && "opacity-50")}>
        {r.imageUrl ? (
          <img src={r.imageUrl} alt="" className="h-32 w-full object-cover grayscale-[35%]" />
        ) : (
          <div className="grid h-24 place-items-center border-b border-border bg-gradient-to-b from-surface-3 to-surface">
            <Gift className="size-6 text-subtle-foreground" strokeWidth={1.5} />
          </div>
        )}
        <CardContent className="flex flex-1 flex-col pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{r.name}</div>
              <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                <span className="capitalize">{r.category}</span>
                {!r.repeatable && <Badge variant="outline">One-time</Badge>}
                {r.quantityAvailable !== null && <Badge variant="outline">{r.quantityAvailable} left</Badge>}
                {r.isDemo && <Badge variant="outline">Demo</Badge>}
                {archived && <Badge>Archived</Badge>}
              </div>
            </div>
            <div className="flex shrink-0">
              <Button variant="ghost" size="icon-sm" aria-pressed={r.isWishlisted} aria-label={r.isWishlisted ? `Remove ${r.name} from wishlist` : `Add ${r.name} to wishlist`} onClick={() => save.mutate({ id: r.id, values: { isWishlisted: !r.isWishlisted } })}>
                <Star className={cn(r.isWishlisted && "fill-foreground text-foreground")} />
              </Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${r.name}`}><MoreHorizontal /></Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-40 rounded-lg border border-border bg-surface-2 p-1 shadow-xl shadow-black/50">
                    <DropdownMenu.Item className={menuItem} onSelect={onEdit}><Pencil className="size-3.5" /> Edit</DropdownMenu.Item>
                    {!first && <DropdownMenu.Item className={menuItem} onSelect={() => move(-1)}><ArrowUp className="size-3.5" /> Move earlier</DropdownMenu.Item>}
                    {!last && <DropdownMenu.Item className={menuItem} onSelect={() => move(1)}><ArrowDown className="size-3.5" /> Move later</DropdownMenu.Item>}
                    <DropdownMenu.Item className={menuItem} onSelect={() => save.mutate({ id: r.id, values: { status: archived ? "active" : "archived" } })}>
                      {archived ? <><ArchiveRestore className="size-3.5" /> Restore</> : <><Archive className="size-3.5" /> Archive</>}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} onSelect={() => setConfirmDelete(true)}><Trash2 className="size-3.5" /> Delete</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>
          {r.description && <p className="mt-2 line-clamp-2 text-xs text-subtle-foreground">{r.description}</p>}
          <div className="mt-auto pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-semibold tabular-nums">{r.creditPrice} cr</span>
              <span className="text-xs text-subtle-foreground">{r.estimatedCostCents ? `≈ ${money(r.estimatedCostCents)}` : "Free"}</span>
            </div>
            <ProgressBar value={credits / r.creditPrice} className="mt-2 h-1" label={`Credits toward ${r.name}`} />
            <Button className="mt-3 w-full" size="sm" variant={r.blockedReason ? "secondary" : "default"} disabled={Boolean(r.blockedReason)} onClick={onRedeem}>
              {r.blockedReason ?? "Redeem"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${r.name}”?`}
        description={r.timesRedeemed > 0 ? "It has been redeemed before, so it will be archived to keep your history." : "This reward has never been redeemed and will be removed."}
        danger
        confirmLabel="Delete"
        onConfirm={() => del.mutate(r.id)}
      />
    </motion.div>
  );
}

function RedeemDialog({ reward, credits, available, money, onClose }: { reward: RewardView | null; credits: number; available: number; money: (c: number) => string; onClose: () => void }) {
  const redeem = useRedeem();
  // A fresh request id per dialog opening makes double-submits harmless.
  const requestId = useMemo(() => (reward ? crypto.randomUUID() : ""), [reward]);
  const [done, setDone] = useState(false);
  useEffect(() => setDone(false), [reward]);
  if (!reward) return null;
  const paid = reward.estimatedCostCents > 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={done ? "Enjoy it." : `Redeem “${reward.name}”?`} description={done ? "Redeemed. Confirm the spending in History once it has actually happened." : "Redeeming records your intention. It does not move any money."} className="w-[min(460px,calc(100vw-2rem))]">
        {done ? (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="grid place-items-center py-6">
            <div className="grid size-16 place-items-center rounded-full bg-foreground text-background"><Check className="size-8" strokeWidth={3} /></div>
            <Button className="mt-6" onClick={onClose}>Close</Button>
          </motion.div>
        ) : (
          <>
            <dl className="space-y-2 rounded-lg border border-border bg-surface-2 p-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Credits</dt><dd className="tabular-nums">{credits} → {credits - reward.creditPrice}</dd></div>
              {paid && <div className="flex justify-between"><dt className="text-muted-foreground">Allowance reserved</dt><dd className="tabular-nums">{money(reward.estimatedCostCents)}</dd></div>}
              {paid && <div className="flex justify-between"><dt className="text-muted-foreground">Allowance left after</dt><dd className="tabular-nums">{money(available - reward.estimatedCostCents)}</dd></div>}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">You can cancel for a full refund until you confirm the spending.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Not now</Button>
              <Button disabled={redeem.isPending} onClick={() => redeem.mutate({ id: reward.id, requestId }, { onSuccess: () => setDone(true) })}>
                {redeem.isPending ? "Redeeming..." : `Redeem for ${reward.creditPrice} credits`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const STATUS_LABEL: Record<RedemptionView["status"], string> = { reserved: "Awaiting confirmation", fulfilled: "Enjoyed", cancelled: "Cancelled · refunded" };

function RedemptionHistory({ redemptions, money, locale, timezone }: { redemptions: RedemptionView[]; money: (c: number) => string; locale: string; timezone?: string }) {
  const cancel = useCancelRedemption();
  const [confirming, setConfirming] = useState<RedemptionView | null>(null);
  const [cancelling, setCancelling] = useState<RedemptionView | null>(null);
  if (redemptions.length === 0) return <EmptyState icon={Gift} title="No redemptions yet">Redeemed rewards appear here, with what they actually cost.</EmptyState>;
  return (
    <Card>
      <CardHeader><CardTitle>Redemption history</CardTitle></CardHeader>
      <CardContent className="pt-3">
        <ul className="divide-y divide-border/60">
          {redemptions.map((r) => (
            <li key={r.id} className={cn("flex items-center gap-4 py-3 text-sm", r.status === "cancelled" && "opacity-50")}>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.rewardName}</div>
                <div className="text-xs text-subtle-foreground">{formatDateTime(r.redeemedAt, locale, timezone)} · {STATUS_LABEL[r.status]}</div>
              </div>
              <div className="text-right text-xs tabular-nums text-muted-foreground">
                <div>{r.creditCost} cr</div>
                <div>{r.status === "fulfilled" && r.actualCostCents ? `Spent ${money(r.actualCostCents)}` : r.status !== "fulfilled" && r.reservedCents ? `Reserved ${money(r.reservedCents)}` : "Free"}</div>
              </div>
              {r.status === "reserved" && (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setConfirming(r)}><Check /> It happened</Button>
                  <Button size="sm" variant="ghost" onClick={() => setCancelling(r)}><Undo2 /> Cancel</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
      <ConfirmSpendingDialog redemption={confirming} onClose={() => setConfirming(null)} money={money} />
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="Cancel this redemption?"
        description={`${cancelling?.creditCost ?? 0} credits are refunded and any reserved allowance is released.`}
        confirmLabel="Cancel redemption"
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
      />
    </Card>
  );
}

function ConfirmSpendingDialog({ redemption, onClose, money }: { redemption: RedemptionView | null; onClose: () => void; money: (c: number) => string }) {
  const confirm = useConfirmSpending();
  const { data: accounts } = useAccounts();
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  useEffect(() => {
    setAmount(redemption ? String((redemption.reservedCents ?? 0) / 100) : "");
    setAccountId("");
  }, [redemption]);
  if (!redemption) return null;
  const cents = parseMoney(amount);
  const valid = cents !== null && Number.isFinite(cents) && cents >= 0;
  const spendable = (accounts ?? []).filter((a) => !a.isProtected && !a.archived);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Confirm it happened" description={`What did “${redemption.rewardName}” actually cost? Reserved: ${money(redemption.reservedCents)}.`} className="w-[min(460px,calc(100vw-2rem))]">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) confirm.mutate({ id: redemption.id, actualCostCents: cents ?? 0, accountId: accountId ? Number(accountId) : null }, { onSuccess: onClose });
          }}
        >
          <Field label="Actual cost" htmlFor="sp-amount"><Input id="sp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Record as an expense from (optional)" htmlFor="sp-acc" hint="Savings and emergency accounts are never offered for rewards.">
            <NativeSelect id="sp-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Don't record a transaction</option>
              {spendable.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </NativeSelect>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!valid || confirm.isPending}>Confirm spending</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RewardEditor({ reward, onClose, currency }: { reward: RewardView | null | "new"; onClose: () => void; currency: string }) {
  const save = useSaveReward();
  const existing = reward && reward !== "new" ? reward : null;
  const blank = { name: "", description: "", imageUrl: "", category: "experience", creditPrice: "50", cost: "", quantity: "", repeatable: true, isWishlisted: false };
  const [f, setF] = useState(blank);
  useEffect(() => {
    setF(
      existing
        ? { name: existing.name, description: existing.description, imageUrl: existing.imageUrl ?? "", category: existing.category, creditPrice: String(existing.creditPrice), cost: existing.estimatedCostCents ? String(existing.estimatedCostCents / 100) : "", quantity: existing.quantityAvailable === null ? "" : String(existing.quantityAvailable), repeatable: existing.repeatable, isWishlisted: existing.isWishlisted }
        : blank,
    );
  }, [reward]);
  if (!reward) return null;
  const cost = f.cost.trim() ? parseMoney(f.cost) : 0;
  const valid = f.name.trim() && Number(f.creditPrice) >= 1 && cost !== null && Number.isFinite(cost) && cost >= 0;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const values: Partial<RewardFormValues> = {
      name: f.name.trim(),
      description: f.description.trim(),
      imageUrl: f.imageUrl.trim() || null,
      category: f.category,
      creditPrice: Number(f.creditPrice),
      estimatedCostCents: cost ?? 0,
      quantityAvailable: f.quantity === "" ? null : Number(f.quantity),
      repeatable: f.repeatable,
      isWishlisted: f.isWishlisted,
    };
    save.mutate({ id: existing?.id, values }, { onSuccess: onClose });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={existing ? "Edit reward" : "New reward"} description="Real-life treats and experiences only. Rest, food and time with people never have to be earned.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" htmlFor="rw-name"><Input id="rw-name" autoFocus required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Cinema experience" /></Field>
          <Field label="Description" htmlFor="rw-desc"><Textarea id="rw-desc" className="min-h-14" maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Credit price" htmlFor="rw-price"><Input id="rw-price" type="number" min={1} value={f.creditPrice} onChange={(e) => setF({ ...f, creditPrice: e.target.value })} /></Field>
            <Field label={`Est. cost (${currency})`} htmlFor="rw-cost"><Input id="rw-cost" inputMode="decimal" value={f.cost} placeholder="0 = free" onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
            <Field label="Quantity" htmlFor="rw-qty"><Input id="rw-qty" type="number" min={0} value={f.quantity} placeholder="Unlimited" onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="rw-cat">
              <NativeSelect id="rw-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {[...new Set([...CATEGORIES, f.category])].map((c) => <option key={c} value={c}>{c}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Image URL (optional)" htmlFor="rw-img"><Input id="rw-img" value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} placeholder="https://..." /></Field>
          </div>
          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2">Repeatable <Switch checked={f.repeatable} onCheckedChange={(v) => setF({ ...f, repeatable: v })} aria-label="Repeatable" /></label>
            <label className="flex items-center gap-2">On wishlist <Switch checked={f.isWishlisted} onCheckedChange={(v) => setF({ ...f, isWishlisted: v })} aria-label="On wishlist" /></label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!valid || save.isPending}>{existing ? "Save" : "Add reward"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
