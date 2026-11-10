// =====================================================================
// tools/verify_wavefx.mjs — 人浪光效（6 档）离线断言
// 纯数学校验 js/wavefx.js，不需要浏览器。用法：node tools/verify_wavefx.mjs
// =====================================================================
import { DATA } from '../js/data.js';
import {
  stripeAt, meetAt, chaseAt, rippleAt, spiralAt, duetAt,
  fxAt, fxRange, wrap01, FX_MODES,
} from '../js/wavefx.js';

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
// DATA.concert.waveFx.modes 是 HUD 按钮 / 模式分派 / 暗区判定的单一真相，
// 必须和 wavefx.js 自己导出的 FX_MODES 一致，否则会出现「按钮点了但 fxAt 返回 null」。
const dataIds = W.modes.map((m) => m.id);
ok(dataIds.join(',') === FX_MODES.join(','),
  `modes 单一真相与 FX_MODES 一致（DATA: ${dataIds.join(',')} / wavefx: ${FX_MODES.join(',')}）`);
for (const m of W.modes) {
  ok(typeof m.label === 'string' && m.label.length > 0, `${m.id}: 有 HUD 文案「${m.label}」`);
  ok(typeof m.dark === 'boolean', `${m.id}: dark 标记明确（${m.dark}）`);
  ok(W[m.id] && typeof W[m.id] === 'object', `${m.id}: 在 DATA.concert.waveFx 里有参数段`);
}

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

// ---------- 4) 涟漪 ----------
console.log('\n== ripple ==');
{
  const P = W.ripple;
  // 图案主轴是径向 s：同一时刻 u 变化不影响亮度（这正是它与 stripe 的区别）
  const uVary = [0, 0.3, 0.6, 0.9].map((u) => rippleAt(0.42, 1.3, P));
  ok(uVary.every((v) => near(v, uVary[0], 1e-12)), '亮度只取决于 s，与环向 u 无关（径向同心环）');
  // 环峰随时间向外扩散：固定一个环峰位置会单调增大
  const peakAt = (t) => {
    let best = 0, bv = -Infinity;
    for (let i = 0; i <= 1000; i++) { const v = rippleAt(i / 1000, t, P); if (v > bv) { bv = v; best = i / 1000; } }
    return best;
  };
  // 环是周期性外推的（每 1/rings 个 s 一个环），只要求 t 推进时峰值位置按 speed/rings 移动
  const full = P.speed / P.rings;   // 环峰扫过整场所需时间
  const q0 = peakAt(0), q1 = peakAt(full * 0.25);
  ok(Math.abs(q1 - q0) > 1e-3 || q0 > 0.9, `t 推进后环峰位置移动（${q0.toFixed(3)} → ${q1.toFixed(3)}）`);
  // 环峰位置：s*rings - t*speed ≡ 0.5 (mod 1)，所以 s_peak = (k+0.5+t*speed)/rings
  const sPeak = (t, k) => (k + 0.5 + t * P.speed) / P.rings;
  // 远端衰减：内圈峰高于外圈峰
  const flat = { ...P, falloff: 0 };
  const inner = rippleAt(sPeak(0, 0), 0, P);
  const outer = rippleAt(sPeak(0, 2), 0, P);
  ok(inner > outer, `远端衰减生效：内圈峰值 ${inner.toFixed(3)} > 外圈 ${outer.toFixed(3)}`);
  // falloff=0 时内外圈峰值相同（衰减只由 falloff 控制，环本身不衰减）
  ok(near(rippleAt(sPeak(0, 0), 0, flat), rippleAt(sPeak(0, 2), 0, flat), 1e-6),
    'falloff=0 时内外圈峰值相同（衰减只由 falloff 控制）');
  // 光环保向外扩散：把「亮度在给定 s 上达到峰值的时刻」画出来，s 越远到得越晚
  const span = 1 / P.speed;                 // 一个完整的环周期
  const tAtPeak = (s) => {
    let best = 0, bv = -Infinity;
    for (let i = 0; i <= 2000; i++) {
      const tt = (i / 2000) * span;
      const v = rippleAt(s, tt, flat);
      if (v > bv) { bv = v; best = tt; }
    }
    return best;
  };
  // 注意扫描窗只有 span=1/speed 一个周期：Δs 必须小到让两个峰值都落在同一窗内，
  // 取 Δs=0.1 时理论时差 0.83s，远小于 span=2.38s，不会绕回。
  const t1 = tAtPeak(0.2), t2 = tAtPeak(0.3);
  const expect = (0.3 - 0.2) * P.rings / P.speed;
  ok(Math.abs((t2 - t1) - expect) < 0.06 * span,
    `光环保向外扩散：s=0.2→0.3 的到达时差 ${(t2 - t1).toFixed(3)}s ≈ 理论 ${expect.toFixed(3)}s`);
  // 周期性
  const per = 1 / P.speed;
  ok(near(rippleAt(0.37, 2.1, P), rippleAt(0.37, 2.1 + per, P), 1e-9), `以 1/speed=${per.toFixed(2)}s 为周期重复`);
  ok(rippleAt(0.5, 0, P) >= P.lo - 1e-9, '底光不低于 lo');
}

