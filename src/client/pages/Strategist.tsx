import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BrainCircuit, Check, Compass, Eye, EyeOff, Lightbulb, MessageSquare, Plus, Send, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { AI_DATA_SCOPES, type AiDataScope, type AiProposalView } from "@shared/types";
import { useAiStatus, useConversation, useConversations, useDecideProposal, useDeleteConversation, usePlanner, useSendMessage } from "@/lib/queries-ai";
import { useCategories, useSaveQuest, useSettings, useUpdateSettings } from "@/lib/queries";
import { navigate } from "@/lib/router";
import { formatMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "./common";

const SCOPE_INFO: Record<AiDataScope, { label: string; detail: string }> = {
  quests: { label: "Quests", detail: "Today's board, quest list. Lets it propose quests and completions." },
  progression: { label: "Progress", detail: "Level, XP, credits, streaks, category XP and your main goals." },
  finances: { label: "Finances", detail: "Account balances, income, expenses, budgets, savings goals and debts." },
  rewards: { label: "Rewards", detail: "Reward vault, credit prices and this month's reward allowance." },
  seasons: { label: "Seasons", detail: "The active season, its objectives and weekly reviews." },
  journal: { label: "Journal", detail: "Your timeline, including personal notes and life events." },
};

const QUICK_PROMPTS: Array<{ label: string; text: string; mode: "chat" | "daily_focus" | "weekly_review" }> = [
  { label: "Plan my day", text: "Look at today's quests and my progress, and give me a short, realistic focus for today. Start with a one-line headline, then 2–4 bullet points.", mode: "daily_focus" },
  { label: "Weekly review", text: "Review my last week: what went well, what slipped, and one or two adjustments for next week.", mode: "weekly_review" },
  { label: "Break down a goal", text: "Help me break one of my main goals into a few small quests. Ask me which goal if it isn't clear.", mode: "chat" },
  { label: "Explain my progress", text: "Explain where I stand right now: level, momentum, and what is closest to unlocking next.", mode: "chat" },
];

export function StrategistPage() {
  const { data: status } = useAiStatus();
  const aiOn = Boolean(status?.enabled);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={aiOn ? `AI Strategist · ${status?.model}` : "AI Strategist · planner mode"}
        title={aiOn ? "Think it through together" : "Your plan, without AI"}
        description={
          aiOn
            ? "It reads only the data you allow, separates facts from estimates, and can't change anything without your approval."
            : "The built-in planner works fully offline. Add a Claude API key in Settings to unlock conversation, reviews and goal breakdowns."
        }
      />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 xl:col-span-8">{aiOn ? <Chat /> : <AiOffCard hasKey={Boolean(status?.hasApiKey)} />}<PlannerPanel /></div>
        <div className="col-span-12 xl:col-span-4"><PrivacyPanel /></div>
      </div>
    </div>
  );
}

function AiOffCard({ hasKey }: { hasKey: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-5">
        <div className="grid size-11 place-items-center rounded-xl border border-border bg-surface-2"><BrainCircuit className="size-5 text-muted-foreground" /></div>
        <div className="flex-1 text-sm">
          <div className="font-medium">{hasKey ? "AI is switched off" : "No Claude API key configured"}</div>
          <div className="text-muted-foreground">{hasKey ? "Turn it on in the privacy panel or in Settings." : "Optional. The key is stored on this computer only and never sent to the browser."}</div>
        </div>
        <Button variant="secondary" onClick={() => navigate("/settings")}>Open Settings</Button>
      </CardContent>
    </Card>
  );
}

