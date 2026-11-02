// =====================================================================
// verify_pixel_layout.mjs — 内场点阵屏的离线校验（Node，不需要浏览器）
//
//   node tools/verify_pixel_layout.mjs
//
// 校验四件事：
//   1. 网格与撒点严格 1:1 —— buildCrowd 用的 cols/rows 与 pitGrid() 一致，格数 == 插棒数
//   2. 每个格点都能被编址到（无空洞），行列区间连续
//   3. 五个图案的三态分布（主体 / 边缘 / 底光），确认没有大面积发黑
//   4. 打出 50×31 的 ASCII，肉眼看形状是否正确（#主 +边缘 .底光 空=无棒）
// =====================================================================
import { DATA } from '../js/data.js';
import { pitGrid, makePixelPattern, pixelStateAt, PATTERN_NAMES } from '../js/pixel.js';

const ok = [];
const bad = [];
const check = (cond, msg, extra = '') => (cond ? ok : bad).push(msg + (extra ? ` (${extra})` : ''));

// ---------- 1. 复刻 buildCrowd 的撒点，核对 1:1 ----------
const CR = DATA.concert.crowd, C = DATA.concert, p = DATA.stadium.pitch;
const G = pitGrid();
let spots = 0;
const perBlock = [];
for (let b = 0; b < C.pitBlocks; b++) {
  const blk = G.blocks[b];
  const n = G.cols * blk.rows;
  spots += n;
  perBlock.push(`b${b}:${G.cols}x${blk.rows}=${n}`);
}
const cells = G.cols * G.rows;

console.log('--- 网格 ---');
console.log(`pitGrid() cols=${G.cols} rows=${G.rows} cells=${cells}`);
console.log(`x ${G.x0.toFixed(2)}..${G.x1.toFixed(2)} (wPhys=${G.wPhys.toFixed(2)}m)  hPhys=${G.hPhys.toFixed(2)}m  aspect=${(G.wPhys / G.hPhys).toFixed(3)}`);
console.log(`blocks ${G.blocks.map((b) => `{z ${b.z0.toFixed(1)}..${b.z1.toFixed(1)} rows=${b.rows} base=${b.base}}`).join(' ')}`);
console.log(`撒点 ${spots} 支 = ${perBlock.join(' ')}`);
console.log(`格元 ${(G.wPhys / G.cols).toFixed(3)}m × ${(G.hPhys / G.rows).toFixed(3)}m`);

check(G.cols === 50 && G.rows === 31, '网格为 50 列 × 31 排', `${G.cols}x${G.rows}`);
check(spots === cells, '格数 == 插棒数（严格 1:1，无空洞）', `${spots} vs ${cells}`);
check(G.blocks.reduce((a, b) => a + b.rows, 0) === G.rows, '区块排数累加 == 总排数');

// ---------- 2. 编址覆盖：每个 (row,col) 都必须是可达的 ----------
// 行从 0 连续到 rows-1，列从 0 连续到 cols-1；用 pixelStateAt 逐个走一遍确保不越界
let addrErr = 0;
for (let r = 0; r < G.rows; r++) {
  for (let c = 0; c < G.cols; c++) {
    const v = pixelStateAt(r, c, 0, 'heart');
    if (v !== 0 && v !== 1 && v !== 2) addrErr++;
  }
}
check(addrErr === 0, '全部 1550 格都能编址', `errors=${addrErr}`);

// 滚动一致性：shift 平移后，同一格取到的是相邻列的值
let wrapErr = 0;
const base = makePixelPattern('heart');
for (const sh of [0, 1, 7, 23, 49]) {
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      const want = base[r * G.cols + (((c + Math.round(sh)) % G.cols) + G.cols) % G.cols];
      if (pixelStateAt(r, c, sh, 'heart') !== want) wrapErr++;
    }
  }
}
check(wrapErr === 0, '滚动 shift 与直接索引一致', `mismatches=${wrapErr}`);

// ---------- 3. 五图案三态分布 ----------
console.log('\n--- 图案三态（共 %d 格；%d 支棒）---', cells, spots);
const rowsOut = {};
for (const name of PATTERN_NAMES) {
  const g = makePixelPattern(name);
  let main = 0, edge = 0, dim = 0;
  for (let i = 0; i < g.length; i++) (g[i] === 2 ? main++ : g[i] === 1 ? edge++ : dim++);
  const pct = (n) => ((n / cells) * 100).toFixed(1).padStart(5);
  const black = dim === cells ? 'ALL-BLACK' : '';
  console.log(`  ${name.padEnd(7)} main=${String(main).padStart(4)}(${pct(main)}%)  edge=${String(edge).padStart(4)}(${pct(edge)}%)  dim=${String(dim).padStart(4)}(${pct(dim)}%) ${black}`);
  check(main > 100, `${name}: 图案主体足够大`, `main=${main}`);
  check(dim < cells * 0.85, `${name}: 底光未被整体压黑`, `dim=${dim}/${cells}`);
  rowsOut[name] = { main, edge, dim, g };
}

// ---------- 4. ASCII ----------
const draw = (name) => {
  const { g } = rowsOut[name];
  console.log(`\n--- ${name} (50 列 × 31 排；# 主体 / + 边缘 / . 底光；左上=屏幕左上) ---`);
  for (let r = 0; r < G.rows; r++) {
    let s = '';
    for (let c = 0; c < G.cols; c++) {
      const v = g[r * G.cols + c];
      s += v === 2 ? '#' : v === 1 ? '+' : '.';
    }
    console.log(String(r).padStart(2, ' ') + ' ' + s);
  }
};
for (const name of PATTERN_NAMES) draw(name);

// ---------- 汇总 ----------
console.log('\n--- 断言 ---');
for (const m of ok) console.log('  OK   ' + m);
for (const m of bad) console.log('  FAIL ' + m);
if (bad.length) { console.log(`\n${bad.length} 项失败`); process.exit(1); }
console.log('\n全部断言通过');
