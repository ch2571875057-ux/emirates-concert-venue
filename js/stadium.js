// =====================================================================
// stadium.js — GLB 改造层 + 演唱会设备（按 build* 分块，逐层施工）
// Step 1 · 删球门 / 删照片地面与校园外围 / 程序化地面
// Step 2 · 演唱会内场：保护地坪 + 站区分块 + 隔离栏
// Step 6v2 · 观众：看台应援棒按实测剖面（standProfile.js）+ 内场人模
// =====================================================================
import * as THREE from 'three';
import { DATA } from './data.js';
import { STAND_PROFILE } from './standProfile.js';
import { pitGrid, pixelStateAt } from './pixel.js';
import { fxAt, fxRange, wrap01, wrapPm } from './wavefx.js';
import { lightShowAt } from './lightshow.js';
import { lightShowBAt } from './lightshowb.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const S = DATA.stadium;

// ---------- Step 1 · GLB 改造 ----------
export function convertGLB(gltfScene) {
  const stats = { removedNets: 0, removedGoalFrames: 0, removedCampus: 0 };
  stripGoals(gltfScene, stats);
  stripCampus(gltfScene, stats);
  const group = new THREE.Group();
  group.name = 'stadium';
  gltfScene.name = 'bowl';
  group.add(gltfScene);
  group.add(buildGround());
  group.add(buildField());
  const stage = buildStage();
  group.add(stage);
  group.add(buildSound());
  const lights = buildLights();
  group.add(lights);
  const audience = buildAudience();
  group.add(audience);
  const sky = buildSky();
  group.add(sky);
  const ribbon = buildRibbon();
  group.add(ribbon);
  // 直接引用存入 userData —— GLB 内可能存在同名节点，getObjectByName 会被遮蔽
  group.userData.stageGroup = stage;
  group.userData.lightsGroup = lights;
  group.userData.audienceGroup = audience;
  group.userData.skyMesh = sky;
  group.userData.ledRibbon = ribbon;
  group.userData.stats = stats;
  console.log('[convertGLB]', JSON.stringify(stats));
  return group;
}

function matNames(obj) {
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  return mats.map((m) => (m && m.name) || '');
}

// 删除球门：球网按材质名，门框按“草坪两端 + 贴地 + 小体量”包围盒识别
function stripGoals(root, stats) {
  const p = S.pitch;
  const dead = [];
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const names = matNames(o);
    if (names.some((n) => S.removeMaterials.includes(n))) {
      dead.push(o);
      stats.removedNets++;
      return;
    }
    if (names.includes('floor')) return; // 场地/楼层大网格不动
    box.setFromObject(o);
    if (box.isEmpty()) return;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const h = box.max.y - box.min.y;
    const fx = box.max.x - box.min.x;
    const fz = box.max.z - box.min.z;
    const t = S.goalFrame;
    const nearLine = Math.abs(cz - S.goalLineSouthZ) < t.nearLine
      || Math.abs(cz - S.goalLineNorthZ) < t.nearLine;
    const inPitchX = cx > p.center.x - p.widthX / 2 - 4 && cx < p.center.x + p.widthX / 2 + 4;
    const sizeOk = h > t.heightMin && h < t.heightMax && Math.max(fx, fz) < t.footprintMax;
    const onGround = box.min.y < S.groundY + 2;
    if (nearLine && inPitchX && sizeOk && onGround) {
      dead.push(o);
      stats.removedGoalFrames++;
    }
  });
  dead.forEach((o) => o.removeFromParent());
}

// 删除照片地面 / 无材质地面 / 校园围墙围网
function stripCampus(root, stats) {
  const remove = new Set([...S.groundMaterials, ...S.campusMaterials]);
  const dead = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const names = matNames(o);
    const noMaterial = names.every((n) => !n);
    if (noMaterial || names.some((n) => remove.has(n))) {
      dead.push(o);
      stats.removedCampus++;
    }
  });
  dead.forEach((o) => o.removeFromParent());
}

// 程序化地面：沥青底 + 碗体外扩的广场椭圆（Canvas 2D，零贴图文件）
function buildGround() {
  const g = S.proceduralGround;
  const px = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  ctx.fillStyle = g.colorAsphalt;
  ctx.fillRect(0, 0, px, px);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
    ctx.fillRect(Math.random() * px, Math.random() * px, 2, 2);
  }
  const drawPlaza = (halfX, halfZ, color) => {
    const sx = ((halfX * 2) / g.size) * px;
    const sz = ((halfZ * 2) / g.size) * px;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(px / 2, px / 2, sx / 2, sz / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  drawPlaza(S.bowl.halfX + g.plazaMargin, S.bowl.halfZ + g.plazaMargin, g.colorPlaza);
  drawPlaza(S.bowl.halfX + 8, S.bowl.halfZ + 8, g.colorPlazaInner);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(g.size, g.size), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(S.bowl.centerX, g.y, S.bowl.centerZ);
  mesh.name = 'ground';
  return mesh;
}

// ---------- Step 2 · 演唱会内场 ----------
export function buildField() {
  const C = DATA.concert, p = S.pitch;
  const g = new THREE.Group();
  g.name = 'concert-field';

  // 1) 保护地坪：按实测草区整块覆盖（抬高的箱体，边缘可见）
  const deckW = C.deckWidthX;
  const deckL = C.deckLengthZ;
  const deckTop = S.groundY + 0.72;
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.9 });
  const deckMats = [sideMat, sideMat, deckMaterial(deckW, deckL, C), sideMat, sideMat, sideMat];
  const deck = new THREE.Mesh(new THREE.BoxGeometry(deckW, deckTop - S.groundY, deckL), deckMats);
  deck.position.set(C.deckCenterX, (deckTop + S.groundY) / 2, C.deckCenterZ);
  deck.name = 'deck';
  g.add(deck);

  // 2) 站区分块（自舞台前向北排列，块间为横向通道；边缘加描边条提高可读性）
  const pit = new THREE.Group();
  pit.name = 'pit';
  const edgeMat = new THREE.MeshStandardMaterial({ color: C.pitEdgeColor, roughness: 0.7 });
  for (let b = 0; b < C.pitBlocks; b++) {
    const zMax = C.pitFirstRowZ - b * (C.pitBlockDepth + C.pitBlockGap);
    const zc = zMax - C.pitBlockDepth / 2;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(C.pitWidth, 0.15, C.pitBlockDepth),
      new THREE.MeshStandardMaterial({
        color: b % 2 === 0 ? C.pitColorA : C.pitColorB, roughness: 0.85,
      }),
    );
    box.position.set(p.center.x, deckTop + 0.075, zc);
    box.name = `pit-block-${b + 1}`;
    pit.add(box);
    const stripeW = 0.4;
    for (const [ex, ez, sx, sz] of [
      [p.center.x, zMax - stripeW / 2, C.pitWidth, stripeW],
      [p.center.x, zc - C.pitBlockDepth / 2 + stripeW / 2, C.pitWidth, stripeW],
    ]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.16, sz), edgeMat);
      stripe.position.set(ex, deckTop + 0.08, ez);
      pit.add(stripe);
    }
  }
  g.add(pit);

  // 3) 站区外围隔离栏（双横杆 + 立柱）
  const xHalf = C.pitWidth / 2 + 2;
  const zMax = C.pitFirstRowZ + 2.5;
  const zMin = C.pitFirstRowZ - (C.pitBlocks * C.pitBlockDepth + (C.pitBlocks - 1) * C.pitBlockGap) - 2.5;
  g.add(barrierFence(p.center.x, xHalf, zMax, zMin, deckTop, C));
  return g;
}

// ---------- Step 3v2 · 海洋主题舞台（移植自 sandbox/stage-lab.js，替换旧舞台）----------
// 锚点与 data.js 实测一致：中轴 x=草坪中心，台口 z=frontZ，地坪顶 y=groundY+0.72；面向 -z
const SA = {
  cx: S.pitch.center.x,
  deckTop: S.groundY + 0.72,
  stageFrontZ: DATA.concert.stageV2.frontZ,
};

// --- 工具（沙盒同款） ---
function catmull(pts, closed = false) {
  return new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed);
}

function tubeAlong(curve, r, color, intensity, closed = false, tubularSeg = 120) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x06121f, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  return new THREE.Mesh(new THREE.TubeGeometry(curve, tubularSeg, r, 8, closed), mat);
}

function remapUV(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y;
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / sx, (p.getY(i) - b.min.y) / sy);
  uv.needsUpdate = true;
}

function capsuleShape(w, h) {
  const r = h / 2, st = w - 2 * r;
  const s = new THREE.Shape();
  s.absarc(-st / 2, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  s.absarc(st / 2, 0, r, Math.PI * 1.5, Math.PI * 2.5, false);
  s.closePath();
  return s;
}

// computeVertexNormals 对只参与退化三角形的顶点会得到零向量 → NaN 法线 → Bloom 整帧黑屏。
// 统一兜底：非有限或零长度法线替换为 +Y。
function sanitizeNormals(geo) {
  const n = geo.attributes.normal;
  if (!n) return;
  let bad = 0;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z);
    if (!isFinite(x) || !isFinite(y) || !isFinite(z) || len < 1e-9) {
      n.setXYZ(i, 0, 1, 0);
      bad++;
    }
  }
  if (bad > 0) console.warn(`[sanitizeNormals] fixed ${bad}/${n.count} bad normals on ${geo.uuid}`);
}

// 曲面：crest/base 两条曲线间插值 + 水平外凸（bulge）
function waveSheetGeometry(curveC, curveB, uSeg, vSeg, bulge) {
  const C = curveC.getSpacedPoints(uSeg);
  const B = curveB.getSpacedPoints(uSeg);
  const up = new THREE.Vector3(0, 1, 0);
  const pos = [], idx = [], uvA = [];
  for (let i = 0; i <= uSeg; i++) {
    const d = new THREE.Vector3().subVectors(C[i], B[i]);
    const n = new THREE.Vector3().crossVectors(d, up); // 水平法向（朝观众侧）
    if (n.lengthSq() < 1e-6) n.set(0, 0, -1);
    n.normalize();
    for (let j = 0; j <= vSeg; j++) {
      const v = j / vSeg;
      const px = C[i].x + (B[i].x - C[i].x) * v + n.x * bulge * Math.sin(Math.PI * v);
      const py = C[i].y + (B[i].y - C[i].y) * v;
      const pz = C[i].z + (B[i].z - C[i].z) * v + n.z * bulge * Math.sin(Math.PI * v);
      pos.push(px, py, pz);
      uvA.push(i / uSeg, v);
    }
  }
  for (let i = 0; i < uSeg; i++) {
    for (let j = 0; j < vSeg; j++) {
      const a = i * (vSeg + 1) + j, b = a + vSeg + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  sanitizeNormals(geo);
  return geo;
}

// --- 台体 + 中央台阶 ---
function buildStageDeckV2() {
  const V2 = DATA.concert.stageV2;
  const g = new THREE.Group();
  g.name = 'stage-deck-v2';
  const stageTop = SA.deckTop + V2.h;
  const zMid = SA.stageFrontZ + V2.depth / 2;

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(V2.width, V2.h, V2.depth),
    new THREE.MeshStandardMaterial({ color: V2.color, roughness: 0.8 }),
  );
  deck.position.set(SA.cx, SA.deckTop + V2.h / 2, zMid);
  g.add(deck);

  // 台口发光描边
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x06121f, emissive: V2.edgeGlowColor, emissiveIntensity: V2.edgeGlowI, roughness: 0.4,
  });
  const a = new THREE.Vector3(SA.cx - V2.width / 2, stageTop + 0.06, SA.stageFrontZ);
  const b = new THREE.Vector3(SA.cx + V2.width / 2, stageTop + 0.06, SA.stageFrontZ);
  const len = a.distanceTo(b);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(V2.edgeGlowR, V2.edgeGlowR, len, 8), glowMat);
  lip.position.copy(a).add(b).multiplyScalar(0.5);
  lip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.add(lip);

  // 中央台阶：4 级 + 发光踢面
  const ST = V2.steps;
  const stepMat = new THREE.MeshStandardMaterial({ color: ST.color, roughness: 0.85 });
  for (let i = 0; i < ST.tierN; i++) {
    const topY = SA.deckTop + (i + 1) * ST.rise;
    const zc = SA.stageFrontZ - ST.tread * (ST.tierN - i - 0.5);
    const step = new THREE.Mesh(new THREE.BoxGeometry(ST.spanW, ST.rise, ST.tread), stepMat);
    step.position.set(SA.cx, topY - ST.rise / 2, zc);
    g.add(step);
    const n = new THREE.Mesh(
      new THREE.BoxGeometry(ST.spanW, 0.05, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x06121f, emissive: ST.noseColor, emissiveIntensity: ST.noseI, roughness: 0.4 }),
    );
    n.position.set(SA.cx, topY + 0.02, zc - ST.tread / 2);
    g.add(n);
  }
  return g;
}

