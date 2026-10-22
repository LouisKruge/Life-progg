import os from "node:os";
import path from "node:path";

export interface ServerConfig {
  host: string;
  port: number;
  dataDir: string;
  dbFile: string;
  backupDir: string;
  /** Built client assets; null disables static serving (dev mode uses Vite instead). */
  clientDir: string | null;
}

/** Default data location: %APPDATA%\LevelOne on Windows, ~/.levelone elsewhere. Kept outside the project folder so re-installing the code never touches user data. */
export function defaultDataDir(): string {
  if (process.platform === "win32" && process.env.APPDATA) return path.join(process.env.APPDATA, "LevelOne");
  return path.join(os.homedir(), ".levelone");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = path.resolve(env.LEVELONE_DATA_DIR ?? defaultDataDir());
  return {
    // Loopback only by default: the app is never reachable from the network unless explicitly configured.
    host: env.LEVELONE_HOST ?? "127.0.0.1",
    port: Number(env.LEVELONE_PORT ?? 4317),
    dataDir,
    dbFile: path.join(dataDir, "levelone.db"),
    backupDir: path.join(dataDir, "backups"),
    clientDir: env.LEVELONE_CLIENT_DIR === "" ? null : path.resolve(env.LEVELONE_CLIENT_DIR ?? "dist/client"),
  };
}
