// =====================================================================
// lightshowc.js — 灯光秀 C「环流」（环形光带绕场旋转）
//
// 与 A/B 的差别：
//   A 是一条绕场行进的单向亮带（bandU 走廊），B 是舞台中央一团光。
//   C 是**多条同时存在的光环**：ringN 条正弦光带绕碗体环向旋转，相位互相错开，
//   再叠一层径向条纹（radN）让上下层看台错拍，形成「流动的波纹」质感。
//   最后一段 bloom 把环流收拢成整片白光，out 段交还常态。
//
// 契约与 A/B 完全一致（registry 里三套消费端只认这一套字段）：
//   { phase, name, p, t, total, w, sticks:{...}, ribbon:{...}, beam:{...} }
// sticks 额外带 C 专属的可选通道：
//   ringN / ringT / ringAmp   环向光带（条数 / 相位 / 幅度）
//   radN  / radT  / radAmp    径向条纹（同上，s 轴）
//   warm                      暖色偏移（这里恒 0，留给 D 用）
// =====================================================================

export const LSC_PHASES = ['enter', 'run', 'split', 'gather', 'bloom', 'out'];

const DUR_KEYS = ['enter', 'run', 'split', 'gather', 'bloom', 'out'];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const mix = (a, b, k) => a + (b - a) * k;
const pulse = (p, cycles) => 0.5 + 0.5 * Math.sin(clamp01(p) * cycles * Math.PI * 2);

/** 一轮完整编舞的时长（秒） */
export function lightShowCDuration(P) {
  let s = 0;
  for (const k of DUR_KEYS) s += Math.max(0, (P && P[k]) || 0);
  return Math.max(0.1, s);
}

/** 定位当前处于哪个阶段；t 会自动按总时长取模（循环） */
export function lightShowCPhaseAt(t, P) {
  const total = lightShowCDuration(P);
  let tt = t % total;
  if (tt < 0) tt += total;
  let acc = 0;
  for (const k of DUR_KEYS) {
    const d = Math.max(0, (P && P[k]) || 0);
    if (tt < acc + d || k === DUR_KEYS[DUR_KEYS.length - 1]) {
      return { phase: k, name: k, p: d > 1e-6 ? clamp01((tt - acc) / d) : 1, t: tt, total };
    }
    acc += d;
  }
  return { phase: 'out', name: 'out', p: 1, t: tt, total };
}

