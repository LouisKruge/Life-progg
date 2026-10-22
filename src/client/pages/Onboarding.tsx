import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useOnboard } from "@/lib/queries";
import { formatMoney, parseMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { key: "wealth", name: "Wealth", hint: "Saving, money, freedom" },
  { key: "physique", name: "Physique", hint: "Fitness, health, energy" },
  { key: "mind", name: "Mind", hint: "Learning, focus, calm" },
  { key: "empire", name: "Empire", hint: "Career, business, building" },
  { key: "life", name: "Life", hint: "People, home, adventure" },
  { key: "discipline", name: "Discipline", hint: "Routines, consistency" },
] as const;

const REWARD_CATEGORIES = ["Experiences", "Food & treats", "Gaming", "Outdoors & sport", "Self-care", "Purchases"];

/** South African onboarding examples. Shown as placeholders only; nothing is assumed unless typed. */
const EXAMPLE = { income: "25 000", savings: "6 000", monthly: "5 000", first: "20 000", longTerm: "100 000" };

interface State {
  displayName: string;
  goals: string;
  focus: string[];
  income: string;
  savings: string;
  monthly: string;
  first: string;
  longTerm: string;
  dailyLimit: string;
  rewardCategories: string[];
  allowance: string;
  apiKey: string;
  demo: boolean;
}

const STEPS = ["Welcome", "You", "Focus", "Finances", "Rhythm", "Rewards", "AI", "Finish"] as const;

