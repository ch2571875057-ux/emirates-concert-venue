// 导出内场点阵屏插棒的世界坐标 + 期望图案格状态到 JSON，供 Python 做「屏幕投影采样」验收。
// 用法: node tools/export_sticks.mjs > tools/_sticks.json
// 注意：PowerShell 重定向会写 UTF-16/BOM，Python 读取需 encoding='utf-8-sig'
import { DATA } from '../js/data.js';
import { pitGrid, pixelStateAt, PATTERN_NAMES } from '../js/pixel.js';

const C = DATA.concert, CR = C.crowd, p = DATA.stadium.pitch;
const G = pitGrid();

// 与 buildCrowd 完全一致的确定性伪随机（同种子 → 同撒点）
let seed = 16807;
const rnd = () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const deckTop = DATA.stadium.groundY + 0.72;
const blockTop = deckTop + 0.15;

const spots = [];
for (let b = 0; b < C.pitBlocks; b++) {
  const blk = G.blocks[b];
  const cols = G.cols;
  const rows = blk.rows;
  const base = blk.base;
  // 与 buildCrowd 的落点公式逐字一致（格边对齐 + 微抖动），否则投影验收会偏半格
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = G.x0 + (cols === 1 ? (G.x1 - G.x0) / 2 : ((G.x1 - G.x0) * c) / (cols - 1))
        + (rnd() * 2 - 1) * CR.colJitter;
      const z = blk.z0 + (rows === 1 ? (blk.z1 - blk.z0) / 2 : ((blk.z1 - blk.z0) * r) / (rows - 1))
        + (rnd() * 2 - 1) * CR.rowJitter;
      // 与 buildCrowd 的插棒偏移逻辑保持一致（右前随机）
      const yaw = CR.faceYaw + (rnd() * 2 - 1) * CR.yawVar;
      const fx = Math.cos(yaw), fz = -Math.sin(yaw);
      const rx = -fz, rz = fx;
      const front = rnd() < 0.5;
      const ox = (front ? fx * CR.pitStick.frontOffset : rx * CR.pitStick.rightOffset) + (rnd() * 2 - 1) * 0.06;
      const oz = (front ? fz * CR.pitStick.frontOffset : rz * CR.pitStick.rightOffset) + (rnd() * 2 - 1) * 0.06;
      const claw = rnd() < CR.pitStick.clawRatio;
      spots.push({
        x: x + ox, y: blockTop, z: z + oz,
        col: c, row: G.rows - 1 - (base + (rows - 1 - r)),
        claw,
      });
    }
  }
}

const states = {};
for (const nm of PATTERN_NAMES) {
  states[nm] = spots.map((sp) => pixelStateAt(sp.row, sp.col, 0, nm));
}

const out = {
  layout: { cols: G.cols, rows: G.rows, x0: G.x0, x1: G.x1, wPhys: G.wPhys, hPhys: G.hPhys, blocks: G.blocks },
  // [x, y, z, row, col] —— 内场插棒的编址直接跟着撒点走，不从坐标反推
  sticks: spots.map((sp) => [+sp.x.toFixed(3), +sp.y.toFixed(3), +sp.z.toFixed(3), sp.row, sp.col]),
  states,
};
const json = JSON.stringify(out);
// 直接写文件（UTF-8 无 BOM）：PowerShell 的 `>` 重定向会写成 UTF-16，Python 读不了
const dest = process.argv[2];
if (dest) {
  const fs = await import('node:fs');
  fs.writeFileSync(dest, json, 'utf8');
  console.log(`wrote ${dest} (${json.length} bytes, utf-8)`);
} else {
  console.log(json);
}
