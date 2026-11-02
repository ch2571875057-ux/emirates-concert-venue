// =====================================================================
// lightshow.js — 灯光秀 A：三载体联动的 12.6s 编舞（纯逻辑，无 three 依赖）
//
// 编舞取自素材视频的逐帧统计（青白爆发 → 收成横贯全宽的细亮带 → 近全暗留白
// → 顶部巨大纯白亮带 → 回落）。三个载体分工：
//   看台应援棒（8870 支）  成片的「点」：呼吸微光 → 爆发 → 灭灯 → 行进亮带
//   屋顶 LED 环带          画面里唯一能横贯全宽的线：爆发闪光 + 黑场里保留的细亮带 + 顶部白带
//   舞台光束阵列（10 束）   爆发全开、黑场收束、白带阶段转纯白
//
// lightShowAt(t, P) 每帧返回：
//   { phase, name, p, t, total, w,
//     sticks: { gain, white, bandU, bandW, bandFloor },
//     ribbon: { intensity, white },
//     beam:   { gain, white } }
// 其中 w 是「灯光秀权重」：0 = 完全交还常态，1 = 完全由灯光秀接管。
// 消费端一律按 w 在「常态值」与「灯光秀值」之间插值，因此收尾（fall）不会跳变。
// =====================================================================

export const LS_PHASES = ['breath', 'burst', 'collapse', 'black', 'band', 'fall'];

const DUR_KEYS = ['breath', 'burst', 'collapse', 'black', 'band', 'fall'];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// 平滑阶跃 0→1（3t²-2t³）
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const mix = (a, b, k) => a + (b - a) * k;
// 归一化相位内的正弦脉冲 0..1（cycles = 相位内重复次数）
const pulse = (p, cycles) => 0.5 + 0.5 * Math.sin(clamp01(p) * cycles * Math.PI * 2);

/** 一轮完整编舞的时长（秒） */
export function lightShowDuration(P) {
  let s = 0;
  for (const k of DUR_KEYS) s += Math.max(0, (P && P[k]) || 0);
  return Math.max(0.1, s);
}

/** 定位当前处于哪个阶段；t 会自动按总时长取模（循环） */
export function lightShowPhaseAt(t, P) {
  const total = lightShowDuration(P);
  const tt = ((t % total) + total) % total;
  let acc = 0;
  for (let i = 0; i < DUR_KEYS.length; i++) {
    const d = Math.max(0, (P && P[DUR_KEYS[i]]) || 0);
    const last = i === DUR_KEYS.length - 1;
    if (tt < acc + d || last) {
      return { phase: i, name: LS_PHASES[i], p: clamp01((tt - acc) / Math.max(1e-4, d)), t: tt, total };
    }
    acc += d;
  }
  return { phase: 0, name: LS_PHASES[0], p: 0, t: tt, total };
}

/**
 * 灯光秀 A 的主曲线。
 * @param {number} t  编舞内的时间（秒，可任意大，按总时长取模）
 * @param {object} P  DATA.concert.lightShow
 * @returns {null|object} 未启用时返回 null（表示「交还常态」）
 */
