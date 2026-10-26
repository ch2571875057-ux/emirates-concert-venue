// =====================================================================
// tools/measure_stands.mjs — 看台坡面剖面测量（只读）
// 方法：对 Arsenal.glb 的看台网格做「三角形 × 24 扇区竖直剖切面」求交，
//       每 1m 高度带取交点半径的 p10（内缘），再按层带拟合 r(y) 直线。
// 输出：js/standProfile.js（data.js 之外唯一的“数字来源”，可复现）
// 用法：node tools/measure_stands.mjs
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GLB = path.join(ROOT, 'assets', 'Arsenal.glb');
const OUT = path.join(ROOT, 'js', 'standProfile.js');

// ---------- GLB 解析 ----------
function parseGLB(file) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  let bin = null;
  const off0 = 20 + jsonLen;
  if (off0 + 8 <= buf.length) {
    const binLen = buf.readUInt32LE(off0);
    if (buf.readUInt32LE(off0 + 4) === 0x004e4942) bin = buf.slice(off0 + 8, off0 + 8 + binLen);
  }
  return { json, bin };
}

const m4 = {
  ident: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  fromTRS(t, q, s) {
    const [x, y, z, w] = q, n = Math.hypot(x, y, z, w) || 1;
    const qx = x / n, qy = y / n, qz = z / n, qw = w / n;
    const m = new Float32Array(16);
    m[0] = (1 - 2 * (qy * qy + qz * qz)) * s[0]; m[1] = (2 * (qx * qy + qz * qw)) * s[0]; m[2] = (2 * (qx * qz - qy * qw)) * s[0];
    m[4] = (2 * (qx * qy - qz * qw)) * s[1]; m[5] = (1 - 2 * (qx * qx + qz * qz)) * s[1]; m[6] = (2 * (qy * qz + qx * qw)) * s[1];
    m[8] = (2 * (qx * qz + qy * qw)) * s[2]; m[9] = (2 * (qy * qz - qx * qw)) * s[2]; m[10] = (1 - 2 * (qx * qx + qy * qy)) * s[2];
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
    return m;
  },
  applyPoint(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ];
  },
};

function readAccessor(gl, accIdx) {
  const acc = gl.json.accessors[accIdx];
  const dv = new DataView(gl.bin.buffer, gl.bin.byteOffset, gl.bin.byteLength);
  const bv = gl.json.bufferViews[acc.bufferView];
  const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  if (acc.componentType === 5126 && acc.type === 'VEC3') {
    const stride = bv.stride || 12;
    const out = new Float32Array(acc.count * 3);
    for (let i = 0; i < acc.count; i++) {
      out[i * 3] = dv.getFloat32(off + i * stride, true);
      out[i * 3 + 1] = dv.getFloat32(off + i * stride + 4, true);
      out[i * 3 + 2] = dv.getFloat32(off + i * stride + 8, true);
    }
    return out;
  }
  if (acc.componentType === 5123 || acc.componentType === 5125) {
    const is32 = acc.componentType === 5125;
    const stride = bv.stride || (is32 ? 4 : 2);
    const out = new Uint32Array(acc.count);
    for (let i = 0; i < acc.count; i++) out[i] = is32 ? dv.getUint32(off + i * stride, true) : dv.getUint16(off + i * stride, true);
    return out;
  }
  return null;
}

// ---------- 采样参数（与 js/data.js 的 bowl 数据一致） ----------
const EXCLUDE = new Set(['goal net', 'goal net1', 'Google Earth Snapshot', 'outerwalls', '[Fencing_Mesh_Blue]', '*80', '*80.001']);
const CX = -32.9, CZ = 48.6;              // 碗心（glTF/three 坐标）
const NSEC = 24, H0 = 6, NH = 36;         // 24 扇区；高度 6..41m、1m 一档
const TIERS = [
  { name: 'lower', y0: 6, y1: 14 },
  { name: 'club', y0: 16, y1: 21.5 },
  { name: 'upper', y0: 30, y1: 41 },
];

const gl = parseGLB(GLB);
gl.json.nodes.forEach((n, i) => { (n.children || []).forEach((c) => { gl.json.nodes[c].parent = i; }); });
const cache = {};
const inner = Array.from({ length: NSEC }, () => Array.from({ length: NH }, () => []));

