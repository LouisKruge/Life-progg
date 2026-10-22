// Used by LevelOne.cmd: prints "install", "build" or "ok" depending on what is out of date,
// so pulling a new version and double-clicking the launcher is all an update needs.
import fs from "node:fs";
import path from "node:path";

const mtime = (p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0);

function newestIn(dir) {
  let newest = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestIn(p) : mtime(p));
  }
  return newest;
}

const installed = mtime("node_modules/.package-lock.json");
if (!installed || mtime("package-lock.json") > installed) {
  console.log("install");
} else {
  const built = mtime("dist/server/index.js");
  const sources = Math.max(newestIn("src"), newestIn("drizzle"), mtime("package.json"));
  console.log(!built || sources > built ? "build" : "ok");
}
