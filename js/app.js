// =====================================================================
// app.js — 渲染循环、相机、后期、QA 参数
// QA：?debug=1&ui=0&view=free&cam=x,y,z&look=x,y,z&time=H
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DATA } from './data.js';
import { convertGLB, updateLights, updateAudience, updateCrowd, buildCrowd, buildSinger, updateSinger } from './stadium.js';
import { ShowManager, Fireworks } from './show.js';

// ---------- URL 参数 ----------
const Q = new URLSearchParams(location.search);
const debugMode = Q.get('debug') === '1';
const uiVisible = Q.get('ui') !== '0';
let timeOfDay = Q.has('time') ? parseFloat(Q.get('time')) : DATA.defaults.time;
if (!isFinite(timeOfDay)) timeOfDay = DATA.defaults.time;

// ---------- DOM ----------
const loadingEl = document.getElementById('loading');
const loadingFill = document.getElementById('loading-fill');
const loadingPct = document.getElementById('loading-pct');
const loadingError = document.getElementById('loading-error');
const hudEl = document.getElementById('hud');
const debugEl = document.getElementById('debug-info');
if (debugMode) debugEl.classList.remove('hidden');

export function toast(msg) {
  if (!uiVisible) return;
  const box = document.getElementById('toast-box');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// ---------- renderer / scene / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(DATA.colors.nightSky);
scene.fog = new THREE.FogExp2(DATA.colors.nightFog, DATA.fog.densityNight);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 4000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.495;
controls.maxDistance = 1500;

// ---------- 基础光（夜景；Step 7 换成时间驱动氛围）----------
const hemi = new THREE.HemisphereLight(0x93b5ff, 0x141b2c, 0.5);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xcfdcff, 0.5);
keyLight.position.set(-180, 260, 120);
scene.add(keyLight);

