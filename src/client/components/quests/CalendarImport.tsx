import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useInvalidateProgress } from "@/lib/queries";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface Suggestion {
  uid: string;
  title: string;
  date: string;
  time: string | null;
  recurring: boolean;
  alreadyImported: boolean;
}

/**
 * Turns an exported calendar (.ics from Google Calendar, Outlook or Apple Calendar) into
 * suggested one-time quests. Nothing is created until the user picks events and confirms.
 */
export function CalendarImport() {
  const invalidate = useInvalidateProgress();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<Suggestion[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const ics = await file.text();
      const res = await api.post<Suggestion[]>("/api/integrations/calendar/preview", { ics, days: 30 });
      setEvents(res);
      setSelected(new Set(res.filter((e) => !e.alreadyImported).map((e) => e.uid)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const importSelected = async () => {
    if (!events) return;
    setBusy(true);
    try {
      const chosen = events.filter((e) => selected.has(e.uid)).map((e) => ({ title: e.title, date: e.date, time: e.time }));
      const r = await api.post<{ created: number; skipped: number }>("/api/integrations/calendar/import", { events: chosen });
      toast.info(`${r.created} quest${r.created === 1 ? "" : "s"} added from your calendar`, r.skipped ? `${r.skipped} already existed` : undefined);
      invalidate();
      setOpen(false);
      setEvents(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><CalendarPlus /> From calendar</Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEvents(null); }}>
        <DialogContent title="Suggest quests from your calendar" description="Export your calendar as an .ics file (Google Calendar: Settings → Import & export → Export). It's read on this computer only. You choose which events become quests.">
          {!events ? (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-10 text-center hover:bg-surface-2">
              <CalendarPlus className="mb-2 size-6 text-muted-foreground" />
              <span className="text-sm font-medium">{busy ? "Reading..." : "Choose an .ics file"}</span>
              <span className="mt-1 text-xs text-subtle-foreground">Events in the next 30 days are shown</span>
              <input type="file" accept=".ics,text/calendar" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events in the next 30 days.</p>
          ) : (
            <>
              <ul tabIndex={0} aria-label="Calendar events" className="max-h-80 space-y-1 overflow-y-auto">
                {events.map((e) => (
                  <li key={e.uid}>
                    <label className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-2">
                      <input type="checkbox" className="accent-[#d4d4d8]" disabled={e.alreadyImported} checked={selected.has(e.uid)} onChange={(ev) => { const n = new Set(selected); if (ev.target.checked) n.add(e.uid); else n.delete(e.uid); setSelected(n); }} />
                      <span className="flex-1">{e.title}</span>
                      {e.recurring && <Badge variant="outline">Repeats</Badge>}
                      {e.alreadyImported && <Badge>Added</Badge>}
                      <span className="text-xs text-subtle-foreground tabular-nums">{formatDate(e.date, undefined, { day: "numeric", month: "short" })}{e.time ? ` ${e.time}` : ""}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEvents(null)}>Choose another file</Button>
                <Button disabled={busy || selected.size === 0} onClick={() => void importSelected()}>Add {selected.size} as quest{selected.size === 1 ? "" : "s"}</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
