// =====================================================================
// pixel.js — 内场点阵屏：平面网格编址 + 图案栅格（纯逻辑，无 three 依赖）
//
// 点阵屏 = 内场站区里插的应援棒，排成一个平面点阵：
//   列 沿 x：每个站区块 50 列（x 方向 55.2m）
//   排 沿 z：4 个区块 7+8+8+8 = 31 排（z 方向 44.8m，区块间 2.5m 站立间距不算像素）
// 网格格数 50×31 = 1550，与插棒数严格 1:1 —— 每格恰好一支棒，不存在空洞，
// 所以不需要「1 格膨胀」补稀疏；图案边缘用超采样覆盖率分两档过渡即可。
//
// 图案定义在 [-1,1]² 方形设计空间，再按物理米制换算到网格，使屏幕上的图形
// 是物理正方形（不被 1.13m×1.45m 的格元比例拉长）。
// =====================================================================
import { DATA } from './data.js';

// ---------- 编址：内场站区块 → 平面网格 ----------
// 唯一真相：buildCrowd 也从这里取 cols/rows 决定撒点数量，保证「网格 == 插棒数」。
let _grid = null;
export function pitGrid() {
  if (_grid) return _grid;
  const C = DATA.concert, CR = C.crowd, p = DATA.stadium.pitch;
  const x0 = p.center.x - C.pitWidth / 2 + CR.blockMargin;
  const x1 = p.center.x + C.pitWidth / 2 - CR.blockMargin;
  const cols = Math.floor((x1 - x0) / CR.colSpacing);
  const blocks = [];
  let cum = 0, hPhys = 0;
  for (let b = 0; b < C.pitBlocks; b++) {
    const zMax = C.pitFirstRowZ - b * (C.pitBlockDepth + C.pitBlockGap);
    const z0 = zMax - C.pitBlockDepth + CR.blockMargin;
    const z1 = zMax - CR.blockMargin;
    const rows = Math.floor((z1 - z0) / CR.rowSpacing);
    // base = 该区块首排的排号（排号随 z 减小而增大，即离舞台越远排号越大）
    blocks.push({ z0, z1, rows, base: cum });
    cum += rows;
    hPhys += z1 - z0;
  }
  const wPhys = x1 - x0;
  return (_grid = { cols, rows: cum, blocks, x0, x1, wPhys, hPhys });
}

// 图案在「设计空间」中定义（u 右正 / v 上正）。**不需要自己占满 [-1,1]²**——
// makePixelPattern 会先量出每个图案的真实包围盒，再居中、等比缩放到屏幕方框内。
// 因此这里只关心形状本身，比例与留白交给统一的 size/margin 控制。

// 经典心形参数曲线（x=16sin³t，y=13cos t-5cos2t-2cos3t-cos4t）。
// 用「圆 + 三角」拼的心形在 34×25 的低分辨率下凹口只有 3 行深、会被读成圆丘；
// 这条曲线顶部凹口约占总高 24%，点阵化后凹口够深，才认得出是心。
const _heartPts = (() => {
  const N = 160, pts = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const s = Math.sin(t);
    pts.push([
      (16 * s * s * s) / 17,
      (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17,
    ]);
  }
  return pts;
})();
function _inHeart(u, v) {
  let inside = false;
  const P = _heartPts;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const yi = P[i][1], yj = P[j][1];
    if ((yi > v) === (yj > v)) continue;
    if (u < ((P[j][0] - P[i][0]) * (v - yi)) / (yj - yi) + P[i][0]) inside = !inside;
  }
  return inside;
}

const _PATTERNS = {
  heart: _inHeart,
  // 五角星：极坐标半径上限随角度呈锯齿三角波
  star: (u, v) => {
    const r = Math.hypot(u, v);
    const seg = (Math.PI * 2) / 5;
    let t = ((((Math.atan2(v, u) + Math.PI / 2) % seg) + seg) % seg) / seg;
    t = Math.abs(t * 2 - 1);
    return r <= 0.46 + 0.54 * t;
  },
  // 笑脸：外环 + 双眼 + 下弧嘴
  smiley: (u, v) => {
    if (Math.abs(Math.hypot(u, v) - 0.86) <= 0.11) return true;
    if (Math.hypot(u + 0.32, v - 0.28) <= 0.13) return true;
    if (Math.hypot(u - 0.32, v - 0.28) <= 0.13) return true;
    const r = Math.hypot(u, v + 0.34);
    return v < -0.06 && r >= 0.42 && r <= 0.64 && Math.abs(u) < 0.56;
  },
  // 音符：加粗版（头 + 宽干 + 斜旗）——细笔画在点阵分辨率下会被吃掉
  note: (u, v) => {
    if (((u + 0.30) / 0.38) ** 2 + ((v + 0.50) / 0.28) ** 2 <= 1) return true;
    if (Math.abs(u) <= 0.17 && v > -0.50 && v < 0.86) return true;
    return v > 0.50 && v < 0.90 && u > -0.08 && u < 0.54
      && Math.abs((v - 0.50) - (u + 0.08) * 0.58) < 0.26;
  },
  // 两个 blocky "B"：竖干 + 三个短横 + 上下两个椭圆弧（用弧线而不是方框，
  // 否则在点阵下会连成一个「日」字，认不出是 B）
  text: (u, v) => {
    const bar = (x0, y0, x1, y1) => u >= x0 && u <= x1 && v >= y0 && v <= y1;
    // 右半椭圆弧：中心 (cx,cy)、半径 (rx,ry)、笔画半厚 th，仅取 u >= cx 的半边
    const ring = (cx, cy, rx, ry, th) => {
      const d = Math.hypot((u - cx) / rx, (v - cy) / ry);
      return u >= cx && Math.abs(d - 1) * Math.min(rx, ry) <= th;
    };
    const B = (cx) => bar(cx, -0.84, cx + 0.15, 0.84)          // 竖干
      || bar(cx, 0.70, cx + 0.13, 0.84)                        // 顶横
      || bar(cx, -0.06, cx + 0.13, 0.08)                       // 中横
      || bar(cx, -0.84, cx + 0.13, -0.70)                      // 底横
      || ring(cx + 0.02, 0.38, 0.40, 0.38, 0.15)               // 上半弧
      || ring(cx + 0.02, -0.44, 0.40, 0.40, 0.15);             // 下半弧
    return B(-0.60) || B(0.10);
  },
};