/** 某一时刻的完整曲线 */
export function lightShowCAt(t, P) {
  if (!P || P.enabled === false) return null;
  const Q = lightShowCPhaseAt(t, P);
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
    // 舞台 LED 大屏（C 也驱动它：冷青呼吸 + 细竖纹，不做几何缩放）
    body: { gain: 0, tint: 0, stripe: 0, scale: 1, freq: 7, phase: 0 },
  };
  const S = out.sticks, R = out.ribbon, B = out.beam, D = out.body;
  const base = P.baseGain != null ? P.baseGain : 0.16;
  // 屏幕：整轮都给一层冷青底 + 呼吸，环流段竖纹密度跟着环带条数走
  D.gain = P.bodyGain != null ? P.bodyGain : 1.15;
  D.tint = P.bodyTint != null ? P.bodyTint : 0.55;
  D.freq = P.bodyFreq != null ? P.bodyFreq : 9;
  D.phase = 0;

  if (Q.name === 'enter') {
    // 1) 起势：从常态渐入，环带条数从 0 涨到 ringN，亮度缓起（循环接缝靠这里衔接）
    out.w = smooth(Q.p / 0.30);
    const k = smooth(Q.p);
    S.gain = mix(base, P.runGain != null ? P.runGain : 0.92, k * 0.55);
    S.white = 0;
    S.ringN = Math.round(mix(0, P.ringN != null ? P.ringN : 3, k));
    S.ringT = 0;
    S.ringAmp = mix(0, P.ringAmp != null ? P.ringAmp : 0.85, k);
    S.radN = P.radN != null ? P.radN : 2;
    S.radT = 0;
    S.radAmp = mix(0, P.radAmp != null ? P.radAmp : 0.18, k);
    R.intensity = mix(P.ribbonBase != null ? P.ribbonBase : 1.4, P.ribbonRun != null ? P.ribbonRun : 4.2, k);
    R.white = 0;
    B.gain = mix(0.16, P.beamRun != null ? P.beamRun : 1.05, k);
    B.white = 0;
  } else if (Q.name === 'run') {
    // 2) 主段：环带匀速绕场旋转，径向条纹反向慢转（上下层错拍）
    const k = smooth(clamp01(Q.p / 0.25));
    S.gain = mix(base, P.runGain != null ? P.runGain : 0.92, k);
    S.white = mix(0, 0.22, smooth(clamp01((Q.p - 0.5) / 0.5)));
    S.ringN = P.ringN != null ? P.ringN : 3;
    S.ringT = Q.t * (P.ringSpeed != null ? P.ringSpeed : 0.42);
    S.ringAmp = P.ringAmp != null ? P.ringAmp : 0.85;
    S.radN = P.radN != null ? P.radN : 2;
    S.radT = Q.t * (P.radSpeed != null ? P.radSpeed : -0.23);
    S.radAmp = P.radAmp != null ? P.radAmp : 0.18;
    R.intensity = P.ribbonRun != null ? P.ribbonRun : 4.2;
    R.white = S.white;
    B.gain = P.beamRun != null ? P.beamRun : 1.05;
    B.white = 0;
  } else if (Q.name === 'split') {
    // 3) 分束：环带条数翻倍、转速加快，明暗对比拉大（画面「散开」）
    const k = smooth(Q.p);
    S.gain = mix(P.runGain != null ? P.runGain : 0.92, P.splitGain != null ? P.splitGain : 1.35, k);
    S.white = mix(0.22, 0.42, k);
    S.ringN = Math.round(mix(P.ringN != null ? P.ringN : 3, (P.ringN != null ? P.ringN : 3) * 2, k));
    S.ringT = Q.t * mix(P.ringSpeed != null ? P.ringSpeed : 0.42, (P.ringSpeed != null ? P.ringSpeed : 0.42) * 1.8, k);
    S.ringAmp = mix(P.ringAmp != null ? P.ringAmp : 0.85, 1.05, k);
    S.radN = P.radN != null ? P.radN : 2;
    S.radT = Q.t * (P.radSpeed != null ? P.radSpeed : -0.23);
    S.radAmp = mix(P.radAmp != null ? P.radAmp : 0.18, 0.32, k);
    R.intensity = mix(P.ribbonRun != null ? P.ribbonRun : 4.2, P.ribbonBloom != null ? P.ribbonBloom : 7.6, k * 0.5);
    R.white = S.white;
    B.gain = mix(P.beamRun != null ? P.beamRun : 1.05, 1.45, k);
    B.white = S.white * 0.6;
  } else if (Q.name === 'gather') {
    // 4) 收拢：条数收回来、相位回零，所有光环对齐成一圈（准备爆亮）
    const k = smooth(Q.p);
    S.gain = mix(P.splitGain != null ? P.splitGain : 1.35, P.bloomGain != null ? P.bloomGain : 2.2, k);
    S.white = mix(0.42, 0.85, k);
    S.ringN = Math.round(mix((P.ringN != null ? P.ringN : 3) * 2, P.ringN != null ? P.ringN : 3, k));
    S.ringT = mix(0.5 - (Q.p * 0.5), 0, k);
    S.ringAmp = mix(1.05, 0.25, k);           // 幅度收到很小 = 整圈几乎均匀
    S.radN = P.radN != null ? P.radN : 2;
    S.radT = 0;
    S.radAmp = mix(0.32, 0.05, k);
    R.intensity = mix(P.ribbonBloom != null ? P.ribbonBloom : 7.6, (P.ribbonBloom != null ? P.ribbonBloom : 7.6) * 1.15, k);
    R.white = S.white;
    B.gain = mix(1.45, P.beamBloom != null ? P.beamBloom : 1.6, k);
    B.white = S.white;
  } else if (Q.name === 'bloom') {
    // 5) 爆亮：整圈同时满亮（光环消失，只剩均匀白光），环带接近纯白满亮
    const fl = pulse(Q.p, 1.4);
    const die = 1 - smooth(clamp01((Q.p - 0.45) / 0.55));
    S.gain = mix(P.bloomGain != null ? P.bloomGain : 2.2, P.runGain != null ? P.runGain : 0.92, 1 - die) * (0.92 + 0.16 * fl);
    S.white = 0.92 * die;
    S.ringN = 0;
    S.ringT = 0;
    S.ringAmp = 0;
    S.radN = 0;
    S.radAmp = 0;
    R.intensity = mix(P.ribbonBloom != null ? P.ribbonBloom : 7.6, P.ribbonBase != null ? P.ribbonBase : 1.4, 1 - die);
    R.white = S.white;
    B.gain = mix(P.beamBloom != null ? P.beamBloom : 1.6, 0.3, 1 - die);
    B.white = S.white;
  } else {
    // 6) 回落：亮度回常态、w 收到 0（下一轮 enter 再从 0 渐入，接缝连续）
    const k = smooth(Q.p);
    out.w = 1 - k;
    S.gain = mix(P.runGain != null ? P.runGain : 0.92, 1, k);
    S.white = mix(0.4, 0, k);
    S.ringN = 0;
    S.ringAmp = 0;
    S.radN = 0;
    S.radAmp = 0;
    R.intensity = mix(P.ribbonBase != null ? P.ribbonBase : 1.4, 2.2, k);
    R.white = 0;
    B.gain = mix(0.3, 0, k);
    B.white = 0;
  }
  return out;
}