export function lightShowAt(t, P) {
  if (!P || P.enabled === false) return null;
  const Q = lightShowPhaseAt(t, P);
  const out = {
    phase: Q.phase,
    name: Q.name,
    p: Q.p,
    t: Q.t,
    total: Q.total,
    w: 1,
    sticks: { gain: 0, white: 0, bandU: -1, bandW: 0.2, bandFloor: 0.25 },
    ribbon: { intensity: 0, white: 0 },
    beam: { gain: 0, white: 0 },
  };
  const S = out.sticks, R = out.ribbon, B = out.beam;
  const bg = P.breathGain || [0.1, 0.26];
  const br = P.breathRibbon || [0.8, 1.5];
  // 聚焦扇区：素材里 0~4.5s 的光块是「居中一团」而不是整圈均匀亮。
  // focusU = 聚焦中心（取正对舞台那一侧的弧，与点阵屏同一基准），focusW = 半角宽（0..0.5）。
  // 0 = 不聚焦（整圈均匀），>0 = 中心亮、两侧按平滑曲线衰减到 focusFloor。
  const FU = P.focusU != null ? P.focusU : 0.75;
  S.focusU = -1;
  S.focusW = 0;
  S.focusFloor = P.focusFloor != null ? P.focusFloor : 0.12;

  if (Q.name === 'breath') {
    // 1) 呼吸：暗青，两次缓慢起伏。观众只是「被点亮」，不是全亮
    const k = pulse(Q.p, 1.6);
    S.gain = mix(bg[0], bg[1], k);
    S.white = 0;
    S.focusU = FU;
    S.focusW = P.focusBreathW != null ? P.focusBreathW : 0.17;
    R.intensity = mix(br[0], br[1], k);
    R.white = 0;
    B.gain = 0.14 + 0.06 * k;
    B.white = 0;
  } else if (Q.name === 'burst') {
    // 2) 爆发：35% 处冲到峰值后略微回落；颜色从冷青迅速转成纯白（视频里唯一的青白时刻）
    // 聚焦范围随峰值展开（P.focusBurstW），形成「一团炸开」而不是整圈同时亮
    const rise = smooth(clamp01(Q.p / 0.35));
    const decay = mix(1, 0.82, clamp01((Q.p - 0.55) / 0.45));
    const pk = rise * decay;
    S.gain = mix(bg[1], P.burstGain, pk);
    S.white = smooth(clamp01((Q.p - 0.12) / 0.30));
    S.focusU = FU;
    S.focusW = mix(P.focusBreathW != null ? P.focusBreathW : 0.17, P.focusBurstW != null ? P.focusBurstW : 0.42, rise);
    R.intensity = mix(br[1], P.burstRibbon, pk);
    R.white = S.white;
    B.gain = mix(0.2, P.burstBeam, pk);
    B.white = S.white;
  } else if (Q.name === 'collapse') {
    // 3) 收束：应援棒迅速灭灯，只留屋顶环带那一条横贯全宽的细亮带（画面上就是「一条线」）
    const die = 1 - smooth(Q.p);
    S.gain = mix(P.blackGain, P.burstGain * 0.55, die);
    S.white = 1 - 0.45 * smooth(Q.p);
    R.intensity = mix(P.burstRibbon, P.burstRibbon * 0.78, smooth(Q.p));
    R.white = 1 - 0.2 * smooth(Q.p);
    B.gain = mix(P.burstBeam, 0.10, smooth(Q.p));
    B.white = 1 - 0.5 * smooth(Q.p);
  } else if (Q.name === 'black') {
    // 4) 黑场：几乎全暗，只留极弱余辉呼吸。对比全靠这一段撑起来
    const fl = pulse(Q.p, 3);
    S.gain = P.blackGain * (0.55 + 0.9 * fl);
    S.white = 0.15;
    R.intensity = P.blackRibbon * (0.65 + 0.55 * fl);
    R.white = 0.1;
    B.gain = 0.04 * (0.5 + 0.5 * fl);
    B.white = 0;
  } else if (Q.name === 'band') {
    // 5) 顶部白带：环带以纯白满亮撑起画面顶部的巨带；应援棒升起一条绕场行进的亮带
    const rise = smooth(clamp01(Q.p / 0.22));
    const hold = 1 - 0.32 * smooth(clamp01((Q.p - 0.72) / 0.28));
    S.gain = P.bandGain * rise * hold;
    S.white = 1;
    S.bandU = P.bandSpeed * Q.p % 1;
    S.bandW = P.bandWidth;
    S.bandFloor = P.bandFloor;
    R.intensity = mix(P.blackRibbon, P.bandRibbon, rise) * hold;
    R.white = 1;
    B.gain = P.bandBeam * rise;
    B.white = 1;
  } else {
    // 6) 回落：权重 w 从 1 收到 0，消费端自动插值回常态，不会有跳变
    const k = smooth(Q.p);
    out.w = 1 - k;
    S.gain = mix(P.bandGain * 0.55, 1, k);
    S.white = 1 - k;
    R.intensity = mix(P.bandRibbon * 0.55, 0, k);
    R.white = 1 - k;
    B.gain = mix(P.bandBeam * 0.55, 1, k);
    B.white = 1 - k;
  }
  return out;
}
