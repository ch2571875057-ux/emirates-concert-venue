// =====================================================================
// holo.js — 全息投影（舞台前沿的 Q 版吉祥物）
//
// 设计要点：
//   1. 模型只有一个 mesh / 一个材质 / 一张贴图，无动画无骨骼 —— 所以全部「动」
//      都靠材质 uniform 与节点 transform 做，不碰 geometry。
//   2. 材质换成自写 ShaderMaterial：冷蓝重映射 + 水平扫描线 + 自下而上的流动亮带
//      + 菲涅尔边缘 + 轻微 uv 抖动。**不用 AdditiveBlending**（白衣服会被 bloom
//      洗成纯白），用 NormalBlending + 较低 opacity 才像「悬浮的投影」。
//   3. 显形扫描按「模型局部高度」而不是 uv.y —— glTF 的 uv 是贴图坐标，与身高无关。
//   4. 状态机：hidden → pillar → materialize → (idle/pulse/rise/spin/push/center)
//      → fly → docked。每帧只写 uniform 与 transform，不分配对象。
// =====================================================================
import * as THREE from 'three';

const TAU = Math.PI * 2;
const smooth = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

// 姿态 → 目标状态（纯函数，便于离线断言）
//   pose: poses 表里的名字；cfg: DATA.holo；flyP: 0..1 飞行进度
export function poseTarget(pose, cfg, flyP) {
  const P = cfg.poses[pose] || cfg.poses.hidden;
  const stage = cfg.stage;
  const dock = cfg.dock;
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
  return {
    x: stage.x, y: stage.y + lift, z: stage.z,
    scale: P.scale || 1,
    opacity: P.opacity ?? cfg.opacity,
  };
}

// 脚底对齐：模型 bbox 中心在原点，group 原点要抬 -minY*scale 才能让脚踩在原点
export function footOffset(bboxMinY, height, bboxHeight) {
  return -bboxMinY * (height / Math.max(1e-6, bboxHeight));
}

const HOLO_VERT = /* glsl */`
  varying vec2 vUv;
  varying float vH;
  varying vec3 vNrm;
  varying vec3 vView;
  uniform float uMinY, uMaxY;
  void main() {
    vUv = uv;
    vH = clamp((position.y - uMinY) / max(1e-5, uMaxY - uMinY), 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNrm = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

const HOLO_FRAG = /* glsl */`
  uniform sampler2D uMap;
  uniform vec3  uColor;
  uniform float uTime, uOpacity, uScanFreq, uScanSpeed, uScroll, uGlitch, uRim, uSweep, uBeat;
  varying vec2 vUv;
  varying float vH;
  varying vec3 vNrm;
  varying vec3 vView;

  void main() {
    // 行级抖动：按「模型局部高度」分行，而不是贴图行 —— 贴图行与身高无关
    float row = floor(vH * 220.0);
    float g = fract(sin(row * 12.9898 + floor(uTime * 14.0) * 78.233) * 43758.5453) - 0.5;
    vec2 uv = vUv + vec2(g * uGlitch * (0.5 + 0.5 * sin(uTime * 3.1)), 0.0);

    vec3 tex = texture2D(uMap, uv).rgb;
    // 冷蓝重映射：保留贴图的明暗层次（0.45 权重）再压成单一色相，
    // 否则白衣服会被完全漂白，人物五官和发型都读不出来
    float lum = dot(tex, vec3(0.299, 0.587, 0.114));
    vec3 base = uColor * (0.10 + 0.52 * lum) + tex * 0.10;

    // 扫描线按身高走（vH），横向细密，肉眼可读为「全息」
    float scan = 0.5 + 0.5 * sin(vH * uScanFreq * 0.42 - uTime * uScanSpeed);
    float fine = 0.5 + 0.5 * sin(vH * uScanFreq * 2.10 + uTime * 1.7);
    // 自下而上的流动亮带
    float d = abs(fract(vH - uTime * uScroll) - 0.5) * 2.0;
    float band = 1.0 - smoothstep(0.0, 0.075, d);
    // 菲涅尔：轮廓更亮，符合全息投影的「玻璃边缘」
    float rim = pow(1.0 - clamp(dot(normalize(vNrm), normalize(vView)), 0.0, 1.0), 2.0) * uRim;
    // 显形扫描（materialize 段自下而上）
    float solid = smoothstep(uSweep + 0.015, uSweep - 0.10, vH);
    float edge = exp(-abs(vH - uSweep) * 70.0) * step(uSweep, 1.15);
    float beatK = 1.0 + uBeat * 0.35;

    vec3 col = base * (0.62 + 0.16 * scan + 0.55 * rim + 0.26 * band)
             * (0.88 + 0.12 * fine) * beatK;
    col += uColor * (band * 0.10 + edge * 0.55) * beatK;

    float a = uOpacity * (0.34 + 0.12 * scan + 0.46 * rim + 0.16 * band) * solid
            + uOpacity * edge * 0.5;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }`;

const ADD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const PILLAR_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uTime, uAlpha;
  varying vec2 vUv;
  void main() {
    float rise = pow(clamp(vUv.y, 0.0, 1.0), 1.35);
    float lines = 0.55 + 0.45 * sin(vUv.y * 90.0 - uTime * 6.0);
    float rim = pow(abs(vUv.x - 0.5) * 2.0, 2.0);
    float a = uAlpha * (1.0 - rise) * (0.5 + 0.35 * lines) * (0.75 + 0.5 * rim);
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor * (0.8 + 0.5 * lines), a);
  }`;

