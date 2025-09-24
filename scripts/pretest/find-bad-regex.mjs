// scripts/pretest/find-bad-regex.mjs
// Find files that contain invalid RegExp literals by compiling modules without executing them.
// Usage:
//   node scripts/pretest/find-bad-regex.mjs <folder> [folder2 ...]
// If no folders are provided, defaults to: tests src ctxpack lib app
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const argv = process.argv.slice(2).filter(Boolean);
const roots = argv.length ? argv : ["tests", "src", "ctxpack", "lib", "app"];
const exts = new Set([".mjs", ".js", ".cjs", ".mts", ".cts", ".ts"]); // TS allowed if plain enough

async function *walk(dir) {
  let ents;
  try {
    ents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of ents) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
      yield *walk(p);
    } else if (exts.has(path.extname(ent.name))) {
      yield p;
    }
  }
}

const failures = [];
for (const root of roots) {
  for await (const file of walk(root)) {
    const code = await fs.readFile(file, "utf8");
    try {
      const id = pathToFileURL(path.resolve(file)).href;
      const mod = new vm.SourceTextModule(code, {
        identifier: id,
        initializeImportMeta(meta) { meta.url = id; },
      });
      // Linking is enough to surface syntax issues across imports without execution.
      await mod.link(() => ({}) );
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/Invalid regular expression/i.test(msg)) {
        failures.push({ file, message: msg.split("\n")[0] });
        console.error(`[bad-regex] ${file}: ${msg.split("\n")[0]}`);
      }
    }
  }
}

if (failures.length) {
  console.error(`\nFound ${failures.length} file(s) with invalid regex literals.`);
  console.error(`Scanned folders: ${roots.join(", ")}`);
  process.exit(1);
} else {
  console.log(`[bad-regex] OK. Scanned folders: ${roots.join(", ")}`);
}
