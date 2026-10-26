// =====================================================================
// stage-lab.js — 海洋主题舞台 · 独立沙盒（阶段 A，不触碰项目文件）
// 与正式代码的对应关系：P（参数表）→ data.js，buildX() → stadium.js
// 坐标即项目坐标：舞台中轴 x=-32.4，台口 z=92，地坪顶 y=5.12，面向 -z
// QA：?view=front|hero|side|top|back|runway  &still=1 定帧  &cam=x,y,z&look=x,y,z&fov=n
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------- 锚点（与主项目 data.js 实测值一致，合入时直接引用 DATA） ----------
const A = {
  cx: -32.4,          // 草坪中心 x（舞台中轴）
  deckTop: 5.12,      // 保护地坪顶面（groundY 4.4 + 0.72）
  stageFrontZ: 92,    // 台口（面向 -z）
};

// ---------- 参数表（合入时原样搬进 data.js） ----------
const P = {
  stage: {
    width: 60, depth: 24, h: 2.2,
    color: 0x23262e, edgeColor: 0x4a5262,
    edgeGlowColor: 0x53e6ff, edgeGlowR: 0.1, edgeGlowI: 1.2,
  },
  steps: {
    tierN: 4, rise: 0.55, tread: 1.15, spanW: 34,
    color: 0x2a2e38, noseColor: 0x53e6ff, noseR: 0.07, noseI: 1.1,
  },
  screen: {
    w: 38, h: 16, cy: 16.8, z: 111.5, wallDepth: 1.6,
    wallColor: 0x0b0e18, artW: 1600, artH: 672, artSeed: 7,
    frameR: 0.3, frameColor: 0xdff2ff, frameI: 1.5, emissiveI: 0.95,
  },
  waves: {
    uSeg: 48, vSeg: 10, bulge: 0.7,
    dropletN: 90, dropletR: [0.08, 0.34],
    main: {
      // 浪脊（crest）与浪底（base）两条自设曲线，x 为相对中轴偏移
      crest: [[20, 6.5, 115], [27.5, 11, 108], [31.5, 14.5, 100], [30.5, 16.8, 93], [25.5, 14.5, 87.5]],
      base:  [[25, 0, 115.5], [31.5, 0, 108.5], [35, 0, 100], [34, 0, 92.5], [30, 0, 87.5]],
      color: 0x1e6fd0, opacity: 0.55, emissive: 0x0a4a8f, emissiveI: 0.5,
      crestR: 0.35, crestColor: 0xcfeeff, crestI: 1.7,
      baseR: 0.5, baseGlowColor: 0x35d5ff, baseGlowI: 1.5,
    },
    inner: {
      crest: [[23, 7.5, 112], [28.5, 12, 103], [29.5, 14.5, 95], [26, 12.5, 89.5]],
      base:  [[27, 0, 113], [32, 0, 104], [32.5, 0, 96], [28.5, 0, 89.5]],
      color: 0x2fa8e8, opacity: 0.32, emissive: 0x1177cc, emissiveI: 0.6,
      crestR: 0.26, crestColor: 0xe8f8ff, crestI: 1.9,
      baseR: 0.35, baseGlowColor: 0x45e0ff, baseGlowI: 1.3,
    },
  },
  rings: {
    z: 100, tubeR: 0.16, ringColor: 0xe8f7ff, ringI: 1.2,
    list: [
      { r: 13, y: 26.5, beadN: 28, beadR: 0.26, beadI: 1.8, hangers: 6 },
      { r: 8.5, y: 30.5, beadN: 20, beadR: 0.22, beadI: 1.7, hangers: 4 },
    ],
    hangerTopY: 42, hangerR: 0.06,
    // 光束方向：自外环向外下扫
    beamN: 10, beamDir: [0.85, -0.5, 0.85],
    beamPalette: [0x37c8ff, 0x6a8cff, 0x9a5cff],
    // 着色器光束（双层锥）：芯亮晕淡，边缘高斯衰减 + 长度耗散 + 尘埃流动噪声
    beam: {
      len: 34,
      core: { topR: 0.22, botR: 0.55, edgeK: 4.0, alpha: 0.5 },
      glow: { topR: 0.3, botR: 1.7, edgeK: 2.2, alpha: 0.16 },
      fadePow: 1.6,                 // 灯头→末端耗散指数
      dustAmp: 0.3, dustScale: 2.6, dustSpeed: 0.7,
    },
    headR: 0.28, headI: 3.2,        // 灯头亮球（Bloom 接管光晕）
    pool: { y: 0.06, r: 2.4, edgeK: 3.0, alpha: 0.2, dustAmp: 0.35 },  // 落地光池
    dust: { perBeam: 22, size: 0.5, alpha: 0.5, drift: 0.5, twinkleHz: 1.7 },  // 尘埃粒子
  },
  scene: {
    groundColor: 0x10151f, groundR: 260,
    skyTop: '#0a1024', skyBottom: '#16203c', skyR: 800,
    starN: 420, starSize: 1.5, starOpacity: 0.75,
    hemiSky: 0x8fb4ff, hemiGround: 0x0c1018, hemiI: 0.38,
    keyColor: 0xbfd4ff, keyI: 0.7,
    fillPos: [0, 20, 40], fillColor: 0x55aaff, fillI: 600, fillDist: 160,
    fogDensity: 0.0009,
    bloom: { strength: 0.38, radius: 0.4, threshold: 0.85 },
    exposure: 1.15,
  },
};

