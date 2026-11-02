// =====================================================================
// tools/verify_wavefx.mjs — 人浪光效（stripe / meet / chase）离线断言
// 纯数学校验 js/wavefx.js，不需要浏览器。用法：node tools/verify_wavefx.mjs
// =====================================================================
import { DATA } from '../js/data.js';
import { stripeAt, meetAt, chaseAt, fxAt, fxRange, wrap01, FX_MODES } from '../js/wavefx.js';

const W = DATA.concert.waveFx;
let fails = 0;
const ok = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fails++; }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const ramp = ' .:-=+*#%@';

console.log('== wavefx 参数 ==');
console.log('  timeScale=' + W.timeScale + ' modes=' + FX_MODES.join(','));
for (const m of FX_MODES) console.log('  ' + m + ' range=' + fxRange(m, W).map((v) => v.toFixed(3)).join('..'));

// ---------- 通用契约 ----------
console.log('\n== 通用契约 ==');
for (const m of FX_MODES) {
  const [lo, hi] = fxRange(m, W);
  let mn = Infinity, mx = -Infinity, bad = 0;
  for (let i = 0; i < 400; i++) {
    const u = i / 400, s = i / 400, t = i * 0.37;
    const v = fxAt(m, u, s, t, W);
    if (!Number.isFinite(v)) { bad++; continue; }
    mn = Math.min(mn, v); mx = Math.max(mx, v);
  }
  ok(bad === 0, `${m}: 400 个采样点全部有限`);
  ok(mn >= lo - 1e-9, `${m}: 最小值 ${mn.toFixed(3)} >= range.lo ${lo}`);
  ok(mx <= hi + 1e-9, `${m}: 最大值 ${mx.toFixed(3)} <= range.hi ${hi}`);
}
ok(fxAt('nope', 0.5, 0.5, 0, W) === null, 'fxAt(未知模式) 返回 null');
ok(near(wrap01(-0.25), 0.75) && near(wrap01(2.25), 0.25) && near(wrap01(0), 0), 'wrap01 折回正确');

// ---------- 1) 条纹 ----------
console.log('\n== stripe ==');
{
  const P = W.stripe;
  const count = (t) => {
    let n = 0;
    for (let i = 0; i < 720; i++) if (stripeAt(i / 720, t, P) > (P.lo + P.hi) / 2) n++;
    return n;
  };
  const n0 = count(0);
  // 亮带占比主要由 soft（软化宽度）决定：soft=0.18 时亮带边缘有渐变，
  // 只有 k>0.5 的部分算「点亮」，实测约 42%。这里只要求落在一个合理区间。
  ok(n0 / 720 > 0.33 && n0 / 720 < 0.62, `shift=0 时亮带覆盖 ${(n0 / 720 * 100).toFixed(1)}%（soft 软化下的合理区间 33%~62%）`);
  // 亮带条数应正好等于 bands（bands = 明暗带对数）
  const runs = (() => {
    let r = 0, prev = stripeAt(0, 0, P) > (P.lo + P.hi) / 2;
    for (let i = 1; i <= 4000; i++) {
      const cur = stripeAt(i / 4000, 0, P) > (P.lo + P.hi) / 2;
      if (cur && !prev) r++;
      prev = cur;
    }
    return r;
  })();
  ok(runs === P.bands, `亮带条数 = ${runs}（应为 bands=${P.bands}）`);
  // 相移半对（1/(2*bands)）明暗互换；相移一对（1/bands）回到同一亮度
  const a = stripeAt(0.10, 0, P), b = stripeAt(0.10 + 1 / (P.bands * 2), 0, P);
  ok(Math.abs(a - b) > 1e-6, '相移半对带宽后亮度改变（明暗互换）');
  const a2 = stripeAt(0.10, 0, P), a3 = stripeAt(0.10 + 1 / P.bands, 0, P);
  ok(near(a2, a3, 1e-9), '相移一整对带宽后回到同一亮度（明暗交替）');
  // 漂移方向：t 增大时某固定亮度特征向 u 增大方向移动
  const findFront = (t) => {
    for (let i = 0; i < 2000; i++) {
      const u = i / 2000;
      if (stripeAt(u, t, P) > (P.lo + P.hi) / 2 + 1e-9) return u;
    }
    return -1;
  };
  if (P.driftSpeed > 0) {
    const f0 = findFront(0), f1 = findFront(0.5);
    ok(f1 > f0, `t 增大时亮带前沿向 u 增大方向漂移（${f0.toFixed(3)} → ${f1.toFixed(3)}）`);
  }
  // 软化参数极小时应出现硬边界
  const hard = { ...P, soft: 1e-4 };
  let edges = 0, prev = stripeAt(0, 0, hard) > (P.lo + P.hi) / 2;
  for (let i = 1; i <= 2000; i++) {
    const cur = stripeAt(i / 2000, 0, hard) > (P.lo + P.hi) / 2;
    if (cur !== prev) edges++;
    prev = cur;
  }
  ok(edges === P.bands * 2, `soft→0 时恰好 ${P.bands * 2} 条硬边界（实测 ${edges}）`);
}

