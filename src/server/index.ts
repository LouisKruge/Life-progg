import fs from "node:fs";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { systemClock } from "./context.js";
import { Store } from "./db/store.js";
import { registerPreMigrationBackup } from "./services/backup.js";

async function main() {
  const config = loadConfig();
  const store = new Store({ file: config.dbFile, backupDir: config.backupDir });
  const ctx = { store, clock: systemClock };
  registerPreMigrationBackup(ctx);

  const clientDir = config.clientDir && fs.existsSync(config.clientDir) ? config.clientDir : null;
  const app = buildApp({ ctx, clientDir, dataDir: config.dataDir, logger: process.env.LEVELONE_LOG === "1" });

  const shutdown = async () => {
    await app.close();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ host: config.host, port: config.port });
  console.log(`\n  LEVEL ONE is running`);
  console.log(`  ${clientDir ? "App" : "API"}:  http://${config.host}:${config.port}`);
  if (!clientDir) console.log(`  UI (dev): http://127.0.0.1:5173`);
  console.log(`  Data: ${config.dataDir}`);
  if (store.lastPreMigrationBackup) console.log(`  Pre-upgrade backup: ${store.lastPreMigrationBackup}`);
  console.log(`  Press Ctrl+C to stop.\n`);
}

main().catch((err) => {
  console.error("LEVEL ONE failed to start:", err);
  process.exit(1);
});
