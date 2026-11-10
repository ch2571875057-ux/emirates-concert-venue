// =====================================================================
// tools/verify_lightshow_variants.mjs — 灯光秀 5 变体契约一致性离线断言
// 校验 js/lightshowRegistry.js + 四个编舞模块，不需要浏览器。
// 用法：node tools/verify_lightshow_variants.mjs
//
// 这个脚本存在的意义：变体从 2 个长到 5 个之后，「新增一个变体忘了带某个字段」
// 只会在运行时表现为某条光通道静默失效（比如漏了 body → 屏不变色），
// 肉眼很难发现。这里把所有变体按同一套契约逐字段断言。
// =====================================================================
import { DATA } from '../js/data.js';
import {
  LS_VARIANTS, LS_IDS, LS_DEFAULT, lsEntry, lsParams,
  lightShowFor, lightShowPhaseFor, lightShowDurationFor, lightShowTimeScale,
} from '../js/lightshowRegistry.js';
import { LS_PHASES } from '../js/lightshow.js';
import { LSB_PHASES } from '../js/lightshowb.js';
import { LSC_PHASES } from '../js/lightshowc.js';
import { LSD_PHASES } from '../js/lightshowd.js';
import { LSE_PHASES } from '../js/lightshowe.js';

let fails = 0;
const ok = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fails++; }
};
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

// 每个变体的 sticks 必填字段（可选通道如 ringN/ringT/ringAmp/beatAmp/warm 不在此列，
// 但一旦出现就必须是有限数，否则 sin01/乘法会把整根棒子写成 NaN）
const STICK_REQ = ['gain', 'white', 'bandU', 'bandW', 'bandFloor', 'focusU', 'focusW', 'focusFloor'];
const STICK_OPT = ['blue', 'flicker', 'flickerHz', 'regionN', 'ringN', 'ringT', 'ringAmp', 'radN', 'radT', 'radAmp', 'beatAmp', 'beatEnv', 'warm'];
const BODY_REQ = ['gain', 'tint', 'stripe', 'freq', 'phase', 'scale'];

const EXPECT = { a: LS_PHASES, b: LSB_PHASES, c: LSC_PHASES, d: LSD_PHASES, e: LSE_PHASES };

console.log('== 注册表 ==');
ok(LS_IDS.length === 5, `变体数 = ${LS_IDS.length}（应为 5）`);
ok(LS_IDS.join(',') === 'a,b,c,d,e', `变体 id 顺序 = ${LS_IDS.join(',')}`);
ok(LS_IDS.includes(LS_DEFAULT), `默认变体 ${LS_DEFAULT} 在册`);
ok(lsEntry('nope').id === LS_DEFAULT, '未知变体 id 回落默认（不会返回 undefined）');
ok(lsParams('nope') === lsParams(LS_DEFAULT), '未知变体参数回落默认');
for (const e of LS_VARIANTS) {
  ok(typeof e.label === 'string' && e.label.length > 0, `${e.id}: 有 HUD 文案「${e.label}」`);
  ok(typeof e.desc === 'string' && e.desc.length > 0, `${e.id}: 有 HUD 描述`);
  ok(DATA.concert[e.dataKey] && typeof DATA.concert[e.dataKey] === 'object', `${e.id}: DATA.concert.${e.dataKey} 存在`);
  ok(typeof e.body === 'boolean', `${e.id}: body 标记明确（${e.body}）`);
}

