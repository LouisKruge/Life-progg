import { useEffect, useState } from "react";
import { DatabaseBackup, Download, KeyRound, RotateCcw } from "lucide-react";
import { DEFAULT_DIFFICULTY_REWARDS, DEFAULT_RANKS, QUEST_DIFFICULTIES, type DifficultyRewards, type RankThreshold, type Settings } from "@shared/types";
import { useBackups, useCreateBackup, useDemoData, useRestoreBackup, useSettings, useSystem, useUpdateSettings } from "@/lib/queries";
import { formatDateTime, parseMoney, WEEKDAYS } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DIFFICULTY_LABEL } from "@/components/quests/meta";
import { PageHeader, QueryError } from "./common";
import { cn } from "@/lib/utils";

export function SettingsPage() {
  const { data: s, error, refetch } = useSettings();
  if (error) return <QueryError error={error} retry={refetch} />;
  if (!s) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Settings" description="Everything is stored locally on this computer." />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 xl:col-span-7">
          <ProfileSection s={s} />
          <QuestSection s={s} />
          <BalancingSection s={s} />
          <RanksSection s={s} />
        </div>
        <div className="col-span-12 space-y-4 xl:col-span-5">
          <FinanceSection s={s} />
          <AiSection s={s} />
          <DataSection />
        </div>
      </div>
    </div>
  );
}

function SaveBar({ dirty, onSave, onReset, pending }: { dirty: boolean; onSave: () => void; onReset: () => void; pending: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      {dirty && <Button variant="ghost" size="sm" onClick={onReset}>Discard</Button>}
      <Button size="sm" disabled={!dirty || pending} onClick={onSave}>{pending ? "Saving..." : "Save"}</Button>
    </div>
  );
}

function useDraft<T>(source: T) {
  const [draft, setDraft] = useState(source);
  useEffect(() => setDraft(source), [source]);
  return [draft, setDraft, JSON.stringify(draft) !== JSON.stringify(source)] as const;
}

