import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const MARKER = "/* browserpod-abort-fix */";
const prefix = dirname(dirname(process.execPath));
const root = process.argv[2] || join(prefix, "lib", "node_modules");
const target = join("pi-coding-agent", "dist", "core", "tools", "bash.js");

const ABORT_FROM = `                const onAbort = () => {
                    if (child.pid)
                        killProcessTree(child.pid);
                };`;
const ABORT_TO = `                ${MARKER}
                const forceExit = () => setTimeout(() => {
                    child.stdout?.destroy();
                    child.stderr?.destroy();
                    child.emit("exit", null, "SIGKILL");
                }, 500);
                const onAbort = () => {
                    if (child.pid)
                        killProcessTree(child.pid);
                    forceExit();
                };`;
const TIMEOUT_FROM = `                        timedOut = true;
                        if (child.pid)
                            killProcessTree(child.pid);`;
const TIMEOUT_TO = `${TIMEOUT_FROM}
                        forceExit();`;

function findFiles(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    if (name === "pi-coding-agent") {
      const file = join(dirname(full), target);
      try {
        if (statSync(file).isFile()) found.push(file);
      } catch {}
      continue;
    }
    findFiles(full, found);
  }
  return found;
}

const files = findFiles(root);
if (files.length === 0) {
  console.error(`No pi-coding-agent bash tool found under ${root}`);
  process.exit(1);
}
let failed = false;
for (const file of files) {
  const src = readFileSync(file, "utf-8");
  if (src.includes(MARKER)) {
    console.log(`Already patched ${file}`);
    continue;
  }
  if (!src.includes(ABORT_FROM) || !src.includes(TIMEOUT_FROM)) {
    console.error(`Unexpected code in ${file}, not patched`);
    failed = true;
    continue;
  }
  writeFileSync(file, src.replace(ABORT_FROM, ABORT_TO).replace(TIMEOUT_FROM, TIMEOUT_TO));
  console.log(`Patched ${file}`);
}
if (failed) process.exit(1);
