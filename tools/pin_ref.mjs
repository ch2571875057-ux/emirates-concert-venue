#!/usr/bin/env node
// 把 index.html 里 CDN 的 REF 固定到指定提交（默认当前 HEAD）。
//
// 为什么不用 @main：jsDelivr 对 @main 的缓存最长 12 小时。改完代码、Pages 也更新了，
// 但资源还从旧缓存来，表现为「本地好好的，线上还是老样子」——排查过很久。
// 固定 SHA 后每个提交的内容是确定的，jsDelivr 也把它当不可变资源长期缓存。
//
// 用法：
//   node tools/pin_ref.mjs              固定到当前 HEAD
//   node tools/pin_ref.mjs <sha|branch> 固定到指定提交（会先解析成完整 sha）
//   node tools/pin_ref.mjs --check      只检查 REF 是否等于 HEAD（CI/提交前用）
//
// 发版顺序：先 commit 资源改动 → 再跑本脚本 → commit index.html。
// 这样 REF 指向的提交里已经包含了最新资源。

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'index.html');

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

const arg = process.argv[2] || 'HEAD';
const checkOnly = arg === '--check';
const head = git('rev-parse', checkOnly ? 'HEAD' : arg);
if (!/^[0-9a-f]{40}$/.test(head)) {
  console.error(`[pin_ref] 无法解析提交：${arg}`);
  process.exit(1);
}

const src = readFileSync(FILE, 'utf8');
const re = /(var REF = ')([0-9a-f]{40})(';)/;
if (!re.test(src)) {
  console.error('[pin_ref] index.html 里找不到 `var REF = \'<40位sha>\';`');
  process.exit(1);
}
const cur = src.match(re)[2];

if (checkOnly) {
  if (cur === git('rev-parse', 'HEAD')) {
    console.log(`[pin_ref] OK REF=${cur.slice(0, 8)} (= HEAD)`);
    process.exit(0);
  }
  // REF 永远比 HEAD 落后一个提交是正常的：REF 那个提交里装着资源，
  // 随后这个提交只改 index.html 自己。所以只要求 REF 是 HEAD 的祖先，
  // 且两者之间除 index.html / 本脚本外没有别的文件变动。
  try { git('merge-base', '--is-ancestor', cur, 'HEAD'); }
  catch { console.error(`[pin_ref] REF=${cur.slice(0, 8)} 不在当前分支历史上`); process.exit(1); }
  const NL = String.fromCharCode(10);
  const changed = git('diff', '--name-only', cur, 'HEAD').split(NL).filter(Boolean);
  const stray = changed.filter((f) => f !== 'index.html' && f !== 'tools/pin_ref.mjs');
  if (stray.length) {
    console.error(`[pin_ref] REF=${cur.slice(0, 8)} 之后有资源改动未进 REF：`);
    for (const f of stray) console.error('  ' + f);
    console.error('[pin_ref] 跑 `node tools/pin_ref.mjs` 把 REF 推到含这些改动的最新提交');
    process.exit(1);
  }
  console.log(`[pin_ref] OK REF=${cur.slice(0, 8)}（之后只改了 index.html）`);
  process.exit(0);
}

if (cur === head) {
  console.log(`[pin_ref] 已是 ${head.slice(0, 8)}，未改动`);
  process.exit(0);
}
writeFileSync(FILE, src.replace(re, `$1${head}$3`), 'utf8');
console.log(`[pin_ref] REF ${cur.slice(0, 8)} → ${head.slice(0, 8)}`);