function Chat() {
  const { data: conversations } = useConversations();
  const [activeId, setActiveId] = useState<number | null>(null);
  const { data: conv } = useConversation(activeId);
  const send = useSendMessage();
  const del = useDeleteConversation();
  const decide = useDecideProposal(activeId);
  const [text, setText] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [conv?.messages.length, pendingText]);

  const submit = (t: string, mode: "chat" | "daily_focus" | "weekly_review" = "chat", fresh = false) => {
    if (!t.trim() || send.isPending) return;
    setPendingText(t);
    send.mutate(
      { conversationId: fresh ? undefined : activeId ?? undefined, text: t.trim(), mode },
      { onSuccess: (c) => { setActiveId(c.id); setText(""); }, onSettled: () => setPendingText(null) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageSquare className="size-3.5" /> Conversation</CardTitle>
        <div className="flex items-center gap-2">
          {conversations && conversations.length > 0 && (
            <select aria-label="Conversation" value={activeId ?? ""} onChange={(e) => setActiveId(e.target.value ? Number(e.target.value) : null)} className="h-8 max-w-56 rounded-md border border-border bg-surface-2 px-2 text-xs">
              <option value="">New conversation</option>
              {conversations.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          )}
          {activeId !== null && (
            <>
              <Button size="icon-sm" variant="ghost" aria-label="New conversation" onClick={() => setActiveId(null)}><Plus /></Button>
              <Button size="icon-sm" variant="ghost" aria-label="Delete conversation" onClick={() => del.mutate(activeId, { onSuccess: () => setActiveId(null) })}><Trash2 /></Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        <div tabIndex={0} role="log" aria-label="Conversation messages" className="max-h-[520px] min-h-56 space-y-4 overflow-y-auto pr-1" aria-live="polite">
          {!conv && !pendingText && (
            <div className="grid gap-2 sm:grid-cols-2">
              {QUICK_PROMPTS.map((p) => (
                <button key={p.label} onClick={() => submit(p.text, p.mode, true)} disabled={send.isPending} className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-left text-sm hover:border-[#45474e] hover:bg-surface-3">
                  <Sparkles className="mb-1 size-3.5 text-muted-foreground" />
                  <span className="block font-medium">{p.label}</span>
                </button>
              ))}
            </div>
          )}
          {conv?.messages.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap", m.role === "user" ? "bg-foreground text-background" : "border border-border bg-surface-2")}>
                {m.text}
                {m.toolsUsed.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 border-t border-border/60 pt-2">
                    {m.toolsUsed.map((t) => <Badge key={t} variant="outline">{t.startsWith("propose_") ? "proposed" : "read"}: {t.replace(/^(get|propose)_/, "").replace(/_/g, " ")}</Badge>)}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          {pendingText && (
            <>
              {(!conv || conv.messages.at(-1)?.text !== pendingText) && <div className="flex justify-end"><div className="max-w-[85%] rounded-xl bg-foreground/80 px-4 py-3 text-sm text-background">{pendingText}</div></div>}
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.4 }}>Thinking and checking your data…</motion.span></div>
            </>
          )}
          {conv && conv.proposals.length > 0 && <Proposals proposals={conv.proposals} onDecide={(id, approve) => decide.mutate({ id, approve })} busy={decide.isPending} />}
          <div ref={endRef} />
        </div>
        <form className="mt-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
          <Textarea aria-label="Message the strategist" value={text} maxLength={8000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(text); } }} placeholder="Ask about your plan, progress, goals or money…" className="min-h-12" />
          <Button type="submit" size="icon" aria-label="Send" disabled={!text.trim() || send.isPending}><Send /></Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Proposals({ proposals, onDecide, busy }: { proposals: AiProposalView[]; onDecide: (id: number, approve: boolean) => void; busy: boolean }) {
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
      <div className="text-label">Proposed changes · nothing happens without your approval</div>
      <AnimatePresence initial={false}>
        {proposals.map((p) => (
          <motion.div key={p.id} layout className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span className="flex-1">
              {p.summary}
              {p.resultNote && <span className="block text-xs text-subtle-foreground">{p.resultNote}</span>}
            </span>
            {p.status === "pending" ? (
              <span className="flex shrink-0 gap-1">
                <Button size="sm" disabled={busy} onClick={() => onDecide(p.id, true)}><Check /> Approve</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide(p.id, false)}><X /> Reject</Button>
              </span>
            ) : (
              <Badge variant={p.status === "approved" ? "solid" : "outline"} className="capitalize">{p.status}</Badge>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function PlannerPanel() {
  const { data: p } = usePlanner();
  const { data: settings } = useSettings();
  const { data: categories } = useCategories();
  const save = useSaveQuest();
  const [added, setAdded] = useState<string[]>([]);
  if (!p) return <Skeleton className="h-64" />;
  const w = p.weeklyReview;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Compass className="size-3.5" /> Today's plan</CardTitle><span className="text-[10px] tracking-wider text-subtle-foreground uppercase">Planner · no AI</span></CardHeader>
        <CardContent className="pt-3">
          <p className="text-sm font-medium">{p.dailyPlan.headline}</p>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">{p.dailyPlan.steps.map((s, i) => <li key={i} className="flex gap-2"><span className="text-subtle-foreground tabular-nums">{i + 1}.</span>{s}</li>)}</ol>
          {p.dailyPlan.workloadNote && <p className="mt-3 text-xs text-warning">{p.dailyPlan.workloadNote}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Last 7 days</CardTitle><span className="text-[10px] tracking-wider text-subtle-foreground uppercase">Verified</span></CardHeader>
        <CardContent className="pt-3">
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-label">Quests</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{w.completed}</dd></div>
            <div><dt className="text-label">XP</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{w.xp.toLocaleString("en-ZA")}</dd></div>
            <div><dt className="text-label">Days</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{w.activeDays}/7</dd></div>
          </dl>
          {w.savingsChangeCents !== 0 && <p className="mt-2 text-xs text-muted-foreground">Savings change: {formatMoney(w.savingsChangeCents, settings?.currency, settings?.locale)}</p>}
          <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">{w.observations.map((o) => <li key={o}>{o}</li>)}</ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="size-3.5" /> Suggested quests</CardTitle></CardHeader>
        <CardContent className="space-y-2 pt-3">
          {p.suggestions.length === 0 ? <p className="text-sm text-muted-foreground">No suggestions right now. Your quests cover your focus areas.</p> : p.suggestions.map((s) => (
            <div key={s.title} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="flex-1"><span className="block font-medium">{s.title}</span><span className="text-xs text-subtle-foreground">{s.reason}</span></span>
              <Button size="sm" variant="secondary" disabled={added.includes(s.title)} onClick={() => save.mutate({ values: { title: s.title, difficulty: s.difficulty, frequency: s.frequency, categoryId: categories?.find((c) => c.key === s.categoryKey)?.id ?? null } }, { onSuccess: () => setAdded([...added, s.title]) })}>
                {added.includes(s.title) ? "Added" : "Add quest"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Reflection prompts</CardTitle></CardHeader>
        <CardContent className="pt-3">
          <ul className="space-y-3 text-sm">{p.reflectionPrompts.map((r) => <li key={r} className="border-l-2 border-border pl-3 text-muted-foreground">{r}</li>)}</ul>
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => navigate("/timeline")}>Write a note in the timeline</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PrivacyPanel() {
  const { data: status } = useAiStatus();
  const update = useUpdateSettings();
  if (!status) return <Skeleton className="h-96" />;
  const toggle = (scope: AiDataScope, on: boolean) => update.mutate({ aiDataScopes: on ? [...status.scopes, scope] : status.scopes.filter((s) => s !== scope) });
  return (
    <Card className="sticky top-4">
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-3.5" /> Privacy</CardTitle></CardHeader>
      <CardContent className="space-y-4 pt-3">
        <label className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm">
          AI strategist enabled
          <Switch checked={status.enabled} disabled={!status.hasApiKey} onCheckedChange={(v) => update.mutate({ aiEnabled: v })} aria-label="AI strategist enabled" />
        </label>
        <div>
          <div className="text-label mb-2">Data the AI may read</div>
          <ul className="space-y-2">
            {AI_DATA_SCOPES.map((scope) => {
              const on = status.scopes.includes(scope);
              return (
                <li key={scope} className="flex items-start gap-3">
                  <span className="mt-0.5">{on ? <Eye className="size-4" /> : <EyeOff className="size-4 text-subtle-foreground" />}</span>
                  <span className="flex-1 text-sm"><span className={cn("block font-medium", !on && "text-muted-foreground")}>{SCOPE_INFO[scope].label}</span><span className="block text-xs text-subtle-foreground">{SCOPE_INFO[scope].detail}</span></span>
                  <Switch checked={on} onCheckedChange={(v) => toggle(scope, v)} aria-label={`Share ${SCOPE_INFO[scope].label}`} />
                </li>
              );
            })}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">Always true</div>
          <ul className="list-disc space-y-1 pl-4">
            <li>Your API key never leaves the server and is never sent to the AI.</li>
            <li>Only categories switched on above are readable.</li>
            <li>The AI can only <em>propose</em> changes. Quests, completions, notes and goals change only when you approve.</li>
            <li>It can never move money, redeem rewards or award credits.</li>
            <li>Requests go to Anthropic's API only when you send a message.</li>
          </ul>
        </div>
        {status.enabled && <p className="text-[11px] text-subtle-foreground">Available tools: {status.tools.map((t) => t.name).join(", ") || "none"}</p>}
      </CardContent>
    </Card>
  );
}
