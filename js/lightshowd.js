// =====================================================================
// lightshowd.js — 灯光秀 D「心跳」（全场同步拍点 + 暖白脉冲）
//
// 与 A/B/C 的差别：前三套都是「空间上流动」，D 是**时间上的律动**。
// 整场观众按鼓点一起亮灭（beat），拍点之间有低频底光托着；
// 第二段 double 把拍频翻倍（从 96 BPM 感变成 192），第三段 hold 让整场
// 悬在半亮不动（憋住），最后 out 泄掉。暖白脉冲（warm 通道）让它区别于
// A/C 的冷青，是唯一一套「暖色」编舞。
//
// 关键实现：拍包络 beatEnv 是**纯算术**（分段线性 + 指数衰减），
// 不逐实例算三角函数——8870 支棒每帧只乘同一个标量。
// =====================================================================

export const LSD_PHASES = ['enter', 'beat', 'double', 'hold', 'out'];

const DUR_KEYS = ['enter', 'beat', 'double', 'hold', 'out'];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const mix = (a, b, k) => a + (b - a) * k;

/** 一拍内的包络：0 → 1（快起）→ 指数衰减到 floor。ph 是拍内相位（0..1） */
function beatShape(ph, rise, decayPow, floor) {
  const p = ph - Math.floor(ph);
  if (p < rise) return smooth(p / Math.max(1e-6, rise));
  const d = (p - rise) / Math.max(1e-6, 1 - rise);
  return floor + (1 - floor) * Math.pow(1 - d, decayPow);
}

/** 一轮完整编舞的时长（秒） */
export function lightShowDDuration(P) {
  let s = 0;
  for (const k of DUR_KEYS) s += Math.max(0, (P && P[k]) || 0);
  return Math.max(0.1, s);
}