// ---------- 2) 相遇 ----------
console.log('\n== meet ==');
{
  const P = W.meet;
  const run = P.period - P.hold;
  // s=0（起点）应比 s=1（相遇点）先亮
  const tEarly = run * 0.25;
  ok(meetAt(0.05, tEarly, P) > meetAt(0.95, tEarly, P), '推进初期：起点侧已亮、相遇点尚未亮');
  // 前沿位置随 t 单调推进
  const litEdge = (t) => {
    let e = 0;
    for (let i = 0; i <= 400; i++) if (meetAt(i / 400, t, P) > (P.dark + P.lit) / 2) e = i / 400;
    return e;
  };
  const e1 = litEdge(run * 0.2), e2 = litEdge(run * 0.5), e3 = litEdge(run * 0.8);
  ok(e1 < e2 && e2 < e3, `前沿随 t 单调外扩（${e1.toFixed(2)} < ${e2.toFixed(2)} < ${e3.toFixed(2)}）`);
  // 合拢后全场亮
  const tHold = run + P.hold * 0.3;
  const allLit = [0, 0.25, 0.5, 0.75, 1].every((s) => meetAt(s, tHold, P) >= P.lit - 1e-9);
  ok(allLit, 'hold 阶段全场（含相遇点）都已点亮');
  // 闪光随时间衰减
  const f0 = meetAt(0.5, run + 0.01, P);
  const f1 = meetAt(0.5, run + P.hold * 0.6, P);
  ok(f0 >= f1, `hold 闪光衰减（${f0.toFixed(3)} → ${f1.toFixed(3)}）`);
  // 前沿有 HDR 亮边
  const p = Math.pow(0.5, P.speedEase);
  const onEdge = meetAt(p, run * 0.5, P);
  const behind = meetAt(0, run * 0.5, P);
  ok(onEdge > behind, `前沿亮边高于已亮区（${onEdge.toFixed(3)} > ${behind.toFixed(3)}）`);
  // 周期性
  ok(near(meetAt(0.3, 0.7, P), meetAt(0.3, 0.7 + P.period, P), 1e-9), '以 period 为周期重复');
}

// ---------- 3) 追逐 ----------
console.log('\n== chase ==');
{
  const P = W.chase;
  // 亮头位置 = frame(t/period)
  const headAt = (t) => wrap01(t / P.period);
  const t0 = P.period * 0.3;
  const h = headAt(t0);
  ok(chaseAt(h, t0, P) > chaseAt(wrap01(h + 0.5), t0, P), '亮头亮度高于其正对面');
  // 尾巴：亮头身后亮度递减，前方（未到）为底光
  const behind = chaseAt(wrap01(h - P.tailWidth * 0.5 * P.dir), t0, P);
  const ahead = chaseAt(wrap01(h + 0.05), t0, P);
  ok(behind > ahead, `尾部（身后）亮度 ${behind.toFixed(3)} > 前方 ${ahead.toFixed(3)}`);
  ok(near(chaseAt(wrap01(h + 0.5), t0, P), P.base, 1e-9), '尾外区域恰好等于底光 base');
  // 亮头随时间沿 dir 前进
  const h1 = headAt(0.1), h2 = headAt(0.1 + 0.6);
  ok(P.dir > 0 ? h2 > h1 : h2 < h1, '亮头按 dir 前进');
  // 周期性
  ok(near(chaseAt(0.42, 3.1, P), chaseAt(0.42, 3.1 + P.period, P), 1e-9), '以 period 为周期重复');
}

// ---------- 4) 剖面可视化（人眼可读的 ASCII，验证形状/方向） ----------
console.log('\n== 剖面（48 桶，越高越亮）==');
const profile = (fn, n = 48) => {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(fn(i / (n - 1)));
  const mx = Math.max(...arr), mn = Math.min(...arr);
  // 平坦剖面（如 meet 的 hold 满亮阶段）没有对比度，画成满格而不是全空
  if (mx - mn < 1e-6) return ramp[ramp.length - 1].repeat(n);
  return arr.map((v) => ramp[Math.min(ramp.length - 1, Math.round(((v - mn) / (mx - mn)) * (ramp.length - 1)))]).join('');
};
const t = W.timeScale;
console.log('stripe t=0    |' + profile((u) => stripeAt(u, 0, W.stripe)) + '|');
console.log('stripe t=+2s  |' + profile((u) => stripeAt(u, 2 * t, W.stripe)) + '|');
console.log('meet  t=30%   |' + profile((s) => meetAt(s, W.meet.period * 0.3, W.meet)) + '|');
console.log('meet  t=90%   |' + profile((s) => meetAt(s, W.meet.period * 0.9, W.meet)) + '|');
console.log('chase t=0     |' + profile((u) => chaseAt(u, 0, W.chase)) + '|');
console.log('chase t=+30%  |' + profile((u) => chaseAt(u, W.chase.period * 0.3, W.chase)) + '|');

console.log('\n' + (fails === 0 ? 'ALL ASSERTIONS PASSED' : fails + ' ASSERTION(S) FAILED'));
process.exit(fails === 0 ? 0 : 1);