// ---------- 5) 螺旋 ----------
console.log('\n== spiral ==');
{
  const P = W.spiral;
  // turns 是臂数：整圈上应出现 turns 个亮臂
  const arms = (() => {
    const th = (P.lo + P.hi) / 2;
    let n = 0, prev = spiralAt(0, 0.5, 0, P) > th;
    for (let i = 1; i <= 4000; i++) {
      const cur = spiralAt(i / 4000, 0.5, 0, P) > th;
      if (cur && !prev) n++;
      prev = cur;
    }
    return n;
  })();
  ok(arms === P.turns, `环向亮臂数 = ${arms}（应为 turns=${P.turns}）`);
  // 内外错拍：s 变化会让同一 u 的相位平移（twist 的直接效果）
  const a = spiralAt(0.25, 0.0, 0, P), b = spiralAt(0.25, 0.5, 0, P);
  ok(Math.abs(a - b) > 1e-6, `同一 u 上内外场不同亮度（twist 错拍）：${a.toFixed(3)} vs ${b.toFixed(3)}`);
  // twist=0 时内外完全同拍
  const noTwist = { ...P, twist: 0 };
  ok(near(spiralAt(0.25, 0.0, 0, noTwist), spiralAt(0.25, 0.9, 0, noTwist), 1e-12),
    'twist=0 时同一 u 上内外场完全同拍（错拍确实只来自 twist）');
  // sharp 越大臂越窄
  const widthAt = (sharp) => {
    const Q = { ...P, sharp };
    let n = 0;
    for (let i = 0; i < 4000; i++) if (spiralAt(i / 4000, 0.5, 0, Q) > (P.lo + P.hi) / 2) n++;
    return n;
  };
  const w1 = widthAt(1), w3 = widthAt(3);
  ok(w3 < w1, `sharp 越大臂越窄（sharp=1 时 ${w1} 格 > sharp=3 时 ${w3} 格）`);
  // 旋转方向：speed>0 时臂向 u 增大方向推进。
  // 只在 [0, 1/turns) 这一个臂的窗口里找峰，避免绕回后误认成另一条臂。
  const win = 1 / P.turns;
  const peakU = (t) => {
    let best = 0, bv = -Infinity;
    for (let i = 0; i <= 2000; i++) {
      const u = (i / 2000) * win;
      const v = spiralAt(u, 0.5, t, P);
      if (v > bv) { bv = v; best = u; }
    }
    return best;
  };
  // u_peak = (0.5 - s*twist + t*speed + k) / turns  →  du/dt = speed/turns
  const step = 0.25 * win / (P.speed / P.turns);   // 推进 0.25 个臂宽的时间
  const f0 = peakU(0), f1 = peakU(step);
  const expectDu = (P.speed / P.turns) * step;
  ok(near(f1 - f0, expectDu, 0.02 * win),
    `臂随时间向 u 增大方向推进 ${(f1 - f0).toFixed(4)}（预期 ${expectDu.toFixed(4)}）：${f0.toFixed(3)} → ${f1.toFixed(3)}`);
}