// --- 胶囊形 LED 海面屏 ---
function screenArt(SC, cv, ctx) {
  cv.width = SC.artW; cv.height = SC.artH;
  let s = SC.artSeed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cw = cv.width, ch = cv.height;

  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, '#060d28'); grad.addColorStop(0.42, '#0d2a63');
  grad.addColorStop(0.58, '#155099'); grad.addColorStop(1, '#0a2a5e');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, cw, ch);

  for (let i = 0; i < 150; i++) {
    const a = 0.15 + rnd() * 0.65;
    ctx.fillStyle = `rgba(230,240,255,${a})`;
    const r = rnd() * 1.8 + 0.4;
    ctx.beginPath(); ctx.arc(rnd() * cw, rnd() * ch * 0.5, r, 0, Math.PI * 2); ctx.fill();
  }

  const mx = cw * 0.5, my = ch * 0.28, mr = ch * 0.085;
  const halo = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 5);
  halo.addColorStop(0, 'rgba(235,245,255,0.55)');
  halo.addColorStop(0.35, 'rgba(160,200,255,0.18)');
  halo.addColorStop(1, 'rgba(160,200,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(mx, my, mr * 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4f9ff';
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();

  for (let i = 0; i < 5; i++) {
    const y = ch * (0.34 + rnd() * 0.14), w2 = cw * (0.14 + rnd() * 0.2);
    ctx.fillStyle = `hsla(258, 55%, ${28 + rnd() * 14}%, 0.24)`;
    ctx.beginPath(); ctx.ellipse(rnd() * cw, y, w2, ch * 0.022, 0, 0, Math.PI * 2); ctx.fill();
  }

  const seaTop = ch * 0.55;
  for (let L = 0; L < 6; L++) {
    const y0 = seaTop + ((ch - seaTop) * L) / 6;
    const amp = ch * (0.012 + L * 0.006);
    const f = 0.004 + L * 0.0016, ph = rnd() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, ch);
    for (let x = 0; x <= cw; x += 8) {
      ctx.lineTo(x, y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.7 + ph * 1.7) * amp * 0.4);
    }
    ctx.lineTo(cw, ch); ctx.closePath();
    ctx.fillStyle = `hsla(${218 - L * 5}, 82%, ${20 + L * 6}%, 0.92)`;
    ctx.fill();
    if (L % 2 === 0) {
      ctx.strokeStyle = 'rgba(215,242,255,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  for (let i = 0; i < 90; i++) {
    const y = seaTop + 8 + rnd() * (ch - seaTop - 16);
    const k = (y - seaTop) / (ch - seaTop);
    const half = mr * (2.4 - k * 1.4) * (0.4 + rnd());
    const a = 0.10 + rnd() * 0.4;
    ctx.strokeStyle = `rgba(240,248,255,${a})`;
    ctx.lineWidth = 1.5 + rnd() * 2.5;
    ctx.beginPath();
    ctx.moveTo(mx - half + (rnd() - 0.5) * 14, y);
    ctx.lineTo(mx + half + (rnd() - 0.5) * 14, y);
    ctx.stroke();
  }

  const swoosh = (x0, y0, cx1, cy1, x1, y1, c0, c1, lw, a) => {
    const lg = ctx.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, c0); lg.addColorStop(1, c1);
    ctx.strokeStyle = lg; ctx.globalAlpha = a; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx1, cy1, x1, y1);
    ctx.stroke(); ctx.globalAlpha = 1;
  };
  swoosh(cw * 0.68, ch * 0.52, cw * 0.86, ch * 0.40, cw * 0.97, ch * 0.30, 'rgba(176,108,255,0.0)', '#c07cff', ch * 0.028, 0.5);
  swoosh(cw * 0.30, ch * 0.50, cw * 0.16, ch * 0.42, cw * 0.06, ch * 0.34, 'rgba(90,220,255,0.0)', '#5ad8ff', ch * 0.02, 0.42);
}

function screenMaterial(SC) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  screenArt(SC, cv, ctx);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: SC.emissiveI, roughness: 0.6,
  });
  mat.userData = { cv, ctx, tex };
  return mat;
}

// 开场秀重绘：mode 'countdown'（value=数字）| 'sea'（恢复月夜海面）
export function paintScreen(mat, mode, value) {
  const { cv, ctx, tex } = mat.userData;
  screenArt(DATA.concert.stageV2.screen, cv, ctx);
  if (mode === 'countdown') {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff4d5e';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#ff8a94';
    ctx.font = `bold ${Math.round(cv.height * 0.66)}px Arial`;
    ctx.fillText(String(value), cv.width / 2, cv.height * 0.46);
    ctx.shadowBlur = 0;
  }
  tex.needsUpdate = true;
}

function buildScreenV2() {
  const SC = DATA.concert.stageV2.screen;
  const g = new THREE.Group();
  g.name = 'led-wall';
  const shape = capsuleShape(SC.w, SC.h);

  const wall = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: SC.wallDepth, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: SC.wallColor, roughness: 0.85, metalness: 0.2 }),
  );
  wall.rotation.y = Math.PI;               // 法线朝 -z；挤出体藏在屏后
  wall.position.set(SA.cx, SC.cy, SC.z + SC.wallDepth + 0.06);
  wall.name = 'screen-wall';
  g.add(wall);

  const scrGeo = new THREE.ShapeGeometry(shape, 48);
  remapUV(scrGeo);
  const scr = new THREE.Mesh(scrGeo, screenMaterial(SC));
  scr.rotation.y = Math.PI;
  scr.position.set(SA.cx, SC.cy, SC.z + 0.02);
  scr.name = 'led-main';
  g.add(scr);

  const outline = shape.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0));
  const frameCurve = new THREE.CatmullRomCurve3(outline, true);
  const frame = tubeAlong(frameCurve, SC.frameR, SC.frameColor, SC.frameI, true, 240);
  frame.position.set(SA.cx, SC.cy, SC.z - 0.05);
  frame.name = 'screen-frame';
  g.add(frame);
  return g;
}

// --- 双侧海浪雕塑 ---
function buildWaveLayer(cfg, W) {
  const grp = new THREE.Group();
  // 相对中轴坐标（x 不加 SA.cx），镜像/定位由外层组负责
  const curveC = catmull(cfg.crest.map(([x, y, z]) => [x, SA.deckTop + y, z]));
  const curveB = catmull(cfg.base.map(([x, , z]) => [x, SA.deckTop, z]));

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: cfg.color, transparent: true, opacity: cfg.opacity,
    roughness: 0.3, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.4,
    emissive: cfg.emissive, emissiveIntensity: cfg.emissiveI,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const body = new THREE.Mesh(waveSheetGeometry(curveC, curveB, W.uSeg, W.vSeg, W.bulge), bodyMat);
  body.renderOrder = 8;
  body.name = 'wave-body';
  grp.add(body);

  const crest = tubeAlong(curveC, cfg.crestR, cfg.crestColor, cfg.crestI, false, 140);
  crest.name = 'wave-crest';
  const base = tubeAlong(curveB, cfg.baseR, cfg.baseGlowColor, cfg.baseGlowI, false, 140);
  base.name = 'wave-base';
  grp.add(crest, base);

  const dg = new THREE.SphereGeometry(1, 8, 6);
  const dm = new THREE.MeshStandardMaterial({ color: 0x0a1a28, emissive: 0xbfeaff, emissiveIntensity: 2.6, roughness: 0.35 });
  const inst = new THREE.InstancedMesh(dg, dm, W.dropletN);
  const M = new THREE.Matrix4(), V = new THREE.Vector3(), SV = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let placed = 0;
  for (let i = 0; i < W.dropletN * 3 && placed < W.dropletN; i++) {
    const u = Math.random();
    const p = curveC.getPoint(u);
    const d = new THREE.Vector3().subVectors(p, curveB.getPoint(u));
    const n = new THREE.Vector3().crossVectors(d, up).normalize();
    const t = Math.pow(Math.random(), 1.6); // 越靠近浪尖越密
    V.copy(p).addScaledVector(n, (Math.random() - 0.2) * 2.2).addScaledVector(up, t * 1.4 + Math.random() * 0.5);
    const r = W.dropletR[0] + Math.random() * (W.dropletR[1] - W.dropletR[0]);
    SV.setScalar(r);
    M.compose(V, new THREE.Quaternion(), SV);
    inst.setMatrixAt(placed++, M);
  }
  inst.count = placed;
  inst.name = 'wave-droplets';
  grp.add(inst);
  return grp;
}

// --- 海浪副屏文字层：同源放样孪生网格，bulge 外扩使其浮在浪体外侧 ---
// side: +1 右侧 / -1 左侧（左=控制点 x 取反）。实测：右侧需 UV.u 翻转才正向，
// 左侧经几何镜像后天然正向，不再翻转（否则二次抵消又变反字）
// 注意：用绝对坐标直接建在 waves 根组——不能放进 scale.x=-1 的镜像组（会二次翻转）
function buildWaveTextLayer(cfg, W, side, WT, defaultText) {
  const curveC = catmull(cfg.crest.map(([x, y, z]) => [SA.cx + x * side, SA.deckTop + y, z]));
  const curveB = catmull(cfg.base.map(([x, , z]) => [SA.cx + x * side, SA.deckTop, z]));
  const geo = waveSheetGeometry(curveC, curveB, W.uSeg, W.vSeg, W.bulge + WT.offset);
  if (side > 0) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    uv.needsUpdate = true;
  }
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 256;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.flipY = false; // 几何 v=0 在浪尖（视觉顶部），关 flipY 让画布顶行贴浪尖，否则文字上下颠倒
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  paintWaveText(mat, defaultText);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 9;
  mesh.name = side < 0 ? 'wave-text-L' : 'wave-text-R';
  return mesh;
}

// 副屏文字重绘（开场秀切换/还原用）
export function paintWaveText(mat, text) {
  const WT = DATA.concert.waveText;
  const cv = mat.map.image;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = WT.glowColor;
  ctx.shadowColor = WT.shadowColor;
  ctx.shadowBlur = WT.shadowBlur;
  ctx.font = `bold ${WT.fontPx}px Arial`;
  ctx.fillText(text, cv.width / 2, cv.height / 2);
  ctx.shadowBlur = 0;
  mat.map.needsUpdate = true;
}

function buildWaves() {
  const W = DATA.concert.stageV2.waves;
  const WT = DATA.concert.waveText;
  const g = new THREE.Group();
  g.name = 'waves';
  const mats = [];
  const right = new THREE.Group();
  right.add(buildWaveLayer(W.main, W), buildWaveLayer(W.inner, W));
  right.position.x = SA.cx;
  right.name = 'wave-R';
  const left = right.clone(true);
  left.scale.x = -1;
  left.name = 'wave-L';
  g.add(right, left);
  // 文字层用绝对坐标直接挂根组（避开镜像组的二次翻转）
  g.add(buildWaveTextLayer(W.main, W, 1, WT, WT.defaultText));
  g.add(buildWaveTextLayer(W.main, W, -1, WT, WT.defaultText));
  g.traverse((o) => { if (o.name === 'wave-text-L' || o.name === 'wave-text-R') mats.push(o.material); });
  g.userData.waveTextMats = mats;
  return g;
}

// --- 顶部环形灯架（仅灯架本体；光束在 buildLights）---
function buildRingsV2() {
  const R = DATA.concert.stageV2.rings;
  const g = new THREE.Group();
  g.name = 'ring-lights';
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x0c0e14, emissive: R.ringColor, emissiveIntensity: R.ringI, roughness: 0.5 });
  const beadMat = new THREE.MeshStandardMaterial({ color: 0x101014, emissive: 0xffffff, emissiveIntensity: 2.4, roughness: 0.4 });
  const hangMat = new THREE.MeshStandardMaterial({ color: 0x39404e, roughness: 0.5, metalness: 0.7 });

  for (const cfg of R.list) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(cfg.r, R.tubeR, 10, 96), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(SA.cx, cfg.y, R.z);
    g.add(ring);
    for (let i = 0; i < cfg.beadN; i++) {
      const a = (i / cfg.beadN) * Math.PI * 2;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(cfg.beadR, 10, 8), beadMat);
      bead.position.set(SA.cx + Math.cos(a) * cfg.r, cfg.y, R.z + Math.sin(a) * cfg.r);
      g.add(bead);
    }
    for (let i = 0; i < cfg.hangers; i++) {
      const a = (i / cfg.hangers) * Math.PI * 2 + Math.PI / cfg.hangers;
      const h = R.hangerTopY - cfg.y;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(R.hangerR, R.hangerR, h, 6), hangMat);
      rod.position.set(SA.cx + Math.cos(a) * cfg.r, cfg.y + h / 2, R.z + Math.sin(a) * cfg.r);
      g.add(rod);
    }
  }
  return g;
}

// --- 组装 ---
export function buildStage() {
  const g = new THREE.Group();
  g.name = 'stage';
  g.add(buildStageDeckV2());
  const screenGrp = buildScreenV2();
  g.add(screenGrp);
  g.userData.ledMainMat = screenGrp.getObjectByName('led-main').material;
  const wavesGrp = buildWaves();
  g.add(wavesGrp);
  g.userData.waveTextMats = wavesGrp.userData.waveTextMats;
  g.add(buildRingsV2());
  return g;
}

// ---------- Step 4 · 音响塔（格构塔 + 吊臂 + 线阵音响串）----------
export function buildSound() {
  const C = DATA.concert, p = S.pitch;
  const deckTop = S.groundY + 0.72;
  const g = new THREE.Group();
  g.name = 'sound';

  for (const sgn of [-1, 1]) {
    // 主 PA 塔：站区走道两侧
    g.add(soundTower(p.center.x + sgn * C.soundTowerOffsetX, C.soundTowerZ,
      C.soundTowerHeight, C.lineArrayBoxes, C.lineArrayTopY, deckTop, C, sgn, 'pa'));
    // 北半场补声塔
    g.add(soundTower(p.center.x + sgn * C.soundTowerOffsetX, C.delayTower.z,
      C.delayTower.height, C.delayTower.boxes, C.delayTower.height - 2.5, deckTop, C, sgn, 'delay'));
  }
  return g;
}

