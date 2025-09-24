// scripts/pretest/find-bad-regex.mjs
// Fast-fail parser that locates files with invalid RegExp literals before tests run.
// Best practice: compile without executing. Reports file and line.
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const roots = ["tests", "src", "ctxpack", "lib"];
const exts = new Set([".mjs", ".js", ".cjs", ".mts", ".cts", ".ts"]); // ts allowed if plain enough

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
      // Compile only. Do not evaluate. Attach URL so stack shows the file.
      const mod = new vm.SourceTextModule(code, {
        identifier: pathToFileURL(path.resolve(file)).href,
        initializeImportMeta(meta) { meta.url = pathToFileURL(path.resolve(file)).href; },
      });
      await mod.link(() => ({}) ); // dummy linker
      // Parse phase happens on creation; link here to surface any import syntax too.
    } catch (e) {
      if (e && /Invalid regular expression/i.test(String(e.message))) {
        failures.push({ file, message: e.message.split("\n")[0] });
        console.error(`[bad-regex] ${file}: ${e.message.split("\n")[0]}`);
      }
    }
  }
}

if (failures.length) {
  console.error(`\nFound ${failures.length} file(s) with invalid regex literals.`);
  console.error("Fix the offending literal or convert to new RegExp('...') with proper escaping.");
  process.exit(1);
}
