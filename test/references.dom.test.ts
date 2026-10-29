import { readdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every file a comment or a document names must exist. A renamed or split
 * module otherwise leaves its old name in prose no compiler reads. In code,
 * only comments are read: imports are the compiler's to check.
 *
 * The files read are the repository's own: the tree on disk less what
 * .gitignore names (dependencies, generated files, local notes), so the test
 * runs the same from a checkout, an archive or a zip. The files that count as
 * existing include the generated ones (public/js/constants.js and the rest),
 * which the build has written before any test runs.
 */

const onDisk = readdirSync('.', { recursive: true, encoding: 'utf8' }).filter(
  (f) => !/^(?:node_modules|\.git|coverage|\.wrangler)\//.test(f),
);
const known = new Set([...onDisk, ...onDisk.map((f) => basename(f))]);
const exists = (path: string): boolean =>
  known.has(path) || known.has(`${path}.ts`) || onDisk.some((f) => f.startsWith(`${path}/`));

/**
 * A .gitignore line as a test on a path: a slash before its end anchors it at
 * the root, otherwise it matches at any depth; `*` stays within one segment.
 */
function gitignored(pattern: string): RegExp {
  const bare = pattern.replace(/\/$/, '');
  const glob = bare.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`${bare.includes('/') ? '^' : '(?:^|/)'}${glob}(?:/|$)`);
}
const IGNORED = readFileSync('.gitignore', 'utf8')
  .split('\n')
  .filter((line) => line.trim() && !line.startsWith('#'))
  .map((line) => gitignored(line.trim()));
const ours = onDisk.filter((f) => !IGNORED.some((re) => re.test(f)));

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
    const read = ours.filter((f) => /\.(?:ts|js|mjs|jsonc?|md|css|html)$/.test(f));
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
