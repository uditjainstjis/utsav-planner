import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every file a comment or a document names must exist. A renamed or split
 * module otherwise leaves its old name in prose no compiler reads. In code,
 * only comments are read: imports are the compiler's to check.
 *
 * The files read are the tracked ones; the files that count as existing are
 * those on disk, so the generated ones (public/js/constants.js and the rest)
 * count once the build has written them, as it has before any test runs.
 */

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n');
const onDisk = readdirSync('.', { recursive: true, encoding: 'utf8' }).filter(
  (f) => !/^(?:node_modules|\.git|coverage|\.wrangler)\//.test(f),
);
const known = new Set([...onDisk, ...onDisk.map((f) => basename(f))]);
const exists = (path: string): boolean =>
  known.has(path) || known.has(`${path}.ts`) || onDisk.some((f) => f.startsWith(`${path}/`));

/** A repository path, "src/lib/dates.ts", or a relative one, "../src/lib/dates". */
const PATH = /(?<![\w./-])(?:\.\.?\/)*((?:src|test|public|docs|scripts)\/[\w./*-]*\w)/g;
/** A bare file name, "dates.ts". */
const NAME = /(?<![\w./@-])([\w-]+(?:\.[\w-]+)*\.(?:ts|js|mjs|jsonc?|md|css|html))\b/g;
/** A comment line, or the comment after code on a line. */
const COMMENT = /^\s*(?:\*|\/\/|\/\*)(.*)$|\s\/\/\s(.*)$/;

/** The lines of `file` that name files: all of a document, the comments of code. */
function prose(file: string): string[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  if (/\.(?:md|html)$/.test(file)) return lines;
  return lines.map((line) => {
    const m = COMMENT.exec(line);
    return m ? (m[1] ?? m[2] ?? '') : '';
  });
}

describe('file names in comments and documents', () => {
  it('name only files that exist', () => {
    const missing: string[] = [];
    const read = tracked.filter((f) => /\.(?:ts|js|mjs|jsonc?|md|css|html)$/.test(f));
    for (const file of read.filter((f) => f !== 'package-lock.json')) {
      prose(file).forEach((line, i) => {
        for (const [, path = ''] of line.matchAll(PATH)) {
          if (!path.includes('*') && !exists(path)) missing.push(`${file}:${i + 1} ${path}`);
        }
        for (const [, name = ''] of line.matchAll(NAME)) {
          if (!known.has(name)) missing.push(`${file}:${i + 1} ${name}`);
        }
      });
    }
    expect(read.length).toBeGreaterThan(50);
    expect(missing).toEqual([]);
  });
});
