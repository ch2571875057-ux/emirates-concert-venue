// =====================================================================
// stadium.js — GLB 改造层 + 演唱会设备（按 build* 分块，逐层施工）
// Step 1 · 删球门 / 删照片地面与校园外围 / 程序化地面
// Step 2 · 演唱会内场：保护地坪 + 站区分块 + 隔离栏
// Step 6v2 · 观众：看台应援棒按实测剖面（standProfile.js）+ 内场人模
// =====================================================================
import * as THREE from 'three';
import { DATA } from './data.js';
import { STAND_PROFILE } from './standProfile.js';
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
  group.add(buildStage());
  group.add(buildSound());
  group.add(buildLights());
  group.add(buildAudience());
  group.add(buildSky());
  group.add(buildRibbon());
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

// ---------- Step 3 · 主舞台 + 延伸台 ----------
export function buildStage() {
  const C = DATA.concert, p = S.pitch;
  const cx = p.center.x;
  const deckTop = S.groundY + 0.72;
  const stageTop = deckTop + C.stageDeckY;                 // 台面标高
  const stageBack = C.stageFrontZ + C.stageDepth;

  const g = new THREE.Group();
  g.name = 'stage';

  // 1) 台体（箱体，前缘加描边）
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(C.stageWidth, C.stageDeckY, C.stageDepth),
    new THREE.MeshStandardMaterial({ color: C.stageColor, roughness: 0.8 }),
  );
  deck.position.set(cx, deckTop + C.stageDeckY / 2, (C.stageFrontZ + stageBack) / 2);
  deck.name = 'stage-deck';
  g.add(deck);
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(C.stageWidth, 0.12, 0.35),
    new THREE.MeshStandardMaterial({ color: C.stageEdgeColor, roughness: 0.6 }),
  );
  trim.position.set(cx, stageTop + 0.02, C.stageFrontZ + 0.1);
  g.add(trim);

  // 2) 背墙 + 主屏（严格 2:1，立于台面）+ 两侧翼屏
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(C.stageWidth, C.backWallHeight, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.85 }),
  );
  wall.position.set(cx, stageTop + C.backWallHeight / 2, C.backWallZ);
  wall.name = 'back-wall';
  g.add(wall);

  const ledMain = new THREE.Mesh(
    new THREE.PlaneGeometry(C.ledMainWidth, C.ledMainHeight),
    ledMaterial(C.ledMainWidth, C.ledMainHeight, 'main'),
  );
  ledMain.position.set(cx, stageTop + C.ledMainHeight / 2, C.backWallZ - 0.65);
  ledMain.rotation.y = Math.PI; // 面向 -z 观众
  ledMain.name = 'led-main';
  g.add(ledMain);
  g.userData.ledMainMat = ledMain.material; // 开场秀倒计时重绘用

  for (const sgn of [-1, 1]) {
    const wing = new THREE.Mesh(
      new THREE.PlaneGeometry(C.ledSideWidth, C.ledSideHeight),
      ledMaterial(C.ledSideWidth, C.ledSideHeight, 'side'),
    );
    wing.position.set(cx + sgn * C.ledSideX, stageTop + 5.5, C.ledSideZ);
    wing.rotation.y = Math.PI + sgn * -0.35; // 内八字朝向观众
    wing.name = sgn < 0 ? 'led-side-L' : 'led-side-R';
    g.add(wing);
  }

  // 3) 拱形桁架（椭圆拱 + 内拱 + 加劲杆）
  g.add(archTruss(cx, stageTop, C));

  // 4) 延伸台 + 尽端圆台
  const runTop = deckTop + C.runwayY;
  const runway = new THREE.Mesh(
    new THREE.BoxGeometry(C.runwayWidth, C.runwayY, C.runwayLength),
    new THREE.MeshStandardMaterial({ color: C.stageColor, roughness: 0.8 }),
  );
  runway.position.set(cx, deckTop + C.runwayY / 2, C.stageFrontZ - C.runwayLength / 2);
  runway.name = 'runway';
  g.add(runway);
  const bstage = new THREE.Mesh(
    new THREE.CylinderGeometry(C.bStage.radius, C.bStage.radius, C.runwayY, 48),
    new THREE.MeshStandardMaterial({ color: C.stageColor, roughness: 0.8 }),
  );
  bstage.position.set(cx, deckTop + C.runwayY / 2, C.bStage.z);
  bstage.name = 'b-stage';
  g.add(bstage);
  const bEdge = new THREE.Mesh(
    new THREE.TorusGeometry(C.bStage.radius, 0.1, 8, 64),
    new THREE.MeshStandardMaterial({ color: C.stageEdgeColor, roughness: 0.6 }),
  );
  bEdge.rotation.x = Math.PI / 2;
  bEdge.position.set(cx, runTop, C.bStage.z);
  g.add(bEdge);

  return g;
}

