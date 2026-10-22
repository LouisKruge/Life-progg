// Starts the production server against a throwaway data directory for Playwright.
// Requires `npm run build` first so dist/client exists.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "levelone-e2e-"));
process.env.LEVELONE_DATA_DIR = dir;
process.env.LEVELONE_CLIENT_DIR = path.resolve("dist/client");
if (!fs.existsSync(process.env.LEVELONE_CLIENT_DIR)) {
  console.error("dist/client is missing - run `npm run build` before `npm run test:e2e`.");
  process.exit(1);
}
await import("../src/server/index.js");