function soundTower(x, z, height, nBoxes, hangTopY, y0, C, sgn, kind) {
  const tower = new THREE.Group();
  tower.name = `tower-${kind}-${sgn < 0 ? 'L' : 'R'}`;
  const steel = new THREE.MeshStandardMaterial({ color: C.trussColor, roughness: 0.45, metalness: 0.7 });
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x1d2027, roughness: 0.7 });

  const half = C.towerLegSpan / 2;
  // 4 根立柱
  const legGeo = new THREE.BoxGeometry(0.22, height, 0.22);
  for (const [lx, lz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
    const leg = new THREE.Mesh(legGeo, steel);
    leg.position.set(x + lx, y0 + height / 2, z + lz);
    tower.add(leg);
  }
  // 横撑层
  const nL = Math.max(2, Math.round(height / C.towerRungStep));
  for (let i = 1; i <= nL; i++) {
    const ry = y0 + (i / nL) * height;
    for (const [dx, dz, w, d] of [
      [0, -half, C.towerLegSpan + 0.22, 0.14], [0, half, C.towerLegSpan + 0.22, 0.14],
      [-half, 0, 0.14, C.towerLegSpan + 0.22], [half, 0, 0.14, C.towerLegSpan + 0.22],
    ]) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), steel);
      rung.position.set(x + dx, ry, z + dz);
      tower.add(rung);
    }
  }
  // 顶部吊臂（伸向舞台中轴一侧）+ 线阵音响串
  const armLen = kind === 'pa' ? C.towerArmLength : C.towerArmLength * 0.5;
  const armDir = -sgn; // 朝中轴
  const armY = y0 + height - 0.3;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.3, 0.3), steel);
  arm.position.set(x + (armDir * armLen) / 2, armY, z);
  tower.add(arm);
  const tipX = x + armDir * (armLen - 0.4);
  for (let i = 0; i < nBoxes; i++) {
    const t = nBoxes === 1 ? 0.5 : i / (nBoxes - 1);
    const bw = 1.15 - t * 0.25;
    const bh = C.lineArrayBoxH;
    const speaker = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.95), boxMat);
    speaker.position.set(tipX, y0 + hangTopY - i * bh, z);
    speaker.rotation.z = armDir * t * 0.1; // 阵列微内倾
    tower.add(speaker);
  }
  return tower;
}