console.log('\n== 契约（逐字段）==');
for (const e of LS_VARIANTS) {
  const id = e.id;
  const total = lightShowDurationFor(id);
  ok(fin(total) && total > 5 && total < 30, `${id}: 总时长 ${total.toFixed(2)}s 在 5~30s`);
  ok(lightShowTimeScale(id) > 0, `${id}: timeScale ${lightShowTimeScale(id)} > 0`);

  // 全时段扫描：任意时刻都不能有 NaN，且顶层字段齐全
  let nan = 0, phaseHits = new Set(), wMin = Infinity, wMax = -Infinity;
  const STEPS = 900;
  for (let i = 0; i <= STEPS; i++) {
    const t = (i / STEPS) * total;
    const R = lightShowFor(id, t);
    if (!R) { nan++; continue; }
    const bad =
      !fin(R.w) || !R.sticks || !R.ribbon || !R.beam ||
      Object.values(R.sticks).some((v) => v != null && !fin(v)) ||
      !fin(R.ribbon.intensity) || !fin(R.ribbon.white) ||
      !fin(R.beam.gain) || !fin(R.beam.white);
    if (bad) { nan++; continue; }
    // 注意：A/B 的 R.phase 是数字段索引（0..5），C/D/E 的 R.phase 是段名字符串。
    // 唯一跨变体统一的字段是 R.name，阶段覆盖一律按 name 统计。
    phaseHits.add(R.name);
    wMin = Math.min(wMin, R.w); wMax = Math.max(wMax, R.w);
  }
  ok(nan === 0, `${id}: ${STEPS + 1} 个采样点无 NaN / 无缺字段`);
  const want = EXPECT[id];
  ok(!!want, `${id}: 有对应的阶段常量`);
  if (want) {
    const missing = want.filter((p) => !phaseHits.has(p));
    ok(missing.length === 0, `${id}: 全时段覆盖所有阶段${missing.length ? '（缺 ' + missing.join(',') + '）' : '（' + want.join('/') + '）'}`);
    ok(lightShowPhaseFor(id, 0).name === want[0], `${id}: t=0 落在首段「${want[0]}」`);
  }
  ok(wMin >= 0 && wMax <= 1 + 1e-9, `${id}: w 始终在 [0,1]（实测 ${wMin.toFixed(3)}~${wMax.toFixed(3)}）`);

  // sticks 必填字段 + 可选字段（出现即须有限）
  const R0 = lightShowFor(id, total * 0.4);
  for (const k of STICK_REQ) ok(fin(R0.sticks[k]), `${id}: sticks.${k} 是有限数`);
  for (const k of STICK_OPT) {
    const v = R0.sticks[k];
    ok(v === undefined || fin(v), `${id}: sticks.${k} ${v === undefined ? '未提供（可选）' : '是有限数'}`);
  }
  // body 契约：A/E 有 body，B/C/D 也有（五个变体都压屏），字段必须齐全
  ok(!!R0.body === e.body, `${id}: body 存在性与注册表一致（${e.body}）`);
  if (e.body) for (const k of BODY_REQ) ok(fin(R0.body[k]), `${id}: body.${k} 是有限数`);
  else ok(R0.body === undefined, `${id}: 无 body 时字段为 undefined（消费端据此不压屏）`);
  // beam.blue 只在带 body 的变体里可选
  ok(R0.beam.blue === undefined || fin(R0.beam.blue), `${id}: beam.blue ${R0.beam.blue === undefined ? '未提供（可选）' : '是有限数'}`);

  // 负时间不崩、多圈回绕一致
  ok(fin(lightShowFor(id, -3.7).w), `${id}: 负时间不崩`);
  const a = lightShowFor(id, 1.234), b = lightShowFor(id, 1.234 + total * 3);
  ok(Math.abs(a.w - b.w) < 1e-9 && a.name === b.name, `${id}: 3 圈回绕后与首圈一致`);

  // enabled=false 返回 null
  const P = lsParams(id);
  if (P) {
    const bak = P.enabled;
    P.enabled = false;
    ok(lightShowFor(id, 1.0) === null, `${id}: enabled=false 返回 null`);
    if (bak === undefined) delete P.enabled; else P.enabled = bak;
  }
}

console.log('\n== 变体之间的差异（避免「五个都一样」）==');
{
  const sig = (id) => {
    const R = lightShowFor(id, lightShowDurationFor(id) * 0.4);
    return [R.sticks.gain, R.ribbon.intensity, R.beam.gain, R.body ? R.body.gain : 0];
  };
  const sigs = LS_IDS.map((id) => sig(id).map((v) => v.toFixed(4)).join('/'));
  const uniq = new Set(sigs);
  ok(uniq.size === LS_IDS.length, `5 个变体在中段取值互不相同（${uniq.size} 种）`);
  for (let i = 0; i < LS_IDS.length; i++) console.log('   ' + LS_IDS[i] + ' sticks/ribbon/beam/body = ' + sigs[i]);
  // 只有 D 是暖色编舞
  const warmIds = LS_IDS.filter((id) => (lightShowFor(id, lightShowDurationFor(id) * 0.4).sticks.warm || 0) > 0.01);
  ok(warmIds.length === 1 && warmIds[0] === 'd', `只有 D 心跳带暖色（实测 ${warmIds.join(',') || '无'}）`);
  // 至少一个变体没有 ring 通道（A/B 保持历史行为）
  const noRing = LS_IDS.filter((id) => !lightShowFor(id, lightShowDurationFor(id) * 0.4).sticks.ringAmp);
  ok(noRing.includes('a') && noRing.includes('b'), `A/B 不启用 ring 通道（它们必须逐位保持历史表现）：${noRing.join(',')}`);
}

console.log('\n== 循环接缝 ==');
for (const e of LS_VARIANTS) {
  const id = e.id, total = lightShowDurationFor(id);
  const eps = 1e-4;
  const atEnd = lightShowFor(id, total - eps);
  const atZero = lightShowFor(id, 0);
  // 消费端的有效亮度 v = gain*w + (1-w)；对 sticks/ribbon/beam 分别比
  const eff = (R) => {
    const w = R.w;
    const g = R.body ? R.body.gain : 1;
    return [R.sticks.gain * w + (1 - w), R.ribbon.intensity * w + (1 - w), R.beam.gain * w + (1 - w), g * w + (1 - w)];
  };
  const a = eff(atEnd), b = eff(atZero);
  const dmax = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  ok(dmax < 0.05, `${id}: 接缝 |v(total-ε) − v(0)| = ${dmax.toFixed(4)} < 0.05`);
}

console.log('\n' + (fails === 0 ? 'ALL ASSERTIONS PASSED' : fails + ' ASSERTION(S) FAILED'));
process.exit(fails === 0 ? 0 : 1);
