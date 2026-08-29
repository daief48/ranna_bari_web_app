/**
 * Find database calls inside a transaction that forget `{ session }`.
 *
 * This is the single most dangerous mistake in this codebase and it raises no
 * error. A Mongoose query without the session runs OUTSIDE the transaction:
 * it commits on its own, it is not rolled back with the rest, and everything
 * looks fine until a failure halfway through a checkout leaves stock
 * decremented and no order to show for it.
 *
 * So it gets a checker rather than a code-review habit.
 *
 * It works by bracket balance, not by a line window — a Mongoose call can run
 * thirty lines and the options object is always last, so anything that guesses
 * a fixed lookahead produces false positives and teaches people to ignore it.
 *
 * Run with `npm run check:sessions`. Exits non-zero on a finding.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MODELS =
  'Account|OtpChallenge|AppSession|Kitchen|Dish|Meal|MealInterest|Store|StoreCategory|' +
  'Product|Cart|TaxonomyCategory|Request|Offer|Order|LedgerEntry|PayoutRun|PayoutItem|' +
  'TopUp|Dispute|Review|Notification|Zone|Setting|FeatureFlag|AdminUser|AuditLog|' +
  'ChatThread|ChatMessage';

/** Reads and writes. Aggregations take `.session()` instead, handled below. */
const OPS =
  'create|insertMany|updateOne|updateMany|findOneAndUpdate|findOneAndDelete|' +
  'bulkWrite|deleteOne|deleteMany|replaceOne|findOne|findById|find|countDocuments|exists|aggregate';

const CALL = new RegExp(`\\b(${MODELS})\\.(${OPS})\\b`);

type Finding = { file: string; line: number; text: string };

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * From `start`, walk forward to the end of the STATEMENT.
 *
 * Paren balance alone is not enough. Mongoose's query builder chains, so
 *
 *     const left = await StoreCategory.find({ storeId })
 *       .sort({ order: 1 })
 *       .session(session)
 *
 * balances its parentheses on the very first line and the session arrives two
 * lines later. Stopping at balance flags that as a violation, and a checker
 * that cries wolf is one people learn to ignore — which is worse than not
 * having it.
 */
function callSpan(lines: string[], start: number): { text: string; end: number } {
  let depth = 0;
  const parts: string[] = [];

  for (let i = start; i < lines.length && i < start + 120; i++) {
    const line = lines[i]!;
    parts.push(line);
    for (const ch of line) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }

    const trimmed = line.trim();
    const next = lines[i + 1]?.trim() ?? '';

    // The statement ends when the parens are closed, this line terminates it,
    // and the next line is not a continuation of the chain.
    if (depth <= 0 && /[;,]$/.test(trimmed) && !next.startsWith('.')) {
      return { text: parts.join('\n'), end: i };
    }
  }
  return { text: parts.join('\n'), end: start };
}

function check(file: string): Finding[] {
  const src = readFileSync(file, 'utf8');
  if (!src.includes('tx(')) return [];

  const lines = src.split('\n');
  const findings: Finding[] = [];

  /* Track transaction depth by brace balance from the `tx(` that opened it,
     so a call after the transaction closes is not flagged. */
  let txDepth: number | null = null;
  let brace = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (txDepth === null && /\btx\(\s*async|\btx\(\s*\(/.test(line)) txDepth = brace;

    brace += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (txDepth !== null && brace <= txDepth) txDepth = null;

    if (txDepth === null) continue;
    if (!CALL.test(line)) continue;

    const { text, end } = callSpan(lines, i);

    /* Two legitimate shapes: an options object `{ session }`, or a chained
       `.session(session)` — aggregations and query builders take the latter. */
    if (!/\bsession\b/.test(text)) {
      findings.push({ file, line: i + 1, text: line.trim().slice(0, 90) });
    }
    i = end;
  }

  return findings;
}

const files = walk(join(process.cwd(), 'src'));
const findings = files.flatMap(check);

const rel = (p: string) => p.replace(process.cwd(), '').replace(/\\/g, '/').replace(/^\//, '');

if (findings.length === 0) {
  console.log(
    `\n  ok — every in-transaction database call across ${files.length} files passes a session\n`,
  );
  process.exit(0);
}

console.log(`\n  ${findings.length} in-transaction call(s) with no session:\n`);
for (const f of findings) console.log(`    ${rel(f.file)}:${f.line}\n      ${f.text}`);
console.log(
  '\n  A query without the session commits on its own and is not rolled back.\n',
);
process.exit(1);