// ---------- 6) 对撞 ----------
console.log('\n== duet ==');
{
  const P = W.duet;
  const th = (P.base + P.gain * 2) * 0.4;
  const heads = (t) => {
    const out = [];
    let prev = duetAt(0, t, P) > th;
    for (let i = 1; i <= 4000; i++) {
      const cur = duetAt(i / 4000, t, P) > th;
      if (cur && !prev) out.push(i / 4000);
      prev = cur;
    }
    return out;
  };
  // 非交错时刻应有两个分离的亮头
  const hs = heads(0);
  ok(hs.length === 2, `非交错时刻有 2 个亮头（实测 ${hs.length}）`);
  // 两头顶在同一个 u 上时叠成一处（交错瞬间）
  const hsMid = heads(P.period * 0.25);
  ok(hsMid.length === 1, `交错瞬间两头顶在一起只剩 1 个亮峰（实测 ${hsMid.length}）`);
  // 交错闪光：pa == pb 发生在 ph = 0.25（即 t = period*0.25），此刻 sep=0、闪光满值
  const maxAt = (t) => { let m = -Infinity; for (let i = 0; i < 4000; i++) m = Math.max(m, duetAt(i / 4000, t, P)); return m; };
  const single = maxAt(0.4), crossed = maxAt(P.period * 0.25);
  ok(crossed > single, `交错瞬间出现闪光（单头 ${single.toFixed(3)} → 交错 ${crossed.toFixed(3)}）`);
  ok(near(crossed, P.base + P.gain * 2 + P.flashGain, 1e-6), `交错峰值 = base+gain*2+flashGain = ${crossed.toFixed(3)}`);
  ok(crossed <= fxRange('duet', W)[1] + 1e-9, `交错峰值 ${crossed.toFixed(3)} 不超过 range.hi`);
  // 头 A 沿 u 增大方向前进（用半圈窗口找峰，避开另一颗头）
  // 窗口取 [0,0.25)：t=0.1/0.2 周期时头 B 分别位于 0.40/0.30，都不落进窗口，
  // 这样峰一定属于头 A（否则两颗头亮度相同，argmax 会随浮点误差乱跳）。
  const peakHalf = (t) => {
    let best = 0, bv = -Infinity;
    for (let i = 0; i <= 2000; i++) {
      const u = (i / 2000) * 0.25;
      const v = duetAt(u, t, P);
      if (v > bv) { bv = v; best = u; }
    }
    return best;
  };
  const hA = peakHalf(P.period * 0.10), hA2 = peakHalf(P.period * 0.20);
  ok(hA2 > hA, `头 A 沿 u 增大方向前进（${hA.toFixed(3)} → ${hA2.toFixed(3)}）`);
  ok(Math.abs(hA - 0.10) < 0.02, `t=period*0.10 时头 A 位于 u≈0.10（实测 ${hA.toFixed(3)}）`);
  // 周期性
  ok(near(duetAt(0.31, 1.7, P), duetAt(0.31, 1.7 + P.period, P), 1e-9), '以 period 为周期重复');
}

// ---------- 7) 剖面可视化（人眼可读的 ASCII，验证形状/方向） ----------
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
console.log('ripple  s=径向 |' + profile((s) => rippleAt(s, 0, W.ripple)) + '|');
console.log('spiral  u=环向 |' + profile((u) => spiralAt(u, 0.5, 0, W.spiral)) + '|');
console.log('duet  t=0     |' + profile((u) => duetAt(u, 0, W.duet)) + '|');
console.log('duet  t=交错  |' + profile((u) => duetAt(u, W.duet.period * 0.25, W.duet)) + '|');

console.log('\n' + (fails === 0 ? 'ALL ASSERTIONS PASSED' : fails + ' ASSERTION(S) FAILED'));
process.exit(fails === 0 ? 0 : 1);
