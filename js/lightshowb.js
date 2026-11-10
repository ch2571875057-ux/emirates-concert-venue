// =====================================================================
// lightshowb.js — 灯光秀 B：居中单光团的 13.0s 编舞（纯逻辑，无 three 依赖）
//
// 编舞取自素材 B 的逐帧统计（720×1624 / 404 帧 / 13.07s）：
//   · 横向几乎不动：质心只在区宽的 11.7% 范围内漂移 —— 不是环绕，是**一个居中的光体**
//   · 面积 4.91 倍动态：0.24 → 1.00 @3.07s → 回落到 0.20~0.35
//   · 纵横比 0.90 方形 → 2.24 宽条（2.6~3.6s 闪成横条）→ 稳定 1.3~1.9
//   · 颜色三段：t<2.4s 近白(sat 10~19) → 2.4~3.6s 转冷(sat 20~23) → t>3.6s 明显蓝(sat 41~53)
//   · 竖条纹理：光体内列剖面 6~10 条，周期 7~16px —— 稀疏竖条，不是细密栅格
//
// 与 A 的分工完全不同：A 靠「整圈应援棒 + 环带白带」铺满画面；
// B 把重量压到**舞台中央的发光体**（LED 大屏），看台只留很低的天蓝底光，
// 因为素材 B 的背景极暗（mean 24~47），全场亮起来就不像 B 了。
//
// lightShowBAt(t, P) 每帧返回：
//   { phase, name, p, t, total, w,
//     body:   { gain, tint, stripe, freq, phase },   // 居中心光团 = LED 大屏
//     beam:   { gain, white, blue },                 // 舞台光束
//     sticks: { gain, white, bandU, bandW, bandFloor, focusU, focusW, focusFloor },  // 看台（压暗）
//     ribbon: { intensity, white } }
// 其中 tint：0 = 纯白，1 = 深蓝（单轴色温，与视频的三段颜色一一对应）。
// w 是「灯光秀权重」：0 = 交还常态，1 = 完全接管；fade 段把它收到 0，收尾不跳变。
// =====================================================================

export const LSB_PHASES = ['ignite', 'flash', 'cool', 'blue', 'stripe', 'fade'];

const DUR_KEYS = ['ignite', 'flash', 'cool', 'blue', 'stripe', 'fade'];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const mix = (a, b, k) => a + (b - a) * k;
const pulse = (p, cycles) => 0.5 + 0.5 * Math.sin(clamp01(p) * cycles * Math.PI * 2);

/** 一轮完整编舞的时长（秒） */
export function lightShowBDuration(P) {
  let s = 0;
  for (const k of DUR_KEYS) s += Math.max(0, (P && P[k]) || 0);
  return Math.max(0.1, s);
}

/** 定位当前处于哪个阶段；t 会自动按总时长取模（循环） */
export function lightShowBPhaseAt(t, P) {
  const total = lightShowBDuration(P);
  const tt = ((t % total) + total) % total;
  let acc = 0;
  for (let i = 0; i < DUR_KEYS.length; i++) {
    const d = Math.max(0, (P && P[DUR_KEYS[i]]) || 0);
    const last = i === DUR_KEYS.length - 1;
    if (tt < acc + d || last) {
      return { phase: i, name: LSB_PHASES[i], p: clamp01((tt - acc) / Math.max(1e-4, d)), t: tt, total };
    }
    acc += d;
  }
  return { phase: 0, name: LSB_PHASES[0], p: 0, t: tt, total };
}

/**
 * 灯光秀 B 的主曲线。
 * @param {number} t  编舞内的时间（秒，可任意大，按总时长取模）
 * @param {object} P  DATA.concert.lightShowB
 * @returns {null|object} 未启用时返回 null（表示「交还常态」）
 */