// ---------- Step 5v2 · 光束系统（双层锥着色器，移植自 sandbox/stage-lab.js）----------
// alpha = 边缘高斯衰减 × 长度耗散 × 尘埃流动噪声；vY: 0=灯头端 → 1=末端；
// vR: 归一化径向距离（0=轴线 → 1=锥面）。锥体局部 +Y 指向灯头，故 vY = 1-uv.y。
function beamMaterial(u) {
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */`
      uniform float uTopR, uBotR;
      varying float vY, vR, vAng;
      void main() {
        vY = 1.0 - uv.y;
        float rr = mix(uTopR, uBotR, vY);
        vR = length(position.xz) / max(0.001, rr);
        vAng = atan(position.z, position.x);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uAlpha, uEdgeK, uFadePow, uDustAmp, uDustScale, uDustSpeed, uTime;
      varying float vY, vR, vAng;
      float hash(vec2 q) {
        return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 q) {
        vec2 i = floor(q), f = fract(q);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float edge = mix(0.22, 1.0, exp(-uEdgeK * vR * vR)); // 外壁保底亮度（否则锥外看壁面近全透明）
        float fade = pow(max(0.0, 1.0 - vY), uFadePow);
        float n = noise(vec2(vY * uDustScale - uTime * uDustSpeed, vAng * 1.6 + vY * 0.7));
        float dust = 1.0 - uDustAmp * 0.5 + uDustAmp * (n - 0.5);
        float a = uAlpha * edge * fade * dust;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * (0.85 + 0.3 * edge), a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, fog: false,
  });
}

// 落地光池着色器：径向高斯衰减 + 缓慢噪声闪烁
function poolMaterial(u) {
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uAlpha, uEdgeK, uDustAmp, uTime;
      varying vec2 vUv;
      float hash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        float r = length(vUv);
        float edge = exp(-uEdgeK * r * r);
        float tw = 1.0 - uDustAmp * 0.5 + uDustAmp * (hash(floor(vUv * 5.0) + floor(uTime * 0.8)) - 0.5);
        float a = uAlpha * edge * tw;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * 1.1, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, fog: false,
  });
}

export function buildLights() {
  const R = DATA.concert.stageV2.rings;
  const L = DATA.concert.lights;
  const outer = R.list[0];
  const B = R.beam;
  const g = new THREE.Group();
  g.name = 'stage-lights';
  const sharedTime = { value: 0 };
  const units = [];

  for (let i = 0; i < R.beamN; i++) {
    const a = (i / R.beamN) * Math.PI * 2;
    const color = R.beamPalette[i % R.beamPalette.length];
    const ox = SA.cx + Math.cos(a) * outer.r, oy = outer.y, oz = R.z + Math.sin(a) * outer.r;
    const origin = new THREE.Vector3(ox, oy, oz);
    // 偶数束向外下扫（沙盒原设计）；奇数束指向内场观众席上空（风暴模式正面可见）
    let dir, len;
    if (i % 2 === 0) {
      dir = new THREE.Vector3(R.beamDir[0] * Math.cos(a), R.beamDir[1], R.beamDir[2] * Math.sin(a)).normalize();
      len = B.len;
    } else {
      // 目标横向散开到内场两侧 → 正面机位看到对角交叉光束
      const tx = SA.cx + ((i % 4) < 2 ? -22 : 22);
      const tz = 48 + ((i * 29) % 26);
      dir = new THREE.Vector3(tx - ox, 0, tz - oz).normalize();
      dir.y = -0.58;
      dir.normalize();
      len = B.len + 8;
    }
    const unit = { alphas: [], pool: null, headMat: null, seed: i / R.beamN, origin, baseDir: dir.clone(), len, beamMeshes: [], poolMesh: null, colors: [], baseColor: new THREE.Color(color) };

    for (const layer of [B.core, B.glow]) {
      const u = {
        uColor: { value: new THREE.Color(color) },
        uAlpha: { value: layer.alpha },
        uTime: sharedTime,
        uTopR: { value: layer.topR },
        uBotR: { value: layer.botR },
        uEdgeK: { value: layer.edgeK },
        uFadePow: { value: B.fadePow },
        uDustAmp: { value: B.dustAmp },
        uDustScale: { value: B.dustScale },
        uDustSpeed: { value: B.dustSpeed },
      };
      unit.alphas.push({ u: u.uAlpha, base: layer.alpha });
      // 逐束独立颜色 uniform：灯光秀可把它渐变到纯白而互不影响
      unit.colors.push(u.uColor);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(layer.topR, layer.botR, len, 16, 1, true),
        beamMaterial(u),
      );
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
      beam.position.copy(origin).addScaledVector(dir, len / 2);
      beam.renderOrder = 20;
      beam.name = 'beam';
      unit.beamMeshes.push(beam);
      g.add(beam);
    }

    // 灯头亮球（Bloom 接管光晕）
    unit.headMat = new THREE.MeshStandardMaterial({ color: 0x101014, emissive: color, emissiveIntensity: R.headI, roughness: 0.4 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(R.headR, 12, 10), unit.headMat);
    head.position.copy(origin);
    head.name = 'beam-head';
    g.add(head);

    // 落地光池：光束延伸至地面处（dir.y < 0）
    const t = (SA.deckTop - oy) / dir.y;
    if (t > 0 && t < len * 2.2) {
      const hit = origin.clone().addScaledVector(dir, t);
      const pu = {
        uColor: { value: new THREE.Color(color) },
        uAlpha: { value: R.pool.alpha },
        uEdgeK: { value: R.pool.edgeK },
        uDustAmp: { value: R.pool.dustAmp },
        uDustScale: { value: B.dustScale },
        uDustSpeed: { value: B.dustSpeed },
        uTime: sharedTime,
      };
      unit.pool = { u: pu.uAlpha, base: R.pool.alpha };
      const pool = new THREE.Mesh(new THREE.CircleGeometry(R.pool.r, 32), poolMaterial(pu));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(hit.x, SA.deckTop + R.pool.y, hit.z);
      pool.renderOrder = 19;
      pool.name = 'beam-pool';
      unit.poolMesh = pool;
      g.add(pool);
    }
    units.push(unit);
  }

  // 尘埃粒子：全场一包 Points，沿光束下漂 + 微闪
  const N = R.beamN * R.dust.perBeam;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N * 2);
  const colors = new Float32Array(N * 3);
  const tmpC = new THREE.Color();
  let k = 0;
  for (let i = 0; i < R.beamN; i++) {
    const a = (i / R.beamN) * Math.PI * 2;
    const dir = new THREE.Vector3(R.beamDir[0] * Math.cos(a), R.beamDir[1], R.beamDir[2] * Math.sin(a)).normalize();
    const ox = SA.cx + Math.cos(a) * outer.r, oy = outer.y, oz = R.z + Math.sin(a) * outer.r;
    tmpC.set(R.beamPalette[i % R.beamPalette.length]);
    const side = new THREE.Vector3().crossVectors(dir,
      Math.abs(dir.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const up2 = new THREE.Vector3().crossVectors(side, dir).normalize();
    for (let j = 0; j < R.dust.perBeam; j++, k++) {
      const t = Math.random();
      const r = Math.sqrt(Math.random()) * THREE.MathUtils.lerp(B.core.topR, B.glow.botR, t);
      const th = Math.random() * Math.PI * 2;
      const p = new THREE.Vector3(ox, oy, oz)
        .addScaledVector(dir, t * B.len)
        .addScaledVector(side, Math.cos(th) * r)
        .addScaledVector(up2, Math.sin(th) * r);
      pos.set([p.x, p.y, p.z], k * 3);
      seed.set([Math.random() * Math.PI * 2, 0], k * 2);
      colors.set([tmpC.r, tmpC.g, tmpC.b], k * 3);
    }
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dgeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  dgeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedTime,
      uSize: { value: R.dust.size },
      uAlpha: { value: R.dust.alpha },
      uDrift: { value: R.dust.drift },
      uTwinkleHz: { value: R.dust.twinkleHz },
    },
    vertexShader: /* glsl */`
      attribute vec2 aSeed;
      attribute vec3 aColor;
      uniform float uTime, uSize, uDrift, uTwinkleHz;
      varying float vTw;
      varying vec3 vCol;
      void main() {
        vec3 p = position;
        p.y -= uDrift * fract(uTime * 0.14 + aSeed.x);
        p.y += uDrift * 0.5;
        vTw = 0.55 + 0.45 * sin(uTime * uTwinkleHz + aSeed.x * 37.0);
        vCol = aColor;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (60.0 / max(1.0, -mv.z)) * (0.7 + 0.3 * sin(aSeed.x * 91.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAlpha;
      varying float vTw;
      varying vec3 vCol;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        float a = smoothstep(0.5, 0.05, r) * uAlpha * vTw;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vCol * 1.6, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dgeo, dustMat);
  dust.name = 'beam-dust';
  dust.renderOrder = 21;
  dust.frustumCulled = false;
  g.add(dust);

  // 两盏真实聚光：从环架区投向舞台台面
  const spots = [];
  const mkSpot = (px, pz, tx, tz) => {
    const s = new THREE.SpotLight(L.realSpotColor, 900, 90, 0.38, 0.55, 1.6);
    s.position.set(SA.cx + px, 30, pz);
    s.target.position.set(SA.cx + tx, SA.deckTop, tz);
    g.add(s, s.target);
    spots.push(s);
  };
  mkSpot(-12, 100, -10, 94);
  mkSpot(12, 100, 10, 94);

  g.userData.beamUnits = units;
  g.userData.spots = spots;
  g.userData.dustU = { u: dustMat.uniforms.uAlpha, base: R.dust.alpha };
  g.userData.sharedTime = sharedTime;
  return g;
}

// 三模式（steady/strobe/sweep）× dimmer × lampBanks → 写入各束 uAlpha；
// 扫描/频闪模式光束实时摆动（风暴感）；灯头/光池/尘埃/聚光同步缩放；sharedTime 驱动尘埃流动
const _YUP = new THREE.Vector3(0, 1, 0);
// 灯光秀「转纯白」的插值目标（素材里爆发与白带阶段光束是纯白）
const _lsWhite = new THREE.Color(1, 1, 1);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export function updateLights(group, elapsed, state) {
  const L = DATA.concert.lights;
  const R = DATA.concert.stageV2.rings;
  const U = group.userData;
  const dim = state.dimmer ?? 1;
  const on = state.lampBanks;
  U.sharedTime.value = elapsed;
  // 灯光秀：光束阵列层。A 段爆发全开、收束塌缩、顶部白带转纯白；
  // B 段光束只做中央光团的环绕陪衬，颜色偏蓝。
  const LS = lightShowOf(state, elapsed);
  const lsW = LS ? clamp01(LS.w) : 0;
  const lsOn = lsW > 0.001;
  const _lsTint = new THREE.Color();
  for (const unit of U.beamUnits) {
    let k = 1;
    if (state.mode === 'strobe') {
      k = Math.sin(elapsed * L.strobeHz * Math.PI * 2 + unit.seed * 97) > 0.25 ? 1 : 0.1;
    } else if (state.mode === 'sweep') {
      k = ((elapsed * L.sweepSpeed + unit.seed) % 1) < L.sweepDuty ? 1 : 0.06;
    } else {
      k = 0.85 + 0.15 * Math.sin(elapsed * 1.7 + unit.seed * 31);
    }
    if (!on) k = 0;
    k *= dim;
    if (lsOn) {
      // 编舞接管：所有光束同步（不再各束独立抖动），逐束保留极小的错相位避免死板
      const jitter = 1 + 0.04 * Math.sin(elapsed * 2.6 + unit.seed * 23);
      k = k * (1 - lsW) + LS.beam.gain * lsW * jitter;
    }
    // 颜色每帧都写：灯光秀结束时要能回到本色，否则会停在纯白/蓝
    // 两级混合：先按 beam.white 去色成白，再按 beam.blue 推向深蓝（B 段用）
    const wt = lsOn ? LS.beam.white * lsW : 0;
    const bt = lsOn ? (LS.beam.blue || 0) * lsW : 0;
    for (const c of unit.colors) {
      // unit.colors 里直接存的是 uColor uniform 对象（{value: Color}）
      _lsTint.copy(unit.baseColor).lerp(_lsWhite, wt);
      if (bt > 0) _lsTint.lerp(_sbBlue, bt);
      c.value.copy(_lsTint);
    }
    for (const a of unit.alphas) a.u.value = a.base * k;
    unit.headMat.emissiveIntensity = 0.15 + R.headI * k;
    if (unit.pool) unit.pool.u.value = unit.pool.base * k;
    // 扫描：大幅摆场；频闪：小幅抖动；steady：保持静态
    if (k > 0 && state.mode !== 'steady') {
      const yaw = state.mode === 'sweep'
        ? Math.sin(elapsed * L.sweepSpeed * 1.4 + unit.seed * 6.283) * 0.38
        : Math.sin(elapsed * 2.1 + unit.seed * 40) * 0.1;
      const dir = unit.baseDir.clone().applyAxisAngle(_YUP, yaw);
      for (const m of unit.beamMeshes) {
        m.quaternion.setFromUnitVectors(_YUP, dir.clone().negate());
        m.position.copy(unit.origin).addScaledVector(dir, unit.len / 2);
      }
      if (unit.poolMesh) {
        const t = (SA.deckTop - unit.origin.y) / dir.y;
        if (t > 0 && t < unit.len * 2.2) {
          unit.poolMesh.visible = true;
          unit.poolMesh.position.set(
            unit.origin.x + dir.x * t,
            SA.deckTop + R.pool.y,
            unit.origin.z + dir.z * t,
          );
        } else {
          unit.poolMesh.visible = false;
        }
      }
    }
  }
  U.dustU.u.value = U.dustU.base * (on ? Math.max(dim, 0.06) : 0);
  for (const s of U.spots) {
    if (s.userData.baseI === undefined) s.userData.baseI = s.intensity;
    s.intensity = s.userData.baseI * dim;
    s.visible = on && dim > 0.02;
  }
}

// ---------- Step 6v3 · 看台应援棒（实体化） ----------
// 位置来自 tools/measure_stands.mjs 的 24 扇区坡面剖面（standProfile.js）。
// 两种应援棒（细圆柱 / 蟹钳款）InstancedMesh + 悬空蓝白小方片；
// 统一蓝白色系（参考图），发光呼吸 + 灯组联锁。
export function buildAudience() {
  const A = DATA.concert.audience;
  const g = new THREE.Group();
  g.name = 'audience';

  // 1) 落点：沿剖面逐行 + 弧向间距
  const spots = [];
  const P = STAND_PROFILE;
  const NSEC = P.sectors.length;
  const stageX = S.pitch.center.x, stageZ = S.goalLineSouthZ + 6;
  for (let s = 0; s < NSEC; s++) {
    const sec = P.sectors[s];
    const th0 = (s / NSEC) * Math.PI * 2;
    const dth = (Math.PI * 2) / NSEC;
    for (const name of ['lower', 'club', 'upper']) {
      const t = sec.tiers[name];
      if (!t) continue;
      const rows = Math.max(2, Math.round((t.y1 - t.y0) / A.rowRise));
      for (let r = 0; r <= rows; r++) {
        const y = t.y0 + ((t.y1 - t.y0) * r) / rows;
        const f = (y - t.y0) / (t.y1 - t.y0);
        const rr = t.r0 + (t.r1 - t.r0) * f - A.rInset;
        const n = Math.max(1, Math.floor((rr * dth) / A.arcSpacing));
        for (let j = 0; j < n; j++) {
          const th = th0 + ((j + 0.5) / n) * dth;
          const lift = A.lift[0] + Math.random() * (A.lift[1] - A.lift[0]);
          const x = P.center.x + Math.cos(th) * rr + (Math.random() * 2 - 1) * A.jitter;
          const z = P.center.z + Math.sin(th) * rr + (Math.random() * 2 - 1) * A.jitter;
          const crab = Math.random() < A.stickClaw.ratio;
          spots.push({
            x, y: y + lift, z, crab,
            // 蟹钳宽面朝舞台（观众自然展示钳面）± 抖动；圆柱棒对称故随机即可
            yaw: crab
              ? Math.atan2(stageX - x, stageZ - z) + (Math.random() * 2 - 1) * A.stickClaw.faceJitter
              : Math.random() * Math.PI * 2,
            tiltX: (Math.random() * 2 - 1) * A.tiltMax,
          });
        }
      }
    }
  }
  console.log('[audience] sticks:', spots.length);

  // 2) 细圆柱应援棒：深柄 + 发光长管（merge 成双材质组几何）
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  const V = new THREE.Vector3(), SV = new THREE.Vector3();
  const place = (inst, list) => {
    list.forEach((sp, i) => {
      E.set(sp.tiltX, sp.yaw, sp.tiltX * 0.6);
      Q.setFromEuler(E);
      V.set(sp.x, sp.y, sp.z);
      SV.set(1, 1, 1);
      M.compose(V, Q, SV);
      inst.setMatrixAt(i, M);
    });
    inst.instanceMatrix.needsUpdate = true;
  };

  const cylSpots = spots.filter((s) => !s.crab);
  const crabSpots = spots.filter((s) => s.crab);

  const assets = getStickAssets();
  const cylInst = new THREE.InstancedMesh(assets.cylGeo, [assets.shellC, assets.glowC], cylSpots.length);
  cylInst.name = 'sticks-cyl';
  place(cylInst, cylSpots);
  captureSway(cylInst);
  g.add(cylInst);

  // 3) 蟹钳应援棒（按实拍重做）：暗柄+装饰环 + 单体泪滴钳头（左缘咬合缺口）通体发光
  const CR = A.stickClaw;
  const crabInst = new THREE.InstancedMesh(assets.clawGeo, [assets.shellK, assets.glowK], crabSpots.length);
  crabInst.name = 'sticks-claw';
  place(crabInst, crabSpots);
  captureSway(crabInst);
  g.add(crabInst);

  // 看台只做潮汐编址（外场不参与点阵图案）；u/s 是人浪光效的预计算位置参数。
  //   u = 环向角归一化 0..1（整周）
  //   s = 距舞台一侧的归一化角距 0..1（0 = 舞台两翼起点，1 = 正对面相遇点）
  const thStage = Math.atan2(SA.stageFrontZ - S.bowl.centerZ, S.pitch.center.x - S.bowl.centerX);
  const mkEntries = (inst, list) => list.map((sp, i) => {
    const theta = Math.atan2(sp.z - S.bowl.centerZ, sp.x - S.bowl.centerX);
    return {
      mesh: inst, idx: i, theta,
      u: wrap01(theta / (Math.PI * 2)),
      s: Math.min(1, Math.abs(wrapPm(theta - thStage)) / Math.PI),
    };
  });
  // 4) 悬空蓝白小方片（氛围光尘，缓慢起伏旋转）
  const SQ = A.squares;
  const sqGeo = new THREE.PlaneGeometry(SQ.size, SQ.size);
  const sqMat = new THREE.MeshBasicMaterial({
    color: SQ.color, transparent: true, opacity: SQ.opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const sqInst = new THREE.InstancedMesh(sqGeo, sqMat, SQ.count);
  sqInst.name = 'light-flakes';
  sqInst.frustumCulled = false;
  const flakes = [];
  for (let i = 0; i < SQ.count; i++) {
    const sp = spots[Math.floor(Math.random() * spots.length)];
    flakes.push({
      x: sp.x + (Math.random() * 2 - 1) * 0.8,
      y: sp.y + SQ.liftMin + Math.random() * (SQ.liftMax - SQ.liftMin),
      z: sp.z + (Math.random() * 2 - 1) * 0.8,
      phase: Math.random() * Math.PI * 2,
      spin: (Math.random() * 2 - 1) * 1.2,
    });
  }
  g.add(sqInst);
  g.userData = {
    cylInst, crabInst, sqInst, flakes, sqMat,
    pixelEntries: [...mkEntries(cylInst, cylSpots), ...mkEntries(crabInst, crabSpots)],
    glowMats: [assets.glowC, assets.glowK],
    baseGlow: [A.stickCyl.glowIntensity, A.stickClaw.glowIntensity],
  };
  updateAudience(g, 0, { lampBanks: true });
  return g;
}

// 应援棒共享资产（几何+材质只建一次；看台与内场人模旁共用，灯光联动自动同步）
let _stickAssets = null;
function getStickAssets() {
  if (_stickAssets) return _stickAssets;
  const A = DATA.concert.audience;
  const CYL = A.stickCyl, CR = A.stickClaw;

  const shellC = new THREE.MeshStandardMaterial({ color: CYL.shellColor, roughness: 0.6 });
  const glowC = new THREE.MeshStandardMaterial({
    color: CYL.glowColor, emissive: CYL.glowColor,
    emissiveIntensity: CYL.glowIntensity, roughness: 0.4,
  });
  // 关键补丁：自发光 × 实例颜色 —— setColorAt 才能真正改变每支棒的亮度（潮汐/点阵依赖此能力）
  const glowPatch = (sh) => {
    const ok = sh.fragmentShader.includes('vec3 totalEmissiveRadiance = emissive;');
    if (ok) {
      sh.fragmentShader = sh.fragmentShader.replace(
        'vec3 totalEmissiveRadiance = emissive;',
        'vec3 totalEmissiveRadiance = emissive * vColor;',
      );
    }
  };
  glowC.onBeforeCompile = glowPatch;
  const handle = new THREE.CylinderGeometry(CYL.handleR, CYL.handleR, CYL.handleH, 8);
  handle.translate(0, CYL.handleH / 2, 0);
  const tube = new THREE.CylinderGeometry(CYL.tubeR, CYL.tubeR, CYL.tubeH, 8);
  tube.translate(0, CYL.handleH + CYL.tubeH / 2, 0);
  const cylGeo = mergeGeometries([handle, tube], true);

  const shellK = new THREE.MeshStandardMaterial({ color: CR.shellColor, roughness: 0.5 });
  const glowK = new THREE.MeshStandardMaterial({
    color: CR.glowColor, emissive: CR.glowColor,
    emissiveIntensity: CR.glowIntensity, roughness: 0.4,
  });
  glowK.onBeforeCompile = glowPatch;
  // 钳头剪影（x 右 y 上，0..headH；右侧圆弧鼓起，左缘自顶尖下行经"咬口"到第二齿再回柄）
  const hh = CR.headH;
  const s = new THREE.Shape();
  s.moveTo(0.055 * hh, 0);
  s.quadraticCurveTo(0.150 * hh, 0.030 * hh, 0.158 * hh, 0.120 * hh);  // 右下腹
  s.quadraticCurveTo(0.168 * hh, 0.230 * hh, 0.118 * hh, 0.305 * hh);  // 右肩上升
  s.quadraticCurveTo(0.070 * hh, 0.365 * hh, -0.005 * hh, 0.372 * hh); // 顶尖（微偏左）
  s.quadraticCurveTo(-0.052 * hh, 0.372 * hh, -0.062 * hh, 0.325 * hh);// 顶尖左缘下行
  s.quadraticCurveTo(-0.068 * hh, 0.285 * hh, -0.034 * hh, 0.268 * hh);// 咬口内谷
  s.quadraticCurveTo(-0.002 * hh, 0.252 * hh, -0.010 * hh, 0.222 * hh);// 咬口底齿
  s.quadraticCurveTo(-0.038 * hh, 0.205 * hh, -0.070 * hh, 0.222 * hh);// 第二齿尖
  s.quadraticCurveTo(-0.118 * hh, 0.248 * hh, -0.130 * hh, 0.196 * hh);// 第二齿外缘
  s.quadraticCurveTo(-0.150 * hh, 0.120 * hh, -0.108 * hh, 0.060 * hh);// 左下腹
  s.quadraticCurveTo(-0.085 * hh, 0.018 * hh, -0.055 * hh, 0);         // 回到柄口
  s.closePath();
  const headGeo = new THREE.ExtrudeGeometry(s, {
    depth: CR.headDepth, bevelEnabled: true,
    bevelThickness: CR.bevel, bevelSize: CR.bevel, bevelSegments: 2, curveSegments: 10,
  });
  headGeo.translate(0, 0, -CR.headDepth / 2 - CR.bevel);
  headGeo.scale(CR.headScale, CR.headScale, CR.headScale);
  headGeo.rotateZ(CR.lean);                       // 钳头微左倾（如实拍）
  headGeo.translate(0, CR.handleH - 0.015, 0);
  const kHandle = new THREE.CylinderGeometry(CR.handleR, CR.handleR, CR.handleH, 10);
  kHandle.translate(0, CR.handleH / 2, 0);
  const collar = new THREE.TorusGeometry(CR.collarR, CR.collarTube, 6, 14);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, CR.handleH - 0.028, 0);
  // ExtrudeGeometry 为非索引几何，柄/环须 toNonIndexed 后才能合并
  const clawShell = mergeGeometries([kHandle.toNonIndexed(), collar.toNonIndexed()], false);
  const clawGeo = mergeGeometries([clawShell, headGeo], true);

  return (_stickAssets = { cylGeo, clawGeo, shellC, glowC, shellK, glowK });
}

// 观众摇摆基础设施：实例化矩阵只改平移分量（列主序 12/13/14），基准矩阵缓存一次
function captureSway(inst, ampScale = 1.0) {
  const n = inst.count;
  const base = inst.instanceMatrix.array.slice();
  const sw = new Float32Array(n * 4); // phaseX, phaseZ, phaseY, amp
  for (let i = 0; i < n; i++) {
    sw[i * 4] = Math.random() * Math.PI * 2;
    sw[i * 4 + 1] = Math.random() * Math.PI * 2;
    sw[i * 4 + 2] = Math.random() * Math.PI * 2;
    sw[i * 4 + 3] = ampScale * (0.55 + Math.random() * 0.9);
  }
  inst.userData.sway = { base, sw };
}

function applySway(inst, elapsed, ax, ay, az, speed = 1.0) {
  const { base, sw } = inst.userData.sway;
  const arr = inst.instanceMatrix.array;
  for (let i = 0; i < sw.length / 4; i++) {
    const px = sw[i * 4], pz = sw[i * 4 + 1], py = sw[i * 4 + 2], a = sw[i * 4 + 3];
    arr[i * 16 + 12] = base[i * 16 + 12] + Math.sin(elapsed * 1.5 * speed + px) * ax * a;
    arr[i * 16 + 13] = base[i * 16 + 13] + Math.sin(elapsed * 2.2 * speed + py) * ay * a;
    arr[i * 16 + 14] = base[i * 16 + 14] + Math.cos(elapsed * 1.25 * speed + pz) * az * a;
  }
  inst.instanceMatrix.needsUpdate = true;
}

// 开场秀波浪：亮度波（波前从波源向外）+ 摇摆幅度随波峰增幅；keepColor 时不动实例色（人模保 tint）
function ensureWaveData(inst, origin) {
  if (inst.userData.wave) return inst.userData.wave;
  const n = inst.count, base = inst.userData.sway.base;
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    dist[i] = Math.hypot(base[i * 16 + 12] - origin.x, base[i * 16 + 14] - origin.z);
  }
  return (inst.userData.wave = { dist });
}
function waveSway(inst, elapsed, wave, ax, ay, az, keepColor, speed = 1.0) {
  const { base, sw } = inst.userData.sway;
  const { dist } = ensureWaveData(inst, wave.origin);
  const arr = inst.instanceMatrix.array;
  const color = keepColor ? null : new THREE.Color();
  for (let i = 0; i < dist.length; i++) {
    let br = 0;
    for (const t0 of wave.starts) {
      const dd = dist[i] - (wave.t - t0) * wave.speed;
      br += Math.exp(-(dd * dd) / (wave.width * wave.width));
    }
    br = Math.min(1, br);
    const amp = 1 + wave.ampBoost * br;
    const px = sw[i * 4], pz = sw[i * 4 + 1], py = sw[i * 4 + 2], a = sw[i * 4 + 3];
    arr[i * 16 + 12] = base[i * 16 + 12] + Math.sin(elapsed * 1.5 * speed + px) * ax * a * amp;
    arr[i * 16 + 13] = base[i * 16 + 13] + Math.sin(elapsed * 2.2 * speed + py) * ay * a * amp;
    arr[i * 16 + 14] = base[i * 16 + 14] + Math.cos(elapsed * 1.25 * speed + pz) * az * a * amp;
    if (color) { color.setScalar(0.22 + 0.78 * br); inst.setColorAt(i, color); }
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
}
function resetWave(inst) {
  if (!inst.instanceColor) return;
  const color = new THREE.Color(1, 1, 1);
  for (let i = 0; i < inst.count; i++) inst.setColorAt(i, color);
  inst.instanceColor.needsUpdate = true;
}

function dirtySticks(inst) {
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
}

// 潮汐人浪：亮度+物理高度沿环向角传播（深海→浪峰渐变），波峰数/速度由参数表驱动
const _tideDeep = new THREE.Color(), _tideFoam = new THREE.Color(), _tideCol = new THREE.Color();
function applyTideEntries(entries, elapsed) {
  if (!entries || !entries.length) return;
  const T = DATA.concert.audience.tide;
  _tideDeep.set(T.deep); _tideFoam.set(T.foam);
  for (const e of entries) {
    const w = 0.5 + 0.5 * Math.sin(e.theta * T.angleWaves - elapsed * T.speed);
    const swell = (w - 0.5) * 2; // -1..1 潮位
    _tideCol.copy(_tideDeep).lerp(_tideFoam, Math.pow(w, 1.5));
    _tideCol.multiplyScalar(0.2 + 1.7 * w); // 浪峰 HDR 提亮
    e.mesh.setColorAt(e.idx, _tideCol);
    const sw = e.mesh.userData.sway;
    if (sw) e.mesh.instanceMatrix.array[e.idx * 16 + 13] =
      sw.base[e.idx * 16 + 13] + swell * T.bobAmp * sw.sw[e.idx * 4 + 3];
  }
}

// ---- 点阵图案与编址：见 js/pixel.js（设计空间方程 + 内场平面网格编址，纯逻辑可单测）----
// 点阵屏只由内场插棒承担；图案随 shift 做有界往复横移，主体 HDR 超亮、边缘过渡、其余保留底光
function applyPixelEntries(entries, name, shift) {
  if (!entries || !entries.length) return;
  const P = DATA.concert.crowd.pixel;
  const col = new THREE.Color();
  for (const e of entries) {
    const v = pixelStateAt(e.row, e.col, shift, name);
    if (v === 2) col.setRGB(0.92 * 2.6, 0.97 * 2.7, 1.0 * 2.8); // HDR 超亮：远距离也能被 Bloom 拾取
    else if (v === 1) col.setScalar(P.edge);
    else col.setScalar(P.dim);
    e.mesh.setColorAt(e.idx, col);
  }
}

// ---- 人浪光效（条纹 / 相遇 / 追逐）：算法在 js/wavefx.js，这里只负责写色+写摇摆 ----
// 亮度标量 → HDR 颜色（>1 会被 Bloom 拾取）；同时按亮度给出轻微的摇摆增幅，
// 让「被点亮」的观众有站起来的感觉，而不只是变色。
const _fxCol = new THREE.Color();
// 悬空小方片（700 片）每帧复用的临时矩阵/四元数——提到模块级，避免逐帧分配触发 GC 抖动
const _flakeM = new THREE.Matrix4(), _flakeQ = new THREE.Quaternion(), _flakeE = new THREE.Euler();
const _flakeV = new THREE.Vector3(), _flakeSV = new THREE.Vector3(1, 1, 1);
// meet/chase 是「灭灯型」光效：没被光效扫到的观众要彻底熄灭，只剩被点亮的区段。
// 这类模式的暗区不仅不给颜色，也不该再大幅摇摆（观众是坐着的）。
const DARKOUT_MODES = ['meet', 'chase'];
function applyWaveFxEntries(entries, mode, elapsed, W) {
  if (!entries || !entries.length) return;
  const [lo, hi] = fxRange(mode, W);
  const span = Math.max(1e-4, hi - lo);
  const t = elapsed * W.timeScale;
  // 暗区是否完全静止（灭灯型模式：亮区抬身、暗区坐定）
  const darkOut = DARKOUT_MODES.includes(mode);
  for (const e of entries) {
    const b = fxAt(mode, e.u, e.s, t, W);
    if (b === null) continue;
    const k = (b - lo) / span;              // 0..1（可略超 1，HDR）
    const v = b;                             // 直接给亮度：暗部为 0 时即彻底灭灯
    _fxCol.setRGB(v * 0.92, v * 0.97, v);
    e.mesh.setColorAt(e.idx, _fxCol);
    // 摇摆增幅：亮区抬得更高；灭灯型模式的暗区几乎不动（坐着）
    const amp = darkOut ? 0.10 + 1.80 * k : 1 + 0.9 * k;
    const sw = e.mesh.userData.sway;
    if (sw) {
      const i = e.idx;
      const arr = e.mesh.instanceMatrix.array;
      const px = sw.sw[i * 4], pz = sw.sw[i * 4 + 1], py = sw.sw[i * 4 + 2], a = sw.sw[i * 4 + 3] * amp;
      arr[i * 16 + 12] = sw.base[i * 16 + 12] + Math.sin(elapsed * 1.5 + px) * 0.05 * a;
      arr[i * 16 + 13] = sw.base[i * 16 + 13] + Math.sin(elapsed * 2.2 + py) * 0.025 * a;
      arr[i * 16 + 14] = sw.base[i * 16 + 14] + Math.cos(elapsed * 1.25 + pz) * 0.05 * a;
    }
  }
}

// 人浪光效模式（与环境/开场秀模式并列，可被 HUD 或 show 直接设到 audienceMode）
const WAVE_FX_MODES = ['stripe', 'meet', 'chase'];

// ---- 灯光秀 A · 看台应援棒层 ----
// 两层叠加：整片底光（gain，可到 HDR）+ 一条绕场行进的高亮带（bandU/bandW）。
// white 控制冷青 → 纯白的过渡（素材里爆发和白带阶段是纯白，呼吸/黑场是冷青）。
const _lsCol = new THREE.Color();
// 观众区的冷蓝色度（素材 B 段实测 B/R 1.6~1.8、sat 36~45）。
// 注意这里存的是**归一化色度**（B 恒为 1），再乘亮度 v —— 直接对颜色做 lerp
// 会把暗底光提亮，看起来像整片发白而不是变蓝。
// 数值经过截图实测回调：线性 B/R=1.39 时，经 Bloom + ACES 出图后落在 B/R≈1.8、
// sat≈45，与素材吻合（更低的 R 会让出图过饱和到 B/R 2.4+）。
const _LS_BLUE_R = 0.72;
const _LS_BLUE_G = 0.79;
function applyLightShowEntries(entries, R, elapsed) {
  if (!entries || !entries.length) return;
  const S = R.sticks;
  const w = clamp01(R.w);
  const gain0 = S.gain;
  const white = S.white;
  const blue = S.blue || 0;
  const bandOn = S.bandU >= 0 && S.bandW > 0;
  // 聚焦扇区：素材 0~4.5s 的亮块是一团居中的光，不是整圈均匀亮。
  // focusW>0 时按环向距离做平滑衰减，聚焦外只留 focusFloor 的底光。
  const focusOn = S.focusU >= 0 && S.focusW > 0;
  const focusFloor = S.focusFloor != null ? S.focusFloor : 0.12;
  // 独立区域闪烁：素材里把看台切成 3×3 子区两两相关只有 0.44，
  // 说明人群是各自挥动的，不是整场一个呼吸。这里按环向把观众分成
  // regionN 个区，每区一个固定相位，区内同闪、跨区错开。
  const regionN = S.regionN != null ? S.regionN : 12;
  const flick = S.flicker != null ? S.flicker : 0;
  const flickHz = S.flickerHz != null ? S.flickerHz : 0.7;
  const TAU = Math.PI * 2;
  // 常态基准（权重要交还时插值回去）：蓝白 tint × 启动呼吸
  const basePulse = 0.85 + 0.15 * Math.sin(elapsed * DATA.concert.audience.pulseSpeed);
  for (const e of entries) {
    // 每区一个固定相位（乘上一个非整数倍率，避免所有区整齐划一）
    let fk = 1;
    if (flick > 0) {
      const rid = Math.floor(wrap01(e.u) * regionN);
      const ph = rid * 2.399963 + rid * rid * 0.37;   // 黄金角撒相位
      fk = 1 + flick * Math.sin(elapsed * TAU * flickHz * (0.78 + 0.44 * ((rid * 0.618) % 1)) + ph);
    }
    let v = gain0 * basePulse * fk;
    if (focusOn) {
      const d = Math.abs(wrapPm((e.u - S.focusU) * Math.PI * 2)) / (Math.PI * 2);
      const f = clamp01(1 - d / S.focusW);
      v *= focusFloor + (1 - focusFloor) * f * f * (3 - 2 * f);
    }
    if (bandOn) {
      const d = Math.abs(wrapPm((e.u - S.bandU) * Math.PI * 2)) / (Math.PI * 2);
      const k = Math.max(0, 1 - d / S.bandW);
      // 带内抬升到满亮，带外保留 S.bandFloor 的底光，避免整片死黑
      const band = S.bandFloor + (1 - S.bandFloor) * Math.pow(k, 1.4);
      v *= band * (1 / Math.max(1e-4, S.bandFloor + (1 - S.bandFloor) * 0.5));
    }
    // 权重不足 1（收尾段）时朝常态值插值：常态是 instanceColor=(1,1,1)，
    // 这样 w→0 交还控制权的那一刻不会有亮度台阶。
    if (w < 1) v = v * w + (1 - w);
    // white: 0 → 冷青(0.92/0.97/1)，1 → 纯白；blue: 再往深蓝推（B 的观众段）
    // 蓝只压 R/G、不动 B —— 对整色 lerp 会把暗底光一起提亮，变成"发白"而不是"发蓝"
    _lsCol.setRGB(v * (0.92 + 0.08 * white), v * (0.97 + 0.03 * white), v);
    if (blue > 0) {
      const t = Math.min(1, blue * w);
      _lsCol.r *= 1 - t * (1 - _LS_BLUE_R);
      _lsCol.g *= 1 - t * (1 - _LS_BLUE_G);
    }
    e.mesh.setColorAt(e.idx, _lsCol);
    // 亮区抬身、暗区坐定：亮度越高摇摆越大
    const kk = Math.min(1, Math.max(0, v / 1.6));
    const amp = (0.25 + 1.5 * kk) * (1 - 0.7 * (1 - w));
    const sw = e.mesh.userData.sway;
    if (sw) {
      const i = e.idx;
      const arr = e.mesh.instanceMatrix.array;
      const px = sw.sw[i * 4], pz = sw.sw[i * 4 + 1], py = sw.sw[i * 4 + 2], a = sw.sw[i * 4 + 3] * amp;
      arr[i * 16 + 12] = sw.base[i * 16 + 12] + Math.sin(elapsed * 1.5 + px) * 0.05 * a;
      arr[i * 16 + 13] = sw.base[i * 16 + 13] + Math.sin(elapsed * 2.2 + py) * 0.025 * a;
      arr[i * 16 + 14] = sw.base[i * 16 + 14] + Math.cos(elapsed * 1.25 + pz) * 0.05 * a;
    }
  }
}

// ---- 灯光秀 A · 屋顶 LED 环带层 ----
// 环带是单条 Tube（uv.x 沿管长 0..1），这里做两件事：
//   1) 整体 emissiveIntensity 由编舞给定（黑场里那条横贯全宽的细亮带就是它）
//   2) onBeforeCompile 注入沿 uv.x 的明暗分段，让白带阶段出现「分段跑马」的质感
const _lsRibbonState = { mat: null, uniforms: null };
export function ensureRibbonShader(mesh) {
  if (!mesh || _lsRibbonState.mat === mesh.material) return _lsRibbonState;
  const mat = mesh.material;
  const uniforms = {
    uLsMix: { value: 0 },
    uLsWhite: { value: 0 },
    // 分段数：素材里那条横带由「一排排等距灯点」组成（600px 内 78~120 个亮峰）。
    // 环带 TubeGeometry 只有 360 段，64 段既能读出灯点感又不会走样。
    uLsSeg: { value: 64 },
    uLsPhase: { value: 0 },
    uLsSegAmp: { value: 0.55 },
  };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLsMix = uniforms.uLsMix;
    sh.uniforms.uLsWhite = uniforms.uLsWhite;
    sh.uniforms.uLsSeg = uniforms.uLsSeg;
    sh.uniforms.uLsPhase = uniforms.uLsPhase;
    sh.uniforms.uLsSegAmp = uniforms.uLsSegAmp;
    sh.vertexShader = 'varying float vLsU;\n' + sh.vertexShader.replace(
      '#include <uv_vertex>',
      '#include <uv_vertex>\n  vLsU = uv.x;',
    );
    sh.fragmentShader = 'varying float vLsU;\nuniform float uLsMix;\nuniform float uLsWhite;\nuniform float uLsSeg;\nuniform float uLsPhase;\nuniform float uLsSegAmp;\n' +
      sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // 分段明暗：奇数段压暗，形成沿环带的跑马灯纹理
          float seg = fract(vLsU * uLsSeg + uLsPhase);
          float segK = 1.0 - uLsSegAmp * smoothstep(0.42, 0.58, seg);
          // 白带阶段整体去色（蓝 → 白）
          vec3 cool = totalEmissiveRadiance;
          vec3 neutral = vec3(dot(cool, vec3(0.2126, 0.7152, 0.0722)));
          totalEmissiveRadiance = mix(cool, neutral * 1.15, uLsWhite * uLsMix) * mix(1.0, segK, uLsMix);
        }`,
      );
  };
  mat.needsUpdate = true;
  _lsRibbonState.mat = mat;
  _lsRibbonState.uniforms = uniforms;
  return _lsRibbonState;
}
export function updateLightShowRibbon(mesh, R, elapsed) {
  if (!mesh) return;
  const st = ensureRibbonShader(mesh);
  const U = st.uniforms;
  const w = R ? clamp01(R.w) : 0;
  U.uLsMix.value = w;
  U.uLsWhite.value = R ? R.ribbon.white : 0;
  U.uLsPhase.value = elapsed * 0.06;
  // 注意：这里的振幅必须与 ensureRibbonShader 的初值一致（0.55），
  // 否则初始化时的值永远被每帧覆盖成死参数，调参也无从生效。
  U.uLsSegAmp.value = 0.55;
  // 亮度：常态值（updateAtmosphere 刚写过，这里读回来）与编舞值之间的插值
  const base = mesh.userData.lsBaseIntensity != null ? mesh.userData.lsBaseIntensity : mesh.material.emissiveIntensity;
  const target = R ? R.ribbon.intensity : base;
  mesh.material.emissiveIntensity = base * (1 - w) + target * w;
}

// ---- 灯光秀变体分派 ----
// A = 全环应援棒 + 环带白带（js/lightshow.js）
// B = 舞台中央单光团（js/lightshowb.js）
// 两者都返回同一套 { w, sticks, ribbon, beam }，B 额外多一个 body/beam.blue。
// 消费端（updateLights / updateAudience / updateLightShowRibbon）因此不用区分变体。
export function lightShowOf(state, elapsed) {
  if (!state || !state.lightShow) return null;
  const t = state.lightShowT != null ? state.lightShowT : elapsed;
  if (state.lightShowVariant === 'b') return lightShowBAt(t, DATA.concert.lightShowB);
  return lightShowAt(t, DATA.concert.lightShow);
}

// ---- 灯光秀 B · 舞台 LED 大屏（居中光团本体）----
// 素材 B 的观感核心就是这一块屏：先是近白的方光，转冷成蓝，面积随呼吸涨缩，
// 内部有 6~10 条稀疏竖纹。这里用 onBeforeCompile 在自发光通道上叠
// 「竖条明暗 × 蓝色调 × 编舞权重」，并用 emissiveIntensity 做整体亮度包络。
const _sbBlue = new THREE.Color(0x5272ff);
const _sbState = { mat: null, uniforms: null };
export function ensureScreenShader(mat) {
  if (!mat || _sbState.mat === mat) return _sbState;
  if (mat.userData.sbBaseIntensity == null) mat.userData.sbBaseIntensity = mat.emissiveIntensity;
  const uniforms = {
    uSbMix: { value: 0 },
    uSbTint: { value: 0 },
    uSbStripe: { value: 0 },
    uSbFreq: { value: 7 },
    uSbPhase: { value: 0 },
  };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSbMix = uniforms.uSbMix;
    sh.uniforms.uSbTint = uniforms.uSbTint;
    sh.uniforms.uSbStripe = uniforms.uSbStripe;
    sh.uniforms.uSbFreq = uniforms.uSbFreq;
    sh.uniforms.uSbPhase = uniforms.uSbPhase;
    const okFrag = sh.fragmentShader.includes('#include <emissivemap_fragment>');
    const okVert = sh.vertexShader.includes('#include <uv_vertex>');
    mat.userData.sbPatched = { frag: okFrag, vert: okVert };
    sh.vertexShader = 'varying float vSbU;\n' + sh.vertexShader.replace(
      '#include <uv_vertex>',
      '#include <uv_vertex>\n  vSbU = uv.x;',
    );
    sh.fragmentShader = 'varying float vSbU;\nuniform float uSbMix;\nuniform float uSbTint;\nuniform float uSbStripe;\nuniform float uSbFreq;\nuniform float uSbPhase;\n' +
      sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // 竖条：沿 uv.x 的稀疏明暗带（素材里是 6~10 条等距竖纹）
          float sbSeg = fract(vSbU * uSbFreq + uSbPhase);
          float sbK = 1.0 - uSbStripe * uSbMix * smoothstep(0.34, 0.66, sbSeg);
          // 关键：素材 B 的光体是「均匀发光的块 + 稀疏竖纹」，不是一张被调亮的画。
          // 这里把贴图贡献（月夜海面）按 uSbMix 融掉，换成纯自发光 emissive
          // （= emissive 颜色 × emissiveIntensity，由 JS 每帧写入），
          // 否则屏上的海面纹理会一直透出来，颜色再蓝也读不成一个光团。
          vec3 sbFlat = emissive;
          totalEmissiveRadiance = mix(totalEmissiveRadiance, sbFlat, uSbMix);
          // 冷 → 深蓝。素材 B 深蓝段的 RGB≈(95,99,160)，即 R≈G、B≈1.6R；
          // 但屏面是 HDR + ACES，亮度一高就会被去饱和推向白，
          // 所以 R/G 要压得很低才能在中段读出蓝，而不是靠整体提亮。
          vec3 sbBlue = vec3(0.06, 0.13, 1.0);
          vec3 sbTint = mix(vec3(1.0), sbBlue, uSbTint * uSbMix);
          totalEmissiveRadiance *= sbTint * sbK;
          // 底色一并压掉：B 模式下这块屏就是光源本身，不该再显示海面纹理
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.03, 0.06), uSbMix);
        }`,
      );
  };
  mat.needsUpdate = true;
  mat.userData.sbUniforms = uniforms; // 供 QA dump 读取真实 uniform 值
  _sbState.mat = mat;
  _sbState.uniforms = uniforms;
  return _sbState;
}