// ---------- 后期 ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  DATA.lighting.bloom.strength,
  DATA.lighting.bloom.radius,
  DATA.lighting.bloom.threshold,
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- GLB 加载（主场景 + 两个人模一并就绪后再建场景，QA 截图稳定） ----------
let lightsGroup = null;
let audienceGroup = null;
let crowdGroup = null;
let singerGroup = null;
let skyMesh = null;
let ribbonMesh = null;
let show = null;
const lightState = { mode: 'sweep', lampBanks: true, audienceMode: 'normal', pixelPattern: 'heart', pixelScroll: true };
const sceneState = { lightsOff: false };
const bytesTotal = 2680000; // 粗略总量，仅进度条用
let bytesLoaded = 0;
const onProg = (ev) => {
  bytesLoaded += ev.loaded - (ev._last || 0);
  ev._last = ev.loaded;
  loadingFill.style.width = Math.min(100, Math.round((bytesLoaded / bytesTotal) * 100)) + '%';
  loadingPct.textContent = Math.min(100, Math.round((bytesLoaded / bytesTotal) * 100)) + '%';
};
Promise.all([
  new GLTFLoader().loadAsync(DATA.asset.url, undefined, onProg),
  new GLTFLoader().loadAsync(DATA.concert.crowd.urlA, undefined, onProg),
  new GLTFLoader().loadAsync(DATA.concert.crowd.urlB, undefined, onProg),
  new GLTFLoader().loadAsync(DATA.concert.singer.url, undefined, onProg),
]).then(([gltf, crowdA, crowdB, singerGltf]) => {
  const stadium = convertGLB(gltf.scene);
  scene.add(stadium);
  lightsGroup = stadium.userData.lightsGroup;
  audienceGroup = stadium.userData.audienceGroup;
  skyMesh = stadium.userData.skyMesh;
  ribbonMesh = stadium.userData.ledRibbon;
  applyLayersParam(stadium);
  applyInitialCamera();
  try {
    crowdGroup = buildCrowd([crowdA, crowdB]);
    stadium.add(crowdGroup);
    const q = Q.get('layers');
    if (q && !q.split(',').map((x) => x.trim()).includes('crowd')) crowdGroup.visible = false;
    if (debugMode) {
      const kids = crowdGroup.children.map((c) => `${c.name}:${c.count ?? '?'}:${c.visible}`).join(' ');
      loadingError.textContent += `[crowd] ok kids=[${kids}]\n`;
      loadingError.textContent += `[lights] beams=${lightsGroup.children.filter((c) => c.name === 'beam').length}\n`;
      loadingError.textContent += `[audience] entries=${audienceGroup.userData.pixelEntries ? audienceGroup.userData.pixelEntries.length : 'NONE'}\n`;
    }
  } catch (e) {
    console.warn('[crowd] skipped:', e);
    loadingError.textContent += '[crowd] ' + (e && e.message ? e.message : e) + '\n';
  }
  // 歌手（加载失败不阻塞主场景）
  try {
    singerGroup = buildSinger(singerGltf);
    stadium.add(singerGroup);
    const q = Q.get('layers');
    if (q && !q.split(',').map((x) => x.trim()).includes('singer')) singerGroup.visible = false;
    // QA：?singerClip=名&singerT=秒 定格任意动画任意时刻
    const sc = Q.get('singerClip');
    if (sc && singerGroup.userData.play(sc)) {
      const st = parseFloat(Q.get('singerT'));
      if (isFinite(st)) singerGroup.userData.mixer.setTime(st);
    }
  } catch (e) {
    console.warn('[singer] skipped:', e);
    loadingError.textContent += '[singer] ' + (e && e.message ? e.message : e) + '\n';
  }
  // QA：?fx=tide|pixel|normal 与 ?pattern=heart|note|smiley|star|text 直达特效
  const qfx = Q.get('fx');
  if (qfx) lightState.audienceMode = qfx;
  const qpat = Q.get('pattern');
  if (qpat) { lightState.pixelPattern = qpat; lightState.audienceMode = 'pixel'; }
  const qOrbit = Q.get('orbitT');
  if (isFinite(qOrbit) && Q.get('view') === 'sg-orbit') orbitAngle = parseFloat(qOrbit);
  if (Q.get('walk') === '1') { setWalk(true); const wp = Q.get('walkAt'); if (wp) { camera.position.fromArray(wp.split(',').map(Number)); } const wy = Q.get('walkYaw'); if (isFinite(parseFloat(wy))) { walk.yaw = parseFloat(wy); walkLook(); } }
  // 开场秀（?show=1 自动播放；?showT=秒 快进到确定帧供 QA 截图）
  const fireworks = new Fireworks(scene, DATA.fireworks, {
    x: DATA.stadium.bowl.centerX, z: DATA.stadium.bowl.centerZ,
  });
  show = new ShowManager({
    lightState, sceneState, fireworks,
    getLedMat: () => stadium.userData.stageGroup?.userData.ledMainMat,
    getWaveTextMats: () => stadium.userData.stageGroup?.userData.waveTextMats || [],
    getSinger: () => singerGroup,
    toast,
  });
  if (Q.get('show') === '1') {
    show.start();
    const st = parseFloat(Q.get('showT'));
    if (isFinite(st)) show.fastForward(st);
  }
  loaded = true;
  loadingEl.classList.add('done');
  if (uiVisible) {
    hudEl.classList.remove('hidden');
    if (!hudBuilt) buildHUD();
  }
  toast('球场已载入');
}).catch((err) => {
  loadingError.textContent = '模型加载失败：' + (err && err.message ? err.message : err) +
    '\n请确认通过 HTTP 访问（不能用 file:// 直接打开）';
  console.error(err);
});

