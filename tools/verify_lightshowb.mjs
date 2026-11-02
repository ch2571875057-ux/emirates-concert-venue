// 灯光秀 B 的离线断言（纯数学，无需浏览器）
// 用法：node tools/verify_lightshowb.mjs
import { DATA } from '../js/data.js';
import { lightShowBAt, lightShowBDuration, lightShowBPhaseAt, LSB_PHASES } from '../js/lightshowb.js';
import { lightShowAt, lightShowDuration } from '../js/lightshow.js';

let fails = 0;
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  OK  ' : '  FAIL'} ${msg}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

const P = DATA.concert.lightShowB;
const PA = DATA.concert.lightShow;

console.log('=== 1. 时长 ===');
const total = lightShowBDuration(P);
console.log(`  total=${total.toFixed(2)}s  段=${['ignite', 'flash', 'cool', 'blue', 'stripe', 'fade'].map((k) => P[k]).join('/')}`);
ok(total > 12 && total < 14, 'B 总时长落在 12~14s（对齐素材 13.07s）', `实际 ${total.toFixed(2)}`);
const totalA = lightShowDuration(PA);
ok(Math.abs(total - totalA) > 0.5, 'A/B 是两条独立时间轴（时长不同）', `A=${totalA.toFixed(2)} B=${total.toFixed(2)}`);

console.log('\n=== 2. 阶段定位（六段全覆盖、无空洞） ===');
const seen = new Set();
for (let t = 0; t < total; t += 0.02) seen.add(lightShowBPhaseAt(t, P).name);
ok(seen.size === 6, '一秒内 6 段全部可达', `命中 ${[...seen].join(',')}`);

console.log('\n=== 3. 分段曲线采样 ===');
const rows = [];
let prevAcc = 0;
const bounds = [];
for (const k of ['ignite', 'flash', 'cool', 'blue', 'stripe', 'fade']) {
  bounds.push([k, prevAcc, prevAcc + P[k]]);
  prevAcc += P[k];
}
console.log('  t      phase        w      body.gain tint stripe scale freq  beam.gain white blue  sticks.gain ribbon');
for (const [name, a, b] of bounds) {
  for (const f of [0.15, 0.5, 0.85]) {
    const t = a + (b - a) * f;
    const R = lightShowBAt(t, P);
    rows.push({ name, t, R });
    console.log(`  ${t.toFixed(2).padStart(5)}  ${R.name.padEnd(11)} ${R.w.toFixed(2)}   `
      + `${R.body.gain.toFixed(2).padStart(6)} ${R.body.tint.toFixed(2)} ${R.body.stripe.toFixed(2)} ${R.body.scale.toFixed(2)} ${R.body.freq.toFixed(1)}  `
      + `${R.beam.gain.toFixed(2).padStart(5)} ${R.beam.white.toFixed(2)} ${R.beam.blue.toFixed(2)}  ${R.sticks.gain.toFixed(2).padStart(5)}   ${R.ribbon.intensity.toFixed(2)}`);
  }
}

console.log('\n=== 4. 关键结构性断言 ===');
const at = (t) => lightShowBAt(t, P);
const b = (n) => bounds.find((x) => x[0] === n);
const mid = (n) => { const [, a, c] = b(n); return at(a + (c - a) * 0.5); };

// 光体亮度必须有 4 倍以上的动态（素材实测面积 4.91 倍）
const gains = rows.map((r) => r.R.body.gain);
const gMin = Math.min(...gains), gMax = Math.max(...gains);
ok(gMax / Math.max(1e-6, gMin) >= 4, '光体亮度动态 >= 4x（素材面积 4.91x）', `${gMin.toFixed(2)}..${gMax.toFixed(2)} = ${(gMax / gMin).toFixed(2)}x`);