// 灯光秀 B：驱动 LED 大屏本体。R 为空时（秀关闭）自动把参数收 0 并回常态亮度。
export function updateLightShowBody(stage, R, elapsed) {
  if (!stage) return;
  const mat = stage.userData.ledMainMat;
  if (!mat) return;
  const st = ensureScreenShader(mat);
  const U = st.uniforms;
  const body = R ? R.body : null;
  // 关键：占位权重必须由「本变体是否真的驱动这块屏」决定，而不是只看编舞权重 w。
  // A 变体同样 w=1，但 A 不碰 LED 大屏；若直接用 w，uSbMix=1 会让片元里的
  // diffuse * sbBlue 把 A 模式的屏也压成蓝调（实测确实会）。
  const w = body ? clamp01(R.w) : 0;
  U.uSbMix.value = w;
  U.uSbTint.value = body ? body.tint : 0;
  U.uSbStripe.value = body ? body.stripe : 0;
  U.uSbFreq.value = body ? body.freq : 7;
  U.uSbPhase.value = body ? body.phase : 0;
  const base = mat.userData.sbBaseIntensity != null ? mat.userData.sbBaseIntensity : mat.emissiveIntensity;
  const target = body ? body.gain : base;
  mat.emissiveIntensity = base * (1 - w) + target * w;
  // 面积脉冲：只缩放屏体与屏框自身（各自绕自己的中心），不动组的原点，
  // 否则整块屏会连带位移，看着像镜头推进而不是灯在涨缩。
  const s = 1 + (body ? (body.scale - 1) * w : 0);
  const wallGrp = stage.getObjectByName('led-wall');
  if (wallGrp) {
    for (const m of wallGrp.children) {
      if (m.name === 'screen-wall') continue;   // 背板不缩放，避免从屏前露出边缘
      m.scale.set(s, s, 1);
    }
  }
}

