// 开场秀时间轴离线断言（零依赖：只碰纯数据模块）
//
// 覆盖：段表结构、灯光秀段与变体时长对齐、段间互斥、全息姿态序列、
//       烟花时刻落在段内、段边界查找、全息参数合理性。
//
// 注意：js/show.js 顶部 import three，Node 里无法直接加载，所以这里按
// show.js 的同一套规则（累积 t0/t1）重建段表做断言；运行期真实行为由
// `?show=1&showT=N` + CDP 扫点验收（见 README「开场秀」一节）。
//
// 用法：node tools/verify_show_timeline.mjs
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { DATA } = await load('js/data.js');
const { lightShowDurationFor, LS_BY_ID } = await load('js/lightshowRegistry.js');

let fails = 0;
const ok = (cond, msg) => {
  if (!cond) { fails++; console.log(`  FAIL  ${msg}`); } else { console.log(`  ok    ${msg}`); }
};

// 与 show.js 的 SEGMENTS 构造保持一致（同一份 DATA.show.segments、累积 t0/t1）
const buildSegments = (list) => {
  let t = 0;
  return list.map((s) => {
    const seg = { ...s, t0: t, t1: t + s.dur };
    t += s.dur;
    return seg;
  });
};
const segmentAt = (segs, t) => {
  if (t <= 0) return segs[0];
  for (const s of segs) if (t < s.t1) return s;
  return segs[segs.length - 1];
};

const RAW = DATA.show.segments;
const SEGS = buildSegments(RAW);
const total = SEGS[SEGS.length - 1].t1;

console.log('\n== 段表结构 ==');
ok(Array.isArray(RAW) && RAW.length >= 6, `segments 是数组且不少于 6 段（实为 ${RAW && RAW.length}）`);
ok(RAW.every((s) => s.id && s.dur > 0 && s.label), '每段都有 id / 正 dur / label');
ok(new Set(RAW.map((s) => s.id)).size === RAW.length, '段 id 唯一');
ok(Math.abs(RAW.reduce((a, s) => a + s.dur, 0) - total) < 1e-9, '段时长之和等于总时长');
ok(total >= 45 && total <= 90, `总时长在 45~90s（实为 ${total.toFixed(2)}s）`);

console.log('\n== show.js 与段表的一致性 ==');
const showSrc = fs.readFileSync(path.join(ROOT, 'js/show.js'), 'utf8');
ok(showSrc.includes('DATA.show.segments'), 'show.js 从 DATA.show.segments 建表（单一真相）');
ok(/export function showTotal\s*\(/.test(showSrc), 'show.js 导出 showTotal()');
ok(/export function showSegmentAt\s*\(/.test(showSrc), 'show.js 导出 showSegmentAt()');
ok(showSrc.includes('this.prev = {'), 'start() 会快照现场');
for (const k of ['dimmer', 'audienceMode', 'pixelPattern', 'lightShowVariant', 'lsFreeze']) {
  ok(showSrc.includes(`${k}: r.lightState.${k}`), `快照包含 ${k}`);
}

console.log('\n== 灯光秀段与变体时长严格对齐 ==');
const lsSegs = SEGS.filter((s) => s.lightShow);
ok(lsSegs.length >= 2, `至少两段接管灯光秀（实为 ${lsSegs.length}）`);
for (const s of lsSegs) {
  ok(LS_BY_ID[s.lightShow] != null, `段 ${s.id} 引用的变体 ${s.lightShow} 存在`);
  const d = lightShowDurationFor(s.lightShow);
  ok(Math.abs(s.dur - d) < 1e-6, `段 ${s.id} 时长 ${s.dur} == 变体 ${s.lightShow} 时长 ${d}`);
}

console.log('\n== 段间互斥（灯光秀 vs 人浪/点阵）==');
for (const s of SEGS) ok(!(s.lightShow && s.audience), `段 ${s.id} 不同时开灯光秀与人浪`);

console.log('\n== 全息姿态序列 ==');
const poses = SEGS.map((s) => s.holo);
ok(poses.every((p) => p && DATA.holo.poses[p]), '每段 holo 姿态都在 DATA.holo.poses 里');
ok(poses[0] === 'hidden' || poses[0] === 'pillar', `首段姿态是 hidden/pillar（实为 ${poses[0]}）`);
ok(poses.includes('fly'), '有 fly 段（飞向常驻位）');
ok(['fly', 'docked'].includes(poses[poses.length - 1]), `末段姿态是 fly/docked（实为 ${poses[poses.length - 1]}）`);

console.log('\n== 段边界查找 ==');
ok(segmentAt(SEGS, 0).id === SEGS[0].id, 't=0 落在首段');
ok(segmentAt(SEGS, total - 1e-6).id === SEGS[SEGS.length - 1].id, 't=total-ε 落在末段');
let boundaryOk = true;
for (let i = 0; i < SEGS.length - 1; i++) {
  if (segmentAt(SEGS, SEGS[i].t1).id !== SEGS[i + 1].id) boundaryOk = false;
  if (segmentAt(SEGS, SEGS[i].t1 - 1e-6).id !== SEGS[i].id) boundaryOk = false;
}
ok(boundaryOk, '每个段边界前后都落在正确的段');

console.log('\n== 烟花时刻 ==');
for (const s of SEGS) {
  if (!s.fireworks) continue;
  if (s.fireworks.singleAt) {
    ok(s.fireworks.singleAt.every((v) => v >= 0 && v < s.dur), `段 ${s.id} 的 singleAt 都在段内`);
    ok(s.fireworks.singleAt.length <= DATA.fireworks.singles.length, `段 ${s.id} 单发数不超过 singles 配置`);
  }
  if (s.fireworks.ringFrom != null) {
    ok(s.fireworks.ringFrom >= 0 && s.fireworks.ringFrom < s.dur, `段 ${s.id} 的 ringFrom 在段内`);
  }
}

console.log('\n== 全息参数 ==');
const H = DATA.holo;
ok(H.height > 1 && H.height < 20, `holo.height 合理（${H.height}）`);
ok(H.dock.scale > 0 && H.dock.scale <= 1, `holo.dock.scale 在 (0,1]（${H.dock.scale}）`);
ok(H.flySec > 0, 'holo.flySec 为正');
ok(Object.keys(H.poses).length >= 8, `姿态表至少 8 个（实为 ${Object.keys(H.poses).length}）`);
ok(typeof H.poses.docked.lift === 'number', 'docked 姿态有 lift');
ok(fs.existsSync(path.join(ROOT, H.url.replace(/^\.\//, ''))), `模型文件存在：${H.url}`);

console.log(`\n${fails === 0 ? 'ALL ASSERTIONS PASSED' : `${fails} ASSERTION(S) FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
