// =====================================================================
// tools/verify_lightshow_seam.mjs — 灯光秀「循环接缝」专项断言
// 用法：node tools/verify_lightshow_seam.mjs
//
// 背景：这个脚本是为了防止一个具体的历史 bug 复现 ——
// A/B 的第一段（breath / ignite）原本是 w=1 且 gain 很低，而最后一段
// （fall / fade）把 w 收到 0 交还常态（有效亮度 → 1.0）。于是循环重启的
// 那一帧，全场亮度从 1.000 直接掉到 0.180，肉眼就是「灯突然一黑」。
// 修法是让首段的 w 从 0 平滑升到 1，与尾端对齐。
//
// 这里不只看 w，而是看**消费端真正用的有效亮度**：
//   v = gain * w + (1 - w)
// 对 sticks / ribbon / beam / body 四条通道分别检查接缝两侧。
// =====================================================================
import { LS_IDS, lightShowFor, lightShowDurationFor } from '../js/lightshowRegistry.js';

let fails = 0;
const ok = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fails++; }
};
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

// 消费端有效亮度（与 stadium.js 里 applyLightShowEntries / updateLightShowRibbon /
// updateLights / updateLightShowBody 的写法一致）
function channels(R) {
  const w = R.w;
  const bw = R.body ? w : 0;                 // 无 body 的变体不压屏（消费端用 body 判定）
  return {
    sticks: R.sticks.gain * w + (1 - w),
    ribbon: R.ribbon.intensity * w + (1 - w),
    beam: R.beam.gain * w + (1 - w),
    body: (R.body ? R.body.gain : 1) * bw + (1 - bw),
  };
}

// 逼近 t=total 时用的是 ε→0 的几个点。ε 一大（比如 0.1s）就已经在 tail/out 段
// 中段了，那里的差值是编舞本身在收尾，不是接缝。
const STEPS = [1e-6, 1e-5, 1e-4, 1e-3, 1e-2];

console.log('== 接缝：有效亮度两侧极限 ==');
for (const id of LS_IDS) {
  const total = lightShowDurationFor(id);
  const at0 = channels(lightShowFor(id, 0));
  const rows = [];
  let worst = 0, worstCh = '';
  for (const eps of STEPS) {
    const atEnd = channels(lightShowFor(id, total - eps));
    for (const ch of Object.keys(at0)) {
      const d = Math.abs(atEnd[ch] - at0[ch]);
      if (d > worst) { worst = d; worstCh = ch; }
    }
    rows.push(`    ε=${eps.toExponential(0).padEnd(4)} ` +
      Object.keys(at0).map((ch) => `${ch} ${atEnd[ch].toFixed(4)}→${at0[ch].toFixed(4)}`).join('  '));
  }
  console.log(`  -- ${id} (total=${total.toFixed(2)}s)`);
  for (const r of rows) console.log(r);
  ok(worst < 0.02, `${id}: 最差通道差 ${worst.toFixed(5)}（${worstCh}）< 0.02`);

  // 首帧不能是「全场直接满亮/全黑」的跳变：w 必须从 0 附近起步
  const w0 = lightShowFor(id, 0).w;
  ok(w0 <= 0.02, `${id}: 首帧 w = ${w0.toFixed(4)} ≤ 0.02（从常态平滑进入，不硬切）`);
  // 尾帧必须把 w 收到 0 附近，才能无缝交还常态
  const wEnd = lightShowFor(id, total - 1e-3).w;
  ok(wEnd <= 0.02, `${id}: 尾帧 w = ${wEnd.toFixed(4)} ≤ 0.02（交还常态）`);
}

// w 是「编舞权重」，段与段之间若让它跳变，消费端插值就会整场闪一下。
// 各通道的 gain/intensity 在段边界跳变是**设计允许**的（比如 burst 段 ribbon
// 直接从 1.x 拉到 6.0），所以这里只对 w 做连续性断言。
console.log('\n== 连续性：编舞权重 w 无单帧跳变 ==');
for (const id of LS_IDS) {
  const total = lightShowDurationFor(id);
  const N = 12000;
  let maxJump = 0, jumpAt = 0, bad = 0;
  let prevW = lightShowFor(id, 0).w;
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * total;
    const w = lightShowFor(id, t).w;
    if (!fin(w)) { bad++; break; }
    const d = Math.abs(w - prevW);
    if (d > maxJump) { maxJump = d; jumpAt = t; }
    prevW = w;
  }
  ok(bad === 0 && maxJump < 0.02,
    `${id}: w 最大单步变化 ${maxJump.toFixed(5)}（@ t=${jumpAt.toFixed(3)}s，步长 ${(total / N).toFixed(4)}s）< 0.02`);
}

console.log('\n' + (fails === 0 ? 'ALL ASSERTIONS PASSED' : fails + ' ASSERTION(S) FAILED'));
process.exit(fails === 0 ? 0 : 1);