export function OnboardingPage() {
  const onboard = useOnboard();
  const [step, setStep] = useState(0);
  const [s, setS] = useState<State>({ displayName: "", goals: "", focus: [], income: "", savings: "", monthly: "", first: "", longTerm: "", dailyLimit: "5", rewardCategories: [], allowance: "", apiKey: "", demo: false });
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((p) => ({ ...p, [k]: v }));

  const money = (v: string) => {
    const c = parseMoney(v);
    return c !== null && Number.isFinite(c) && c >= 0 ? c : null;
  };
  const badMoney = [s.income, s.savings, s.monthly, s.first, s.longTerm, s.allowance].some((v) => v.trim() !== "" && money(v) === null);

  const finish = () => {
    onboard.mutate({
      displayName: s.displayName.trim() || undefined,
      mainGoals: s.goals.split("\n").map((g) => g.trim()).filter(Boolean).slice(0, 10),
      focusCategories: s.focus,
      dailyQuestLimit: s.dailyLimit ? Number(s.dailyLimit) : null,
      rewardCategories: s.rewardCategories,
      monthlyRewardAllowanceCents: money(s.allowance),
      finances: {
        monthlyIncomeCents: money(s.income),
        startingSavingsCents: money(s.savings),
        monthlySavingsTargetCents: money(s.monthly),
        firstMilestoneCents: money(s.first) || null,
        longTermMilestoneCents: money(s.longTerm) || null,
      },
      anthropicApiKey: s.apiKey.trim() || null,
      loadDemoData: s.demo,
    });
  };

  const next = () => (step === STEPS.length - 1 ? finish() : setStep(step + 1));
  const last = step === STEPS.length - 1;

  return (
    <div className="grid min-h-full place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="text-[13px] font-semibold tracking-[0.18em]">LEVEL ONE</div>
          <ol className="flex gap-1.5" aria-label="Onboarding progress">
            {STEPS.map((label, i) => (
              <li key={label} aria-current={i === step ? "step" : undefined} className={cn("h-1 w-6 rounded-full transition-colors", i <= step ? "bg-foreground" : "bg-surface-3")}>
                <span className="sr-only">{label}</span>
              </li>
            ))}
          </ol>
        </div>

        <AnimatePresence mode="wait">
          <motion.section key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="min-h-[340px]">
            {step === 0 && (
              <Step title="Make progress visible." subtitle="LEVEL ONE turns real responsibilities into quests, tracks the things that matter, and builds enjoyment into the system instead of postponing it.">
                <p className="text-sm text-muted-foreground">Setup takes about two minutes. Every step is optional, and nothing financial is required.</p>
              </Step>
            )}
            {step === 1 && (
              <Step title="What should we call you?" subtitle="And, if you like, the few big things you're working toward.">
                <Field label="Display name" htmlFor="ob-name"><Input id="ob-name" autoFocus maxLength={60} value={s.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="Player One" /></Field>
                <Field label="Main life goals (one per line)" htmlFor="ob-goals">
                  <Textarea id="ob-goals" value={s.goals} onChange={(e) => set("goals", e.target.value)} placeholder={"Build a R100,000 safety net\nGet properly fit\nLaunch my side business"} />
                </Field>
              </Step>
            )}
            {step === 2 && (
              <Step title="Where do you want to focus?" subtitle="Pick any. Every category stays available; focus just highlights them.">
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Focus categories">
                  {CATEGORIES.map((c) => {
                    const on = s.focus.includes(c.key);
                    return (
                      <button key={c.key} type="button" aria-pressed={on} onClick={() => set("focus", on ? s.focus.filter((x) => x !== c.key) : [...s.focus, c.key])}
                        className={cn("flex items-start justify-between rounded-lg border px-4 py-3 text-left transition-colors", on ? "border-accent bg-surface-2" : "border-border hover:bg-surface")}>
                        <span><span className="block text-sm font-medium">{c.name}</span><span className="block text-xs text-muted-foreground">{c.hint}</span></span>
                        {on && <Check className="size-4" />}
                      </button>
                    );
                  })}
                </div>
              </Step>
            )}
            {step === 3 && (
              <Step title="Your finances (optional)" subtitle="Used to show savings progress. Stored only on this computer. Leave blank to skip — the examples are placeholders, not defaults.">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Monthly net income (R)" htmlFor="ob-inc"><Input id="ob-inc" inputMode="decimal" value={s.income} onChange={(e) => set("income", e.target.value)} placeholder={EXAMPLE.income} /></Field>
                  <Field label="Current savings (R)" htmlFor="ob-sav"><Input id="ob-sav" inputMode="decimal" value={s.savings} onChange={(e) => set("savings", e.target.value)} placeholder={EXAMPLE.savings} /></Field>
                  <Field label="Monthly savings goal (R)" htmlFor="ob-mon"><Input id="ob-mon" inputMode="decimal" value={s.monthly} onChange={(e) => set("monthly", e.target.value)} placeholder={EXAMPLE.monthly} /></Field>
                  <Field label="First savings milestone (R)" htmlFor="ob-first"><Input id="ob-first" inputMode="decimal" value={s.first} onChange={(e) => set("first", e.target.value)} placeholder={EXAMPLE.first} /></Field>
                  <Field label="Long-term milestone (R)" htmlFor="ob-long"><Input id="ob-long" inputMode="decimal" value={s.longTerm} onChange={(e) => set("longTerm", e.target.value)} placeholder={EXAMPLE.longTerm} /></Field>
                </div>
                {money(s.first) && money(s.monthly) ? (
                  <p className="text-xs text-muted-foreground">
                    Projection (estimate): at {formatMoney(money(s.monthly)!)} a month, {formatMoney(money(s.first)!)} is reached in about {Math.max(0, Math.ceil(((money(s.first) ?? 0) - (money(s.savings) ?? 0)) / money(s.monthly)!))} months.
                  </p>
                ) : null}
                {badMoney && <p className="text-xs text-danger">Use plain amounts like 25000 or 25 000,00.</p>}
              </Step>
            )}
            {step === 4 && (
              <Step title="A sustainable rhythm" subtitle="How many daily quests feel manageable? You'll get a gentle warning above this, never a penalty.">
                <Field label="Daily quest limit" htmlFor="ob-limit" hint="Rest days and skipping are always penalty-free. You can change this in Settings.">
                  <Input id="ob-limit" type="number" min={1} max={50} value={s.dailyLimit} onChange={(e) => set("dailyLimit", e.target.value)} className="w-32" />
                </Field>
              </Step>
            )}
            {step === 5 && (
              <Step title="What do you enjoy?" subtitle="Rewards are real-life treats and experiences. Rest, food and relationships are never things you have to earn.">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Reward categories">
                  {REWARD_CATEGORIES.map((c) => {
                    const on = s.rewardCategories.includes(c);
                    return (
                      <button key={c} type="button" aria-pressed={on} onClick={() => set("rewardCategories", on ? s.rewardCategories.filter((x) => x !== c) : [...s.rewardCategories, c])}
                        className={cn("rounded-full border px-3.5 py-1.5 text-sm", on ? "border-accent bg-accent text-background" : "border-border text-muted-foreground hover:text-foreground")}>
                        {c}
                      </button>
                    );
                  })}
                </div>
                <Field label="Monthly reward allowance (R, optional)" htmlFor="ob-allow" hint="Money set aside for paid rewards. Kept separate from savings and debt payments.">
                  <Input id="ob-allow" inputMode="decimal" value={s.allowance} onChange={(e) => set("allowance", e.target.value)} placeholder="e.g. 1 000" className="w-48" />
                </Field>
              </Step>
            )}
            {step === 6 && (
              <Step title="AI strategist (optional)" subtitle="LEVEL ONE works fully without AI. If you add a Claude API key it stays on this computer's server and is never shown in the browser.">
                <Field label="Claude API key" htmlFor="ob-key" hint="You can add or remove this later in Settings.">
                  <Input id="ob-key" type="password" autoComplete="off" value={s.apiKey} onChange={(e) => set("apiKey", e.target.value)} placeholder="sk-ant-..." />
                </Field>
              </Step>
            )}
            {step === 7 && (
              <Step title="Ready." subtitle="One last choice.">
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-surface px-4 py-4">
                  <span>
                    <span className="block text-sm font-medium">Start with demo quests and rewards</span>
                    <span className="block text-xs text-muted-foreground">Six example quests and eight example rewards, tagged “Demo”. Remove them any time in Settings.</span>
                  </span>
                  <Switch checked={s.demo} onCheckedChange={(v) => set("demo", v)} aria-label="Load demo data" />
                </label>
              </Step>
            )}
          </motion.section>
        </AnimatePresence>

        <div className="mt-8 flex items-center justify-between">
          <div>
            {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}><ArrowLeft /> Back</Button>}
          </div>
          <div className="flex items-center gap-2">
            {step === 0 && <Button variant="ghost" onClick={finish} disabled={onboard.isPending}>Skip setup</Button>}
            {step > 0 && !last && <Button variant="ghost" onClick={() => setStep(step + 1)}>Skip</Button>}
            <Button size="lg" onClick={next} disabled={onboard.isPending || (step === 3 && badMoney) || (last && badMoney)}>
              {last ? (onboard.isPending ? "Setting up..." : "Enter LEVEL ONE") : step === 0 ? "Begin" : "Continue"} {!last && <ArrowRight />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
