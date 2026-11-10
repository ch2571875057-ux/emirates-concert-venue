// =====================================================================
// lightshowe.js — 灯光秀 E「极光」（环向 + 径向双向慢波，冷绿到紫的色温漂移）
//
// A 是单向亮带、B 是居中光团、C 是环形光带、D 是时间拍点。E 走的是
// **两个方向同时传播的慢波**：环向 ringN 条 + 径向 radN 条，各自以不同
// 速度/方向漂移，叠出来的是「极光带」那种缓慢流动的明暗层次。
// 中段 fold 把环向相位反向（波「折回来」），末段 flare 一次爆亮后回落。
//
// 色温：E 不用 warm（暖白是 D 的），靠 white 在 0~0.55 之间游走 ——
// 冷青 ↔ 近白的缓慢过渡，配合极慢的流速读作「极光」。
// =====================================================================

export const LSE_PHASES = ['seep', 'drift', 'fold', 'flare', 'out'];

const DUR_KEYS = ['seep', 'drift', 'fold', 'flare', 'out'];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const mix = (a, b, k) => a + (b - a) * k;

/** 一轮完整编舞的时长（秒） */
export function lightShowEDuration(P) {
  let s = 0;
  for (const k of DUR_KEYS) s += Math.max(0, (P && P[k]) || 0);
  return Math.max(0.1, s);
}

/** 定位当前处于哪个阶段；t 会自动按总时长取模（循环） */
export function lightShowEPhaseAt(t, P) {
  const total = lightShowEDuration(P);
  let tt = t % total;
  if (tt < 0) tt += total;
  let acc = 0;
  for (const k of DUR_KEYS) {
    const d = Math.max(0, (P && P[k]) || 0);
    if (tt < acc + d || k === DUR_KEYS[DUR_KEYS.length - 1]) {
      return { phase: k, name: k, p: d > 1e-6 ? clamp01((tt - acc) / d) : 1, t: tt, total, elapsedInPhase: tt - acc };
    }
    acc += d;
  }
  return { phase: 'out', name: 'out', p: 1, t: tt, total, elapsedInPhase: 0 };
}