// 椭圆拱桁架：外拱 + 内拱（0.92 缩放）+ 径向加劲杆
function archTruss(cx, stageTop, C) {
  const arch = new THREE.Group();
  arch.name = 'arch-truss';
  const mat = new THREE.MeshStandardMaterial({ color: C.trussColor, roughness: 0.45, metalness: 0.7 });
  const pt = (t, k) => new THREE.Vector3(
    cx + k * C.archRadius * Math.cos(t),
    stageTop + k * C.archTopY * Math.sin(t),
    C.archLegZ,
  );
  const sample = (k) => {
    const pts = [];
    const n = 48;
    for (let i = 0; i <= n; i++) pts.push(pt((i / n) * Math.PI, k));
    return new THREE.CatmullRomCurve3(pts);
  };
  for (const k of [1, 0.92]) {
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(sample(k), 64, C.archTubeR, 10),
      mat,
    );
    arch.add(tube);
  }
  const nR = C.rungsPerQuarter * 4;
  const rungGeo = new THREE.CylinderGeometry(C.archTubeR * 0.55, C.archTubeR * 0.55, 1, 6);
  for (let i = 1; i < nR; i++) {
    const t = (i / nR) * Math.PI;
    const a = pt(t, 1), b = pt(t, 0.92);
    const rung = new THREE.Mesh(rungGeo, mat);
    rung.position.copy(a).add(b).multiplyScalar(0.5);
    rung.scale.y = a.distanceTo(b);
    rung.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
    arch.add(rung);
  }
  return arch;
}

// LED 屏内容（Canvas 2D 生成，emissive 自发光）
function ledMaterial(w, h, kind) {
  const cw = kind === 'main' ? 1024 : 512;
  const ch = kind === 'main' ? 512 : 384;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  paintLedBase(ctx, cw, ch);
  paintLedText(ctx, cw, ch, kind);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.15,
    roughness: 0.6,
  });
  mat.userData = { cv, ctx, kind, tex }; // 句柄供开场秀重绘（倒计时/恢复）
  return mat;
}

function paintLedBase(ctx, cw, ch) {
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, '#1a1040');
  grad.addColorStop(0.55, '#3d1560');
  grad.addColorStop(1, '#0c1030');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * cw, y = ch * 0.15 + Math.random() * ch * 0.7;
    const r = 20 + Math.random() * 90;
    const rg = ctx.createRadialGradient(x, y, 2, x, y, r);
    rg.addColorStop(0, `hsla(${Math.random() * 360}, 90%, 65%, 0.55)`);
    rg.addColorStop(1, 'transparent');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

function paintLedText(ctx, cw, ch, kind) {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#7fb4ff';
  ctx.shadowBlur = 24;
  if (kind === 'main') {
    ctx.font = 'bold 120px Arial';
    ctx.fillText('LIVE IN CONCERT', cw / 2, ch * 0.56);
    ctx.font = '60px Arial';
    ctx.fillText('EMIRATES STADIUM', cw / 2, ch * 0.78);
  } else {
    ctx.font = 'bold 90px Arial';
    ctx.fillText('LIVE', cw / 2, ch * 0.6);
  }
  ctx.shadowBlur = 0;
}