function ProfileSection({ s }: { s: Settings }) {
  const update = useUpdateSettings();
  const [d, setD, dirty] = useDraft({ displayName: s.displayName, timezone: s.timezone, locale: s.locale, currency: s.currency, reducedMotion: s.reducedMotion });
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [s.timezone];
  return (
    <Card>
      <CardHeader><CardTitle>Profile &amp; region</CardTitle></CardHeader>
      <CardContent className="space-y-4 pt-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Display name" htmlFor="s-name"><Input id="s-name" maxLength={60} value={d.displayName} onChange={(e) => setD({ ...d, displayName: e.target.value })} /></Field>
          <Field label="Timezone" htmlFor="s-tz">
            <NativeSelect id="s-tz" value={d.timezone} onChange={(e) => setD({ ...d, timezone: e.target.value })}>
              {zones.map((z) => <option key={z}>{z}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Locale (formatting)" htmlFor="s-locale" hint="en-ZA gives South African date and number formats.">
            <Input id="s-locale" value={d.locale} onChange={(e) => setD({ ...d, locale: e.target.value })} />
          </Field>
          <Field label="Currency" htmlFor="s-cur"><Input id="s-cur" maxLength={3} value={d.currency} onChange={(e) => setD({ ...d, currency: e.target.value.toUpperCase() })} /></Field>
          <Field label="Animations" htmlFor="s-motion">
            <NativeSelect id="s-motion" value={d.reducedMotion} onChange={(e) => setD({ ...d, reducedMotion: e.target.value as Settings["reducedMotion"] })}>
              <option value="system">Follow system setting</option>
              <option value="reduce">Reduced</option>
              <option value="full">Full</option>
            </NativeSelect>
          </Field>
        </div>
        <SaveBar dirty={dirty} pending={update.isPending} onReset={() => setD({ displayName: s.displayName, timezone: s.timezone, locale: s.locale, currency: s.currency, reducedMotion: s.reducedMotion })} onSave={() => update.mutate({ ...d, displayName: d.displayName.trim() })} />
      </CardContent>
    </Card>
  );
}

function QuestSection({ s }: { s: Settings }) {
  const update = useUpdateSettings();
  const [d, setD, dirty] = useDraft({ restDays: s.restDays, dailyQuestLimit: s.dailyQuestLimit, undoWindowHours: s.undoWindowHours });
  return (
    <Card>
      <CardHeader><CardTitle>Quests &amp; workload</CardTitle></CardHeader>
      <CardContent className="space-y-4 pt-3">
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Rest days (no daily quests generated)</div>
          <div className="flex gap-1.5" role="group" aria-label="Rest days">
            {WEEKDAYS.map((w, i) => {
              const on = d.restDays.includes(i);
              return (
                <button key={w} aria-pressed={on} onClick={() => setD({ ...d, restDays: on ? d.restDays.filter((x) => x !== i) : [...d.restDays, i].sort() })}
                  className={cn("h-8 w-11 rounded-md border text-xs", on ? "border-accent bg-accent text-background" : "border-border text-muted-foreground hover:text-foreground")}>
                  {w}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Daily quest limit" htmlFor="s-limit" hint="A soft limit: you'll see a gentle warning above it.">
            <Input id="s-limit" type="number" min={1} max={50} value={d.dailyQuestLimit ?? ""} placeholder="No limit" onChange={(e) => setD({ ...d, dailyQuestLimit: e.target.value ? Number(e.target.value) : null })} />
          </Field>
          <Field label="Undo window (hours)" htmlFor="s-undo">
            <Input id="s-undo" type="number" min={0} max={168} value={d.undoWindowHours} onChange={(e) => setD({ ...d, undoWindowHours: Number(e.target.value) })} />
          </Field>
        </div>
        <SaveBar dirty={dirty} pending={update.isPending} onReset={() => setD({ restDays: s.restDays, dailyQuestLimit: s.dailyQuestLimit, undoWindowHours: s.undoWindowHours })} onSave={() => update.mutate(d)} />
      </CardContent>
    </Card>
  );
}

function BalancingSection({ s }: { s: Settings }) {
  const update = useUpdateSettings();
  const [d, setD, dirty] = useDraft<DifficultyRewards>(s.difficultyRewards);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reward balancing</CardTitle>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setD(DEFAULT_DIFFICULTY_REWARDS)}>Reset to defaults</button>
      </CardHeader>
      <CardContent className="pt-3">
        <p className="mb-3 text-xs text-muted-foreground">Defaults for new quests. Existing quests and past payouts are not changed.</p>
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-x-3 gap-y-2 text-sm">
          <span className="text-label">Difficulty</span><span className="text-label">XP</span><span className="text-label">Credits</span>
          {QUEST_DIFFICULTIES.map((k) => (
            <div key={k} className="contents">
              <span className="self-center">{DIFFICULTY_LABEL[k]}</span>
              <Input aria-label={`${k} XP`} type="number" min={0} max={10000} value={d[k].xp} onChange={(e) => setD({ ...d, [k]: { ...d[k], xp: Number(e.target.value) } })} />
              <Input aria-label={`${k} credits`} type="number" min={0} max={1000} value={d[k].credits} onChange={(e) => setD({ ...d, [k]: { ...d[k], credits: Number(e.target.value) } })} />
            </div>
          ))}
        </div>
        <SaveBar dirty={dirty} pending={update.isPending} onReset={() => setD(s.difficultyRewards)} onSave={() => update.mutate({ difficultyRewards: d })} />
      </CardContent>
    </Card>
  );
}

function RanksSection({ s }: { s: Settings }) {
  const update = useUpdateSettings();
  const [d, setD, dirty] = useDraft<RankThreshold[]>(s.rankThresholds);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rank titles</CardTitle>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setD(DEFAULT_RANKS)}>Reset to defaults</button>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="space-y-2">
          {d.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px] gap-3">
              <Input aria-label={`Rank ${i + 1} title`} value={r.title} maxLength={40} onChange={(e) => setD(d.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <Input aria-label={`Rank ${i + 1} minimum level`} type="number" min={1} value={r.minLevel} onChange={(e) => setD(d.map((x, j) => (j === i ? { ...x, minLevel: Number(e.target.value) } : x)))} />
            </div>
          ))}
        </div>
        <SaveBar dirty={dirty} pending={update.isPending} onReset={() => setD(s.rankThresholds)} onSave={() => update.mutate({ rankThresholds: d.map((r) => ({ ...r, title: r.title.trim() })) })} />
      </CardContent>
    </Card>
  );
}

function moneyInput(cents: number | null) {
  return cents === null ? "" : String(cents / 100);
}

function FinanceSection({ s }: { s: Settings }) {
  const update = useUpdateSettings();
  const src = { income: moneyInput(s.monthlyIncomeCents), savings: moneyInput(s.monthlySavingsTargetCents), allowance: moneyInput(s.monthlyRewardAllowanceCents) };
  const [d, setD, dirty] = useDraft(src);
  const parsed = { income: parseMoney(d.income), savings: parseMoney(d.savings), allowance: parseMoney(d.allowance) };
  const invalid = Object.values(parsed).some((v) => v !== null && (!Number.isFinite(v) || v < 0));
  return (
    <Card>
      <CardHeader><CardTitle>Monthly plan</CardTitle></CardHeader>
      <CardContent className="space-y-3 pt-3">
        <p className="text-xs text-muted-foreground">Optional planning figures. They are not transactions and never move money.</p>
        <Field label={`Net income (${s.currency})`} htmlFor="f-inc"><Input id="f-inc" inputMode="decimal" value={d.income} onChange={(e) => setD({ ...d, income: e.target.value })} placeholder="Not set" /></Field>
        <Field label={`Savings target (${s.currency})`} htmlFor="f-sav"><Input id="f-sav" inputMode="decimal" value={d.savings} onChange={(e) => setD({ ...d, savings: e.target.value })} placeholder="Not set" /></Field>
        <Field label={`Reward allowance (${s.currency})`} htmlFor="f-all" hint="Discretionary money for paid rewards. Separate from savings and debt payments.">
          <Input id="f-all" inputMode="decimal" value={d.allowance} onChange={(e) => setD({ ...d, allowance: e.target.value })} placeholder="Not set" />
        </Field>
        {invalid && <p className="text-xs text-danger">Use positive amounts like 25000 or 25 000,00.</p>}
        <SaveBar dirty={dirty} pending={update.isPending} onReset={() => setD(src)} onSave={() => !invalid && update.mutate({ monthlyIncomeCents: parsed.income, monthlySavingsTargetCents: parsed.savings, monthlyRewardAllowanceCents: parsed.allowance })} />
      </CardContent>
    </Card>
  );
}

function AiSection({ s }: { s: Settings }) {
  const update = useUpdateSettings();
  const [key, setKey] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-3.5" /> AI strategist (optional)</CardTitle>{s.hasApiKey ? <Badge variant="solid">Key stored</Badge> : <Badge>No key</Badge>}</CardHeader>
      <CardContent className="space-y-4 pt-3">
        <p className="text-xs text-muted-foreground">The key is stored in the local database on this computer and is never sent back to the browser. The AI strategist itself ships in phase 5; until then the dashboard uses the built-in planner.</p>
        <label className="flex items-center justify-between">
          <span className="text-sm">Enable AI features</span>
          <Switch checked={s.aiEnabled} disabled={!s.hasApiKey} onCheckedChange={(v) => update.mutate({ aiEnabled: v })} aria-label="Enable AI features" />
        </label>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (key.trim()) update.mutate({ anthropicApiKey: key.trim() }, { onSuccess: () => setKey("") }); }}>
          <Input type="password" autoComplete="off" aria-label="Claude API key" value={key} onChange={(e) => setKey(e.target.value)} placeholder={s.hasApiKey ? "Replace stored key" : "sk-ant-..."} />
          <Button type="submit" variant="secondary" disabled={key.trim().length < 10}>Save</Button>
        </form>
        {s.hasApiKey && <button className="text-xs text-muted-foreground hover:text-danger" onClick={() => setConfirmRemove(true)}>Remove stored key</button>}
        <ConfirmDialog open={confirmRemove} onOpenChange={setConfirmRemove} title="Remove API key?" description="AI features will be disabled. You can add a key again later." danger confirmLabel="Remove" onConfirm={() => update.mutate({ anthropicApiKey: null, aiEnabled: false })} />
      </CardContent>
    </Card>
  );
}

