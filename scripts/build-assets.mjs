/**
 * Writes the files in public/ that are generated from TypeScript in src/, so
 * the page, the edge and the Worker share one definition of each:
 *
 *   public/js/constants.js    src/shared/constants.ts, compiled
 *   public/js/constants.d.ts  its declarations, which type the front end
 *   public/js/dates.js        src/lib/dates.ts, compiled, with its .d.ts
 *   public/_headers           headersFile() from src/lib/headers.ts
 *
 * Generated files are gitignored. npm's pretypecheck, prelint, pretest and
 * precoverage hooks run this script, and wrangler runs it as build.command
 * before `dev` and `deploy`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const compilerOptions = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };

/** The output text of a TypeScript transform, or an error naming why it failed. */
function text(source, { outputText, diagnostics = [] }) {
  if (diagnostics.length === 0) return outputText;
  const why = diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
  throw new Error(`${source}: ${why.join('; ')}`);
}

/** Write `body` to `path` under a `comment`-style line naming its source. */
function emit(path, source, body, comment = '//') {
  const banner = `${comment} Generated from ${source} by scripts/build-assets.mjs. Edit that file, not this one.\n`;
  writeFileSync(new URL(path, root), banner + body);
}

const read = (path) => readFileSync(new URL(path, root), 'utf8');
const compile = (path) => text(path, ts.transpileModule(read(path), { compilerOptions }));
const declare = (path) => text(path, ts.transpileDeclaration(read(path), { compilerOptions }));

// Each of these imports nothing, so its compiled copy stands alone in the page.
for (const [source, name] of [
  ['src/shared/constants.ts', 'constants'],
  ['src/lib/dates.ts', 'dates'],
]) {
  emit(`public/js/${name}.js`, source, compile(source));
  emit(`public/js/${name}.d.ts`, source, declare(source));
}

// headers.ts imports nothing, so its compiled text runs as a module on its own.
const HEADERS = 'src/lib/headers.ts';
const { headersFile } = await import(
  `data:text/javascript,${encodeURIComponent(compile(HEADERS))}`
);
emit('public/_headers', HEADERS, headersFile(), '#');
