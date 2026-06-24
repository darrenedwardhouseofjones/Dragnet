#!/usr/bin/env node
/**
 * Copies tree-sitter .wasm grammars + runtime into public/grammars/ so the
 * Next.js runtime can load them via fetch. Idempotent — skips files that
 * already match the source. Silently exits 0 if sources are missing (npm
 * may run postinstall before peer deps resolve; subsequent runs fix it).
 */
import { mkdir, cp, stat, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const sources = [
  ["node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm", "tree-sitter-typescript.wasm"],
  ["node_modules/tree-sitter-typescript/tree-sitter-tsx.wasm", "tree-sitter-tsx.wasm"],
  ["node_modules/web-tree-sitter/web-tree-sitter.wasm", "web-tree-sitter.wasm"],
];

const destDir = resolve(root, "public", "grammars");

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function sameHash(src, dst) {
  // Cheap check: if size matches, skip the copy. fs.cp with force:false would
  // also skip but throws EEXIST on collision — size check is simpler.
  try {
    const [s, d] = await Promise.all([stat(src), stat(dst)]);
    return s.size === d.size;
  } catch {
    return false;
  }
}

await mkdir(destDir, { recursive: true });

let copied = 0;
let skipped = 0;
let missing = 0;

for (const [srcRel, destName] of sources) {
  const srcAbs = resolve(root, srcRel);
  const destAbs = resolve(destDir, destName);

  if (!(await exists(srcAbs))) {
    console.warn(`[copy-grammars] source missing, skipping: ${srcRel}`);
    missing++;
    continue;
  }

  if (await sameHash(srcAbs, destAbs)) {
    skipped++;
    continue;
  }

  await cp(srcAbs, destAbs, { force: true });
  copied++;
}

console.log(
  `[copy-grammars] done — ${copied} copied, ${skipped} up-to-date, ${missing} missing`
);