export function updateAudience(group, elapsed, state) {
  const A = DATA.concert.audience;
  const u = group.userData;
  const on = state.lampBanks;
  const pulse = 0.85 + 0.15 * Math.sin(elapsed * A.pulseSpeed);
  const mode0 = state.audienceMode || 'normal';
  // 灯光秀优先于一切观众光效：它自带六段编舞与权重，收尾时 w→0 自动交还常态
  // 用 lightShowOf 分派 A/B 变体，两者都返回同一套 { w, sticks, ... } 契约
  const LS = lightShowOf(state, elapsed);
  const lsActive = !!(LS && LS.w > 0.001);
  // 灭灯型光效（相遇 / 追逐）：观众只留被光效扫到的部分，悬空小方片也要压暗，
  // 否则满场飘着的 700 片亮方块会把「灭灯」的对比冲淡。
  const darkout = lsActive ? (LS.sticks.gain < 0.25) : DARKOUT_MODES.includes(mode0);
  u.glowMats.forEach((m, i) => {
    m.emissiveIntensity = on ? u.baseGlow[i] * pulse : 0.05;
  });
  u.sqMat.opacity = on ? A.squares.opacity * (0.7 + 0.3 * pulse) * (darkout ? 0.30 : 1) : 0;
  u.cylInst.visible = on;
  u.crabInst.visible = on;
  u.sqInst.visible = on;
  if (on) {
    const mode = mode0;
    const W = DATA.concert.waveFx;
    if (lsActive) {
      // 灯光秀：三载体联动的看台层（整体底光 + 绕场行进的高亮带 / B 段只留微弱底光）
      if (u.lastFx && u.lastFx !== 'lightshow') {
        resetWave(u.cylInst); resetWave(u.crabInst);
      }
      u.waveWasOn = false;
      applyLightShowEntries(u.pixelEntries || [], LS, elapsed);
      dirtySticks(u.cylInst); dirtySticks(u.crabInst);
      u.lastFx = 'lightshow';
    } else if (WAVE_FX_MODES.includes(mode)) {
      // 人浪光效：条纹 / 相遇 / 追逐 —— 逐实例写色 + 摇摆增幅随亮度
      if (u.lastFx && u.lastFx !== mode && u.lastFx !== 'normal') {
        // 从潮汐/波浪切过来：清掉上一模式的残留色与位移
        resetWave(u.cylInst); resetWave(u.crabInst);
      }
      if (u.waveWasOn) { u.waveWasOn = false; }
      applyWaveFxEntries(u.pixelEntries || [], mode, elapsed, W);
      dirtySticks(u.cylInst); dirtySticks(u.crabInst);
      u.lastFx = mode;
    } else if (mode === 'tide') {
      // 潮汐人浪：亮度+物理高度绕碗体环形传播
      applyTideEntries(u.pixelEntries || [], elapsed);
      dirtySticks(u.cylInst); dirtySticks(u.crabInst);
      u.lastFx = 'tide';
    } else if (state.wave) {
      // 开场秀波浪：亮度波沿看台径向传播（setColorAt 逐实例）+ 摇摆随波峰增幅
      waveSway(u.cylInst, elapsed, state.wave, 0.055, 0.028, 0.055, false);
      waveSway(u.crabInst, elapsed, state.wave, 0.065, 0.032, 0.065, false);
      u.waveWasOn = true;
      u.lastFx = 'wave';
    } else {
      // normal 与 pixel 共用：点阵屏由内场插棒承担，外场不参与图案，
      // 只保持常规呼吸摇摆（不压黑、不改色）
      if (u.lastFx && u.lastFx !== 'normal') { resetWave(u.cylInst); resetWave(u.crabInst); }
      if (u.waveWasOn) { resetWave(u.cylInst); resetWave(u.crabInst); u.waveWasOn = false; }
      u.lastFx = 'normal';
      applySway(u.cylInst, elapsed, 0.055, 0.028, 0.055);
      applySway(u.crabInst, elapsed, 0.065, 0.032, 0.065);
    }
  }
  // 小方片起伏旋转（临时对象提到模块级复用，避免每帧 new 4×700 次触发 GC 抖动）
  const t = elapsed * A.squares.bobSpeed;
  const M = _flakeM, Q = _flakeQ, E = _flakeE, V = _flakeV, SV = _flakeSV;
  u.flakes.forEach((f, i) => {
    const y = f.y + Math.sin(t + f.phase) * A.squares.bobAmp;
    E.set(0.35, f.spin * t * 0.4 + f.phase, 0.2);
    Q.setFromEuler(E);
    V.set(f.x, y, f.z);
    M.compose(V, Q, SV);
    u.sqInst.setMatrixAt(i, M);
  });
  u.sqInst.instanceMatrix.needsUpdate = true;
}

