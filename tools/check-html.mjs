#!/usr/bin/env node
// HTML parse-validity gate.
//
// Fails ONLY on a true parse error (e.g. an unescaped quote that terminates an
// attribute early), NOT on formatting drift — that stays advisory via the
// `format:check` script. This closes the blind spot that let attribute-quote
// bugs ship in options.html and library.html past node --check + vitest + eslint
// (none of which look at HTML).
//
// Uses prettier's parser via its Node API: prettier.format() throws on a parse
// error and merely reformats on style differences, so a thrown error is a real
// structural problem, not a whitespace nit.

import prettier from 'prettier';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const files = execSync('git ls-files "*.html"', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

const failures = [];
for (const file of files) {
  try {
    await prettier.format(readFileSync(file, 'utf8'), { parser: 'html', filepath: file });
  } catch (err) {
    failures.push({ file, message: String(err.message).split('\n')[0] });
  }
}

if (failures.length > 0) {
  console.error(`HTML parse check FAILED — ${failures.length} file(s) with structural errors:\n`);
  for (const { file, message } of failures) {
    console.error(`  ${file}: ${message}`);
  }
  console.error('\nThese are real parse errors (often an unescaped " inside an attribute). Fix the markup.');
  process.exit(1);
}

console.log(`HTML parse check passed — ${files.length} file(s) parse cleanly.`);
