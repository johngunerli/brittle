// Minimal, no-deps smoke helpers for manual verification.
//
// This repo intentionally doesn't ship with a test runner (jest/vitest/etc).
// Keep anything "test-like" out of `*.test.ts` files so Next/TS tooling
// doesn't assume a test environment.

import { markdownToHtml, upsertPostsJs } from './blogExport';

export function smokeMarkdownToHtml() {
  const html = markdownToHtml('# Title\n\nHello');
  if (!html.includes('<h1>Title</h1>')) throw new Error('markdownToHtml: missing h1');
  if (!html.includes('<p>Hello</p>')) throw new Error('markdownToHtml: missing paragraph');
}

export function smokeUpsertPostsJs() {
  const source = "const posts = {\n  'a': { title: 'A', date: 'x', meta: 'm', tags: [], body: `<p>A</p>` },\n};\n";
  const next = upsertPostsJs(source, 'b', {
    title: 'B',
    date: 'y',
    meta: 'm',
    tags: ['t'],
    body: '<p>B</p>',
  });

  if (!next.includes("'b':")) throw new Error('upsertPostsJs: did not insert');
}