const RING_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uTime, uAlpha;
  varying vec2 vUv;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float core = smoothstep(1.0, 0.55, r);
    float pulse = 0.7 + 0.3 * sin(uTime * 2.4);
    float a = uAlpha * core * pulse;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

// 建全息组：返回 THREE.Group(name='holo')，userData 里带状态与 uniform
export function buildHolo(gltf, cfg) {
  const root = gltf.scene || gltf.scenes[0];
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  if (!meshes.length) throw new Error('holo.glb 里没有 mesh');

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const bboxH = Math.max(1e-6, size.y);
  const scale = cfg.height / bboxH;

  const group = new THREE.Group();
  group.name = 'holo';
  group.visible = false;

  const inner = new THREE.Group();
  inner.name = 'holo-body';
  group.add(inner);

  const uniforms = {
    uMap: { value: null },
    uColor: { value: new THREE.Color(cfg.color) },
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uScanFreq: { value: cfg.scanFreq },
    uScanSpeed: { value: cfg.scanSpeed },
    uScroll: { value: cfg.scrollSpeed },
    uGlitch: { value: cfg.glitchAmp },
    uRim: { value: cfg.rim },
    uSweep: { value: 0 },
    uBeat: { value: 0 },
    uMinY: { value: box.min.y },
    uMaxY: { value: box.max.y },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    fog: false,
  });

  let firstMap = null;
  for (const m of meshes) {
    const src = m.material;
    const map = src && src.map ? src.map : null;
    if (map && !firstMap) firstMap = map;
    const nm = mat.clone();
    nm.uniforms.uMap.value = map;
    m.material = nm;
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    inner.add(m);
  }
  if (!firstMap) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const cx = c.getContext('2d');
    cx.fillStyle = '#cfe8ff';
    cx.fillRect(0, 0, 1, 1);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    firstMap = t;
    for (const m of meshes) m.material.uniforms.uMap.value = t;
  }
  uniforms.uMap.value = firstMap;

  inner.scale.setScalar(scale);
  inner.position.set(0, -box.min.y * scale, 0);
  inner.rotation.y = cfg.yaw || 0;

  const ringUniforms = {
    uColor: { value: new THREE.Color(cfg.color) },
    uTime: { value: 0 },
    uAlpha: { value: 0 },
  };
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(cfg.ringRadius * 0.82, cfg.ringRadius, 72),
    new THREE.ShaderMaterial({
      uniforms: ringUniforms, vertexShader: ADD_VERT, fragmentShader: RING_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.name = 'holo-ring';
  group.add(ring);

  const pillarUniforms = {
    uColor: { value: new THREE.Color(cfg.color) },
    uTime: { value: 0 },
    uAlpha: { value: 0 },
  };
  const pillarH = cfg.height * 1.18;
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.pillarRadius * 0.86, cfg.pillarRadius, pillarH, 28, 1, true),
    new THREE.ShaderMaterial({
      uniforms: pillarUniforms, vertexShader: ADD_VERT, fragmentShader: PILLAR_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false,
    }),
  );
  pillar.position.y = pillarH * 0.5;
  pillar.name = 'holo-pillar';
  group.add(pillar);

  group.position.set(cfg.stage.x, cfg.stage.y, cfg.stage.z);

  group.userData = {
    cfg,
    uniforms: [uniforms, ...meshes.map((m) => m.material.uniforms)],
    ringUniforms, pillarUniforms,
    inner, meshes, ring, pillar,
    bboxHeight: bboxH, scale,
    pose: 'hidden',
    cur: { x: cfg.stage.x, y: cfg.stage.y, z: cfg.stage.z, scaleMul: 1, opacity: 0 },
    flyP: 0,
    swept: 0,
    beat: 0,
    t: 0,
  };
  return group;
}