// ---------- 初始机位 ----------
// QA 逐层显影：?layers=ground,stage,audience（缺省全部显示）
const LAYER_NAMES = ['bowl', 'ground', 'concert-field', 'stage', 'sound', 'stage-lights', 'audience', 'crowd', 'singer', 'led-ribbon', 'sky'];
function applyLayersParam(stadium) {
  const q = Q.get('layers');
  if (!q) return;
  const show = new Set(q.split(',').map((s) => s.trim()).filter(Boolean));
  const byName = {};
  for (const c of stadium.children) if (c.name) byName[c.name] = c; // 仅直接子级，避免 GLB 同名节点遮蔽
  byName.crowd = crowdGroup;
  byName.singer = singerGroup;
  for (const name of LAYER_NAMES) {
    const obj = byName[name];
    if (obj) obj.visible = show.has(name);
  }
}

function applyInitialCamera() {
  const camStr = Q.get('cam'), lookStr = Q.get('look');
  if (debugMode && camStr && lookStr) {
    camera.position.fromArray(camStr.split(',').map(Number));
    controls.target.fromArray(lookStr.split(',').map(Number));
    const fov = parseFloat(Q.get('fov'));
    if (isFinite(fov)) { camera.fov = fov; camera.updateProjectionMatrix(); }
  } else {
    const all = [...DATA.views, ...DATA.camAudience, ...DATA.camSinger];
    const v = all.find((x) => x.id === (Q.get('view') || 'aerial')) || DATA.views[0];
    camera.position.fromArray(v.cam);
    controls.target.fromArray(v.look);
    camera.fov = v.fov;
    camera.updateProjectionMatrix();
    currentViewName = v.title || v.id;
    currentViewId = v.id;
  }
  controls.update();
}

// ---------- 氛围与时间（Step 7）----------
const _cNightTop = new THREE.Color(DATA.atmosphere.nightTop);
const _cNightBot = new THREE.Color(DATA.atmosphere.nightBottom);
const _cDayTop = new THREE.Color(DATA.atmosphere.dayTop);
const _cDayBot = new THREE.Color(DATA.atmosphere.dayBottom);
const _cDuskTop = new THREE.Color(DATA.atmosphere.duskTop);
const _cDuskBot = new THREE.Color(DATA.atmosphere.duskBottom);
const _tmpTop = new THREE.Color();
const _tmpBot = new THREE.Color();

function updateAtmosphere(t, lightsOff) {
  const A = DATA.atmosphere;
  const sunAlt = Math.sin(((t - 6) / 12) * Math.PI);        // 6..18 点为正
  const d = THREE.MathUtils.clamp(sunAlt, 0, 1);            // 白天因子
  const dusk = THREE.MathUtils.clamp(1 - Math.abs(sunAlt) / 0.25, 0, 1);
  const night = 1 - d;
  _tmpTop.copy(_cNightTop).lerp(_cDayTop, d).lerp(_cDuskTop, dusk * 0.6);
  _tmpBot.copy(_cNightBot).lerp(_cDayBot, d).lerp(_cDuskBot, dusk * 0.6);
  if (skyMesh) {
    skyMesh.material.uniforms.uTop.value.copy(_tmpTop);
    skyMesh.material.uniforms.uBottom.value.copy(_tmpBot);
  }
  keyLight.intensity = A.sunDayIntensity * d * (lightsOff ? 0.15 : 1);
  hemi.intensity = (A.hemiNight + (A.hemiDay - A.hemiNight) * d) * (lightsOff ? 0.45 : 1);
  scene.fog.density = A.fogNight + (A.fogDay - A.fogNight) * d;
  renderer.toneMappingExposure = A.exposureNight + (A.exposureDay - A.exposureNight) * d;
  bloom.strength = A.bloomDay + (A.bloomNight - A.bloomDay) * night;
  if (ribbonMesh) {
    ribbonMesh.material.emissiveIntensity =
      (A.ribbonIntensityDay + (A.ribbonIntensityNight - A.ribbonIntensityDay) * night) * (lightsOff ? 0.15 : 1);
  }
}

// ---------- 交互 UI（Step 8）----------
const MODES = [['steady', '常亮'], ['strobe', '频闪'], ['sweep', '扫描']];

