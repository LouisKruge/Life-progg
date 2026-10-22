import { useEffect, useState } from "react";
import { QUEST_DIFFICULTIES, QUEST_FREQUENCIES, QUEST_KINDS, type Quest, type QuestDifficulty, type QuestFrequency, type QuestKind, type QuestVerification } from "@shared/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useCategories, useSaveQuest, useSettings } from "@/lib/queries";
import { closeQuestEditor, questEditorStore } from "@/lib/ui-state";
import { WEEKDAYS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DIFFICULTY_LABEL, FREQUENCY_LABEL, KIND_LABEL } from "./meta";

interface FormState {
  title: string;
  description: string;
  categoryId: string;
  kind: QuestKind;
  difficulty: QuestDifficulty;
  xpReward: string;
  creditReward: string;
  frequency: QuestFrequency;
  recurrenceDays: number[];
  completionRequirements: string;
  verification: QuestVerification;
  dueDate: string;
  isOptional: boolean;
}

function initial(q: Quest | null): FormState {
  return {
    title: q?.title ?? "",
    description: q?.description ?? "",
    categoryId: q?.categoryId ? String(q.categoryId) : "",
    kind: q?.kind ?? "standard",
    difficulty: q?.difficulty ?? "medium",
    xpReward: q ? String(q.xpReward) : "",
    creditReward: q ? String(q.creditReward) : "",
    frequency: q?.frequency ?? "daily",
    recurrenceDays: q?.recurrenceDays ?? [1, 3, 5],
    completionRequirements: q?.completionRequirements ?? "",
    verification: q?.verification ?? "none",
    dueDate: q?.dueDate ?? "",
    isOptional: q?.isOptional ?? false,
  };
}

/** Create / edit quest dialog. Mounted once in the app shell and opened via `openQuestEditor`. */
export function QuestEditor() {
  const { open, quest } = questEditorStore.use();
  const { data: categories } = useCategories();
  const { data: settings } = useSettings();
  const save = useSaveQuest();
  const [f, setF] = useState<FormState>(() => initial(quest));

  useEffect(() => {
    if (open) setF(initial(quest));
  }, [open, quest]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const defaults = settings?.difficultyRewards[f.difficulty];
  const editing = Boolean(quest);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = {
      title: f.title.trim(),
      description: f.description.trim(),
      categoryId: f.categoryId ? Number(f.categoryId) : null,
      kind: f.kind,
      difficulty: f.difficulty,
      xpReward: f.xpReward === "" ? defaults?.xp : Number(f.xpReward),
      creditReward: f.creditReward === "" ? defaults?.credits : Number(f.creditReward),
      ...(editing ? {} : { frequency: f.frequency }),
      recurrenceDays: f.frequency === "custom" ? f.recurrenceDays : [],
      completionRequirements: f.completionRequirements.trim(),
      verification: f.verification,
      dueDate: f.frequency === "once" && f.dueDate ? f.dueDate : null,
      isOptional: f.isOptional,
    };
    save.mutate({ id: quest?.id, values }, { onSuccess: () => closeQuestEditor() });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeQuestEditor()}>
      <DialogContent title={editing ? "Edit quest" : "New quest"} description={editing ? "Changes apply to future completions. Past rewards stay as they were." : "Make it small enough to actually do."} className="w-[min(640px,calc(100vw-2rem))]">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Title" htmlFor="q-title">
            <Input id="q-title" autoFocus required maxLength={120} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Move for 30 minutes" />
          </Field>
          <Field label="Description" htmlFor="q-desc">
            <Textarea id="q-desc" maxLength={2000} value={f.description} onChange={(e) => set("description", e.target.value)} className="min-h-16" />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Frequency" htmlFor="q-freq" hint={editing ? "Locked once a quest has history." : undefined}>
              <NativeSelect id="q-freq" value={f.frequency} disabled={editing} onChange={(e) => set("frequency", e.target.value as QuestFrequency)}>
                {QUEST_FREQUENCIES.map((x) => <option key={x} value={x}>{FREQUENCY_LABEL[x]}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Category" htmlFor="q-cat">
              <NativeSelect id="q-cat" value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">None</option>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Type" htmlFor="q-kind">
              <NativeSelect id="q-kind" value={f.kind} onChange={(e) => set("kind", e.target.value as QuestKind)}>
                {QUEST_KINDS.map((x) => <option key={x} value={x}>{KIND_LABEL[x]}</option>)}
              </NativeSelect>
            </Field>
          </div>

          {f.frequency === "custom" && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Repeat on</div>
              <div className="flex gap-1.5" role="group" aria-label="Repeat on weekdays">
                {WEEKDAYS.map((d, i) => {
                  const on = f.recurrenceDays.includes(i);
                  return (
                    <button
                      type="button"
                      key={d}
                      aria-pressed={on}
                      onClick={() => set("recurrenceDays", on ? f.recurrenceDays.filter((x) => x !== i) : [...f.recurrenceDays, i])}
                      className={cn("h-8 w-11 rounded-md border text-xs", on ? "border-accent bg-accent text-background" : "border-border text-muted-foreground hover:text-foreground")}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {f.frequency === "once" && (
            <Field label="Due date (optional)" htmlFor="q-due">
              <Input id="q-due" type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} className="w-48 [color-scheme:dark]" />
            </Field>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Field label="Difficulty" htmlFor="q-diff">
              <NativeSelect id="q-diff" value={f.difficulty} onChange={(e) => set("difficulty", e.target.value as QuestDifficulty)}>
                {QUEST_DIFFICULTIES.map((x) => <option key={x} value={x}>{DIFFICULTY_LABEL[x]}</option>)}
              </NativeSelect>
            </Field>
            <Field label="XP reward" htmlFor="q-xp">
              <Input id="q-xp" type="number" min={0} max={10000} value={f.xpReward} placeholder={String(defaults?.xp ?? "")} onChange={(e) => set("xpReward", e.target.value)} />
            </Field>
            <Field label="Credit reward" htmlFor="q-cr">
              <Input id="q-cr" type="number" min={0} max={1000} value={f.creditReward} placeholder={String(defaults?.credits ?? "")} onChange={(e) => set("creditReward", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Verification" htmlFor="q-ver" hint="Keep daily habits on “None” so tracking stays light.">
              <NativeSelect id="q-ver" value={f.verification} onChange={(e) => set("verification", e.target.value as QuestVerification)}>
                <option value="none">None - just tick it off</option>
                <option value="note">Short note required</option>
                <option value="confirm">Explicit confirmation</option>
              </NativeSelect>
            </Field>
            <Field label="Done when..." htmlFor="q-req">
              <Input id="q-req" maxLength={1000} value={f.completionRequirements} onChange={(e) => set("completionRequirements", e.target.value)} placeholder="Optional definition of done" />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3">
            <span>
              <span className="block text-sm">Optional challenge</span>
              <span className="block text-xs text-muted-foreground">Doesn't count toward daily completion or workload.</span>
            </span>
            <Switch checked={f.isOptional} onCheckedChange={(v) => set("isOptional", v)} aria-label="Optional challenge" />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeQuestEditor}>Cancel</Button>
            <Button type="submit" disabled={save.isPending || !f.title.trim()}>{save.isPending ? "Saving..." : editing ? "Save changes" : "Create quest"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
