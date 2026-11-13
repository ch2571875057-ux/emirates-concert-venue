// tools/verify_playlist.mjs
// 歌单与音频素材的离线断言（零依赖，不联网、不开浏览器）。
//
//   node tools/verify_playlist.mjs
//
// 校验：歌单契约（id/title/file）、文件存在与字节数、m4a 魔数与时长、
// 缺失条目的文档一致性。末尾打印 ALL ASSERTIONS PASSED。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AUDIO = path.join(ROOT, 'assets', 'audio');

let fails = 0;
const ok = (cond, msg) => {
  if (!cond) { fails++; console.log('  FAIL  ' + msg); } else { console.log('  ok    ' + msg); }
};

// ---------------------------------------------------------------- m4a 时长

function readBoxes(buf, start, end, visit) {
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    let header = 8;
    if (size === 1) {
      if (p + 16 > end) return;
      size = Number(buf.readBigUInt64BE(p + 8));
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < header || p + size > end) return;
    visit(type, p + header, p + size);
    p += size;
  }
}

function durationOf(buf) {
  let out = null;
  const walk = (start, end, depth) => {
    if (depth > 4 || out) return;
    readBoxes(buf, start, end, (type, s, e) => {
      if (type === 'mvhd') {
        const version = buf.readUInt8(s);
        if (version === 1) {
          const ts = buf.readUInt32BE(s + 20);
          if (ts > 0) out = Number(buf.readBigUInt64BE(s + 24)) / ts;
        } else {
          const ts = buf.readUInt32BE(s + 12);
          if (ts > 0) out = buf.readUInt32BE(s + 16) / ts;
        }
      } else if (type === 'moov' || type === 'trak' || type === 'mdia') {
        walk(s, e, depth + 1);
      }
    });
  };
  // 不能只扫前 1 MB：moov 可能在 mdat 之后（手机录音/微信转存常见）
  walk(0, buf.length, 0);
  return out;
}

// ---------------------------------------------------------------- 读 DATA

// data.js 是纯 ES module，可以直接 import（它只导出常量，不碰 DOM / three）
// Windows 下必须转成 file:// URL，否则动态 import 会把 E: 当成协议
const { DATA } = await import(pathToFileURL(path.join(ROOT, 'js', 'data.js')).href);
const PL = DATA?.playlist;

console.log('== 契约 ==');
ok(!!PL, 'DATA.playlist 存在');
ok(PL?.songs?.length === 5, `歌单共 5 首（实际 ${PL?.songs?.length}）`);
ok(PL?.audioDir === 'assets/audio/', `audioDir = ${PL?.audioDir}`);

const songs = PL?.songs || [];
const ids = new Set();
for (const [i, s] of songs.entries()) {
  ok(typeof s?.id === 'string' && s.id.length > 0, `第 ${i + 1} 条有 id（${s?.id}）`);
  ok(typeof s?.title === 'string' && s.title.length > 0, `第 ${i + 1} 条有 title（${s?.title}）`);
  ok(typeof s?.file === 'string' && s.file.endsWith('.m4a'), `第 ${i + 1} 条 file 是 .m4a（${s?.file}）`);
  ok(!ids.has(s?.id), `第 ${i + 1} 条 id 唯一（${s?.id}）`);
  ids.add(s?.id);
  ok(typeof s?.title === 'string' && !s.title.includes('object'), `第 ${i + 1} 条 title 不是对象串（${s?.title}）`);
}

console.log('\n== 素材 ==');
const rows = [];
for (const s of songs) {
  const full = path.join(AUDIO, s.file || '');
  const exists = !!s.file && fs.existsSync(full);
  if (s.missing) {
    console.log(`  ---   ${s.title.padEnd(10)} ${String(s.file).padEnd(16)} 标为暂缺，跳过文件校验`);
    continue;
  }
  ok(exists, `${s.file} 存在`);
  if (!exists) { rows.push({ title: s.title, file: s.file, bytes: 0, seconds: null }); continue; }
  const buf = fs.readFileSync(full);
  const ftyp = buf.length >= 8 && buf.toString('latin1', 4, 8) === 'ftyp';
  const sec = durationOf(buf);
  ok(ftyp, `${s.file} 是 ISO BMFF（前 8 字节含 ftyp）`);
  ok(buf.length > 200000, `${s.file} 字节数 ${buf.length} > 200000`);
  ok(sec != null && sec > 5 && sec < 600, `${s.file} 时长 ${sec?.toFixed(2)} s 在合理区间`);
  rows.push({ title: s.title, file: s.file, bytes: buf.length, seconds: sec });
}

console.log('\n== 文档一致性 ==');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const missingCount = songs.filter((s) => s.missing).length;
if (missingCount > 0) {
  ok(readme.includes('暂缺'), `有 ${missingCount} 条标为暂缺，README 里提到了「暂缺」`);
}
ok(readme.includes('assets/audio/'), 'README 提到 assets/audio/');
ok(readme.includes('fetch_audio.mjs'), 'README 提到 tools/fetch_audio.mjs');
ok(readme.includes('verify_playlist.mjs'), 'README 提到 tools/verify_playlist.mjs');

console.log('\n== 汇总 ==');
console.log('  title'.padEnd(22) + 'file'.padEnd(18) + 'bytes'.padStart(10) + '   duration');
for (const r of rows) {
  console.log('  ' + String(r.title).padEnd(20) + String(r.file).padEnd(18) +
    String(r.bytes).padStart(10) + '   ' + (r.seconds == null ? '?' : r.seconds.toFixed(2)) + ' s');
}
for (const s of songs.filter((x) => x.missing)) {
  console.log('  ' + String(s.title).padEnd(20) + String(s.file).padEnd(18) + '         -   暂缺（无音源）');
}

if (fails) {
  console.log(`\n${fails} 项断言失败`);
  process.exit(1);
}
console.log('\nALL ASSERTIONS PASSED');