// ---------- QA 机位 ----------
const VIEWS = {
  front:  { cam: [A.cx, 9, 26],      look: [A.cx, 12, 104], fov: 55 },
  hero:   { cam: [A.cx + 34, 14, 28], look: [A.cx, 12, 100], fov: 50 },
  side:   { cam: [A.cx + 52, 10, 62], look: [A.cx + 10, 10, 98], fov: 50 },
  top:    { cam: [A.cx, 130, 58],    look: [A.cx, 0, 90],   fov: 45 },
  back:   { cam: [A.cx, 12, 142],    look: [A.cx, 12, 90],  fov: 50 },
  runway: { cam: [A.cx, 8, 20],      look: [A.cx, 8, 92],   fov: 62 },
};

// ---------- 基础场景 ----------
const Q = new URLSearchParams(location.search);
const infoEl = document.getElementById('info');
// JS 错误直接打到画面（headless 截图可见）
window.addEventListener('error', (e) => {
  infoEl.textContent = 'PAGE-ERR: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno;
});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = P.scene.exposure;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a1024, P.scene.fogDensity);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.495;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  P.scene.bloom.strength, P.scene.bloom.radius, P.scene.bloom.threshold,
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- 环境层 ----------
function buildGround() {
  const mat = new THREE.MeshStandardMaterial({ color: P.scene.groundColor, roughness: 0.88, metalness: 0 });
  const m = new THREE.Mesh(new THREE.CircleGeometry(P.scene.groundR, 64), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(A.cx, A.deckTop, 80);
  m.name = 'ground';
  return m;
}

function buildSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(P.scene.skyTop) },
      uBottom: { value: new THREE.Color(P.scene.skyBottom) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 uTop; uniform vec3 uBottom;
      void main(){ float h = clamp(vP.y / ${P.scene.skyR.toFixed(1)} * 1.4 + 0.25, 0.0, 1.0);
      gl_FragColor = vec4(mix(uBottom, uTop, h), 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(P.scene.skyR, 32, 16), mat);
  sky.renderOrder = -10;
  return sky;
}

function buildStars() {
  const pos = [];
  for (let i = 0; i < P.scene.starN; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(1 - Math.random() * 0.85); // 偏上半球
    const r = P.scene.skyR * 0.92;
    pos.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xcfe0ff, size: P.scene.starSize, sizeAttenuation: false,
    transparent: true, opacity: P.scene.starOpacity, depthWrite: false, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -9;
  return pts;
}

// ---------- 工具 ----------
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

// ---------- 部件 1 · 主舞台台面 + 台阶 ----------
function buildStageDeck() {
  const g = new THREE.Group();
  g.name = 'stage-deck-v2';
  const S = P.stage, ST = P.steps;
  const stageTop = A.deckTop + S.h;
  const zMid = A.stageFrontZ + S.depth / 2;

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(S.width, S.h, S.depth),
    new THREE.MeshStandardMaterial({ color: S.color, roughness: 0.8 }),
  );
  deck.position.set(A.cx, A.deckTop + S.h / 2, zMid);
  g.add(deck);

  // 台口发光描边（含两侧短边）
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x06121f, emissive: S.edgeGlowColor, emissiveIntensity: S.edgeGlowI, roughness: 0.4 });
  const nose = (x0, z0, x1, z1) => {
    const a = new THREE.Vector3(x0, stageTop + 0.06, z0), b = new THREE.Vector3(x1, stageTop + 0.06, z1);
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(S.edgeGlowR, S.edgeGlowR, len, 8), glowMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    g.add(m);
  };
  nose(A.cx - S.width / 2, A.stageFrontZ, A.cx + S.width / 2, A.stageFrontZ);

  // 台阶：台口中央整排（延伸台已移除）
  const stepMat = new THREE.MeshStandardMaterial({ color: ST.color, roughness: 0.85 });
  for (let i = 0; i < ST.tierN; i++) {
    const topY = A.deckTop + (i + 1) * ST.rise;
    const zc = A.stageFrontZ - ST.tread * (ST.tierN - i - 0.5);
    const step = new THREE.Mesh(new THREE.BoxGeometry(ST.spanW, ST.rise, ST.tread), stepMat);
    step.position.set(A.cx, topY - ST.rise / 2, zc);
    g.add(step);
    // 踏步沿口发光条
    const n = new THREE.Mesh(new THREE.BoxGeometry(ST.spanW, 0.05, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x06121f, emissive: ST.noseColor, emissiveIntensity: ST.noseI, roughness: 0.4 }));
    n.position.set(A.cx, topY + 0.02, zc - ST.tread / 2);
    g.add(n);
  }
  return g;
}

