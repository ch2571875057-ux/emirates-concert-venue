// 全息投影离线断言（零依赖）：姿态表、位姿插值数学、着色器注入点、模型资产
//
// js/holo.js 顶部 import three，Node 里加载不了，所以这里
//   1) 静态检查 holo.js 的关键实现与着色器片段是否还在（防止被误删/误改）
//   2) 把姿态表与位姿函数的「契约」按同一套公式复算，断言数值合理
// 运行期真实表现由 CDP 验收：?holoPhase=<pose>&holoT=N + 截图/像素统计。
//
// 用法：node tools/verify_holo.mjs
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { DATA } = await load('js/data.js');
const H = DATA.holo;
const src = fs.readFileSync(path.join(ROOT, 'js/holo.js'), 'utf8');

let fails = 0;
const ok = (cond, msg) => {
  if (!cond) { fails++; console.log(`  FAIL  ${msg}`); } else { console.log(`  ok    ${msg}`); }
};
const near = (a, b, eps, msg) => ok(Math.abs(a - b) <= eps, `${msg}（${a.toFixed(4)} vs ${b.toFixed(4)}）`);

const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

// 与 holo.js 的 poseTarget 同构（用于独立复算）
function poseTarget(pose, cfg, flyP) {
  const P = cfg.poses[pose] || cfg.poses.hidden;
  const stage = cfg.stage, dock = cfg.dock;
  const lift = P.lift || 0;
  if (pose === 'docked' || flyP > 0) {
    const k = pose === 'docked' ? 1 : smooth(flyP);
    const baseY = stage.y + lift;
    return {
      x: stage.x + (dock.x - stage.x) * k,
      y: baseY + (dock.y - baseY) * k,
      z: stage.z + (dock.z - stage.z) * k,
      scale: (P.scale || 1) + ((dock.scale || 1) - (P.scale || 1)) * k,
      opacity: ((P.opacity ?? cfg.opacity) * (1 - k)) + ((cfg.dockOpacity ?? cfg.opacity) * k),
    };
  }
  return { x: stage.x, y: stage.y + lift, z: stage.z, scale: P.scale || 1, opacity: P.opacity ?? cfg.opacity };
}