// 开场秀重绘：mode 'countdown'（value=数字）| 'live'（恢复演出内容）
export function drawLED(mat, mode, value) {
  const { cv, ctx, kind, tex } = mat.userData;
  const cw = cv.width, ch = cv.height;
  paintLedBase(ctx, cw, ch);
  ctx.textAlign = 'center';
  if (mode === 'countdown') {
    ctx.shadowColor = '#ff4d5e';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#ff8a94';
    ctx.font = `bold ${Math.round(ch * 0.62)}px Arial`;
    ctx.fillText(String(value), cw / 2, ch * 0.62);
  } else {
    paintLedText(ctx, cw, ch, kind);
  }
  ctx.shadowBlur = 0;
  tex.needsUpdate = true;
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

// ---------- Step 5 · 灯光系统 ----------
// 解耦约束（范式 Step 8）：灯组只读 lampBanks；lightsOff 只影响立面/泛光（Step 7）。
export function buildLights() {
  const C = DATA.concert, L = C.lights, p = S.pitch;
  const cx = p.center.x;
  const deckTop = S.groundY + 0.72;
  const stageTop = deckTop + C.stageDeckY;
  const g = new THREE.Group();
  g.name = 'stage-lights';
  const units = [];

  const beamGeo = new THREE.CylinderGeometry(L.beamTopR, L.beamBottomR, L.beamLength, 12, 1, true);
  const headGeo = new THREE.BoxGeometry(L.headSize, L.headSize * 0.7, L.headSize);

  const addUnit = (x, y, z, color, dir) => {
    const d = dir.clone().normalize();
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x101014, emissive: color, emissiveIntensity: 2.0, roughness: 0.5,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(x, y, z);
    head.lookAt(x + d.x, y + d.y, z + d.z);
    const beamMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().negate());
    beam.position.set(x + d.x * L.beamLength / 2, y + d.y * L.beamLength / 2, z + d.z * L.beamLength / 2);
    g.add(head, beam);
    units.push({ headMat, beamMat, beam, seed: Math.random() });
  };

  // 1) 拱桁架摇头灯：沿外拱弧布置，光束向外/向观众上方扫
  for (let i = 0; i < L.archLights; i++) {
    const t = Math.PI * (0.06 + 0.88 * (i / (L.archLights - 1)));
    const x = cx + C.archRadius * Math.cos(t);
    const y = stageTop + C.archTopY * Math.sin(t) - 0.6;
    const color = L.palette[i % L.palette.length];
    const dir = new THREE.Vector3(Math.cos(t) * 0.85, -0.15, -0.5);
    addUnit(x, y, C.archLegZ, color, dir);
  }
  // 2) 舞台前沿脚灯：朝前上打
  for (let i = 0; i < L.frontLights; i++) {
    const fx = C.stageWidth - 6;
    const x = cx - fx / 2 + (fx * i) / (L.frontLights - 1);
    const color = L.palette[(i + 3) % L.palette.length];
    addUnit(x, stageTop + 0.25, C.stageFrontZ - 0.3, color, new THREE.Vector3(0, 0.72, -0.7));
  }
  // 3) B 台环形灯：四盏朝外上
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const color = L.palette[(i + 1) % L.palette.length];
    addUnit(
      cx + Math.cos(a) * (C.bStage.radius + 1), deckTop + 1.6, C.bStage.z + Math.sin(a) * (C.bStage.radius + 1),
      color, new THREE.Vector3(Math.cos(a), 0.8, Math.sin(a)),
    );
  }
  // 4) 真实聚光灯（少量）：舞台两盏 + B 台两盏，随 lampBanks 联锁
  const spots = [];
  const mkSpot = (px, pz, tx, tz) => {
    const s = new THREE.SpotLight(L.realSpotColor, 900, 90, 0.38, 0.55, 1.6);
    s.position.set(cx + px, stageTop + 17, pz);
    s.target.position.set(cx + tx, deckTop, tz);
    g.add(s, s.target);
    spots.push(s);
  };
  mkSpot(-14, C.archLegZ + 2, -10, C.stageFrontZ + 6);
  mkSpot(14, C.archLegZ + 2, 10, C.stageFrontZ + 6);
  mkSpot(-12, 28, 0, C.bStage.z);
  mkSpot(12, 28, 0, C.bStage.z);

  g.userData.units = units;
  g.userData.spots = spots;
  return g;
}