gl.json.nodes.forEach((n, i) => {
  if (n.mesh === undefined) return;
  const mesh = gl.json.meshes[n.mesh];
  const names = mesh.primitives.map((p) => (p.material !== undefined ? gl.json.materials[p.material].name || '' : ''));
  if (names.every((x) => !x)) return;
  if (names.some((x) => EXCLUDE.has(x))) return;
  const wm = (function walk(idx) {
    if (cache[idx]) return cache[idx];
    const nd = gl.json.nodes[idx];
    const local = nd.matrix ? new Float32Array(nd.matrix) : m4.fromTRS(nd.translation || [0, 0, 0], nd.rotation || [0, 0, 0, 1], nd.scale || [1, 1, 1]);
    const parent = nd.parent !== undefined ? walk(nd.parent) : m4.ident();
    return (cache[idx] = m4.mul(parent, local));
  })(i);
  for (const prim of mesh.primitives) {
    const pos = readAccessor(gl, prim.attributes.POSITION);
    if (!pos) continue;
    const idx = prim.indices !== undefined ? readAccessor(gl, prim.indices) : null;
    const triCount = idx ? idx.length / 3 : pos.length / 9;
    const world = [];
    for (let k = 0; k < pos.length; k += 3) world.push(m4.applyPoint(wm, [pos[k], pos[k + 1], pos[k + 2]]));
    const getTri = (t) => (idx ? [world[idx[t * 3]], world[idx[t * 3 + 1]], world[idx[t * 3 + 2]]] : [world[t * 3], world[t * 3 + 1], world[t * 3 + 2]]);
    for (let t = 0; t < triCount; t++) {
      const tri = getTri(t);
      const hMax = Math.max(tri[0][1], tri[1][1], tri[2][1]);
      const hMin = Math.min(tri[0][1], tri[1][1], tri[2][1]);
      if (hMax < H0 || hMin > H0 + NH) continue;
      for (let s = 0; s < NSEC; s++) {
        const th = ((s + 0.5) / NSEC) * Math.PI * 2;
        const dx = Math.cos(th), dz = Math.sin(th);
        const side = (p) => -dz * (p[0] - CX) + dx * (p[2] - CZ);
        const ss = tri.map(side);
        if ((ss[0] > 0) === (ss[1] > 0) && (ss[1] > 0) === (ss[2] > 0)) continue;
        const cross = [];
        for (let e = 0; e < 3; e++) {
          const p1 = tri[e], p2 = tri[(e + 1) % 3];
          if ((ss[e] > 0) === (ss[(e + 1) % 3] > 0)) continue;
          const t2 = ss[e] / (ss[e] - ss[(e + 1) % 3]);
          cross.push([p1[0] + (p2[0] - p1[0]) * t2, p1[1] + (p2[1] - p1[1]) * t2, p1[2] + (p2[2] - p1[2]) * t2]);
        }
        if (cross.length < 2) continue;
        const [P, Q] = cross;
        const mx = (P[0] + Q[0]) / 2 - CX, mz = (P[2] + Q[2]) / 2 - CZ;
        if (mx * dx + mz * dz < 0) continue;
        const len = Math.hypot(Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]);
        const steps = Math.max(1, Math.ceil(len / 0.5));
        for (let k = 0; k <= steps; k++) {
          const f = k / steps;
          const x = P[0] + (Q[0] - P[0]) * f, y = P[1] + (Q[1] - P[1]) * f, z = P[2] + (Q[2] - P[2]) * f;
          if (y < H0 || y >= H0 + NH) continue;
          const r = Math.hypot(x - CX, z - CZ);
          if (r < 40 || r > 140) continue;
          inner[s][Math.min(NH - 1, Math.floor(y - H0))].push(r);
        }
      }
    }
  }
});

// p10 内缘（坡面簇），再按层带拟合端点
const p10 = (list) => {
  if (!list || list.length < 3) return null;
  const a = list.slice().sort((x, y) => x - y);
  return a[Math.floor(a.length * 0.1)];
};
const sectors = [];
for (let s = 0; s < NSEC; s++) {
  const entry = { theta: +(((s + 0.5) / NSEC) * 360).toFixed(1), tiers: {} };
  for (const tier of TIERS) {
    const b0 = Math.round(tier.y0) - H0, b1 = Math.round(tier.y1) - H0;
    const lo = [], hi = [];
    for (let b = b0; b <= b0 + 1; b++) { const v = p10(inner[s][b]); if (v !== null) lo.push(v); }
    for (let b = b1 - 1; b <= b1; b++) { const v = p10(inner[s][b]); if (v !== null) hi.push(v); }
    if (lo.length && hi.length) {
      const r0 = lo.sort((a, b) => a - b)[Math.floor(lo.length / 2)];
      const r1 = hi.sort((a, b) => a - b)[Math.floor(hi.length / 2)];
      entry.tiers[tier.name] = { y0: tier.y0, y1: tier.y1, r0: +r0.toFixed(1), r1: +r1.toFixed(1) };
    } else {
      entry.tiers[tier.name] = null; // 该扇区无此层（如端部收窄）
    }
  }
  sectors.push(entry);
}

const header = `// 由 tools/measure_stands.mjs 生成（勿手改）。来源：assets/Arsenal.glb 剖切采样。
// 坐标系：glTF/three（Y 向上），碗心 (${CX}, *, ${CZ})。theta 单位度。`;
const body = `export const STAND_PROFILE = ${JSON.stringify({ center: { x: CX, z: CZ }, sectors }, null, 1)};`;
fs.writeFileSync(OUT, header + '\n' + body + '\n');
console.log(`written ${OUT}`);
for (const s of sectors) {
  const f = (t) => (t ? `r${t.r0}→${t.r1}` : '—');
  console.log(`S${String(sectors.indexOf(s)).padStart(2)} θ=${String(s.theta).padStart(5)}° lower ${f(s.tiers.lower).padEnd(12)} club ${f(s.tiers.club).padEnd(12)} upper ${f(s.tiers.upper)}`);
}