// 逐图案包围盒（惰性、缓存）：让每个图案都居中且等比充满屏幕方框
const _bboxCache = {};
function _bboxOf(name) {
  if (_bboxCache[name]) return _bboxCache[name];
  const fn = _PATTERNS[name] || _PATTERNS.heart;
  const N = 221, LO = -1.6, HI = 1.6, step = (HI - LO) / (N - 1);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let j = 0; j < N; j++) {
    const v = LO + j * step;
    for (let i = 0; i < N; i++) {
      const u = LO + i * step;
      if (!fn(u, v)) continue;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
  }
  if (!isFinite(u0)) { u0 = -1; u1 = 1; v0 = -1; v1 = 1; }
  return (_bboxCache[name] = {
    uc: (u0 + u1) / 2, vc: (v0 + v1) / 2,
    du: Math.max(1e-3, u1 - u0), dv: Math.max(1e-3, v1 - v0),
  });
}

// 生成三态色阵：0 = 底光压暗 / 1 = 边缘过渡 / 2 = 图案主体
// 行 0 = 图案上方（= 离舞台最远的一排），与 aerial / sg-back 机位一致
const _cache = {};
export function makePixelPattern(name) {
  const P = DATA.concert.crowd.pixel;
  const G = pitGrid();
  const W = G.cols, H = G.rows;
  const key = `${name}|${W}x${H}|${P.th}|${P.thEdge}|${P.margin}|${P.size}`;
  if (_cache[key]) return _cache[key];
  const fn = _PATTERNS[name] || _PATTERNS.heart;
  const bb = _bboxOf(name);
  // 图案方框：边长按屏幕短边 × size，再等比容纳整个包围盒（长边顶满方框）
  const side = Math.min(G.wPhys, G.hPhys) * (1 - 2 * P.margin) * P.size;
  const scale = side / Math.max(bb.du, bb.dv);       // 米 / 设计单位
  const SS = 5;                                       // 5×5 超采样/格
  const duCell = G.wPhys / W / scale;                 // 一格在设计单位里的宽
  const dvCell = G.hPhys / H / scale;                 // 一格在设计单位里的高
  const grid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const nv = 1 - ((y + 0.5) / H) * 2;               // +1 = 屏幕上边
    const v0 = bb.vc + nv * (G.hPhys / scale) * 0.5;
    for (let x = 0; x < W; x++) {
      const nu = ((x + 0.5) / W) * 2 - 1;             // -1 = 屏幕左边
      const u0 = bb.uc + nu * (G.wPhys / scale) * 0.5;
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        const vv = v0 + ((sy + 0.5) / SS - 0.5) * dvCell;
        for (let sx = 0; sx < SS; sx++) {
          const uu = u0 + ((sx + 0.5) / SS - 0.5) * duCell;
          if (fn(uu, vv)) hit++;
        }
      }
      const cov = hit / (SS * SS);
      if (cov >= P.th) grid[y * W + x] = 2;
      else if (cov >= P.thEdge) grid[y * W + x] = 1;
    }
  }
  return (_cache[key] = grid);
}

// 单支棒 → 图案格状态（0/1/2）。row 0 = 图案上方，col 0 = 屏幕左侧。
// hot path：每帧 1550 次调用，图案名不变时复用 grid/W/H。
let _hName = null, _hGrid = null, _hW = 0, _hH = 0;
export function pixelStateAt(row, col, shift, name) {
  if (name !== _hName) {
    _hGrid = makePixelPattern(name);
    const G = pitGrid();
    _hW = G.cols;
    _hH = G.rows;
    _hName = name;
  }
  if (!(row >= 0 && row < _hH)) return 0;
  const off = Math.round(shift);
  const c = (((col + off) % _hW) + _hW) % _hW;
  return _hGrid[row * _hW + c] || 0;
}

export const PATTERN_NAMES = Object.keys(_PATTERNS);