let tween = null;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function goView(v) {
  currentViewName = v.title || v.id;
  currentViewId = v.id;
  tween = {
    t0: performance.now(), dur: 1700,
    fromP: camera.position.clone(), toP: new THREE.Vector3().fromArray(v.cam),
    fromL: controls.target.clone(), toL: new THREE.Vector3().fromArray(v.look),
    fromF: camera.fov, toF: v.fov,
  };
  showCaption(v.title, v.desc);
  toast(`视角：${v.title}`);
}
function stepTween(now) {
  if (!tween) return;
  const k = Math.min(1, (now - tween.t0) / tween.dur);
  const e = easeInOutCubic(k);
  camera.position.lerpVectors(tween.fromP, tween.toP, e);
  controls.target.lerpVectors(tween.fromL, tween.toL, e);
  camera.fov = tween.fromF + (tween.toF - tween.fromF) * e;
  camera.updateProjectionMatrix();
  if (k >= 1) tween = null;
}

let capTimer = null;
function showCaption(title, desc) {
  const cap = document.getElementById('caption');
  cap.innerHTML = '<div class="cap-title"></div><div class="cap-desc"></div>';
  cap.querySelector('.cap-title').textContent = title;
  cap.querySelector('.cap-desc').textContent = desc || '';
  cap.classList.add('show');
  clearTimeout(capTimer);
  capTimer = setTimeout(() => cap.classList.remove('show'), 3400);
}

function periodName(t) {
  const names = [[4.5, '深夜'], [6.5, '黎明'], [9, '清晨'], [13, '正午'], [16.5, '午后'], [19, '黄昏'], [20.5, '暮色'], [24.1, '深夜']];
  for (const [h, n] of names) if (t < h) return n;
  return '深夜';
}

function mkToggle(parent, label, val, cb) {
  const row = document.createElement('div');
  row.className = 'hud-row';
  row.innerHTML = `<label>${label}</label>`;
  const seg = document.createElement('div');
  seg.className = 'seg';
  const on = document.createElement('button'); on.textContent = '开';
  const off = document.createElement('button'); off.textContent = '关';
  const set = (v) => { on.classList.toggle('on', v); off.classList.toggle('on', !v); cb(v); };
  on.onclick = () => set(true);
  off.onclick = () => set(false);
  (val ? on : off).classList.add('on');
  seg.appendChild(on); seg.appendChild(off);
  row.appendChild(seg);
  parent.appendChild(row);
}

let hudBuilt = false;
let currentViewName = '鸟瞰全景';
let currentViewId = 'aerial';
let orbitAngle = 0;
let statFrames = 0;
const VIEW_ICONS = {
  aerial: '🛩️', stagefront: '👀', stands: '🪑', facade: '🏟️', roof: '🔭', free: '🧭',
  'aud-pit': '🙋', 'aud-north': '🪑', 'aud-east': '🏛️', 'aud-west': '🏛️', 'aud-south': '🔙',
  'sg-close': '🎯', 'sg-side': '📽️', 'sg-back': '🌌', 'sg-orbit': '🔄',
};