// ---------- 部件 2 · 胶囊形 LED 大屏 + 发光亮边 ----------
function buildScreen() {
  const SC = P.screen;
  const g = new THREE.Group();
  g.name = 'led-wall';
  const shape = capsuleShape(SC.w, SC.h);

  // 背衬墙体（挤出，深色）
  const wall = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: SC.wallDepth, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: SC.wallColor, roughness: 0.85, metalness: 0.2 }),
  );
  wall.rotation.y = Math.PI;               // 法线朝 -z；挤出体随之指向 +z（藏在屏后）
  wall.position.set(A.cx, SC.cy, SC.z + SC.wallDepth + 0.06);
  wall.name = 'screen-wall';
  g.add(wall);

  // 屏体（UV 重映射后贴月夜海面画面）
  const scrGeo = new THREE.ShapeGeometry(shape, 48);
  remapUV(scrGeo);
  const scr = new THREE.Mesh(scrGeo, screenMaterial(SC));
  scr.rotation.y = Math.PI;
  scr.position.set(A.cx, SC.cy, SC.z + 0.02);
  scr.name = 'led-main';
  g.add(scr);

  // 胶囊轮廓发光亮边
  const outline = shape.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0));
  const frameCurve = new THREE.CatmullRomCurve3(outline, true);
  const frame = tubeAlong(frameCurve, SC.frameR, SC.frameColor, SC.frameI, true, 240);
  frame.position.set(A.cx, SC.cy, SC.z - 0.05);
  frame.name = 'screen-frame';
  g.add(frame);
  return g;
}