// 每帧驱动：cmd = { pose, beat }
//   dt 用真实帧间隔；快进时由调用方按固定步长喂同一个函数，结果确定
//   sceneTime 只用于自转/浮动/扫描线的相位（快进时传累计秒即可复现）
export function updateHolo(group, dt, cmd, sceneTime) {
  if (!group) return;
  const u = group.userData;
  const cfg = u.cfg;
  const pose = (cmd && cmd.pose) || 'hidden';
  const beat = Math.max(0, Math.min(1.5, (cmd && cmd.beat) || 0));
  const step = Math.max(0, dt || 0);

  u.t += step;
  if (pose !== u.pose) {
    u.pose = pose;
    if (pose === 'materialize') u.swept = 0;
  }

  if (pose === 'fly') u.flyP = Math.min(1, u.flyP + step / Math.max(0.05, cfg.flySec));
  else if (pose === 'docked') u.flyP = 1;
  else u.flyP = 0;

  if (pose === 'hidden' || pose === 'pillar') u.swept = 0;
  else if (pose === 'materialize') u.swept = Math.min(1, u.swept + step / 1.1);
  else u.swept = 1;

  const tgt = poseTarget(pose, cfg, u.flyP);
  const k = 1 - Math.exp(-cfg.poseLerp * step);
  const c = u.cur;
  c.x += (tgt.x - c.x) * k;
  c.y += (tgt.y - c.y) * k;
  c.z += (tgt.z - c.z) * k;
  c.scaleMul += (tgt.scale - c.scaleMul) * k;
  c.opacity += (tgt.opacity - c.opacity) * k;
  u.beat += (beat - u.beat) * (1 - Math.exp(-6 * step));

  group.visible = c.opacity > 0.012;
  if (!group.visible) return;

  const st = (sceneTime != null && isFinite(sceneTime)) ? sceneTime : u.t;
  const bobK = pose === 'docked' ? 0.5 : 1;
  const bob = Math.sin(st * cfg.bobHz * TAU) * cfg.bobAmp * bobK;

  group.position.set(c.x, c.y + bob, c.z);
  group.scale.setScalar(c.scaleMul);
  group.rotation.y = st * cfg.spin * (pose === 'docked' ? 0.55 : 1) * (pose === 'spin' ? 2.6 : 1);

  const op = c.opacity;
  const sweep = pose === 'materialize' ? (u.swept * 1.16 - 0.06) : (pose === 'pillar' ? -0.2 : 1.2);

  for (const um of u.uniforms) {
    um.uTime.value = st;
    um.uOpacity.value = op;
    um.uBeat.value = u.beat;
    um.uSweep.value = sweep;
    if (um.uRim) um.uRim.value = cfg.rim * (1 + u.beat * 0.6);
    if (um.uGlitch) um.uGlitch.value = cfg.glitchAmp * (pose === 'materialize' ? 3.0 : 1);
  }

  const pillarA = pose === 'pillar' ? 0.30 * Math.max(0.35, op * 6)
    : pose === 'materialize' ? Math.max(0, 0.30 - u.swept * 0.30)
    : 0;
  u.pillarUniforms.uTime.value = st;
  u.pillarUniforms.uAlpha.value = pillarA;
  u.pillar.visible = pillarA > 0.004;

  u.ringUniforms.uTime.value = st;
  u.ringUniforms.uAlpha.value = op * (pose === 'docked' ? 0.30 : 0.55);
  u.ring.visible = u.ringUniforms.uAlpha.value > 0.004;
}

// QA 用：一次性摆到某个姿态（给 ?holoPhase= 冻结），不推进时间
export function snapHolo(group, pose, sceneTime) {
  if (!group) return;
  const u = group.userData;
  const cfg = u.cfg;
  const tgt = poseTarget(pose, cfg, pose === 'docked' ? 1 : 0);
  u.pose = pose;
  u.flyP = pose === 'docked' ? 1 : 0;
  u.cur.x = tgt.x; u.cur.y = tgt.y; u.cur.z = tgt.z;
  u.cur.scaleMul = tgt.scale;
  u.cur.opacity = tgt.opacity;
  u.swept = pose === 'materialize' ? 0.55 : 1;
  const st = (sceneTime != null && isFinite(sceneTime)) ? sceneTime : u.t;
  group.visible = tgt.opacity > 0.012;
  group.position.set(tgt.x, tgt.y, tgt.z);
  group.scale.setScalar(tgt.scale);
  group.rotation.y = st * cfg.spin;
  const sweep = pose === 'materialize' ? (u.swept * 1.16 - 0.06) : (pose === 'pillar' ? -0.2 : 1.2);
  for (const um of u.uniforms) {
    um.uOpacity.value = tgt.opacity;
    um.uSweep.value = sweep;
    um.uTime.value = st;
  }
  u.ringUniforms.uAlpha.value = tgt.opacity * (pose === 'docked' ? 0.30 : 0.55);
  u.ringUniforms.uTime.value = st;
  u.pillarUniforms.uAlpha.value = pose === 'pillar' ? 0.30 : 0;
  u.pillarUniforms.uTime.value = st;
  u.pillar.visible = pose === 'pillar';
}