export function lightShowBAt(t, P) {
  if (!P || P.enabled === false) return null;
  const Q = lightShowBPhaseAt(t, P);
  const out = {
    phase: Q.phase,
    name: Q.name,
    p: Q.p,
    t: Q.t,
    total: Q.total,
    w: 1,
    body: { gain: 0, tint: 0, stripe: 0, scale: 1, freq: P.stripeFreq != null ? P.stripeFreq : 7, phase: 0 },
    beam: { gain: 0, white: 0, blue: 0 },
    sticks: {
      gain: 0, white: 0, blue: 0, flicker: 0, flickerHz: 0.7, regionN: 12,
      bandU: -1, bandW: 0.2, bandFloor: 0.25,
      focusU: -1, focusW: 0, focusFloor: 0.12,
    },
    ribbon: { intensity: 0, white: 0 },
  };
  const D = out.body, B = out.beam, S = out.sticks, R = out.ribbon;

  // 竖条相位：全程缓慢漂移（素材里光体内部的斑驳始终在动），stripe 段再叠加一次快扫
  const drift = P.stripeDrift != null ? P.stripeDrift : 0.12;
  D.phase = Q.t * drift;
  // 面积：素材的 4.91 倍面积动态主要靠「亮度 → Bloom 光晕半径」实现
  // （HDR 从 0.55 到 3.2 时泛光范围会明显外扩），几何缩放只做小幅补充，
  // 直接把 LED 大屏放大 2 倍以上会露出屏框、看着像镜头推进而不是灯在亮。
  const sp = P.scalePulse != null ? P.scalePulse : 0.06;

  if (Q.name === 'ignite') {
    // 1) 起势：近白（sat 10~19），方形，缓慢涨亮
    // 循环接缝：上一轮 fade 段把 w 收到 0，这里从 0 渐入回来（同 A 的 breath 段）
    out.w = smooth(Q.p / 0.20);
    const k = smooth(Q.p);
    D.gain = mix(P.bodyBase, P.bodyIgnite, k) * (0.92 + 0.08 * pulse(Q.p, 1.0));
    D.tint = mix(0.05, P.igniteTint != null ? P.igniteTint : 0.15, k);
    D.stripe = mix(0.10, 0.28, k);
    D.freq = (P.stripeFreq != null ? P.stripeFreq : 7) * 1.2;
    D.scale = mix(1 - sp, 1, k);
    B.gain = mix(P.beamIgnite * 0.55, P.beamIgnite, k);
    B.white = 0.9;
    B.blue = 0;
    // 素材 0~2.5s 观众完全没亮（相对基线稳定 1.00×），所以 ignite 只做极轻微抬升
    S.gain = mix(P.stickDark, P.stickDark * 1.35, k);
    S.white = 1;
    S.blue = 0;
    S.flicker = 0;
    R.intensity = mix(P.ribbonBase * 0.7, P.ribbonBase, k);
    R.white = 0.7;
  } else if (Q.name === 'flash') {
    // 2) 闪爆：纯白冲到峰值，光体横向拉宽（freq 降 → 条纹变宽，观感就是「变宽」）
    const rise = smooth(clamp01(Q.p / 0.30));
    const decay = mix(1, 0.78, smooth(clamp01((Q.p - 0.50) / 0.50)));
    const pk = rise * decay;
    D.gain = mix(P.bodyIgnite, P.bodyFlash, pk);
    D.tint = mix(0.15, 0, rise);          // 完全去色成纯白
    D.stripe = mix(0.28, 0.16, rise);     // 闪光时条纹几乎看不出来
    D.freq = (P.stripeFreq != null ? P.stripeFreq : 7) * mix(1.2, 0.55, rise);
    D.scale = mix(1, 1 + sp * 2, pk);
    B.gain = mix(P.beamIgnite, P.beamFlash, pk);
    B.white = 1;
    B.blue = 0;
    // 观众白闪与屏峰值同一刻（素材实测两者都在 t≈3.07s 冲到 12~14 倍）
    S.gain = mix(P.stickDark * 1.35, P.stickPeak, pk);
    S.white = 1;
    S.blue = 0;
    S.flicker = 0.18 * pk;
    R.intensity = mix(P.ribbonBase, P.ribbonFlash, pk);
    R.white = 1;
  } else if (Q.name === 'cool') {
    // 3) 转冷：白 → 蓝的过渡段（素材 2.4~3.6s），面积从峰值开始回收
    const k = smooth(Q.p);
    D.gain = mix(P.bodyFlash * 0.78, P.bodyBlue, k);
    D.tint = mix(0, P.coolTint != null ? P.coolTint : 0.72, k);
    D.stripe = mix(0.16, P.stripeAmp, k);
    D.freq = (P.stripeFreq != null ? P.stripeFreq : 7) * mix(0.55, 1.0, k);
    D.scale = mix(1 + sp * 2, 1 + sp, k);
    B.gain = mix(P.beamFlash, P.beamBlue, k);
    B.white = 1 - k;
    B.blue = k;
    S.gain = mix(P.stickPeak, P.stickSustain, k);
    S.white = 1 - k;
    S.blue = k * P.stickBlueMix;
    S.flicker = mix(0.18, P.stickFlicker * 0.5, k);
    R.intensity = mix(P.ribbonFlash, P.ribbonBlue, k);
    R.white = 1 - k;
  } else if (Q.name === 'blue') {
    // 4) 深蓝呼吸：面积缓慢衰减到 0.2~0.35，竖条纹理显形（素材 3.6~9s 的主段落）
    const breathe = 0.5 + 0.5 * Math.sin(Q.p * Math.PI * 2 * 1.2);
    D.gain = P.bodyBlue * (0.72 + 0.42 * breathe);
    D.tint = P.blueTint != null ? P.blueTint : 0.95;
    D.stripe = P.stripeAmp;
    D.freq = P.stripeFreq != null ? P.stripeFreq : 7;
    // 面积跟呼吸同步收缩（素材里这一段面积是持续回落的）
    D.scale = (1 + sp) * (0.94 + 0.10 * breathe) * mix(1, 0.92, smooth(Q.p));
    B.gain = P.beamBlue * (0.75 + 0.35 * breathe);
    B.white = 0;
    B.blue = 0.85;
    // 长段主戏：观众持续闪烁（素材实测 1.5~3.5 倍、主频 0.70Hz、各区独立）
    S.gain = P.stickSustain * (0.72 + 0.28 * breathe);
    S.white = 0;
    S.blue = P.stickBlueMix;
    S.flicker = P.stickFlicker;
    S.flickerHz = P.stickFlickerHz != null ? P.stickFlickerHz : 0.7;
    S.regionN = P.stickRegionN != null ? P.stickRegionN : 12;
    R.intensity = P.ribbonBlue * (0.85 + 0.15 * breathe);
    R.white = 0;
  } else if (Q.name === 'stripe') {
    // 5) 竖条扫过：素材 12.6s 那次条纹 moment —— 条纹对比拉满并快速横移，光体再抬一次
    const k = smooth(clamp01(Q.p / 0.25));
    const hold = 1 - smooth(clamp01((Q.p - 0.70) / 0.30));
    D.gain = mix(P.bodyBlue, P.bodyStripe, k) * (0.88 + 0.12 * hold);
    D.tint = mix(P.blueTint != null ? P.blueTint : 0.95, P.stripeTint != null ? P.stripeTint : 0.80, k);
    D.stripe = mix(P.stripeAmp, 1, k);
    D.freq = (P.stripeFreq != null ? P.stripeFreq : 7) * mix(1, P.stripeBurstFreq != null ? P.stripeBurstFreq : 1.5, k);
    D.phase = Q.t * drift + Q.p * (P.stripeSweep != null ? P.stripeSweep : 2.5);
    D.scale = mix(1 - sp, 1 + sp * 1.5, k);
    B.gain = mix(P.beamBlue, P.beamBlue * 1.35, k);
    B.white = 0;
    B.blue = 0.75;
    S.gain = mix(P.stickSustain, P.stickStripe, k);
    S.white = 0;
    S.blue = P.stickBlueMix;
    S.flicker = mix(P.stickFlicker, P.stickFlicker * 1.3, k);
    S.flickerHz = P.stickFlickerHz != null ? P.stickFlickerHz : 0.7;
    S.regionN = P.stickRegionN != null ? P.stickRegionN : 12;
    R.intensity = mix(P.ribbonBlue, P.ribbonBlue * 1.5, k);
    R.white = 0.15;
  } else {
    // 6) 回落：w 从 1 收到 0，消费端自动插值回常态
    const k = smooth(Q.p);
    out.w = 1 - k;
    D.gain = mix(P.bodyStripe * 0.6, P.bodyBase, k);
    D.tint = mix(P.stripeTint != null ? P.stripeTint : 0.80, 0.15, k);
    D.stripe = mix(0.9, 0.1, k);
    D.freq = P.stripeFreq != null ? P.stripeFreq : 7;
    D.scale = mix(1 + sp, 1, k);
    B.gain = mix(P.beamBlue * 0.8, P.beamIgnite, k);
    B.white = 1 - k;
    B.blue = 0.5 * (1 - k);
    S.gain = mix(P.stickSustain * 1.1, P.stickDark, k);
    S.white = 1;
    S.blue = P.stickBlueMix * (1 - k);
    S.flicker = P.stickFlicker * (1 - k);
    R.intensity = mix(P.ribbonBlue * 0.8, 0, k);
    R.white = 1 - k;
  }
  return out;
}