console.log('\n== 模型资产 ==');
const glb = path.join(ROOT, H.url.replace(/^\.\//, ''));
ok(fs.existsSync(glb), `模型文件存在：${H.url}`);
const buf = fs.readFileSync(glb);
ok(buf.subarray(0, 4).toString('ascii') === 'glTF', 'glb 魔数为 glTF');
ok(buf.length > 100000, `glb 体积合理（${buf.length} B）`);

console.log('\n== 姿态表 ==');
const POSES = Object.keys(H.poses);
ok(POSES.length >= 8, `姿态不少于 8 个（实为 ${POSES.length}）`);
for (const need of ['hidden', 'pillar', 'materialize', 'fly', 'docked']) {
  ok(POSES.includes(need), `包含必需姿态 ${need}`);
}
for (const p of POSES) {
  const v = H.poses[p];
  ok(typeof v === 'object' && v !== null, `姿态 ${p} 是对象`);
  ok(typeof (v.lift ?? 0) === 'number', `姿态 ${p} 的 lift 是数字`);
  ok((v.scale ?? 1) > 0, `姿态 ${p} 的 scale 为正`);
  const op = v.opacity ?? H.opacity;
  ok(op >= 0 && op <= 1, `姿态 ${p} 的 opacity 在 [0,1]（${op}）`);
}
ok(H.poses.hidden.opacity <= 0.02, `hidden 几乎不可见（${H.poses.hidden.opacity}）`);
ok(H.poses.materialize.opacity >= 0.6, `materialize 明显可见（${H.poses.materialize.opacity}）`);
ok(poseTarget('docked', H, 0).scale < poseTarget('materialize', H, 0).scale,
  `常驻态比舞台态小（${H.dock.scale} vs 1）`);

console.log('\n== 位姿插值 ==');
const atHidden = poseTarget('hidden', H, 0);
const atStage = poseTarget('materialize', H, 0);
ok(atHidden.opacity <= 0.02, 'hidden 位姿不透明度≈0');
near(atStage.x, H.stage.x, 1e-9, '舞台态 x == stage.x');
near(atStage.z, H.stage.z, 1e-9, '舞台态 z == stage.z');
near(atStage.scale, 1, 1e-9, '舞台态 scale == 1');
const atDock = poseTarget('docked', H, 0);
near(atDock.x, H.dock.x, 1e-9, '常驻态 x == dock.x');
near(atDock.y, H.dock.y, 1e-9, '常驻态 y == dock.y');
near(atDock.z, H.dock.z, 1e-9, '常驻态 z == dock.z');
near(atDock.scale, H.dock.scale, 1e-9, '常驻态 scale == dock.scale');
near(atDock.opacity, H.dockOpacity, 1e-9, '常驻态 opacity == dockOpacity');

// fly 段：flyP 单调推进时位置应单调趋近 dock，且不越过端点
let prev = null, monoX = true, monoScale = true, inside = true;
for (let i = 0; i <= 20; i++) {
  const p = poseTarget('fly', H, i / 20);
  if (prev) {
    if (H.dock.x > H.stage.x ? p.x < prev.x : p.x > prev.x) monoX = false;
    if (p.scale > prev.scale + 1e-9) monoScale = false;
  }
  const lo = Math.min(H.stage.x, H.dock.x) - 1e-6, hi = Math.max(H.stage.x, H.dock.x) + 1e-6;
  if (p.x < lo || p.x > hi) inside = false;
  prev = p;
}
ok(monoX, 'fly 期间 x 单调趋向 dock');
ok(monoScale, 'fly 期间 scale 单调不增（先放大后缩小的姿态除外）'.replace('（先放大后缩小的姿态除外）', ''));
ok(inside, 'fly 期间位置始终在 stage 与 dock 之间');

console.log('\n== 着色器实现要点 ==');
ok(src.includes('uMinY') && src.includes('uMaxY'), '顶点着色器用 uMinY/uMaxY 归一化身高');
ok(src.includes('vH = clamp((position.y - uMinY)'), 'vH 由模型局部高度算出（不是 uv）');
ok(src.includes('varying float vH'), 'vH 作为 varying 传入片元');
ok(src.includes('NormalBlending'), '使用 NormalBlending（Additive 会把白衣洗白）');
ok(src.includes('depthWrite: false'), '关闭 depthWrite（半透明叠加）');
ok(src.includes('smoothstep(uSweep'), '显形扫描由 uSweep 驱动');
ok(src.includes('pow(1.0 - clamp(dot(normalize(vNrm)'), '菲涅尔边缘项存在');
ok(src.includes('uGlitch'), '行级抖动 uniform 存在');
ok(src.includes('uBeat'), '拍点联动 uniform 存在');
ok(!src.includes('AdditiveBlending,\n    side: THREE.DoubleSide,\n    fog: false,\n  });\n\n  let firstMap'), '主材质没有误用 AdditiveBlending');

console.log('\n== 状态机 ==');
ok(src.includes('export function updateHolo'), '导出 updateHolo');
ok(src.includes('export function buildHolo'), '导出 buildHolo');
ok(src.includes('export function snapHolo'), '导出 snapHolo');
ok(src.includes('export function poseTarget'), '导出 poseTarget（可离线断言）');
ok(src.includes("u.pose = pose;"), 'updateHolo 记录当前姿态');
ok(src.includes('pose === \'materialize\''), 'materialize 段重置/推进扫描');
ok(src.includes('frustumCulled = false'), 'mesh 关闭视锥剔除（缩放/位移较大）');
ok(!/new THREE\.(Vector3|Box3|Color)\(\)/.test(src.split('export function updateHolo')[1] || ''),
  'updateHolo 里不分配新的 three 对象（避免每帧 GC）');

console.log(`\n${fails === 0 ? 'ALL ASSERTIONS PASSED' : `${fails} ASSERTION(S) FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
