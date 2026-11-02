import { DATA } from "../js/data.js";
import { pitGrid, pixelStateAt, PATTERN_NAMES } from "../js/pixel.js";
const G = pitGrid(), W = G.cols, H = G.rows, P = DATA.concert.crowd.pixel;
const ok=[], bad=[];
const chk=(c,m)=>(c?ok:bad).push(m);

console.log(`swayAmp=${P.swayAmp} swayPeriod=${P.swayPeriod}s  网格 ${W}x${H}`);
chk(P.scrollSpeed === undefined, "旧的单向 scrollSpeed 已移除");

// 摆动位移：Math.round(A*sin(2πt/T)) 的取值集合
const shifts = new Set();
for (let i = 0; i <= 2000; i++) {
  const t = (i / 2000) * P.swayPeriod * 3;
  shifts.add(Math.round(P.swayAmp * Math.sin((t / P.swayPeriod) * Math.PI * 2)));
}
const sArr = [...shifts].sort((a,b)=>a-b);
console.log(`一个周期内出现过的 shift 取值: [${sArr.join(', ')}]`);
chk(Math.min(...sArr) >= -P.swayAmp && Math.max(...sArr) <= P.swayAmp, `shift 始终落在 ±${P.swayAmp} 内`);
chk(sArr.includes(0), "shift 会经过 0（回正到屏幕中心）");

// 每个 shift 下，图案 bbox 都不能贴边 / 不能被回卷切断
console.log("\n图案      shift    bbox col     左留白 右留白  main  状态");
let worst = 1e9;
for (const name of PATTERN_NAMES) {
  let baseMain = 0;
  for (let r=0;r<H;r++) for (let c=0;c<W;c++) if (pixelStateAt(r,c,0,name)===2) baseMain++;
  for (const sh of sArr) {
    let c0=1e9,c1=-1e9,n=0;
    for (let r=0;r<H;r++) for (let c=0;c<W;c++) if (pixelStateAt(r,c,sh,name)===2){n++; if(c<c0)c0=c; if(c>c1)c1=c;}
    const mL=c0, mR=W-1-c1, mm=Math.min(mL,mR);
    if (mm<worst) worst=mm;
    const intact = n===baseMain;
    chk(intact, `${name} shift=${sh}: 图案未被回卷切断`);
    if (sh===Math.min(...sArr)||sh===Math.max(...sArr)||sh===0) {
      console.log(`${name.padEnd(8)} ${String(sh).padStart(3)}   ${String(c0).padStart(2)}..${String(c1).padStart(2)}   ${String(mL).padStart(4)} ${String(mR).padStart(6)} ${String(n).padStart(5)}  ${intact?'完整':'*** 被切断 ***'}`);
    }
  }
}
console.log(`\n摆动全程最小留白 = ${worst} 列`);
chk(worst >= 1, `摆动全程图案不贴边（最小留白 ${worst} 列 ≥ 1）`);

// 屏幕位置上界：3 列 / 50 列 = 6% 屏宽，其中 ±3 列 → 相对中心最大 3 列
const maxPct = (P.swayAmp / W) * 100;
console.log(`最大横移 = ${P.swayAmp} 列 = 屏宽的 ${maxPct.toFixed(1)}%（双向）→ 单侧 ${(maxPct/2).toFixed(1)}%`);
chk(maxPct <= 8, `最大横移 ${maxPct.toFixed(1)}% 屏宽，观感仍居中`);

console.log("\n--- 断言 ---");
for (const m of ok) console.log("  OK   " + m);
for (const m of bad) console.log("  FAIL " + m);
if (bad.length) { console.log(`\n${bad.length} 项失败`); process.exit(1); }
console.log("\n全部断言通过");