// 灯组更新：mode = steady | strobe | sweep；lampBanks 为灯组总开关（与 lightsOff 无关）
export function updateLights(group, elapsed, state) {
  const L = DATA.concert.lights;
  const { units, spots } = group.userData;
  const dim = state.dimmer ?? 1; // 开场秀总闸（P3 光束退场用）
  const on = state.lampBanks;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    let k = 1;
    if (state.mode === 'strobe') {
      k = Math.sin(elapsed * L.strobeHz * Math.PI * 2 + u.seed * 97) > 0.25 ? 1 : 0.1;
    } else if (state.mode === 'sweep') {
      k = ((elapsed * L.sweepSpeed + i / units.length) % 1) < L.sweepDuty ? 1 : 0.06;
    } else {
      k = 0.85 + 0.15 * Math.sin(elapsed * 1.7 + u.seed * 31); // 常亮微呼吸
    }
    if (!on) k = 0;
    k *= dim;
    u.beam.visible = k > 0.01;
    u.beamMat.opacity = 0.34 * k;
    u.headMat.emissiveIntensity = 0.15 + 2.1 * k;
  }
  for (const s of spots) {
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

export function updateAudience(group, elapsed, state) {
  const A = DATA.concert.audience;
  const u = group.userData;
  const on = state.lampBanks;
  const pulse = 0.85 + 0.15 * Math.sin(elapsed * A.pulseSpeed);
  u.glowMats.forEach((m, i) => {
    m.emissiveIntensity = on ? u.baseGlow[i] * pulse : 0.05;
  });
  u.sqMat.opacity = on ? A.squares.opacity * (0.7 + 0.3 * pulse) : 0;
  u.cylInst.visible = on;
  u.crabInst.visible = on;
  u.sqInst.visible = on;
  if (on) {
    if (state.wave) {
      // 开场秀波浪：亮度波沿看台径向传播（setColorAt 逐实例）+ 摇摆随波峰增幅
      waveSway(u.cylInst, elapsed, state.wave, 0.055, 0.028, 0.055, false);
      waveSway(u.crabInst, elapsed, state.wave, 0.065, 0.032, 0.065, false);
      u.waveWasOn = true;
    } else {
      if (u.waveWasOn) { resetWave(u.cylInst); resetWave(u.crabInst); u.waveWasOn = false; }
      applySway(u.cylInst, elapsed, 0.055, 0.028, 0.055);
      applySway(u.crabInst, elapsed, 0.065, 0.032, 0.065);
    }
  }
  // 小方片起伏旋转
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  const V = new THREE.Vector3(), SV = new THREE.Vector3(1, 1, 1);
  const t = elapsed * A.squares.bobSpeed;
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

  // 1) 网格落点（行沿 z 面向舞台，列沿 x；避让延伸台/B 台的格子跳过）
  const spots = [];
  const runwayHalf = C.runwayWidth / 2 + CR.avoidRunwayPad;
  const runwayZMin = C.stageFrontZ - C.runwayLength, runwayZMax = C.stageFrontZ;
  for (let b = 0; b < C.pitBlocks; b++) {
    const zMax = C.pitFirstRowZ - b * (C.pitBlockDepth + C.pitBlockGap);
    const x0 = p.center.x - C.pitWidth / 2 + CR.blockMargin;
    const x1 = p.center.x + C.pitWidth / 2 - CR.blockMargin;
    const z0 = zMax - C.pitBlockDepth + CR.blockMargin;
    const z1 = zMax - CR.blockMargin;
    const cols = Math.floor((x1 - x0) / CR.colSpacing);
    const rows = Math.floor((z1 - z0) / CR.rowSpacing);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + (cols === 1 ? (x1 - x0) / 2 : ((x1 - x0) * c) / (cols - 1))
          + (Math.random() * 2 - 1) * CR.colJitter;
        const z = z0 + (rows === 1 ? (z1 - z0) / 2 : ((z1 - z0) * r) / (rows - 1))
          + (Math.random() * 2 - 1) * CR.rowJitter;
        if (z >= runwayZMin && z <= runwayZMax && Math.abs(x - p.center.x) < runwayHalf) continue;
        if (Math.hypot(x - p.center.x, z - C.bStage.z) < C.bStage.radius + CR.avoidBStagePad) continue;
        spots.push({
          x, z,
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
  const PS = CR.pitStick;
  const stageX = p.center.x, stageZ = S.goalLineSouthZ + 6;
  const pitCylSpots = [], pitClawSpots = [];
  for (const sp of spots) {
    const fx = Math.cos(sp.yaw), fz = -Math.sin(sp.yaw); // 人模朝向（原生 +x 经 yaw）
    const rx = -fz, rz = fx;                             // 人模右手侧
    const front = Math.random() < 0.5;
    const x = sp.x + (front ? fx * PS.frontOffset : rx * PS.rightOffset) + (Math.random() * 2 - 1) * 0.06;
    const z = sp.z + (front ? fz * PS.frontOffset : rz * PS.rightOffset) + (Math.random() * 2 - 1) * 0.06;
    const base = { x, z, y: blockTop, tiltX: (Math.random() * 2 - 1) * PS.tiltMax };
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

  g.userData.count = spots.length;
  console.log('[crowd] instances:', spots.length, '| pit sticks:', pitCylSpots.length + pitClawSpots.length);
  return g;
}

// 内场更新：人模微晃（呼吸/踮步感）；插地应援棒摇摆幅度与看台一致，受灯组开关联锁；
// 开场秀波浪时人模只增幅摇摆（保 tint 色），插棒亮波 + 摇摆
export function updateCrowd(group, elapsed, state) {
  const on = state ? state.lampBanks : true;
  const wave = state ? state.wave : null;
  for (const child of group.children) {
    if (!child.isInstancedMesh || !child.userData.sway) continue;
    if (child.name.startsWith('pit-')) {
      child.visible = on;
      if (on) {
        if (wave) waveSway(child, elapsed, wave, 0.05, 0.025, 0.05, false);
        else {
          if (child.userData.waveOn) { resetWave(child); child.userData.waveOn = false; }
          applySway(child, elapsed, 0.05, 0.025, 0.05);
        }
        child.userData.waveOn = !!wave;
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