function screenMaterial(SC) {
  const cv = document.createElement('canvas');
  cv.width = SC.artW; cv.height = SC.artH;
  const ctx = cv.getContext('2d');
  let s = SC.artSeed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cw = SC.artW, ch = SC.artH;

  // 天空渐变
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, '#060d28'); grad.addColorStop(0.42, '#0d2a63');
  grad.addColorStop(0.58, '#155099'); grad.addColorStop(1, '#0a2a5e');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, cw, ch);

  // 星
  for (let i = 0; i < 150; i++) {
    const a = 0.15 + rnd() * 0.65;
    ctx.fillStyle = `rgba(230,240,255,${a})`;
    const r = rnd() * 1.8 + 0.4;
    ctx.beginPath(); ctx.arc(rnd() * cw, rnd() * ch * 0.5, r, 0, Math.PI * 2); ctx.fill();
  }

  // 月 + 月晕
  const mx = cw * 0.5, my = ch * 0.28, mr = ch * 0.085;
  const halo = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 5);
  halo.addColorStop(0, 'rgba(235,245,255,0.55)');
  halo.addColorStop(0.35, 'rgba(160,200,255,0.18)');
  halo.addColorStop(1, 'rgba(160,200,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(mx, my, mr * 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4f9ff';
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();

  // 远景紫云带
  for (let i = 0; i < 5; i++) {
    const y = ch * (0.34 + rnd() * 0.14), w2 = cw * (0.14 + rnd() * 0.2);
    ctx.fillStyle = `hsla(258, 55%, ${28 + rnd() * 14}%, 0.24)`;
    ctx.beginPath(); ctx.ellipse(rnd() * cw, y, w2, ch * 0.022, 0, 0, Math.PI * 2); ctx.fill();
  }

  // 海面：6 层递进浪剪影
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

  // 月光倒影柱（抖动短横线）
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

  // 流光弧（右粉紫 / 左青）
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

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: SC.emissiveI, roughness: 0.6,
  });
}


// computeVertexNormals 对只参与退化三角形的顶点会得到零向量，
// 归一化时 1/0 → NaN 法线 → 受光片元 NaN → Bloom 把 NaN 扩散成整帧黑屏。
// 统一兜底：非有限或零长度法线替换为 +Y。
function sanitizeNormals(geo) {
  const n = geo.attributes.normal;
  if (!n) return;
  const UP = [0, 1, 0];
  let bad = 0;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z);
    if (!isFinite(x) || !isFinite(y) || !isFinite(z) || len < 1e-9) {
      n.setXYZ(i, UP[0], UP[1], UP[2]);
      bad++;
    }
  }
  if (bad > 0) console.warn(`[sanitizeNormals] fixed ${bad}/${n.count} bad normals on ${geo.uuid}`);
}

// ---------- 部件 4 · 两侧波浪雕塑 ----------
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