function DataSection() {
  const { data: system } = useSystem();
  const { data: backups } = useBackups();
  const create = useCreateBackup();
  const restore = useRestoreBackup();
  const demo = useDemoData();
  const { data: s } = useSettings();
  const [restoreName, setRestoreName] = useState<string | null>(null);
  const [confirmRemoveDemo, setConfirmRemoveDemo] = useState(false);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><DatabaseBackup className="size-3.5" /> Data &amp; backups</CardTitle></CardHeader>
      <CardContent className="space-y-4 pt-3">
        {system?.dataDir && (
          <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
            <div className="text-subtle-foreground">Data folder</div>
            <div className="mt-0.5 font-mono break-all text-muted-foreground">{system.dataDir}</div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => create.mutate()} disabled={create.isPending}><DatabaseBackup /> Back up now</Button>
          <Button size="sm" variant="secondary" asChild><a href="/api/export" download><Download /> Export JSON</a></Button>
        </div>
        <div>
          <div className="text-label mb-2">Backups</div>
          {!backups ? (
            <Skeleton className="h-16" />
          ) : backups.length === 0 ? (
            <p className="text-xs text-muted-foreground">No backups yet. Automatic backups are also taken before every upgrade and every restore.</p>
          ) : (
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {backups.map((b) => (
                <li key={b.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-surface-2">
                  <span className="flex-1">
                    <span className="block">{formatDateTime(b.createdAt, s?.locale, s?.timezone)} <span className="text-subtle-foreground">· {b.kind}</span></span>
                    <span className="block text-subtle-foreground">{(b.sizeBytes / 1024).toFixed(0)} KB · {b.integrityOk ? "verified" : "failed check"}</span>
                  </span>
                  <Button size="sm" variant="ghost" disabled={!b.integrityOk || restore.isPending} onClick={() => setRestoreName(b.fileName)}><RotateCcw /> Restore</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border pt-4">
          <div className="text-label mb-2">Demo data</div>
          <p className="mb-3 text-xs text-muted-foreground">Example quests and rewards, clearly tagged “Demo”. Removing them keeps any XP you genuinely earned.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => demo.mutate("load")} disabled={demo.isPending}>Load demo data</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemoveDemo(true)} disabled={demo.isPending}>Remove demo data</Button>
          </div>
        </div>
        <ConfirmDialog
          open={restoreName !== null}
          onOpenChange={(o) => !o && setRestoreName(null)}
          title="Restore this backup?"
          description="Your current data is backed up automatically first, so this can be reversed by restoring that safety copy."
          confirmLabel="Restore"
          onConfirm={() => restoreName && restore.mutate(restoreName)}
        />
        <ConfirmDialog
          open={confirmRemoveDemo}
          onOpenChange={setConfirmRemoveDemo}
          title="Remove demo data?"
          description="Unused demo quests and all demo rewards are deleted. Demo quests you already completed are archived instead, so your history stays intact."
          confirmLabel="Remove"
          onConfirm={() => demo.mutate("remove")}
        />
      </CardContent>
    </Card>
  );
}
