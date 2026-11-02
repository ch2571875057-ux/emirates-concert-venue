// =====================================================================
// wavefx.js — 人浪光效纯逻辑（条纹 / 相遇 / 追逐）
// 设计约束：只做数学、不 import three，返回「亮度标量」（可 >1 即 HDR），
// 由 stadium.js 负责写 instanceColor / instanceMatrix。
// 这样算法可以被 node 直接 import 做离线断言（同 js/pixel.js 的思路）。
//
// 三种光效共用一套位置参数（由 stadium.js 在撒点时预计算，每帧不再做三角函数）：
//   看台应援棒： u = 环向角归一化 0..1（整周）
//               s = 距舞台方向的归一化角距 0..1（0 = 舞台正后方，1 = 正对面）
//   内场插棒：   u = 列归一化 0..1
//               s = 距最近一侧的归一化距离 0..1（0 = 舞台两翼，1 = 中线）
// =====================================================================

const TAU = Math.PI * 2;

// 折到 [0,1)
export function wrap01(x) {
  const v = x - Math.floor(x);
  return v < 0 ? v + 1 : v;
}

// 折到 (-π, π]
export function wrapPm(a) {
  let v = a % TAU;
  if (v > Math.PI) v -= TAU;
  else if (v <= -Math.PI) v += TAU;
  return v;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// Hermite 平滑阶跃
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------
// 1) 条纹 stripe —— 绕场交替的明暗竖带，整体缓慢环向漂移
//    每条亮带在环向占 1/bands，亮带与暗带交替，边界用 soft 软化。
//    返回 [lo, hi] 之间的亮度；被完全点亮的带内是 hi。
// ---------------------------------------------------------------------
export function stripeAt(u, t, P) {
  // bands 是「亮/暗带对数」：一对 = 1 亮 + 1 暗，所以一整圈是 bands*2 条带。
  // 时间项取负号：固定相位处的 u 随时间增大 → 条纹向 u 增大方向漂移（与 col 增大同向）。
  const phase = wrap01(u) * P.bands * 2 - t * P.driftSpeed;
  const whole = Math.floor(phase);
  const frac = phase - whole;
  const bright = ((whole % 2) + 2) % 2 === 0;
  // 距本带边界最近的距离（0..0.5），soft 为该距离的软化尺度
  const edge = Math.min(frac, 1 - frac) / Math.max(1e-4, P.soft);
  const k = smooth(edge);
  return bright ? P.lo + (P.hi - P.lo) * k : P.lo;
}

// ---------------------------------------------------------------------
// 2) 相遇 meet —— 从舞台两翼同时出发，沿环形双向推进，在正对面合拢，
//    随后全场满亮「hold」秒（带一次衰减闪光），然后重新开始。
//    p = 前沿进度 0..1；s <= p 的区段已点亮；前沿附近叠一条 HDR 亮边。
//    dark = 0 时未扫到的观众彻底灭灯，只剩推进中的亮区与前沿亮边。
// ---------------------------------------------------------------------
export function meetAt(s, t, P) {
  const period = Math.max(0.001, P.period);
  const hold = Math.min(period * 0.9, Math.max(0, P.hold));
  const run = Math.max(0.001, period - hold);
  const tt = wrap01(t / period) * period;
  if (tt >= run) {
    // 合拢后的满亮保持：闪光随时间衰减
    const h = tt - run;
    const flash = clamp01(1 - h / Math.max(0.001, hold * 0.55));
    return P.lit * (1 + P.holdGain * flash);
  }
  const p = Math.pow(clamp01(tt / run), P.speedEase);
  const peak = P.lit * (1 + P.headGain);
  if (s <= p) {
    // 已点亮区；紧贴前沿处叠 HDR 亮边，向后 headWidth 内回落到 lit
    let b = P.lit;
    const behind = p - s;
    if (behind < P.headWidth) b = P.lit + (peak - P.lit) * (1 - behind / P.headWidth);
    return b;
  }
  // 前沿之前（尚未点亮）：亮边向外用 2.5 倍宽度平滑回落到 dark。
  // 不直接硬切，否则 2.1 的 HDR 亮边会挨着一片纯黑，看起来像渲染接缝而不是光浪前沿。
  const ahead = s - p;
  const f = clamp01(1 - ahead / Math.max(1e-4, P.headWidth * 2.5));
  return P.dark + (peak - P.dark) * f * f;
}

// ---------------------------------------------------------------------
// 3) 追逐 chase —— 一颗亮头绕场单向跑，身后留长尾逐渐衰减。
//    这是「人浪」的本体形态：观众依次站起、依次坐下（区别于潮汐的驻波）。
//    d = 该点被亮头「甩在身后」的归一化距离，0 = 亮头正下方。
//    base = 0 时尾外区域彻底灭灯，只有亮头和长尾发光（对比最强）。
// ---------------------------------------------------------------------
export function chaseAt(u, t, P) {
  const head = wrap01(t / P.period);
  const d = wrap01((head - wrap01(u)) * P.dir);
  const tail = Math.max(0, 1 - d / Math.max(1e-4, P.tailWidth));
  // tailFloor：把尾部曲线的下限抬起来一点，避免尾端整段掉进纯黑、
  // 让「长尾」看起来像被一刀切断。0 = 尾巴尖完全黑。
  const floor = P.tailFloor || 0;
  const shape = tail > 0 ? floor + (1 - floor) * Math.pow(tail, P.tailPow) : 0;
  let b = P.base + P.gain * shape;
  if (d < P.headSharp) b += P.headGain * (1 - d / P.headSharp);
  return b;
}

// 按名字取亮度（stadium.js 的模式派发用；未知名字返回 null）
export function fxAt(mode, u, s, t, W) {
  if (mode === 'stripe') return stripeAt(u, t, W.stripe);
  if (mode === 'meet') return meetAt(s, t, W.meet);
  if (mode === 'chase') return chaseAt(u, t, W.chase);
  return null;
}

// 该模式的亮度区间（用于把亮度归一化成 0..1 的「起立程度」）
// 注意 hi 要取「能出现的最大亮度」：meet 有前沿亮边 lit*(1+headGain) 和满亮闪光 lit*(1+holdGain)，
// 两者取大者；否则归一化会溢出把暗部压到 0。
export function fxRange(mode, W) {
  if (mode === 'stripe') return [W.stripe.lo, W.stripe.hi];
  if (mode === 'meet') {
    const P = W.meet;
    const peak = Math.max(P.lit * (1 + P.headGain), P.lit * (1 + P.holdGain));
    return [P.dark, peak];
  }
  if (mode === 'chase') return [W.chase.base, W.chase.base + W.chase.gain + W.chase.headGain];
  return [0, 1];
}

export const FX_MODES = ['stripe', 'meet', 'chase'];