/** 定位当前处于哪个阶段；t 会自动按总时长取模（循环） */
export function lightShowDPhaseAt(t, P) {
  const total = lightShowDDuration(P);
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
export function lightShowDAt(t, P) {
  if (!P || P.enabled === false) return null;
  const Q = lightShowDPhaseAt(t, P);
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
      ringN: 0, ringT: 0, ringAmp: 0, radN: 0, radT: 0, radAmp: 0,
      beatAmp: 0, beatEnv: 0, warm: 0,
    },
    ribbon: { intensity: 0, white: 0 },
    beam: { gain: 0, white: 0 },
    body: { gain: 0, tint: 0, stripe: 0, scale: 1, freq: 7, phase: 0 },
  };
  const S = out.sticks, R = out.ribbon, B = out.beam, D = out.body;
  const base = P.baseGain != null ? P.baseGain : 0.14;
  const bpm = P.bpm != null ? P.bpm : 96;
  const hz = bpm / 60;
  const floor = P.beatFloor != null ? P.beatFloor : 0.10;
  const rise = P.beatRise != null ? P.beatRise : 0.10;
  const decayPow = P.beatDecay != null ? P.beatDecay : 2.6;
  // 屏幕：随拍点一起脉动（暖白 → 屏幕给不了暖色，靠亮度 + tint 走）
  D.freq = P.bodyFreq != null ? P.bodyFreq : 6;
  D.stripe = 0.16;

  if (Q.name === 'enter') {
    // 1) 起势：从常态渐入，前两拍轻轻试探（拍幅度从 0 涨到满）
    out.w = smooth(Q.p / 0.35);
    const k = smooth(Q.p);
    const env = beatShape(Q.t * hz, rise, decayPow, floor);
    S.gain = mix(base, P.beatGain != null ? P.beatGain : 1.05, k);
    S.beatAmp = mix(0, P.beatAmp != null ? P.beatAmp : 0.95, k * 0.6);
    S.beatEnv = env;
    S.warm = mix(0, P.warm != null ? P.warm : 0.55, k * 0.5);
    S.white = 0.1 * k;
    R.intensity = mix(P.ribbonBase != null ? P.ribbonBase : 1.6, P.ribbonBeat != null ? P.ribbonBeat : 4.0, env * k);
    R.white = 0;
    B.gain = mix(0.18, P.beamBeat != null ? P.beamBeat : 1.2, env * k);
    B.white = 0;
    D.gain = mix(P.bodyBase != null ? P.bodyBase : 0.7, P.bodyBeat != null ? P.bodyBeat : 1.9, env * k);
    D.tint = 0.30;
    D.scale = 1;
  } else if (Q.name === 'beat') {
    // 2) 主段：一拍一亮，拍间有底光；看台被分成 regionN 个区微微错拍（人群不是整齐划一）
    const env = beatShape(Q.t * hz, rise, decayPow, floor);
    const breathe = 0.9 + 0.1 * Math.sin(Q.t * 1.7);
    S.gain = (P.beatGain != null ? P.beatGain : 1.05) * breathe;
    S.beatAmp = P.beatAmp != null ? P.beatAmp : 0.95;
    S.beatEnv = env;
    S.warm = P.warm != null ? P.warm : 0.55;
    S.white = 0.12;
    S.flicker = P.regionFlicker != null ? P.regionFlicker : 0.10;
    S.flickerHz = 0.42;
    S.regionN = P.regionN != null ? P.regionN : 8;
    R.intensity = mix(P.ribbonBase != null ? P.ribbonBase : 1.6, P.ribbonBeat != null ? P.ribbonBeat : 4.0, env);
    R.white = 0.08;
    B.gain = mix(0.4, P.beamBeat != null ? P.beamBeat : 1.2, env);
    B.white = 0.06;
    D.gain = mix(P.bodyBase != null ? P.bodyBase : 0.7, P.bodyBeat != null ? P.bodyBeat : 1.9, env);
    D.tint = 0.30 + 0.12 * env;
    D.scale = 1 + (P.bodyPulse != null ? P.bodyPulse : 0.05) * env;
  } else if (Q.name === 'double') {
    // 3) 加倍：拍频翻倍、幅度略收，形成「加速」的推进感
    const env = beatShape(Q.t * hz * 2, rise * 0.8, decayPow * 0.85, floor);
    S.gain = (P.beatGain != null ? P.beatGain : 1.05) * 1.06;
    S.beatAmp = (P.beatAmp != null ? P.beatAmp : 0.95) * 0.82;
    S.beatEnv = env;
    S.warm = (P.warm != null ? P.warm : 0.55) * 0.7;
    S.white = mix(0.12, 0.45, smooth(Q.p));
    S.flicker = 0.16;
    S.flickerHz = 0.42;
    S.regionN = P.regionN != null ? P.regionN : 8;
    R.intensity = mix(P.ribbonBeat != null ? P.ribbonBeat : 4.0, (P.ribbonBeat != null ? P.ribbonBeat : 4.0) * 1.5, smooth(Q.p));
    R.white = S.white * 0.7;
    B.gain = mix(P.beamBeat != null ? P.beamBeat : 1.2, (P.beamBeat != null ? P.beamBeat : 1.2) * 1.2, env);
    B.white = S.white * 0.5;
    D.gain = mix(P.bodyBeat != null ? P.bodyBeat : 1.9, (P.bodyBeat != null ? P.bodyBeat : 1.9) * 1.25, smooth(Q.p));
    D.tint = 0.30;
    D.stripe = 0.34;
    D.scale = 1 + (P.bodyPulse != null ? P.bodyPulse : 0.05) * 1.6 * env;
  } else if (Q.name === 'hold') {
    // 4) 悬停：整场憋在半亮不动（拍点消失），是这套编舞的「留白」
    const k = smooth(clamp01(Q.p / 0.2)) * (1 - smooth(clamp01((Q.p - 0.75) / 0.25)));
    S.gain = (P.beatGain != null ? P.beatGain : 1.05) * mix(1, 0.42, k);
    S.beatAmp = (P.beatAmp != null ? P.beatAmp : 0.95) * (1 - k);
    S.beatEnv = 0.6;
    S.warm = (P.warm != null ? P.warm : 0.55) * mix(0.7, 0.15, k);
    S.white = mix(0.45, 0.72, k);
    S.flicker = 0.05;
    S.flickerHz = 0.42;
    S.regionN = P.regionN != null ? P.regionN : 8;
    R.intensity = mix((P.ribbonBeat != null ? P.ribbonBeat : 4.0) * 1.5, (P.ribbonBeat != null ? P.ribbonBeat : 4.0) * 0.9, k);
    R.white = 0.85 * k;
    B.gain = mix((P.beamBeat != null ? P.beamBeat : 1.2) * 1.1, 0.35, k);
    B.white = 0.7 * k;
    D.gain = mix((P.bodyBeat != null ? P.bodyBeat : 1.9) * 1.2, (P.bodyBase != null ? P.bodyBase : 0.7) * 1.1, k);
    D.tint = mix(0.30, 0.75, k);
    D.stripe = mix(0.34, 0.10, k);
    D.scale = 1;
  } else {
    // 5) 泄掉：亮度回常态、w 收到 0（下一轮 enter 从 0 渐入，接缝连续）
    const k = smooth(Q.p);
    out.w = 1 - k;
    S.gain = mix((P.bodyBase != null ? P.bodyBase : 0.7) * 1.1, 1, k);
    S.beatAmp = 0;
    S.beatEnv = 0;
    S.warm = mix(0.15, 0, k);
    S.white = mix(0.6, 0, k);
    S.flicker = 0;
    R.intensity = mix((P.ribbonBeat != null ? P.ribbonBeat : 4.0) * 0.9, 2.2, k);
    R.white = mix(0.8, 0, k);
    B.gain = mix(0.35, 0, k);
    B.white = mix(0.6, 0, k);
    D.gain = mix((P.bodyBase != null ? P.bodyBase : 0.7) * 1.1, 1, k);
    D.tint = mix(0.75, 0, k);
    D.stripe = mix(0.10, 0, k);
    D.scale = 1;
  }
  return out;
}