function buildWaveLayer(cfg, W) {
  const grp = new THREE.Group();
  // 注意：这里用相对中轴坐标（x 不加 A.cx），镜像/定位由外层组负责
  const curveC = catmull(cfg.crest.map(([x, y, z]) => [x, A.deckTop + y, z]));
  const curveB = catmull(cfg.base.map(([x, , z]) => [x, A.deckTop, z]));

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: cfg.color, transparent: true, opacity: cfg.opacity,
    roughness: 0.3, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.4,
    emissive: cfg.emissive, emissiveIntensity: cfg.emissiveI,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const body = new THREE.Mesh(
    waveSheetGeometry(curveC, curveB, W.uSeg, W.vSeg, W.bulge), bodyMat,
  );
  body.renderOrder = 8;
  body.name = 'wave-body';
  grp.add(body);

  // 浪尖泡沫亮边 + 浪底发光水线
  const crest = tubeAlong(curveC, cfg.crestR, cfg.crestColor, cfg.crestI, false, 140);
  crest.name = 'wave-crest';
  const base = tubeAlong(curveB, cfg.baseR, cfg.baseGlowColor, cfg.baseGlowI, false, 140);
  base.name = 'wave-base';
  grp.add(crest, base);

  // 浪尖液滴（InstancedMesh）
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

function buildWaves() {
  const W = P.waves;
  const g = new THREE.Group();
  g.name = 'waves';
  const right = new THREE.Group();
  right.add(buildWaveLayer(W.main, W), buildWaveLayer(W.inner, W));
  right.position.x = A.cx;
  right.name = 'wave-R';
  const left = right.clone(true);
  left.scale.x = -1;
  left.name = 'wave-L';
  g.add(right, left);
  return g;
}

// ---------- 部件 5 · 顶部环形灯架 ----------
function buildRings() {
  const R = P.rings;
  const g = new THREE.Group();
  g.name = 'ring-lights';
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x0c0e14, emissive: R.ringColor, emissiveIntensity: R.ringI, roughness: 0.5 });
  const beadMat = new THREE.MeshStandardMaterial({ color: 0x101014, emissive: 0xffffff, emissiveIntensity: 2.4, roughness: 0.4 });
  const hangMat = new THREE.MeshStandardMaterial({ color: 0x39404e, roughness: 0.5, metalness: 0.7 });

  for (const cfg of R.list) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(cfg.r, R.tubeR, 10, 96), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(A.cx, cfg.y, R.z);
    g.add(ring);
    for (let i = 0; i < cfg.beadN; i++) {
      const a = (i / cfg.beadN) * Math.PI * 2;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(cfg.beadR, 10, 8), beadMat);
      bead.position.set(A.cx + Math.cos(a) * cfg.r, cfg.y, R.z + Math.sin(a) * cfg.r);
      g.add(bead);
    }
    for (let i = 0; i < cfg.hangers; i++) {
      const a = (i / cfg.hangers) * Math.PI * 2 + Math.PI / cfg.hangers;
      const h = R.hangerTopY - cfg.y;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(R.hangerR, R.hangerR, h, 6), hangMat);
      rod.position.set(A.cx + Math.cos(a) * cfg.r, cfg.y + h / 2, R.z + Math.sin(a) * cfg.r);
      g.add(rod);
    }
  }

  // 着色器光束：双层锥（芯 + 晕）+ 灯头亮球 + 落地光池 + 尘埃粒子
  const outer = R.list[0];
  const B = R.beam;
  const beamUniforms = [];   // 每束光的 uniforms（uTime 共享引用）
  const sharedTime = { value: 0 };
  const mkBeamUniforms = (colorHex, alpha) => ({
    uColor: { value: new THREE.Color(colorHex) },
    uAlpha: { value: alpha },
    uTime: sharedTime,
  });

  for (let i = 0; i < R.beamN; i++) {
    const a = (i / R.beamN) * Math.PI * 2;
    const color = R.beamPalette[i % R.beamPalette.length];
    const dir = new THREE.Vector3(R.beamDir[0] * Math.cos(a), R.beamDir[1], R.beamDir[2] * Math.sin(a)).normalize();
    const ox = A.cx + Math.cos(a) * outer.r, oy = outer.y, oz = R.z + Math.sin(a) * outer.r;
    const origin = new THREE.Vector3(ox, oy, oz);

    for (const layer of [B.core, B.glow]) {
      const u = {
        ...mkBeamUniforms(color, layer.alpha),
        uTopR: { value: layer.topR },
        uBotR: { value: layer.botR },
        uEdgeK: { value: layer.edgeK },
        uFadePow: { value: B.fadePow },
        uDustAmp: { value: B.dustAmp },
        uDustScale: { value: B.dustScale },
        uDustSpeed: { value: B.dustSpeed },
      };
      beamUniforms.push(u);
      const mat = beamMaterial(u);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(layer.topR, layer.botR, B.len, 16, 1, true), mat);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
      beam.position.set(ox + dir.x * B.len / 2, oy + dir.y * B.len / 2, oz + dir.z * B.len / 2);
      beam.renderOrder = 20;
      beam.name = 'beam';
      if (!hide.has('beams')) g.add(beam);
    }

    // 灯头亮球（Bloom 接管光晕）
    const head = new THREE.Mesh(new THREE.SphereGeometry(R.headR, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x101014, emissive: color, emissiveIntensity: R.headI, roughness: 0.4 }));
    head.position.copy(origin);
    if (!hide.has('beams')) g.add(head);

    // 落地光池：光束延伸至地面处的径向渐变椭圆（沿光束方向压扁）
    if (!hide.has('pools')) {
      const t = (A.deckTop - oy) / dir.y;                 // 与地面相交参数（dir.y < 0）
      if (t > 0 && t < B.len * 2.2) {
        const hit = origin.clone().addScaledVector(dir, t);
        const u = {
          uColor: { value: new THREE.Color(color) },
          uAlpha: { value: R.pool.alpha },
          uEdgeK: { value: R.pool.edgeK },
          uDustAmp: { value: R.pool.dustAmp },
          uDustScale: { value: B.dustScale },
          uDustSpeed: { value: B.dustSpeed },
          uTime: sharedTime,
        };
        beamUniforms.push(u);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(R.pool.r, 32), poolMaterial(u));
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(hit.x, A.deckTop + R.pool.y, hit.z);
        pool.renderOrder = 19;
        pool.name = 'beam-pool';
        g.add(pool);
      }
    }
  }

  // 尘埃粒子：每束光锥内散点，沿光束方向漂移 + 微闪（一个 Points 管全部）
  if (!hide.has('dust')) {
    const N = R.beamN * R.dust.perBeam;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N * 2);   // [相位, 0]
    const colors = new Float32Array(N * 3); // 自定义 aColor（避开内置 vertexColors 注入）
    const tmpC = new THREE.Color();
    let k = 0;
    for (let i = 0; i < R.beamN; i++) {
      const a = (i / R.beamN) * Math.PI * 2;
      const dir = new THREE.Vector3(R.beamDir[0] * Math.cos(a), R.beamDir[1], R.beamDir[2] * Math.sin(a)).normalize();
      const ox = A.cx + Math.cos(a) * outer.r, oy = outer.y, oz = R.z + Math.sin(a) * outer.r;
      tmpC.set(R.beamPalette[i % R.beamPalette.length]);
      // 垂直于 dir 的正交基（径向平面）
      const side = new THREE.Vector3().crossVectors(dir,
        Math.abs(dir.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      const up2 = new THREE.Vector3().crossVectors(side, dir).normalize();
      for (let j = 0; j < R.dust.perBeam; j++, k++) {
        const t = Math.random();                                   // 沿光束 0..1
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
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
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
          p.y -= uDrift * fract(uTime * 0.14 + aSeed.x);   // 沿光束向下缓慢漂移（循环）
          p.y += uDrift * 0.5;                             // 居中漂移区间
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
    const dust = new THREE.Points(geo, dustMat);
    dust.name = 'beam-dust';
    dust.renderOrder = 21;
    dust.frustumCulled = false;
    g.add(dust);
  }

  g.userData.sharedTime = sharedTime;
  return g;
}

// 光束着色器：alpha = 边缘高斯衰减 × 长度耗散 × 尘埃流动噪声
// vY: 0=灯头端 → 1=末端；vR: 归一化径向距离（0=轴线 → 1=锥面）
// 锥体局部 +Y 指向灯头（quaternion 把 +Y 旋到 -dir），故 vY = 1-uv.y，
// 该高度半径 = mix(uTopR, uBotR, 1-uv.y)（CylinderGeometry uv.y=1 为 +Y 端）
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
        float edge = exp(-uEdgeK * vR * vR);              // 轴线亮 → 边缘软衰减
        float fade = pow(max(0.0, 1.0 - vY), uFadePow);   // 灯头 → 末端耗散
        float n = noise(vec2(vY * uDustScale - uTime * uDustSpeed, vAng * 1.6 + vY * 0.7));
        float dust = 1.0 - uDustAmp * 0.5 + uDustAmp * (n - 0.5);  // 尘埃流光（±amp/2）
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
        vUv = uv * 2.0 - 1.0;   // CircleGeometry uv ∈ [0,1] → 以圆心为原点
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

// ---------- 组装 ----------
const hide = new Set((Q.get('no') || '').split(',').filter(Boolean));
const maybe = (obj, key) => { if (hide.has(key)) obj.visible = false; return obj; };

scene.add(maybe(buildSky(), 'sky'));
scene.add(maybe(buildStars(), 'stars'));
scene.add(maybe(buildGround(), 'ground'));
const stageRoot = new THREE.Group();
stageRoot.name = 'stage';
stageRoot.add(maybe(buildStageDeck(), 'deck'));
stageRoot.add(maybe(buildScreen(), 'screen'));
stageRoot.add(maybe(buildWaves(), 'waves'));
stageRoot.add(maybe(buildRings(), 'rings'));
scene.add(stageRoot);

scene.add(new THREE.HemisphereLight(P.scene.hemiSky, P.scene.hemiGround, P.scene.hemiI));
const key = new THREE.DirectionalLight(P.scene.keyColor, P.scene.keyI);
key.position.set(A.cx - 60, 90, 20);
key.target.position.set(A.cx, A.deckTop, 100);
scene.add(key, key.target);
const fill = new THREE.PointLight(P.scene.fillColor, P.scene.fillI, P.scene.fillDist, 1.8);
fill.position.set(A.cx + P.scene.fillPos[0], A.deckTop + P.scene.fillPos[1], P.scene.fillPos[2] + 40);
scene.add(fill);

// ---------- 初始机位 / 定帧 ----------
const VIEWS_MAP = VIEWS;
if (Q.get('bg')) scene.background = new THREE.Color(Q.get('bg'));
if (Q.get('diag') === '1') {
  setTimeout(() => {
    const box = new THREE.Box3();
    scene.traverse((o) => {
      if (o.isMesh || o.isPoints) {
        box.setFromObject(o);
        const c = box.getCenter(new THREE.Vector3());
        const sz = box.getSize(new THREE.Vector3());
        console.log(`[diag] ${o.name || o.type} vis=${o.visible} center=(${c.x.toFixed(0)},${c.y.toFixed(0)},${c.z.toFixed(0)}) size=(${sz.x.toFixed(0)},${sz.y.toFixed(0)},${sz.z.toFixed(0)})`);
      }
    });
    console.log(`[diag] cam=${camera.position.toArray().map((n) => n.toFixed(1))} look=${controls.target.toArray().map((n) => n.toFixed(1))} fog=${scene.fog.density}`);
  }, 400);
}
function applyCamera() {
  const camStr = Q.get('cam'), lookStr = Q.get('look');
  if (camStr && lookStr) {
    camera.position.fromArray(camStr.split(',').map(Number));
    controls.target.fromArray(lookStr.split(',').map(Number));
    const fov = parseFloat(Q.get('fov'));
    if (isFinite(fov)) camera.fov = fov;
  } else {
    const v = VIEWS_MAP[Q.get('view')] || VIEWS_MAP.hero;
    camera.position.fromArray(v.cam);
    controls.target.fromArray(v.look);
    camera.fov = v.fov;
  }
  camera.updateProjectionMatrix();
  controls.update();
  infoEl.textContent =
    `stage-lab · view=${Q.get('view') || 'hero'}\n` +
    `cam=${camera.position.toArray().map((n) => n.toFixed(1)).join(',')}\n` +
    `look=${controls.target.toArray().map((n) => n.toFixed(1)).join(',')}\n` +
    `fov=${camera.fov.toFixed(0)}`;
}
applyCamera();

// ---------- 循环 ----------
const stillMode = Q.get('still') === '1';
let frames = 0;
const clock = new THREE.Clock();
let elapsed = 0;
const ringsGroup = stageRoot.getObjectByName('ring-lights');
function tick() {
  const dt = clock.getDelta();
  elapsed += dt;
  if (ringsGroup && ringsGroup.userData.sharedTime) {
    ringsGroup.userData.sharedTime.value = elapsed;
  }
  controls.update();
  composer.render();
  frames++;
  if (stillMode && frames >= 8) return;
  requestAnimationFrame(tick);
}
tick();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

window.__lab = { THREE, scene, camera, controls, P, A, VIEWS: VIEWS_MAP };
