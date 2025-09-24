// tests/harness/hooks-guard.mjs
// Use async_hooks to report live async resources at exit with init callsites.
import async_hooks from "node:async_hooks";

const ENABLED = process.env.LEAK_GUARD !== "0";
if (!ENABLED) { console.error("[hooks-guard] disabled via LEAK_GUARD=0"); }

function rel(p){
  try { return String(p).replace(/\\/g,'/').replace(process.cwd().replace(/\\/g,'/') + '/', ''); }
  catch { return String(p); }
}

const resources = new Map(); // id -> { type, stack }

if (ENABLED){
  const ah = async_hooks.createHook({
    init(id, type, triggerAsyncId){
      const e = new Error();
      const stack = (e.stack || "").split("\n").slice(2).filter(l => !l.includes("hooks-guard.mjs")).map(s => s.trim());
      resources.set(id, { type, stack });
    },
    destroy(id){ resources.delete(id); }
  });
  ah.enable();

  process.on("beforeExit", () => {
    if (!resources.size) return;
    console.error("[async-hooks] live async resources before exit:", resources.size);
    for (const [id, {type, stack}] of resources.entries()){
      // print only first few frames and any frame under tests/
      const frames = stack.filter(f => f.includes("tests/")).slice(0, 3);
      const head = frames[0] || stack[0] || "";
      console.error(` - id=${id} type=${type} at ${head}`);
    }
  });
}
export {};
