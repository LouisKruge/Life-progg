import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppContext, Clock } from "../src/server/context.js";
import { Store } from "../src/server/db/store.js";

export class TestClock implements Clock {
  constructor(private current: Date) {}
  now() {
    return new Date(this.current);
  }
  set(iso: string) {
    this.current = new Date(iso);
  }
  advanceHours(h: number) {
    this.current = new Date(this.current.getTime() + h * 3_600_000);
  }
}

/** 10:00 in Johannesburg on Thursday 22 Oct 2026. */
export const START = "2026-10-22T08:00:00.000Z";

export function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "levelone-test-"));
}

export function makeCtx(opts: { file?: string; backupDir?: string; clock?: TestClock } = {}): AppContext & { clock: TestClock } {
  const clock = opts.clock ?? new TestClock(new Date(START));
  const store = new Store({ file: opts.file ?? ":memory:", backupDir: opts.backupDir ?? path.join(tempDir(), "backups") });
  return { store, clock };
}