// ---------- Step 6v2 · 内场人模 ----------
// 两个低模（各 ~730 三角）InstancedMesh 实例化；站区内整齐网格排列，
// 全部面向舞台（南端 +z）；避让延伸台 / B 台；脚底贴站区块顶面。
export function buildCrowd(gltfs) {
  const C = DATA.concert, CR = C.crowd, p = S.pitch;
  const deckTop = S.groundY + 0.72;
  const blockTop = deckTop + 0.15; // 站区块顶面
  const g = new THREE.Group();
  g.name = 'crowd';

  // 1) 网格落点（行沿 z 面向舞台，列沿 x）。网格尺寸取自 pixel.js 的 pitGrid()，
  //    它是点阵编址的唯一真相——保证「网格格数 == 插棒数」，点阵屏每格恰好一支棒。
  const PG = pitGrid();
  const spots = [];
  for (let b = 0; b < C.pitBlocks; b++) {
    const zMax = C.pitFirstRowZ - b * (C.pitBlockDepth + C.pitBlockGap);
    const x0 = p.center.x - C.pitWidth / 2 + CR.blockMargin;
    const x1 = p.center.x + C.pitWidth / 2 - CR.blockMargin;
    const z0 = zMax - C.pitBlockDepth + CR.blockMargin;
    const z1 = zMax - CR.blockMargin;
    const cols = PG.cols;
    const rows = PG.blocks[b].rows;
    const base = PG.blocks[b].base;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + (cols === 1 ? (x1 - x0) / 2 : ((x1 - x0) * c) / (cols - 1))
          + (Math.random() * 2 - 1) * CR.colJitter;
        const z = z0 + (rows === 1 ? (z1 - z0) / 2 : ((z1 - z0) * r) / (rows - 1))
          + (Math.random() * 2 - 1) * CR.rowJitter;
        spots.push({
          x, z,
          // 点阵编址：col 沿 x、row 由 z 反推。r=0 最远离舞台 —— 让「远离舞台 = 行号小」，
          // 于是图案行 0（顶部）落在最远离舞台的一排，与 aerial / sg-back 机位一致
          col: c, row: PG.rows - 1 - (base + (rows - 1 - r)),
          yaw: CR.faceYaw + (Math.random() * 2 - 1) * CR.yawVar,
          hs: CR.scale * (1 + (Math.random() * 2 - 1) * CR.heightVar),
        });
      }
    }
  }

  // 2) 两个模型各建一个 InstancedMesh
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  const V = new THREE.Vector3(), SV = new THREE.Vector3(), COL = new THREE.Color();
  gltfs.forEach((gltf, mi) => {
    let src = null;
    gltf.scene.traverse((o) => { if (!src && o.isMesh) src = o; });
    if (!src) return;
    src.geometry.computeBoundingBox();
    const yOff = -src.geometry.boundingBox.min.y; // 原点移到脚底
    const mat = src.material.clone();
    mat.emissive = new THREE.Color(CR.emissive);
    mat.emissiveIntensity = CR.emissiveIntensity;
    const mine = spots.filter((_, i) => i % gltfs.length === mi);
    const inst = new THREE.InstancedMesh(src.geometry, mat, mine.length);
    mine.forEach((sp, i) => {
      E.set(0, sp.yaw, 0);
      Q.setFromEuler(E);
      V.set(sp.x, blockTop + yOff * sp.hs, sp.z);
      SV.set(sp.hs, sp.hs, sp.hs);
      M.compose(V, Q, SV);
      inst.setMatrixAt(i, M);
      COL.setScalar(CR.tintMin + Math.random() * CR.tintVar);
      inst.setColorAt(i, COL);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    captureSway(inst, 0.5); // 人模微晃（幅度更小）
    inst.name = mi === 0 ? 'crowd-a' : 'crowd-b';
    g.add(inst);
  });

  // 3) 人模旁应援棒：右侧或正前方随机插地（圆柱/蟹钳与看台同资产、同灯光联动）
  //    每支棒继承所归属格的 (col,row) —— 点阵屏就是这 1550 支棒，1 格 1 支
  const PS = CR.pitStick;
  const stageX = p.center.x, stageZ = S.goalLineSouthZ + 6;
  const pitCylSpots = [], pitClawSpots = [];
  for (const sp of spots) {
    const fx = Math.cos(sp.yaw), fz = -Math.sin(sp.yaw); // 人模朝向（原生 +x 经 yaw）
    const rx = -fz, rz = fx;                             // 人模右手侧
    const front = Math.random() < 0.5;
    const x = sp.x + (front ? fx * PS.frontOffset : rx * PS.rightOffset) + (Math.random() * 2 - 1) * 0.06;
    const z = sp.z + (front ? fz * PS.frontOffset : rz * PS.rightOffset) + (Math.random() * 2 - 1) * 0.06;
    const base = {
      x, z, y: blockTop, tiltX: (Math.random() * 2 - 1) * PS.tiltMax,
      col: sp.col, row: sp.row,
    };
    if (Math.random() < PS.clawRatio) {
      pitClawSpots.push({ ...base, yaw: Math.atan2(stageX - x, stageZ - z) + (Math.random() * 2 - 1) * 0.5 });
    } else {
      pitCylSpots.push({ ...base, yaw: Math.random() * Math.PI * 2 });
    }
  }
  const assets = getStickAssets();
  const mkPit = (geo, mats, list, name) => {
    const inst = new THREE.InstancedMesh(geo, mats, list.length);
    inst.name = name;
    const Pm = new THREE.Matrix4(), Pq = new THREE.Quaternion(), Pe = new THREE.Euler();
    const Pv = new THREE.Vector3(), Ps = new THREE.Vector3(1, 1, 1);
    list.forEach((sp, i) => {
      Pe.set(sp.tiltX, sp.yaw, sp.tiltX * 0.6);
      Pq.setFromEuler(Pe);
      Pv.set(sp.x, sp.y, sp.z);
      Pm.compose(Pv, Pq, Ps);
      inst.setMatrixAt(i, Pm);
    });
    inst.instanceMatrix.needsUpdate = true;
    captureSway(inst);
    g.add(inst);
    return inst;
  };
  const pitCyl = mkPit(assets.cylGeo, [assets.shellC, assets.glowC], pitCylSpots, 'pit-sticks-cyl');
  const pitClaw = mkPit(assets.clawGeo, [assets.shellK, assets.glowK], pitClawSpots, 'pit-sticks-claw');
  g.userData.pitSticks = [pitCyl, pitClaw];
  // 点阵编址：内场插棒就是点阵屏本体（50 列 × 31 排 = 1550 格，1 格 1 支）。
  // row 0 = 图案上方（离舞台最远的一排），col 0 = 屏幕左侧（aerial / sg-back 机位下为正）。
  // theta 仍保留给潮汐模式（潮位绕碗体环形传播）；u/s 给人浪光效：
  //   u = 列归一化 0..1
  //   s = 距最近一侧的归一化距离 0..1（0 = 舞台两翼，1 = 中线相遇处）
  //       内场是矩形，没有"环"，所以相遇光效在这里表现为「左右两股向中线推进」。
  const mkEntries = (inst, list) => list.map((sp, i) => ({
    mesh: inst, idx: i, col: sp.col, row: sp.row,
    theta: Math.atan2(sp.z - S.bowl.centerZ, sp.x - S.bowl.centerX),
    u: PG.cols === 1 ? 0.5 : sp.col / (PG.cols - 1),
    s: PG.cols === 1 ? 1 : Math.min(1, Math.min(sp.col, PG.cols - 1 - sp.col) / ((PG.cols - 1) / 2)),
  }));
  g.userData.pixelEntries = [...mkEntries(pitCyl, pitCylSpots), ...mkEntries(pitClaw, pitClawSpots)];
  g.userData.pixelSticks = pitCylSpots.length + pitClawSpots.length;
  g.userData.pixelGrid = { cols: PG.cols, rows: PG.rows };

  g.userData.count = spots.length;
  console.log('[crowd] instances:', spots.length, '| pit sticks:', pitCylSpots.length + pitClawSpots.length);
  return g;
}

// 内场更新：人模微晃（呼吸/踮步感）；插棒随特效模式切换——
// 点阵（内场插棒即点阵屏，逐格写图案色）/ 潮汐（环形潮位起伏+变色）/ 波浪 / 常规
export function updateCrowd(group, elapsed, state) {
  const on = state ? state.lampBanks : true;
  const mode = on ? (state.audienceMode || 'normal') : 'off';
  const wave = state ? state.wave : null;
  const entries = group.userData.pixelEntries || [];
  const AP = DATA.concert.crowd.pixel;
  const W = DATA.concert.waveFx;
  const isFx = WAVE_FX_MODES.includes(mode);
  for (const child of group.children) {
    if (!child.isInstancedMesh || !child.userData.sway) continue;
    if (child.name.startsWith('pit-')) {
      child.visible = on;
      if (!on) continue;
      if (isFx) {
        // 人浪光效：内场插棒按列 u / 距边距离 s 逐支上色
        if (child.userData.fxOn && child.userData.fxOn !== mode && child.userData.fxOn !== 'normal') {
          resetWave(child);
        }
        applyWaveFxEntries(entries.filter((e) => e.mesh === child), mode, elapsed, W);
        dirtySticks(child);
        child.userData.fxOn = mode;
      } else if (mode === 'tide') {
        applyTideEntries(entries.filter((e) => e.mesh === child), elapsed);
        dirtySticks(child);
        child.userData.fxOn = 'tide';
      } else if (mode === 'pixel') {
        // 点阵屏：每帧按 (row,col) 写三档亮度 —— 主体 / 边缘 / 底光
        // 横向动效 = 绕中心的**有界往复摆动**（不再用 elapsed * scrollSpeed 单向漂移，
        // 否则几十秒后图案会歪到屏幕一侧并跨边界被回卷切断）
        const shift = state.pixelShift != null ? state.pixelShift
          : (state.pixelScroll === false ? 0
            : Math.round(AP.swayAmp * Math.sin((elapsed / AP.swayPeriod) * Math.PI * 2)));
        applyPixelEntries(entries.filter((e) => e.mesh === child), state.pixelPattern || 'heart', shift);
        dirtySticks(child);
        applySway(child, elapsed, 0.02, 0.010, 0.02);
        child.userData.fxOn = 'pixel';
      } else {
        if (child.userData.fxOn && child.userData.fxOn !== 'normal') resetWave(child);
        child.userData.fxOn = 'normal';
        if (wave) waveSway(child, elapsed, wave, 0.05, 0.025, 0.05, false);
        else applySway(child, elapsed, 0.05, 0.025, 0.05);
      }
    } else {
      if (wave) waveSway(child, elapsed, wave, 0.022, 0.010, 0.022, true, 0.8);
      else applySway(child, elapsed, 0.022, 0.010, 0.022, 0.8);
    }
  }
}

// ---------- Step 7 · 天空与 LED 环带 ----------
// 天空：大球渐变（uTop/uBottom 由 app.js 的时间驱动插值）
export function buildSky() {
  const A = DATA.atmosphere;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(A.nightTop) },
      uBottom: { value: new THREE.Color(A.nightBottom) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 uTop; uniform vec3 uBottom;
      void main(){ float h = clamp(vP.y / ${A.skyRadius.toFixed(1)} * 1.4 + 0.25, 0.0, 1.0);
      gl_FragColor = vec4(mix(uBottom, uTop, h), 1.0); }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(A.skyRadius, 32, 16), mat);
  sky.name = 'sky';
  sky.renderOrder = -10;
  return sky;
}