function buildHUD() {
  const box = document.getElementById('hud-groups');
  const rail = document.getElementById('sb-rail');
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sb-toggle');
  const sections = {};

  // 手风琴分组框架
  const grp = (id, icon, title, open = false) => {
    const sec = document.createElement('div');
    sec.className = 'sb-sec' + (open ? ' open' : '');
    sec.dataset.id = id;
    const head = document.createElement('button');
    head.className = 'sb-sec-head';
    head.innerHTML = `<span class="sb-sec-icon">${icon}</span><span>${title}</span><span class="sb-arrow">▸</span>`;
    head.onclick = () => sec.classList.toggle('open');
    const body = document.createElement('div');
    body.className = 'sb-sec-body';
    sec.appendChild(head);
    sec.appendChild(body);
    box.appendChild(sec);
    const railBtn = document.createElement('button');
    railBtn.className = 'sb-rail-btn';
    railBtn.title = title;
    railBtn.textContent = icon;
    railBtn.onclick = () => {
      sidebar.classList.remove('collapsed');
      toggleBtn.textContent = '⟨';
      sec.classList.add('open');
    };
    rail.appendChild(railBtn);
    sections[id] = body;
    return body;
  };

  // 初始收起态（按钮点击由 index.html 内联脚本处理）
  if (Q.get('sb') === 'collapsed' || window.innerWidth <= 640) {
    sidebar.classList.add('collapsed');
    toggleBtn.textContent = '⟩';
  }

  // 视角（默认展开；含时段滑杆）
  const gv = grp('views', '🎥', '视角', true);
  for (const v of DATA.views) {
    const b = document.createElement('button');
    b.className = 'hud-btn';
    b.innerHTML = `<span class="sb-btn-icon">${VIEW_ICONS[v.id] || '📍'}</span>${v.title || v.id}`;
    b.onclick = () => goView(v);
    gv.appendChild(b);
  }
  const label = document.createElement('div');
  label.className = 'hud-row';
  label.innerHTML = '<label>时段</label><span id="time-label"></span>';
  gv.appendChild(label);
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = 0; slider.max = 24; slider.step = 0.1;
  slider.value = timeOfDay; slider.style.width = '100%';
  const labelUpdate = () => {
    const el = document.getElementById('time-label');
    const h = Math.floor(timeOfDay), m = Math.round((timeOfDay - h) * 60);
    el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${periodName(timeOfDay)}`;
  };
  slider.oninput = () => { timeOfDay = parseFloat(slider.value); labelUpdate(); };
  gv.appendChild(slider);
  labelUpdate();

  // 灯光
  const gl = grp('lights', '💡', '灯光');
  const segRow = document.createElement('div');
  segRow.className = 'hud-row';
  segRow.innerHTML = '<label>模式</label>';
  const seg = document.createElement('div');
  seg.className = 'seg';
  for (const [id, name] of MODES) {
    const b = document.createElement('button');
    b.textContent = name;
    b.dataset.m = id;
    if (id === lightState.mode) b.classList.add('on');
    b.onclick = () => {
      lightState.mode = id;
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.m === id));
      toast(`灯光模式：${name}`);
    };
    seg.appendChild(b);
  }
  segRow.appendChild(seg);
  gl.appendChild(segRow);
  mkToggle(gl, '灯组开关', lightState.lampBanks, (v) => { lightState.lampBanks = v; toast(v ? '灯组已开' : '灯组已关'); });
  mkToggle(gl, '场馆泛光', !sceneState.lightsOff, (v) => { sceneState.lightsOff = !v; toast(v ? '场馆泛光已开' : '场馆泛光已关'); });

  // 观众（星海开关 + 特效模式 + 点阵图案）
  const ga = grp('crowd', '👥', '观众');
  mkToggle(ga, '观众星海', true, (v) => {
    if (audienceGroup) audienceGroup.visible = v;
    if (crowdGroup) crowdGroup.visible = v;
    toast(v ? '观众星海已开' : '观众星海已关');
  });
  const fxRow = document.createElement('div');
  fxRow.className = 'hud-row';
  fxRow.innerHTML = '<label>特效</label>';
  const fxEls = {};
  const fxEff = document.createElement('div');
  fxEff.className = 'seg';
  const setFx = (id) => {
    lightState.audienceMode = id;
    for (const k of Object.keys(fxEls)) fxEls[k].classList.toggle('on', k === id);
  };
  for (const [id, name] of [['normal', '常规'], ['tide', '潮汐'], ['pixel', '点阵']]) {
    const b = document.createElement('button');
    b.textContent = name;
    if (id === 'normal') b.classList.add('on');
    b.onclick = () => { setFx(id); toast(`观众特效：${name}`); };
    fxEls[id] = b;
    fxEff.appendChild(b);
  }
  fxRow.appendChild(fxEff);
  ga.appendChild(fxRow);
  const patRow = document.createElement('div');
  patRow.className = 'hud-row';
  patRow.innerHTML = '<label>图案</label>';
  const patSeg = document.createElement('div');
  patSeg.className = 'seg';
  for (const [id, name] of [['heart', '❤'], ['note', '♪'], ['smiley', '☺'], ['star', '★'], ['text', 'BB']]) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => {
      setFx('pixel');
      lightState.pixelPattern = id;
      lightState.pixelScroll = true;
      toast(`点阵图案：${name}`);
    };
    patSeg.appendChild(b);
  }
  patRow.appendChild(patSeg);
  ga.appendChild(patRow);

  // 观众机位
  const gac = grp('aud-cam', '🪑', '观众机位');
  for (const v of DATA.camAudience) {
    const b = document.createElement('button');
    b.className = 'hud-btn';
    b.innerHTML = `<span class="sb-btn-icon">🪑</span>${v.title}`;
    b.onclick = () => goView(v);
    gac.appendChild(b);
  }
  // 歌手
  const gsg = grp('singer', '🎤', '歌手');
  mkToggle(gsg, '主唱登场', true, (v) => { if (singerGroup) singerGroup.visible = v; toast(v ? '主唱登场' : '主唱退场'); });
  if (singerGroup) {
    for (const name of DATA.concert.singer.clips) {
      const b = document.createElement('button');
      b.className = 'hud-btn';
      b.textContent = '♪ ' + name;
      b.onclick = () => { if (singerGroup.userData.play(name)) toast(`动作：${name}`); };
      gsg.appendChild(b);
    }
    const cineTitle = document.createElement('div');
    cineTitle.className = 'hud-row';
    cineTitle.innerHTML = '<label style="color:var(--accent);letter-spacing:1px">🎬 运镜机位</label>';
    gsg.appendChild(cineTitle);
    for (const v of DATA.camSinger) {
      const b = document.createElement('button');
      b.className = 'hud-btn';
      b.innerHTML = `<span class="sb-btn-icon">🎬</span>${v.title}`;
      b.onclick = () => goView(v);
      gsg.appendChild(b);
    }
  }

  // 开场秀
  const gs = grp('show', '🎆', '开场秀');
  const bPlay = document.createElement('button');
  bPlay.className = 'hud-btn';
  bPlay.textContent = '▶ 播放开场秀（46s）';
  bPlay.onclick = () => { if (show && !show.active) show.start(); else toast('开场秀进行中'); };
  gs.appendChild(bPlay);
  const bSkip = document.createElement('button');
  bSkip.className = 'hud-btn';
  bSkip.textContent = '■ 跳过';
  bSkip.onclick = () => { if (show && show.active) show.skip(); else toast('没有进行中的开场秀'); };
  gs.appendChild(bSkip);

  // 漫游
  const gw = grp('walk', '🎮', '漫游');
  mkToggle(gw, '第一人称漫游', false, (v) => { setWalk(v); });
  const hint = document.createElement('div');
  hint.className = 'hud-row';
  hint.innerHTML = '<label style="color:var(--text-dim);font-size:10.5px;line-height:1.5">W/A/S/D 移动 · Space/C 升降 · Shift 加速 · 按住拖拽转动视角</label>';
  gw.appendChild(hint);

  // 状态栏（视角名 · 时间 · FPS · draw calls）
  const statusEl = document.getElementById('sb-status');
  let lastT = performance.now(), fps = 0;
  setInterval(() => {
    const now = performance.now();
    fps = Math.round((statFrames * 1000) / (now - lastT));
    statFrames = 0;
    lastT = now;
    const calls = renderer.info.render.calls;
    const h = Math.floor(timeOfDay), m = Math.round((timeOfDay - h) * 60);
    statusEl.textContent =
      `${currentViewName} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${fps} FPS · ${calls} calls`;
  }, 500);

  hudBuilt = true;
}

// ---------- 漫游 v2（FPS 风格：拖拽转向 + WASD 平移 + Space/C 升降 + 边界钳制） ----------
const walk = { enabled: false, keys: {}, yaw: 0, pitch: 0, dragging: false };
window.addEventListener('keydown', (e) => { walk.keys[e.code] = true; });
window.addEventListener('keyup', (e) => { walk.keys[e.code] = false; });
const _we = new THREE.Euler(0, 0, 0, 'YXZ');
const _wf = new THREE.Vector3();
const _wr = new THREE.Vector3();
const _wm = new THREE.Vector3();
const WALK_MIN_Y = DATA.stadium.groundY + 1.7, WALK_MAX_Y = 58;

function walkLook() {
  _we.set(walk.pitch, walk.yaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(_we);
  camera.getWorldDirection(_wf);
  controls.target.copy(camera.position).addScaledVector(_wf, 8);
}

function walkApplyDir(dir, dt) {
  const sp = (walk.keys.ShiftLeft || walk.keys.ShiftRight) ? 40 : 15;
  camera.position.addScaledVector(dir, sp * dt);
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, WALK_MIN_Y, WALK_MAX_Y);
}

function stepWalk(dt) {
  if (!walk.enabled) return;
  _we.set(walk.pitch, walk.yaw, 0, 'YXZ');
  _wf.set(0, 0, -1).applyEuler(_we);           // 视线方向（含俯仰）
  _wr.set(Math.cos(walk.yaw), 0, -Math.sin(walk.yaw)); // 右手侧（水平面）
  _wm.set(0, 0, 0);
  if (walk.keys.KeyW) _wm.add(_wf);
  if (walk.keys.KeyS) _wm.sub(_wf);
  if (walk.keys.KeyD) _wm.add(_wr);
  if (walk.keys.KeyA) _wm.sub(_wr);
  if (walk.keys.Space) _wm.y += 1;
  if (walk.keys.KeyC) _wm.y -= 1;
  if (_wm.lengthSq() > 0) walkApplyDir(_wm.normalize(), dt);
  walkLook();
}

// 拖拽转向（漫游开启时接管鼠标；OrbitControls 已禁用避免冲突）
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (currentViewId === 'sg-orbit') { currentViewId = 'sg-orbit-hold'; toast('环绕运镜已暂停'); }
  if (!walk.enabled) return;
  walk.dragging = true;
  walk._px = e.clientX; walk._py = e.clientY;
});
window.addEventListener('pointermove', (e) => {
  if (!walk.enabled || !walk.dragging) return;
  walk.yaw -= (e.clientX - walk._px) * 0.0024;
  walk.pitch = THREE.MathUtils.clamp(walk.pitch - (e.clientY - walk._py) * 0.0024, -1.45, 1.45);
  walk._px = e.clientX; walk._py = e.clientY;
  walkLook();
});
window.addEventListener('pointerup', () => { walk.dragging = false; });

function setWalk(on) {
  walk.enabled = on;
  controls.enabled = !on; // 漫游时禁用 OrbitControls（避免与拖拽转向冲突）
  tween = null;
  if (on) {
    camera.getWorldDirection(_wf);
    walk.pitch = Math.asin(THREE.MathUtils.clamp(_wf.y, -1, 1));
    walk.yaw = Math.atan2(-_wf.x, -_wf.z);
    walkLook();
    toast('漫游已开：W/A/S/D 移动 · Space/C 升降 · Shift 加速 · 按住拖拽转动视角');
  } else {
    camera.getWorldDirection(_wf);
    controls.target.copy(camera.position).addScaledVector(_wf, 20);
    toast('漫游已关');
  }
}

// ---------- debug 覆盖层（固定机位核对用）----------
function updateDebugOverlay() {
  const p = camera.position, t = controls.target;
  debugEl.textContent =
    `cam=${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}\n` +
    `look=${t.x.toFixed(1)},${t.y.toFixed(1)},${t.z.toFixed(1)}\n` +
    `time=${timeOfDay.toFixed(1)}h  fov=${camera.fov.toFixed(0)}`;
}

// ---------- 循环 / resize ----------
const clock = new THREE.Clock();
let elapsed = 0;
// QA 定帧模式：?still=1 时等模型加载完成后渲染若干帧再停表
const stillMode = Q.get('still') === '1';
let loaded = false;
let frameCount = 0;
const _lastGoodCam = { pos: new THREE.Vector3(-262, 175, 320), tgt: new THREE.Vector3(-32, 14, 49) };
function tick() {
  const dt = clock.getDelta();
  elapsed += dt;
  // NaN 护盾：相机/目标一旦非有限值，立即回滚上一有效机位（任何来源的 NaN 都不致黑屏）
  if (!isFinite(camera.position.x + camera.position.y + camera.position.z +
      controls.target.x + controls.target.y + controls.target.z)) {
    camera.position.copy(_lastGoodCam.pos);
    controls.target.copy(_lastGoodCam.tgt);
    if (debugMode && !window._nanSeen) {
      window._nanSeen = 0;
    }
    if (debugMode && window._nanSeen < 3) {
      window._nanSeen++;
      loadingError.textContent += `[nan] blocked @frame${statFrames} dt=${dt} orbitA=${orbitAngle}
`;
    }
  } else {
    _lastGoodCam.pos.copy(camera.position);
    _lastGoodCam.tgt.copy(controls.target);
  }
  updateAtmosphere(timeOfDay, sceneState.lightsOff);
  if (show) show.update(dt);
  if (show?.r?.fireworks) show.r.fireworks.update(dt);
  if (lightsGroup) updateLights(lightsGroup, elapsed, lightState);
  if (audienceGroup) updateAudience(audienceGroup, elapsed, lightState);
  if (crowdGroup && crowdGroup.visible) updateCrowd(crowdGroup, elapsed, lightState);
  if (singerGroup && singerGroup.visible) updateSinger(singerGroup, dt);
  // 歌手环绕运镜：围绕主唱缓慢环绕（拖拽即退出）
  if (singerGroup && currentViewId === 'sg-orbit' && !tween && !walk.enabled) {
    orbitAngle += dt * 0.14;
    if (!window._orbitDbg) {
      window._orbitDbg = 1;
      const el = document.getElementById('loading-error');
      if (el) el.textContent += `[orbit] first frame: angle=${orbitAngle} dt=${dt}
`;
    }
    const SG = DATA.concert.singer;
    camera.position.set(
      SG.pos.x + Math.cos(orbitAngle) * 9,
      9.7 + Math.sin(orbitAngle * 0.6) * 0.5,
      SG.pos.z + Math.sin(orbitAngle) * 9,
    );
    camera.lookAt(SG.pos.x, 8.8, SG.pos.z);
    controls.target.set(SG.pos.x, 8.8, SG.pos.z);
    if (!isFinite(camera.position.x) && !window._orbitNaN) {
      window._orbitNaN = true;
      const el = document.getElementById('loading-error');
      if (el) el.textContent += `[orbitNaN] angle=${orbitAngle} dt=${dt} sg=${SG.pos.x},${SG.pos.z} mixerT=${singerGroup.userData.mixer.time}
`;
    }
  }
  stepTween(performance.now());
  stepWalk(dt);
  controls.update();
  if (debugMode) updateDebugOverlay();
  statFrames++;
  composer.render();
  if (loaded) frameCount++;
  if (stillMode && loaded && frameCount >= 6) return;
  requestAnimationFrame(tick);
}
tick();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// QA 辅助：外部可 window.__app 拿到关键对象
window.__app = { THREE, scene, camera, controls, renderer, composer, bloom, DATA, lightState, sceneState, get time() { return timeOfDay; }, set time(v) { timeOfDay = v; } };
