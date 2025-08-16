// Minimal unified diff parser & applier (text files only). Not bulletproof; safe-fails on mismatch.
export function parseUnifiedDiff(diffText) {
  const lines = diffText.replace(/\r\n/g, "\n").split("\n");
  const files = [];
  let current = null;
  function startFile() {
    if (current) files.push(current);
    current = { oldPath: null, newPath: null, hunks: [], isDelete: false, isCreate: false };
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("diff --git")) { startFile(); continue; }
    if (line.startsWith("--- ")) {
      if (!current) startFile();
      current.oldPath = line.slice(4).trim().replace(/^a\//, "");
      if (current.oldPath === "/dev/null") { current.isCreate = true; current.oldPath = null; }
      continue;
    }
    if (line.startsWith("+++ ")) {
      if (!current) startFile();
      current.newPath = line.slice(4).trim().replace(/^b\//, "");
      if (current.newPath === "/dev/null") { current.isDelete = true; current.newPath = null; }
      continue;
    }
    const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (m) {
      current.hunks.push({
        oldStart: parseInt(m[1],10),
        oldLines: parseInt(m[2]||"0",10),
        newStart: parseInt(m[3],10),
        newLines: parseInt(m[4]||"0",10),
        lines: []
      });
      continue;
    }
    if (current && current.hunks.length) {
      const h = current.hunks[current.hunks.length-1];
      if (/^[ +\-]/.test(line)) h.lines.push(line);
      // ignore other metadata lines
    }
  }
  if (current) files.push(current);
  // Filter invalid entries
  return files.filter(f => f.newPath || f.oldPath);
}

export function applyHunksToContent(originalText, hunks) {
  const orig = originalText.replace(/\r\n/g, "\n").split("\n");
  let out = [];
  let origIndex = 0;

  for (const h of hunks) {
    const targetIndex = h.oldStart - 1; // 1-based -> 0-based
    // copy unchanged up to hunk
    while (origIndex < targetIndex) {
      out.push(orig[origIndex++] ?? "");
    }
    // apply hunk lines
    for (const l of h.lines) {
      const sign = l[0];
      const val = l.slice(1);
      if (sign === ' ') {
        if ((orig[origIndex] ?? "") !== val) {
          throw new Error("Context mismatch while applying hunk");
        }
        out.push(val); origIndex++;
      } else if (sign === '-') {
        if ((orig[origIndex] ?? "") !== val) {
          throw new Error("Removal mismatch while applying hunk");
        }
        origIndex++;
      } else if (sign === '+') {
        out.push(val);
      }
    }
  }
  // tail
  while (origIndex < orig.length) out.push(orig[origIndex++] ?? "");
  // Normalize trailing newline
  return out.join("\n").replace(/\n?$/, "\n");
}
