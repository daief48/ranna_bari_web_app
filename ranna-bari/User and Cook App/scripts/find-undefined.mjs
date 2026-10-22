/**
 * Static scan for identifiers used but never declared or imported — the
 * "n is not defined" class of crash. Plain .js only, JSX parsing, no
 * typechecking (this app is TypeScript-free by design).
 *
 * Scope resolution is babel's own (`path.scope.hasBinding`), the same check
 * ESLint's no-undef performs, so a miss here is a real ReferenceError at
 * runtime the first render touches it.
 *
 * Usage: node scripts/find-undefined.mjs [dir1 dir2 ...]  (default: app src)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

/* Globals that exist at runtime in Hermes/RN-web but are not imports. */
const GLOBALS = new Set([
  'console', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'setImmediate', 'clearImmediate', 'requestAnimationFrame',
  'cancelAnimationFrame', 'queueMicrotask', '__DEV__', 'process', 'global',
  'globalThis', 'FormData', 'Blob', 'URL', 'alert', 'AbortController',
  'structuredClone', 'localStorage', 'navigator', 'location', 'window',
  'document', 'WebSocket', 'Headers', 'Request', 'Response',
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      yield* walk(p);
    } else if (entry.endsWith('.js')) {
      yield p;
    }
  }
}

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['app', 'src'];
let bad = 0;
let files = 0;

for (const root of roots) {
  for (const file of walk(root)) {
    let ast;
    try {
      ast = parser.parse(readFileSync(file, 'utf8'), {
        sourceType: 'module',
        plugins: ['jsx'],
        errorRecovery: false,
      });
    } catch (e) {
      console.log(`PARSE FAIL  ${file}: ${e.message.split('\n')[0]}`);
      bad++;
      continue;
    }
    files++;
    const misses = new Map();
    traverse(ast, {
      ReferencedIdentifier(path) {
        const name = path.node.name;
        if (GLOBALS.has(name)) return;
        if (path.scope.hasBinding(name)) return;
        /* Unknown JSX member/name nodes arrive here too; skip namespaces. */
        misses.set(name, path.node.loc?.start?.line ?? 0);
      },
    });
    if (misses.size) {
      bad++;
      for (const [name, line] of [...misses.entries()].sort((a, b) => a[1] - b[1])) {
        console.log(`${relative(process.cwd(), file)}:${line}  ${name} is not defined`);
      }
    }
  }
}

console.log(`\nscanned ${files} files, ${bad} with problems`);
process.exit(0);