// LED 环带：屋盖内环下沿一圈发光管（时间驱动亮度，受 lightsOff 影响）
export function buildRibbon() {
  const A = DATA.atmosphere, R = S.roof;
  const pts = [];
  const n = 220;
  const superPt = (t, a, b) => {
    const c = Math.cos(t), s = Math.sin(t);
    const e = 2 / 3.5;
    return new THREE.Vector3(
      R.centerX + Math.sign(c) * Math.pow(Math.abs(c), e) * a,
      A.ribbonY,
      R.centerZ + Math.sign(s) * Math.pow(Math.abs(s), e) * b,
    );
  };
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push(superPt(t, R.innerHalfX + 1.5, R.innerHalfZ + 1.5));
  }
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0c0e14, emissive: A.ribbonColor, emissiveIntensity: A.ribbonIntensityNight, roughness: 0.5,
  });
  const ribbon = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 360, A.ribbonTubeR, 8, true), mat);
  ribbon.name = 'led-ribbon';
  return ribbon;
}

// ---------- 主唱歌手（41 骨骼 + 6 动画；台面上单人，AnimationMixer 驱动） ----------
export function buildSinger(gltf) {
  const SG = DATA.concert.singer;
  const g = new THREE.Group();
  g.name = 'singer';
  const V2 = DATA.concert.stageV2;
  const stageTop = S.groundY + 0.72 + V2.h; // 台面

  const model = gltf.scene;
  model.scale.setScalar(SG.scale);
  model.rotation.y = SG.faceYaw;
  model.position.set(SG.pos.x, stageTop, SG.pos.z);
  g.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    actions[clip.name] = action;
  }
  const fade = 0.35;
  let current = null;
  if (actions[SG.defaultClip]) {
    current = actions[SG.defaultClip];
    current.play();
  }

  // 主唱追光 + 近距补光（挂歌手组内；夜景保证人物可读）
  const spot = new THREE.SpotLight(0xfff2d8, SG.spotIntensity, 90, 0.24, 0.5, 1.6);
  spot.position.set(SG.pos.x, stageTop + 22, SG.pos.z + 24);
  spot.target.position.set(SG.pos.x, stageTop + 1, SG.pos.z);
  g.add(spot, spot.target);
  const fill = new THREE.PointLight(0xbfd4ff, SG.fillIntensity, 20, 1.4);
  fill.position.set(SG.pos.x + 3, stageTop + 4.5, SG.pos.z - 6); // 观众侧前上方
  g.add(fill);

  g.userData = {
    mixer, actions, currentName: current ? SG.defaultClip : null,
    play(name) {
      const next = actions[name];
      if (!next || name === g.userData.currentName) return false;
      if (current) current.fadeOut(fade);
      next.reset().fadeIn(fade).play();
      current = next;
      g.userData.currentName = name;
      return true;
    },
  };
  return g;
}

export function updateSinger(group, dt) {
  group.userData.mixer.update(dt);
}

// ---------- 伴奏乐队：舞台两侧的体素乐器 ----------
// 模型来自 sandbox/band-lab（Blender 体素建模 → glTF），已拷进 assets/band/。
// 每件乐器原点在底面中心、正面朝 -Z，所以摆位只需 (x, 台面高, z) + 绕 Y 偏航，无需再补偏移。
// 材质必须做三处修正（否则在主场馆光照下不可读）：
//   1) 无环境贴图 → metalness 高的银/铜件渲染成纯黑，压到 ≤ metalnessMax；
//   2) 近白材质（琴键）在近场补光下顶到 255 糊成白板，按固有色亮度等比压暗；
//   3) 加一点自发光底光，暗场里不只剩黑色剪影。
export function buildBand(gltfs, crowdGltfs) {
  const B = DATA.concert.band;
  const g = new THREE.Group();
  g.name = 'band';
  const deckY = B.deckY != null ? B.deckY : SA.deckTop + DATA.concert.stageV2.h;
  const items = [];

  gltfs.forEach((gltf, i) => {
    const lay = B.items[i];
    if (!gltf || !lay) return;
    const root = new THREE.Group();
    root.name = `band-${lay.id}`;
    const model = gltf.scene;
    model.scale.setScalar(B.scale);
    root.add(model);
    root.position.set(SA.cx + lay.x, deckY, lay.z);
    root.rotation.y = THREE.MathUtils.degToRad(lay.yaw);
    g.add(root);

    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, B.metalnessMax);
        if (m.roughness !== undefined) m.roughness = Math.max(B.roughnessMin, Math.min(1, m.roughness));
        m.envMapIntensity = 0.7;
        if (m.color) {
          const lum = 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b;
          if (lum > B.whiteLum) m.color.multiplyScalar(B.whiteMul);
        }
        if (m.emissive) {
          m.emissive.set(B.emissive);
          m.emissiveIntensity = B.emissiveIntensity;
        }
      }
      if (o.geometry) sanitizeNormals(o.geometry);
    });
    items.push({ id: lay.id, root, label: lay.label });
  });

  // 乐手：复用内场人模（crowd_a / crowd_b），站在各自乐器旁/后。
  // 人模 GLB 原点在身体中部（min.y ≈ -0.494），所以先按缩放后的包围盒把脚底落到台面，
  // 再按 yaw 转向观众；材质必须 clone —— 否则改 color 会连内场 1550 个人模一起变暗。
  const performers = [];
  const byModel = {};
  (crowdGltfs || []).forEach((gltf, i) => { if (gltf) byModel[i === 0 ? 'crowd_a' : 'crowd_b'] = gltf; });
  for (const spec of B.performers || []) {
    const src = byModel[spec.model];
    if (!src) continue;
    const root = new THREE.Group();
    root.name = `band-${spec.id}`;
    // 前倾支点：必须挂在脚底高度，否则绕身体中心转会把脚也甩出去（人会滑步）
    const leanPivot = new THREE.Group();
    leanPivot.name = `${root.name}-lean`;
    root.add(leanPivot);
    const model = src.scene.clone(true);
    model.scale.setScalar(B.performerScale);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = Array.isArray(o.material) ? mats.map(cloneBandMat) : cloneBandMat(mats[0]);
      if (o.geometry) sanitizeNormals(o.geometry);
    });
    // 脚底落地：包围盒在 root 局部空间算（此时尚未平移，只含缩放后的 model）
    const box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;
    leanPivot.add(model);
    // 上身前倾：绕**脚底**的 Z 轴旋转（在 root 局部空间里，人模正面朝 +X）。
    // 实测标定（tools/_lean2.mjs）：pivot.rotation.z = -lean 时头顶位移为 (0, -0.035, -0.332)，
    // 即朝世界 -Z = 朝观众方向压下去，正是"俯身演奏"的姿态；绕 X 轴转只会左右歪（dx=±0.333）。
    // 支点挂在脚底高度（leanPivot 原点 = root 原点 = 台面），否则绕身体中心转会把脚甩出去、人像在滑步。
    leanPivot.rotation.z = -THREE.MathUtils.degToRad(spec.lean || 0);
    root.position.set(SA.cx + spec.x, deckY, spec.z);
    root.rotation.y = THREE.MathUtils.degToRad(spec.yaw);
    // 前倾会让身体外缘越过脚底平面（12° 时最低点比台面低约 8cm，鞋会陷进台面）。
    // 用世界包围盒回补一次，保证最低点精确落在台面上。
    root.updateMatrixWorld(true);
    const wb = new THREE.Box3().setFromObject(root);
    root.position.y += deckY - wb.min.y;
    g.add(root);
    performers.push({
      id: spec.id, label: spec.label, root, leanPivot,
      baseYaw: THREE.MathUtils.degToRad(spec.yaw),
      baseY: root.position.y,   // 含前倾补偿后的落脚高度，updateBand 以此为基准做上下微浮
      baseLean: THREE.MathUtils.degToRad(spec.lean || 0),
      sway: spec.sway || B.performerSway,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // 乐队区补光：观众侧接近水平的窄锥 SpotLight，只擦过台面、主要打在乐器立面上。
  // （顶光点光会把 60×24m 台面整片照亮，实测台面 46→143，乐器反而被压掉）
  const F = B.fill;
  const fills = [];
  for (const spec of F.spots) {
    const l = new THREE.SpotLight(F.color, F.intensity, F.distance, F.angle, F.penumbra, F.decay);
    l.position.set(SA.cx + spec.x, deckY + F.lift, spec.z);
    l.target.position.set(SA.cx + spec.tx, deckY + F.aimLift, spec.tz);
    l.castShadow = false;
    g.add(l, l.target);
    fills.push({ light: l, base: F.intensity });
  }

  g.userData.items = items;
  g.userData.performers = performers;
  g.userData.fills = fills;
  g.userData.deckY = deckY;
  return g;
}

// 乐手材质：贴图接近白，在暖白近场补光下会整片溢出成白块，整体压暗一档；
// 压掉金属度（无环境贴图）保证衣服固有色在任何灯下都读得出来。
function cloneBandMat(src) {
  if (!src) return src;
  const B = DATA.concert.band;
  const m = src.clone();
  if (m.metalness !== undefined) m.metalness = 0;
  if (m.roughness !== undefined) m.roughness = 0.92;
  m.envMapIntensity = 0.7;
  if (m.color) m.color.multiplyScalar(B.performerColorMul);
  return m;
}

// 乐队补光随灯光状态缩放（与全场 dimmer / 灯组开关联动，避免乐队在暗场里"过曝独立"）
export function updateBand(group, elapsed, state) {
  const U = group.userData;
  const B = DATA.concert.band;
  // 底限 0.35：开场秀倒计时会把 dimmer 压到 0.2、灯组也会关掉，
  // 但乐队不能跟着全黑（那 6 件乐器是舞台布景的一部分，纯黑会显得舞台"缺了一块"）
  const k = Math.max(0.35, (state.dimmer ?? 1) * (state.lampBanks ? 1 : 0.55));
  for (const f of U.fills) f.light.intensity = f.base * k;
  // 乐手的「演奏」律动：三层叠加、频率互不相同，避免整体像机械人同步摆动。
  //   ① 前倾角呼吸（绕脚底 X 轴）：随节拍前后压身 —— 这是"在演奏"最关键的信号；
  //   ② 绕 Y 微转：身体跟着琴颈/鼓点轻摇；
  //   ③ 上下微浮：随重音顶一下。
  for (const p of U.performers) {
    const s = Math.sin(elapsed * p.sway + p.phase);
    const s2 = Math.sin(elapsed * p.sway * 2 + p.phase * 1.7);
    p.root.rotation.y = p.baseYaw + s * B.performerSwayYaw;
    p.root.position.y = p.baseY + Math.abs(s2) * B.performerSwayBob;
    if (p.leanPivot) {
      // 与静态前倾同一根轴（局部 Z），负角 = 朝观众压身
      p.leanPivot.rotation.z = -(p.baseLean + (0.5 + 0.5 * s2) * B.performerLeanAmp);
    }
  }
}

// 地坪顶面材质：Canvas 分格线 + 噪点
function deckMaterial(w, l, C) {
  const px = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.deckColor;
  ctx.fillRect(0, 0, px, px);
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
    ctx.fillRect(Math.random() * px, Math.random() * px, 2, 2);
  }
  ctx.strokeStyle = C.deckLineColor;
  ctx.lineWidth = 2;
  const nx = Math.max(2, Math.round(w / C.deckGrid));
  const nz = Math.max(2, Math.round(l / C.deckGrid));
  for (let i = 0; i <= nx; i++) {
    const x = (i / nx) * px;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, px); ctx.stroke();
  }
  for (let j = 0; j <= nz; j++) {
    const y = (j / nz) * px;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(px, y); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
}

// 隔离栏：四边双横杆 + 沿边立柱
function barrierFence(cx, xHalf, zMax, zMin, y0, C) {
  const fence = new THREE.Group();
  fence.name = 'barrier';
  const mat = new THREE.MeshStandardMaterial({ color: C.barrierColor, roughness: 0.4, metalness: 0.6 });
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, C.barrierHeight, 8);
  const spacing = 4;
  const sides = [
    { x0: cx - xHalf, x1: cx + xHalf, z: zMin },
    { x0: cx - xHalf, x1: cx + xHalf, z: zMax },
    { z0: zMin, z1: zMax, x: cx - xHalf },
    { z0: zMin, z1: zMax, x: cx + xHalf },
  ];
  const railYs = [C.barrierHeight * 0.45, C.barrierHeight * 0.9];
  for (const s of sides) {
    const isX = s.x0 !== undefined;
    const a = isX ? s.x0 : s.z0, b = isX ? s.x1 : s.z1;
    for (const ry of railYs) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(isX ? b - a : 0.08, 0.07, isX ? 0.08 : b - a), mat);
      rail.position.set(isX ? (a + b) / 2 : s.x, y0 + ry, isX ? s.z : (a + b) / 2);
      fence.add(rail);
    }
    const n = Math.max(2, Math.round((b - a) / spacing));
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n;
      const post = new THREE.Mesh(postGeo, mat);
      post.position.set(isX ? t : s.x, y0 + C.barrierHeight / 2, isX ? s.z : t);
      fence.add(post);
    }
  }
  return fence;
}