// 闪白段必须是纯白（tint≈0）且蓝色分量 0
const flashR = mid('flash');
ok(flashR.body.tint <= 0.06, 'flash 段 tint ≈ 0（纯白）', `tint=${flashR.body.tint.toFixed(3)}`);
ok((flashR.beam.blue || 0) === 0, 'flash 段 beam.blue = 0');
ok(flashR.body.gain >= Math.max(...gains) - 1e-6, 'flash 段是亮度峰值', `${flashR.body.gain.toFixed(2)}`);

// 深蓝段必须 tint 高、蓝通道明显
const blueR = mid('blue');
ok(blueR.body.tint >= 0.9, 'blue 段 tint >= 0.9（深蓝）', `tint=${blueR.body.tint.toFixed(3)}`);
ok((blueR.beam.blue || 0) >= 0.8, 'blue 段 beam.blue >= 0.8', `${blueR.beam.blue}`);
ok(blueR.body.stripe >= 0.5, 'blue 段竖条可见', `stripe=${blueR.body.stripe.toFixed(2)}`);

// 颜色必须单调地向蓝推进（ignite → cool → blue），不能来回摆
const tintSeq = [mid('ignite').body.tint, mid('cool').body.tint, mid('blue').body.tint];
ok(tintSeq[0] < tintSeq[1] && tintSeq[1] < tintSeq[2], '色温单调推进 白→冷→蓝', tintSeq.map((v) => v.toFixed(2)).join(' → '));

// 竖条段对比度拉满，且条纹速度更快
const stripeR = mid('stripe');
ok(stripeR.body.stripe >= mid('blue').body.stripe, 'stripe 段竖条对比 >= blue 段');
ok(stripeR.body.freq >= mid('blue').body.freq, 'stripe 段竖条更密', `${stripeR.body.freq.toFixed(2)} vs ${mid('blue').body.freq.toFixed(2)}`);

// 观众层（用户要求复刻视频里的观众行为）：素材实测 0~2.5s 完全不亮、t≈3.07s
// 冲到暗态的 12~14 倍、之后长段维持 1.5~3.5 倍并各自闪烁、颜色由白转深蓝。
// 所以这里断言的是「暗态够暗 + 峰值够高 + 长段适度 + 蓝度推进」，
// 不再是「看台全程压得很低」。
const nonFade = rows.filter((r) => r.name !== 'fade');
const stickMin = Math.min(...nonFade.map((r) => r.R.sticks.gain));
ok(stickMin <= 0.10, '观众 igniter 段几乎不亮（素材 0~2.5s）', `min=${stickMin.toFixed(3)}`);
const stickPeak = Math.max(...nonFade.map((r) => r.R.sticks.gain));
ok(stickPeak >= 0.55, '观众在 flash 段冲到峰值（素材 12~14 倍暗态）', `peak=${stickPeak.toFixed(3)}`);
ok(stickPeak / Math.max(1e-4, stickMin) >= 8, '观众亮暗动态 >= 8 倍', `ratio=${(stickPeak / stickMin).toFixed(1)}x`);
const blueRows = rows.filter((r) => r.name === 'blue');
const sustainAvg = blueRows.reduce((s, r) => s + r.R.sticks.gain, 0) / blueRows.length;
ok(sustainAvg >= 0.10 && sustainAvg <= 0.20, 'blue 段维持适度微光（素材 2.6 倍暗态）', `avg=${sustainAvg.toFixed(3)}`);
ok(blueRows.every((r) => r.R.sticks.blue >= 0.85), 'blue/stripe 段观众转深蓝', `min=${Math.min(...blueRows.map((r) => r.R.sticks.blue)).toFixed(2)}`);
ok(rows.filter((r) => r.name === 'flash').every((r) => r.R.sticks.blue === 0), 'flash 段观众为冷白（未转蓝）');
const flickRows = blueRows.concat(rows.filter((r) => r.name === 'stripe'));
ok(flickRows.every((r) => r.R.sticks.flicker >= 0.3), 'blue/stripe 段观众持续闪烁', `min=${Math.min(...flickRows.map((r) => r.R.sticks.flicker)).toFixed(2)}`);
ok(flickRows.every((r) => r.R.sticks.flickerHz >= 0.5 && r.R.sticks.flickerHz <= 1.0), '闪烁主频落在素材实测 0.70Hz 附近');
ok(flickRows.every((r) => r.R.sticks.regionN >= 6), '闪烁分多个独立区域（素材子区相关仅 0.44）', `regionN=${flickRows[0].R.sticks.regionN}`);
// fade 段：亮度必须从暗单调回到常态，不能中途弹跳
const fadeRows = [];
for (let t = b('fade')[1]; t < b('fade')[2]; t += 0.05) {
  const R = at(t);
  fadeRows.push(R.sticks.gain * R.w + (1 - R.w));   // 消费端实际写出的亮度
}
const fadeMono = fadeRows.every((v, i) => i === 0 || v >= fadeRows[i - 1] - 1e-3);
ok(fadeMono, 'fade 段看台亮度单调回到常态（无中途弹跳）',
  `${fadeRows[0].toFixed(2)} → ${fadeRows[fadeRows.length - 1].toFixed(2)}`);
