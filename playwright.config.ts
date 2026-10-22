import { defineConfig } from "@playwright/test";

const port = 4399;
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: "node --import tsx/esm e2e/start-test-server.ts",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    env: { LEVELONE_PORT: String(port) },
    timeout: 60_000,
  },
});
