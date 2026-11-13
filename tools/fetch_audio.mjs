// tools/fetch_audio.mjs
// 抓取歌单五首曲目的官方 30 秒试听，落到 assets/audio/。
//
//   node tools/fetch_audio.mjs           下载缺失的文件（已存在则跳过）
//   node tools/fetch_audio.mjs --check   只检查现有文件（字节数 + 时长），不联网
//   node tools/fetch_audio.mjs --force   覆盖重新下载
//
// 说明：这里拿到的是 Apple iTunes 提供的 30 秒官方试听片段（audio/mp4），
// 完整曲目没有合法的公开下载渠道，因此不在此抓取。想换成完整曲目：
// 自己合法获取后，用同名文件覆盖 assets/audio/ 下的对应 .m4a 即可，
// 代码无需任何改动。
//
// 零依赖，只用 Node 内置 fetch / fs。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'audio');
const SOURCES = path.join(OUT_DIR, 'sources.json');

// country=TW 是必须的：这五首只在台湾/香港区上架，大中华区其它 storefront 查不到。
const STOREFRONT = 'TW';

// 树读 / 生长在 Apple 那边用的是繁体标题，trackId 是唯一的稳定标识。
const TRACKS = [
  { id: 'yiyiyi', title: '疑疑疑', trackId: 6821825986, file: 'yiyiyi.m4a' },
  { id: 'ruqi', title: '如期', trackId: 6821826092, file: 'ruqi.m4a' },
  { id: 'shudu', title: '树读', trackId: 1728225082, file: 'shudu.m4a' },
  { id: 'shengzhang', title: '生长', trackId: 1728239438, file: 'shengzhang.m4a' },
];

// 《特别的人》的王俊凯版本没有在 Apple Music 上架，
// 所以这首用用户自备的 assets/audio/tebie.m4a（完整曲，41 s），
// 不归入 MISSING；脚本只管那四首官方试听。
const MISSING = [];

// 用户自备音源（不从 iTunes 下载，但仍要在 --check 里报出来）。
// 那些从 iTunes 拿不到的曲子放这里，文件必须已经存在。
const LOCAL = [{ id: 'tebie', title: '特别的人', file: 'tebie.m4a' }];

const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check');
const FORCE = args.has('--force');

// ---------------------------------------------------------------- m4a 时长

// 在 ISO BMFF 的 box 树里递归找 mvhd，读出 timescale / duration。
// 只支持 mvhd version 0 与 1 —— 够用，且不需要任何第三方库。
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
          const timescale = buf.readUInt32BE(s + 20);
          const duration = Number(buf.readBigUInt64BE(s + 24));
          if (timescale > 0) out = duration / timescale;
        } else {
          const timescale = buf.readUInt32BE(s + 12);
          const duration = buf.readUInt32BE(s + 16);
          if (timescale > 0) out = duration / timescale;
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

function report(file) {
  const full = path.join(OUT_DIR, file);
  if (!fs.existsSync(full)) return { file, bytes: 0, seconds: null, ok: false };
  const buf = fs.readFileSync(full);
  const isM4a = buf.length >= 8 && buf.toString('latin1', 4, 8) === 'ftyp';
  return { file, bytes: buf.length, seconds: durationOf(buf), ok: isM4a };
}

function fmt(sec) {
  return sec == null ? '   ?   ' : sec.toFixed(2).padStart(6);
}

// ---------------------------------------------------------------- main

async function lookup(track) {
  const url = `https://itunes.apple.com/lookup?id=${track.trackId}&country=${STOREFRONT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lookup HTTP ${res.status} (${track.title})`);
  const json = await res.json();
  const hit = (json.results || [])[0];
  if (!hit) throw new Error(`lookup 没有结果 (${track.title}, id=${track.trackId})`);
  if (!hit.previewUrl) throw new Error(`没有 previewUrl (${track.title})`);
  return hit;
}

async function download(track) {
  const hit = await lookup(track);
  const res = await fetch(hit.previewUrl);
  if (!res.ok) throw new Error(`下载 HTTP ${res.status} (${track.title})`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, track.file), buf);
  return {
    trackId: track.trackId,
    id: track.id,
    title: track.title,
    displayTitle: hit.trackName,
    album: hit.collectionName,
    fullDurationMs: hit.trackTimeMillis,
    previewUrl: hit.previewUrl,
    file: track.file,
    bytes: buf.length,
  };
}

async function main() {
  if (CHECK) {
    console.log('assets/audio/ 现状（--check 不联网）：');
    let bad = 0;
    for (const t of [...TRACKS, ...LOCAL]) {
      const r = report(t.file);
      console.log(`  ${t.title.padEnd(10)} ${t.file.padEnd(16)} ${String(r.bytes).padStart(9)} B  ${fmt(r.seconds)} s  ${r.ok ? 'ok' : '缺失/损坏'}`);
      if (!r.ok) bad++;
    }
    for (const m of MISSING) console.log(`  ${m.title.padEnd(10)} （暂无音源：${m.reason}）`);
    if (bad) console.log(`\n${bad} 个文件缺失。跑 node tools/fetch_audio.mjs 下载。`);
    return bad ? 1 : 0;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sources = [];

  for (const track of TRACKS) {
    const full = path.join(OUT_DIR, track.file);
    if (fs.existsSync(full) && !FORCE) {
      console.log(`跳过（已存在）${track.file}`);
      const r = report(track.file);
      sources.push({
        trackId: track.trackId, id: track.id, title: track.title, file: track.file,
        bytes: r.bytes, note: '已存在，未重新下载',
      });
      continue;
    }
    process.stdout.write(`下载 ${track.title} … `);
    try {
      const meta = await download(track);
      sources.push(meta);
      console.log(`${meta.bytes} B`);
    } catch (err) {
      console.log(`失败：${err.message}`);
      sources.push({ trackId: track.trackId, id: track.id, title: track.title, file: track.file, error: String(err.message) });
    }
  }

  const prev = fs.existsSync(SOURCES) ? safeJSON(SOURCES) : null;
  const doc = {
    note: 'Apple iTunes 官方 30 秒试听片段（audio/mp4）。版权归原权利人，仅供本地演示。完整曲目请自行合法获取后用同名文件覆盖。',
    storefront: STOREFRONT,
    fetchedAt: new Date().toISOString(),
    tracks: sources,
    missing: MISSING,
    // 上一次的抓取记录留档：previewUrl 带一次性签名，过一段时间会失效。
    previous: prev ? { fetchedAt: prev.fetchedAt, tracks: prev.tracks } : undefined,
  };
  fs.writeFileSync(SOURCES, JSON.stringify(doc, null, 2) + '\n');

  console.log('\nassets/audio/ 结果：');
  for (const t of [...TRACKS, ...LOCAL]) {
    const r = report(t.file);
    console.log(`  ${t.title.padEnd(10)} ${t.file.padEnd(16)} ${String(r.bytes).padStart(9)} B  ${fmt(r.seconds)} s  ${r.ok ? 'ok' : '缺失/损坏'}`);
  }
  for (const m of MISSING) console.log(`  ${m.title.padEnd(10)} （暂无音源：${m.reason}）`);
  console.log(`\n来源记录写入 ${path.relative(ROOT, SOURCES)}`);
  return 0;
}

function safeJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

main().then((code) => process.exit(code || 0), (err) => {
  console.error(err);
  process.exit(1);
});