ok(fadeRows[fadeRows.length - 1] > 0.95, 'fade 段末看台亮度 = 常态 1.0',
  `${fadeRows[fadeRows.length - 1].toFixed(3)}`);

// 收尾：w 必须收到 0 附近，保证消费端能插值回常态
const fadeEnd = at(b('fade')[2] - 1e-4);
ok(fadeEnd.w <= 0.02, 'fade 段末 w → 0（干净交还常态）', `w=${fadeEnd.w.toFixed(4)}`);

// 循环接缝：t=total-ε 与 t=0 的 w 都接近 0/1 且 body.gain 连续
const seamA = at(total - 1e-3);
const seamB = at(0);
ok(Math.abs(seamA.body.gain - seamB.body.gain) < 0.9, '循环接缝处 body.gain 大致连续',
  `${seamA.body.gain.toFixed(2)} → ${seamB.body.gain.toFixed(2)}`);

// 越界与负数时间必须照常工作（tick 里会传任意 elapsed）
ok(lightShowBAt(-3, P) != null, '负时间不崩');
ok(lightShowBAt(total * 7 + 1.2, P).name === lightShowBPhaseAt(1.2, P).name, '多圈后相位正确回绕');

// 未启用
const off = lightShowBAt(3, { ...P, enabled: false });
ok(off === null, 'enabled=false 时返回 null（交还常态）');

// 契约一致性：A/B 必须返回同一套顶层字段，消费端才能不分变体
const ra = lightShowAt(1.0, PA);
const rb = lightShowBAt(1.0, P);
const need = ['w', 'sticks', 'ribbon', 'beam'];
const missing = need.filter((k) => !(k in rb) || !(k in ra));
ok(missing.length === 0, 'A/B 顶层契约字段一致', missing.length ? `缺 ${missing.join(',')}` : '');
const stickKeys = ['gain', 'white', 'bandU', 'bandW', 'bandFloor', 'focusU', 'focusW', 'focusFloor'];
const missS = stickKeys.filter((k) => !(k in rb.sticks) || !(k in ra.sticks));
ok(missS.length === 0, 'sticks 子字段一致', missS.length ? `缺 ${missS.join(',')}` : '');

// 有限性：全部数值必须是有限数（NaN 会让下游亮度直接崩）
let nan = 0;
for (let t = 0; t < total; t += 0.013) {
  const R = lightShowBAt(t, P);
  const nums = [R.w, R.body.gain, R.body.tint, R.body.stripe, R.body.scale, R.body.freq, R.body.phase,
    R.beam.gain, R.beam.white, R.beam.blue, R.sticks.gain, R.sticks.white, R.ribbon.intensity, R.ribbon.white];
  if (nums.some((v) => !Number.isFinite(v))) nan++;
}
ok(nan === 0, '全时段无 NaN/Infinity', `坏帧 ${nan}`);

console.log(`\n${fails === 0 ? 'ALL ASSERTIONS PASSED' : `${fails} ASSERTION(S) FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
