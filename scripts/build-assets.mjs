/**
 * Writes the files in public/ that are generated from TypeScript in src/, so
 * the page and the Worker share one definition of each:
 *
 *   public/js/constants.js    src/shared/constants.ts, compiled
 *   public/js/constants.d.ts  its declarations, which type the front end
 *
 * Generated files are gitignored. npm's pretypecheck, pretest and precoverage
 * hooks run this script, and wrangler runs it as build.command before `dev`
 * and `deploy`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const compilerOptions = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };

/** Write `output.outputText` to `path` under a banner naming `source`; refuse output with diagnostics. */
function emit(path, source, output, comment = '//') {
  if (output.diagnostics?.length) {
    const why = output.diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
    throw new Error(`${source}: ${why.join('; ')}`);
  }
  const banner = `${comment} Generated from ${source} by scripts/build-assets.mjs. Edit that file, not this one.\n`;
  writeFileSync(new URL(path, root), banner + output.outputText);
}

const CONSTANTS = 'src/shared/constants.ts';
const constants = readFileSync(new URL(CONSTANTS, root), 'utf8');
emit('public/js/constants.js', CONSTANTS, ts.transpileModule(constants, { compilerOptions }));
emit(
  'public/js/constants.d.ts',
  CONSTANTS,
  ts.transpileDeclaration(constants, { compilerOptions }),
);