/** 某一时刻的完整曲线 */
export function lightShowEAt(t, P) {
  if (!P || P.enabled === false) return null;
  const Q = lightShowEPhaseAt(t, P);
  const out = {
    phase: Q.phase,
    name: Q.name,
    p: Q.p,
    t: Q.t,
    total: Q.total,
    w: 1,
    sticks: {
      gain: 0, white: 0, bandU: -1, bandW: 0.2, bandFloor: 0.25,
      focusU: -1, focusW: 0, focusFloor: 0.12,
      ringN: 0, ringT: 0, ringAmp: 0, radN: 0, radT: 0, radAmp: 0, warm: 0,
    },
    ribbon: { intensity: 0, white: 0 },
    beam: { gain: 0, white: 0 },
    body: { gain: 0, tint: 0, stripe: 0, scale: 1, freq: 7, phase: 0 },
  };
  const S = out.sticks, R = out.ribbon, B = out.beam, D = out.body;
  const base = P.baseGain != null ? P.baseGain : 0.15;
  const ringN = P.ringN != null ? P.ringN : 3;
  const radN = P.radN != null ? P.radN : 2;
  const ringSpeed = P.ringSpeed != null ? P.ringSpeed : 0.11;
  const radSpeed = P.radSpeed != null ? P.radSpeed : 0.07;
  // 环向相位用一个**全局连续**函数算，不能各段各算（否则段边界处相位跳变 = 光带整体闪一下）。
  // fold 段的速度平滑地由 +ringSpeed 过零变到 -ringSpeed：改用
  //   T(t) = T0 + (V·Tf/π)·sin(π·τ/Tf)
  // 对 τ 求导就是 V·cos(...)，起点 +V、终点 -V，且 C0/C1 连续、净位移为 0（波原路折回）。
  const ringPhase = (() => {
    const t = Q.t;
    const dSeep = Math.max(0, P.seep || 0);
    const dDrift = Math.max(0, P.drift || 0);
    const foldStart = dSeep + dDrift;
    const Tf = Math.max(1e-6, P.fold || 0);
    if (t <= foldStart) return t * ringSpeed;
    const T0 = foldStart * ringSpeed;
    if (t < foldStart + Tf) return T0 + ringSpeed * (Tf / Math.PI) * Math.sin(Math.PI * (t - foldStart) / Tf);
    // fold 结束时速度已是 -ringSpeed，之后沿反方向继续
    return T0 - ringSpeed * (t - foldStart - Tf);
  })();

  // 屏幕：极光感的冷青底 + 很慢的相位漂移
  D.tint = P.bodyTint != null ? P.bodyTint : 0.62;
  D.freq = P.bodyFreq != null ? P.bodyFreq : 5;
  D.phase = Q.t * (P.bodyDrift != null ? P.bodyDrift : 0.03);
  D.stripe = 0.22;

  if (Q.name === 'seep') {
    // 1) 渗透：从常态极慢地浮起来（E 的起势比其他变体都要慢，是它的性格）
    out.w = smooth(Q.p / 0.45);
    const k = smooth(Q.p);
    S.gain = mix(base, P.driftGain != null ? P.driftGain : 0.78, k * 0.5);
    S.white = mix(0, 0.12, k);
    S.ringN = ringN;
    S.ringT = ringPhase;
    S.ringAmp = mix(0, P.ringAmp != null ? P.ringAmp : 0.62, k);
    S.radN = radN;
    S.radT = Q.t * radSpeed;
    S.radAmp = mix(0, P.radAmp != null ? P.radAmp : 0.30, k);
    R.intensity = mix(P.ribbonBase != null ? P.ribbonBase : 1.3, P.ribbonDrift != null ? P.ribbonDrift : 3.4, k);
    R.white = 0;
    B.gain = mix(0.15, P.beamDrift != null ? P.beamDrift : 0.85, k);
    B.white = 0;
    D.gain = mix(P.bodyBase != null ? P.bodyBase : 0.6, P.bodyDrift != null ? P.bodyDrift : 1.5, k);
  } else if (Q.name === 'drift') {
    // 2) 漂流：双向慢波各自匀速，白度极慢地来回（极光的呼吸）
    const k = 0.92 + 0.08 * Math.sin(Q.t * 0.55);
    S.gain = (P.driftGain != null ? P.driftGain : 0.78) * k;
    S.white = 0.18 + 0.20 * (0.5 + 0.5 * Math.sin(Q.t * 0.42 + 1.1));
    S.ringN = ringN;
    S.ringT = ringPhase;
    S.ringAmp = P.ringAmp != null ? P.ringAmp : 0.62;
    S.radN = radN;
    S.radT = Q.t * radSpeed;
    S.radAmp = P.radAmp != null ? P.radAmp : 0.30;
    R.intensity = (P.ribbonDrift != null ? P.ribbonDrift : 3.4) * k;
    R.white = S.white * 0.6;
    B.gain = P.beamDrift != null ? P.beamDrift : 0.85;
    B.white = 0;
    D.gain = (P.bodyDrift != null ? P.bodyDrift : 1.5) * k;
    D.stripe = 0.26;
  } else if (Q.name === 'fold') {
    // 3) 折返：环向相位反向（波「撞墙折回」），径向幅度抬升，白度推到高位
    const k = smooth(Q.p);
    S.gain = mix(P.driftGain != null ? P.driftGain : 0.78, P.foldGain != null ? P.foldGain : 1.25, k);
    S.white = mix(0.28, 0.55, k);
    S.ringN = ringN;
    S.ringT = ringPhase;
    S.ringAmp = mix(P.ringAmp != null ? P.ringAmp : 0.62, (P.ringAmp != null ? P.ringAmp : 0.62) * 1.35, k);
    S.radN = radN;
    S.radT = -Q.t * radSpeed;                 // 径向在这段与环向反向，层次拉开
    S.radAmp = mix(P.radAmp != null ? P.radAmp : 0.30, (P.radAmp != null ? P.radAmp : 0.30) * 1.6, k);
    R.intensity = mix(P.ribbonDrift != null ? P.ribbonDrift : 3.4, P.ribbonFold != null ? P.ribbonFold : 5.6, k);
    R.white = S.white;
    B.gain = mix(P.beamDrift != null ? P.beamDrift : 0.85, P.beamFold != null ? P.beamFold : 1.25, k);
    B.white = S.white * 0.7;
    D.gain = mix(P.bodyDrift != null ? P.bodyDrift : 1.5, P.bodyFold != null ? P.bodyFold : 2.0, k);
    D.stripe = mix(0.26, 0.44, k);
  } else if (Q.name === 'flare') {
    // 4) 爆亮：一次短促的满亮（波幅收小、整圈几乎均匀），随后迅速退去
    const fl = smooth(clamp01(Q.p / 0.18)) * (1 - smooth(clamp01((Q.p - 0.28) / 0.72)));
    S.gain = mix(P.foldGain != null ? P.foldGain : 1.25, P.flareGain != null ? P.flareGain : 2.4, fl);
    S.white = mix(0.55, 0.95, fl);
    S.ringN = ringN;
    S.ringT = ringPhase;
    S.ringAmp = mix((P.ringAmp != null ? P.ringAmp : 0.62) * 1.35, 0.10, fl);
    S.radN = radN;
    S.radT = Q.t * radSpeed;
    S.radAmp = mix((P.radAmp != null ? P.radAmp : 0.30) * 1.6, 0.04, fl);
    R.intensity = mix(P.ribbonFold != null ? P.ribbonFold : 5.6, P.ribbonFlare != null ? P.ribbonFlare : 8.4, fl);
    R.white = S.white;
    B.gain = mix(P.beamFold != null ? P.beamFold : 1.25, P.beamFlare != null ? P.beamFlare : 1.7, fl);
    B.white = S.white;
    D.gain = mix(P.bodyFold != null ? P.bodyFold : 2.0, P.bodyFlare != null ? P.bodyFlare : 2.9, fl);
    D.stripe = mix(0.44, 0.08, fl);
  } else {
    // 5) 退去：极慢地回常态，w 收到 0（下一轮 seep 从 0 渐入，接缝连续）
    const k = smooth(Q.p);
    out.w = 1 - k;
    S.gain = mix(P.foldGain != null ? P.foldGain : 1.25, 1, k);
    S.white = mix(0.9, 0, k);
    S.ringN = ringN;
    S.ringT = ringPhase;
    S.ringAmp = mix(0.10, 0, k);
    S.radN = radN;
    S.radT = Q.t * radSpeed;
    S.radAmp = mix(0.04, 0, k);
    R.intensity = mix(P.ribbonFold != null ? P.ribbonFold : 5.6, 2.2, k);
    R.white = mix(0.9, 0, k);
    B.gain = mix(P.beamFold != null ? P.beamFold : 1.25, 0, k);
    B.white = mix(0.9, 0, k);
    D.gain = mix(P.bodyFold != null ? P.bodyFold : 2.0, 1, k);
    D.stripe = mix(0.08, 0, k);
  }
  return out;
}
