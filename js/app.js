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
import { convertGLB, updateLights, updateAudience, updateCrowd, buildCrowd, buildSinger, updateSinger, buildBand, updateBand, updateLightShowRibbon, ensureRibbonShader, updateLightShowBody, lightShowOf } from './stadium.js';
import { pitGrid } from './pixel.js';
import { lightShowAt, lightShowDuration, lightShowPhaseAt, LS_PHASES } from './lightshow.js';
import { lightShowBAt, lightShowBDuration, lightShowBPhaseAt, LSB_PHASES } from './lightshowb.js';
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
let stadiumGroup = null;
let lightsGroup = null;
let audienceGroup = null;
let crowdGroup = null;
let singerGroup = null;
let bandGroup = null;
let skyMesh = null;
let ribbonMesh = null;
let show = null;
let lsStageEl = null; // 灯光秀阶段指示（HUD 建好后赋值，tick 里刷新）
let lsLastPhase = '';
// 阶段中文名：tick() 每帧要用，必须放在模块作用域（放在 buildHUD 里会 ReferenceError
// → tick 抛异常 → requestAnimationFrame 断链，表现为「打开灯光秀后页面直接卡死」）
const LS_PHASE_LABEL = {
  // A：全环应援棒 + 环带白带
  breath: '起势', burst: '爆发', collapse: '收束', black: '暗场', band: '白带', fall: '回落',
  // B：舞台中央光团
  ignite: '点亮', flash: '闪白', cool: '转冷', blue: '深蓝', stripe: '竖纹', fade: '隐去',
};
const lightState = { mode: 'sweep', lampBanks: true, audienceMode: 'normal', pixelPattern: 'heart', pixelScroll: true, lightShow: false, lightShowT: 0, lightShowVariant: 'a' };
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
  // 乐队乐器逐件加载：单件失败不该拖垮主场景，所以用 allSettled 语义（catch → null）
  ...DATA.concert.band.items.map((it) =>
    new GLTFLoader().loadAsync(it.url, undefined, onProg).catch((e) => {
      console.warn(`[band] ${it.id} load failed:`, e);
      loadingError.textContent += `[band] ${it.id} ${e && e.message ? e.message : e}\n`;
      return null;
    })),
]).then(([gltf, crowdA, crowdB, singerGltf, ...bandGltfs]) => {
  const stadium = convertGLB(gltf.scene);
  scene.add(stadium);
  stadiumGroup = stadium;
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
  // 伴奏乐队（舞台两侧体素乐器 + 乐手；任何一件失败都只跳过它自己）
  try {
    bandGroup = buildBand(bandGltfs, [crowdA, crowdB]);
    stadium.add(bandGroup);
    const q = Q.get('layers');
    if (q && !q.split(',').map((x) => x.trim()).includes('band')) bandGroup.visible = false;
    // QA：?nopperf=1 隐藏乐手，只留乐器（用于差分验收乐手是否真的画出来）
    if (Q.get('nopperf') === '1') {
      for (const p of bandGroup.userData.performers) p.root.visible = false;
    }
    if (debugMode) {
      const ids = bandGroup.userData.items.map((it) => it.id).join(',');
      const pids = bandGroup.userData.performers.map((p) => p.id).join(',');
      loadingError.textContent += `[band] items=${bandGroup.userData.items.length} [${ids}]\n`;
      loadingError.textContent += `[band] performers=${bandGroup.userData.performers.length} [${pids}]\n`;
      // QA：每个乐手的世界包围盒（验脚底贴台面 y≈7.32、身高≈1.7m、横向不越界）
      const bb = new THREE.Box3();
      for (const p of bandGroup.userData.performers) {
        bb.setFromObject(p.root);
        loadingError.textContent += `[band] ${p.id} y=[${bb.min.y.toFixed(2)},${bb.max.y.toFixed(2)}]`
          + ` h=${(bb.max.y - bb.min.y).toFixed(2)} x=[${bb.min.x.toFixed(1)},${bb.max.x.toFixed(1)}]`
          + ` z=[${bb.min.z.toFixed(1)},${bb.max.z.toFixed(1)}]\n`;
      }
    }
  } catch (e) {
    console.warn('[band] skipped:', e);
    loadingError.textContent += '[band] ' + (e && e.message ? e.message : e) + '\n';
  }
  // QA：?fx=tide|pixel|normal 与 ?pattern=heart|note|smiley|star|text 直达特效
  const qfx = Q.get('fx');
  if (qfx) lightState.audienceMode = qfx;
  const qpat = Q.get('pattern');
  if (qpat) { lightState.pixelPattern = qpat; lightState.audienceMode = 'pixel'; }
  // QA：?scroll=0 冻结图案横移动效，让截图与离线校验的 shift=0 对齐
  if (Q.get('scroll') === '0') lightState.pixelScroll = false;
  // QA：?pshift=<列> 冻结到指定横移列，用于复现/验收图案水平位置
  const qShift = parseFloat(Q.get('pshift'));
  if (isFinite(qShift)) lightState.pixelShift = qShift;
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
  // QA：?lightshow=1（A）或 ?lightshow=b（B）启动灯光秀；?lsT=秒 冻结到确定时刻
  if (Q.get('lightshow')) {
    const lv = Q.get('lightshow');
    lightState.lightShowVariant = lv === 'b' ? 'b' : 'a';
    lightState.lightShow = true;
    const lt = parseFloat(Q.get('lsT'));
    lightState.lightShowT = isFinite(lt) ? lt : 0;
    lightState.lsFreeze = isFinite(lt);
  }
  loaded = true;
  loadingEl.classList.add('done');
  if (uiVisible) {
    hudEl.classList.remove('hidden');
    if (!hudBuilt) buildHUD();
  }
  toast('球场已载入');
  // QA：?pixdump=heart 把真实渲染用的 instanceColor 按点阵网格输出到 #loading-error，
  // 供 headless 验收（不依赖截图像素采样，免疫于机位/遮挡/背景亮度）
  if (Q.get('pixdump')) dumpPixelGrid(Q.get('pixdump'));
  // QA：?fxdump=stripe|meet|chase 把看台/内场的平均亮度剖面打到 #loading-error
  if (Q.get('fxdump')) dumpWaveFx(Q.get('fxdump'));
  // QA：?lsdump=2.0 把灯光秀在 t=2.0s 的三载体实测值打到 #loading-error
  if (Q.get('lsdump') != null) {
    const raw = Q.get('lsdump');
    dumpLightShow(raw === 'off' ? NaN : (parseFloat(raw) || 0));
  }
  // QA：?bench=1 实例写色 CPU 微基准（逐档 ms/帧）
  if (Q.get('bench') === '1') { window.__bench = benchSticks; benchSticks(); }
}).catch((err) => {
  loadingError.textContent = '模型加载失败：' + (err && err.message ? err.message : err) +
    '\n请确认通过 HTTP 访问（不能用 file:// 直接打开）';
  console.error(err);
});

// ---------- QA：把真实渲染用的点阵 instanceColor 打印成 ASCII ----------
// 读取的是渲染器里实际的 instanceColor 数组，因此验证的是「编址 + 配色 + 刷新」
// 整条生产路径，而不是离线模型的期望值。
function dumpPixelGrid(pattern) {
  if (!crowdGroup) return;
  const G = pitGrid();
  const u = crowdGroup.userData;
  const W = G.cols, H = G.rows;
  lightState.audienceMode = 'pixel';
  lightState.pixelPattern = pattern;
  lightState.pixelScroll = false;
  updateCrowd(crowdGroup, 0, lightState);        // 立即按 shift=0 写一遍颜色
  const cells = new Map();
  let noColor = 0, dup = 0;
  for (const e of u.pixelEntries || []) {
    const ic = e.mesh && e.mesh.instanceColor;
    if (!ic) { noColor++; continue; }
    const r = e.row, c = e.col;
    if (!(r >= 0 && r < H && c >= 0 && c < W)) continue;
    const key = `${r},${c}`;
    if (cells.has(key)) { dup++; continue; }
    const i3 = e.idx * 3;
    cells.set(key, (ic.array[i3] + ic.array[i3 + 1] + ic.array[i3 + 2]) / 3);
  }
  const cnt = { main: 0, edge: 0, dim: 0, black: 0 };
  for (const [, v] of cells) {
    if (v > 2.0) cnt.main++; else if (v > 0.4) cnt.edge++;
    else if (v > 0.05) cnt.dim++; else cnt.black++;
  }
  const lines = [];
  lines.push(`[pixdump] pattern=${pattern} grid=${W}x${H} sticks=${u.pixelSticks || 0} `
    + `entries=${(u.pixelEntries || []).length} cells=${cells.size}/${W * H} `
    + `noColor=${noColor} dup=${dup}`);
  lines.push(`[pixdump] main=${cnt.main} edge=${cnt.edge} dim=${cnt.dim} black=${cnt.black}`);
  lines.push('[pixdump]     ' + Array.from({ length: W }, (_, i) => String(i % 10)).join(''));
  for (let r = 0; r < H; r++) {
    let line = '';
    for (let c = 0; c < W; c++) {
      const v = cells.get(`${r},${c}`);
      line += v === undefined ? ' ' : (v > 2.0 ? '#' : v > 0.4 ? '+' : v > 0.05 ? '.' : ' ');
    }
    lines.push(`[pixdump] ${String(r).padStart(2, ' ')} ${line}`);
  }
  loadingError.textContent += lines.join('\n') + '\n';
}

// ---------- QA：把真实 instanceColor 按位置分桶，验证人浪光效 ----------
// 看台按环向 u（0..1 整周）分 48 桶、内场按列 col 分 50 桶，各桶求平均亮度，
// 输出「剖面字符串」——足以判读条纹/相遇/追逐的形状、方向、前沿位置。
const FX_RAMP = ' .:-=+*#%@';
function dumpWaveFx(mode) {
  const W = DATA.concert.waveFx;
  lightState.audienceMode = mode;
  lightState.wave = null;
  // 取一个能看出形状的时刻：meet 取前沿推进到 ~55% 时（尚未合拢）
  const t = mode === 'meet' ? W.meet.period * 0.35 : 0;
  if (audienceGroup) updateAudience(audienceGroup, t, lightState);
  if (crowdGroup) updateCrowd(crowdGroup, t, lightState);
  const lines = [`[fxdump] mode=${mode} t=${t.toFixed(2)}`];

  const buckets = (entries, keyOf, n) => {
    const sum = new Float64Array(n), cnt = new Float64Array(n);
    for (const e of entries || []) {
      const ic = e.mesh && e.mesh.instanceColor;
      if (!ic) continue;
      const k = keyOf(e);
      if (!(k >= 0 && k < n)) continue;
      const i3 = e.idx * 3;
      sum[k] += (ic.array[i3] + ic.array[i3 + 1] + ic.array[i3 + 2]) / 3;
      cnt[k]++;
    }
    return Array.from({ length: n }, (_, i) => (cnt[i] ? sum[i] / cnt[i] : 0));
  };
  const toStr = (arr) => {
    const mx = Math.max(...arr, 1e-4);
    return arr.map((v) => FX_RAMP[Math.min(FX_RAMP.length - 1, Math.round((v / mx) * (FX_RAMP.length - 1)))]).join('');
  };
  // 看台：环向 48 桶
  if (audienceGroup && audienceGroup.userData.pixelEntries) {
    const a = buckets(audienceGroup.userData.pixelEntries, (e) => Math.floor(e.u * 48), 48);
    const zeros = a.filter((v) => v <= 1e-6).length;
    lines.push(`[fxdump] stands n=48 min=${Math.min(...a).toFixed(3)} max=${Math.max(...a).toFixed(3)} zeros=${zeros}/48`);
    lines.push('[fxdump] stands |' + toStr(a) + '|');
  }
  // 内场：按列 50 桶（每列把 31 排平均掉）
  if (crowdGroup && crowdGroup.userData.pixelEntries) {
    const c = buckets(crowdGroup.userData.pixelEntries, (e) => e.col, 50);
    const zeros = c.filter((v) => v <= 1e-6).length;
    lines.push(`[fxdump] pit n=50 min=${Math.min(...c).toFixed(3)} max=${Math.max(...c).toFixed(3)} zeros=${zeros}/50`);
    lines.push('[fxdump] pit    |' + toStr(c) + '|');
  }
  loadingError.textContent += lines.join('\n') + '\n';
}

// ---------- QA：灯光秀的三载体实测数值（A / B 通用） ----------
// 直接读场景里「正在渲染」的真实值：应援棒 instanceColor（看台 8870 支分 48 桶）、
// 环带材质 emissiveIntensity、LED 大屏 emissiveIntensity + 屏体缩放、光束各束 uAlpha、
// 以及编舞本身返回的曲线值。用途：headless dump-dom 一次拿到全部载体的量，不依赖截图采样。
function dumpLightShow(t) {
  const isB = lightState.lightShowVariant === 'b';
  const P = isB ? DATA.concert.lightShowB : DATA.concert.lightShow;
  const phaseAt = isB ? lightShowBPhaseAt : lightShowPhaseAt;
  // ?lsdump=off → 走「未开启」路径，验证着色器 uniform 与光束颜色能否干净归位
  const off = !isFinite(t);
  const R = off ? null : lightShowOf({ lightShow: true, lightShowT: t, lightShowVariant: lightState.lightShowVariant }, t);
  const tt = off ? 0 : t; // off 模式下给一个合法时间，避免把 NaN 传给下游
  lightState.lightShow = !off;
  lightState.lightShowT = tt;
  lightState.lsFreeze = !off;
  // 先跑一遍氛围，让 ribbonMesh.userData.lsBaseIntensity 有值（tick 里本来是这个顺序）
  updateAtmosphere(timeOfDay, sceneState.lightsOff);
  if (lightsGroup) updateLights(lightsGroup, tt, lightState);
  if (ribbonMesh) updateLightShowRibbon(ribbonMesh, R, tt);
  const ribState = ribbonMesh ? ensureRibbonShader(ribbonMesh) : null;
  if (stadiumGroup?.userData?.stageGroup) updateLightShowBody(stadiumGroup.userData.stageGroup, R, tt);
  if (audienceGroup) updateAudience(audienceGroup, tt, lightState);
  const tag = isB ? 'lsdumpB' : 'lsdump';
  const lines = [off
    ? `[${tag}] mode=off（未开启灯光秀，验证归位）`
    : `[${tag}] t=${t.toFixed(2)}/${R.total.toFixed(2)} phase=${R.name} p=${R.p.toFixed(3)} w=${R.w.toFixed(3)}`];
  if (!off) {
    lines.push(`[${tag}] curve sticks.gain=${R.sticks.gain.toFixed(3)} sticks.white=${R.sticks.white.toFixed(3)} `
      + `bandU=${R.sticks.bandU.toFixed(3)} bandW=${R.sticks.bandW.toFixed(3)} bandFloor=${R.sticks.bandFloor.toFixed(3)} `
      + `ribbon=${R.ribbon.intensity.toFixed(3)} ribbonWhite=${R.ribbon.white.toFixed(3)} beam=${R.beam.gain.toFixed(3)} beamWhite=${R.beam.white.toFixed(3)}`
      + (isB ? ` beamBlue=${(R.beam.blue || 0).toFixed(3)}` : ''));
    if (isB && R.body) {
      lines.push(`[${tag}] curve body.gain=${R.body.gain.toFixed(3)} tint=${R.body.tint.toFixed(3)} stripe=${R.body.stripe.toFixed(3)} `
        + `scale=${R.body.scale.toFixed(3)} freq=${R.body.freq.toFixed(2)} phase=${R.body.phase.toFixed(3)}`);
    }
  }
  // 环带：材质实际 emissiveIntensity
  if (ribbonMesh) {
    const lu = ribState && ribState.uniforms;
    lines.push(`[${tag}] ribbon emissiveIntensity=${ribbonMesh.material.emissiveIntensity.toFixed(4)} `
      + `base=${(ribbonMesh.userData.lsBaseIntensity ?? NaN).toFixed(4)} `
      + `uLsMix=${lu ? lu.uLsMix.value.toFixed(3) : 'NA'} uLsWhite=${lu ? lu.uLsWhite.value.toFixed(3) : 'NA'}`);
  } else lines.push(`[${tag}] ribbon MISSING`);
  // LED 大屏（B 的光团本体）：材质亮度 + 着色器 uniform + 屏体缩放
  const ledMat = stadiumGroup?.userData?.stageGroup?.userData?.ledMainMat;
  if (ledMat) {
    const su = ledMat.userData.sbUniforms || null;
    const wallGrp = stadiumGroup.userData.stageGroup.getObjectByName('led-wall');
    // 屏体缩放只作用于非背板的子级（screen-wall 被刻意跳过，所以不能取 children[0]）
    const scaled = wallGrp ? wallGrp.children.find((m) => m.name !== 'screen-wall') : null;
    const sc = scaled ? scaled.scale.x : NaN;
    const sbU = ledMat.userData.sbUniforms;
    lines.push(`[${tag}] screen emissiveIntensity=${ledMat.emissiveIntensity.toFixed(4)} `
      + `base=${(ledMat.userData.sbBaseIntensity ?? NaN).toFixed(4)} scale=${sc.toFixed(3)} `
      + `uSbMix=${sbU ? sbU.uSbMix.value.toFixed(3) : 'NA'} uSbTint=${sbU ? sbU.uSbTint.value.toFixed(3) : 'NA'} `
      + `uSbStripe=${sbU ? sbU.uSbStripe.value.toFixed(3) : 'NA'} uSbFreq=${sbU ? sbU.uSbFreq.value.toFixed(2) : 'NA'} `
      + `patched=${ledMat.userData.sbPatched ? (ledMat.userData.sbPatched.frag && ledMat.userData.sbPatched.vert ? 'ok' : 'partial') : 'none'}`);
  } else lines.push(`[${tag}] screen MISSING`);
  // 光束：各束 uAlpha（core 层）× 全 20 层求和
  if (lightsGroup && lightsGroup.userData.beamUnits) {
    const units = lightsGroup.userData.beamUnits;
    const alphas = units.map((u) => u.alphas.reduce((s, a) => s + a.u.value, 0));
    const heads = units.map((u) => u.headMat.emissiveIntensity);
    lines.push(`[${tag}] beams n=${units.length} alphaSum min=${Math.min(...alphas).toFixed(3)} max=${Math.max(...alphas).toFixed(3)}`);
    lines.push(`[${tag}] beams |` + toStrRamp(alphas) + '|');
    lines.push(`[${tag}] heads min=${Math.min(...heads).toFixed(2)} max=${Math.max(...heads).toFixed(2)}`);
    // 颜色是否已转白/转蓝：取第一束的两层 uColor
    const c0 = units[0].colors[0]?.value;
    if (c0) lines.push(`[${tag}] beamColor0 r=${c0.r.toFixed(3)} g=${c0.g.toFixed(3)} b=${c0.b.toFixed(3)}`);
  } else lines.push(`[${tag}] beams MISSING`);
  // 看台应援棒：48 桶平均亮度（真实 instanceColor）
  if (audienceGroup && audienceGroup.userData.pixelEntries) {
    // 量的是「发光材质的有效倍率」：有 instanceColor 就是它的均值，
    // 没有（着色器走 #else 分支、vColor 不参与）就是 1.0 —— 两种情况在屏幕上等价，
    // 所以直接比这个数才不会被「有没有分配缓冲区」这种实现细节误导。
    const n = 48, sum = new Float64Array(n), cnt = new Float64Array(n);
    let noColor = 0;
    for (const e of audienceGroup.userData.pixelEntries) {
      const ic = e.mesh && e.mesh.instanceColor;
      const k = Math.min(n - 1, Math.max(0, Math.floor(e.u * n)));
      if (!ic) { noColor++; sum[k] += 1; cnt[k]++; continue; }
      const i3 = e.idx * 3;
      sum[k] += (ic.array[i3] + ic.array[i3 + 1] + ic.array[i3 + 2]) / 3;
      cnt[k]++;
    }
    const arr = Array.from({ length: n }, (_, i) => (cnt[i] ? sum[i] / cnt[i] : 0));
    lines.push(`[${tag}] sticks n=${n} noColor=${noColor} min=${Math.min(...arr).toFixed(3)} max=${Math.max(...arr).toFixed(3)} `
      + `zeros=${arr.filter((v) => v <= 1e-6).length}/${n} mean=${(arr.reduce((a, b) => a + b, 0) / n).toFixed(3)}`);
    lines.push(`[${tag}] sticks |` + toStrRamp(arr) + '|');
  } else lines.push(`[${tag}] sticks MISSING`);
  loadingError.textContent += lines.join('\n') + '\n';
}
function toStrRamp(arr) {
  const mx = Math.max(...arr, 1e-4);
  return arr.map((v) => FX_RAMP[Math.min(FX_RAMP.length - 1, Math.round((v / mx) * (FX_RAMP.length - 1)))]).join('');
}

// ---------- QA：实例写色的 CPU 微基准（?bench=1）----------
// headless 下 FPS 不可信（虚拟时间不驱动 rAF），但结构性热点正好在 CPU 这一层：
// 每帧对 8870 支看台棒 + 1550 支内场棒逐实例写 instanceColor / 平移分量。
// 这里直接给 updateAudience + updateCrowd 计时，warmup 后取 reps 帧均值。
// 'off' 一档跳过了全部应援棒工作、只留 700 片小方片，用它当固定开销基线。
function benchSticks() {
  if (!audienceGroup || !crowdGroup) {
    loadingError.textContent += '[bench] audience/crowd 未就绪\n';
    return;
  }
  const reps = 120, warm = 20;
  const saved = {
    audienceMode: lightState.audienceMode, wave: lightState.wave,
    lightShow: lightState.lightShow, lightShowT: lightState.lightShowT,
    lsFreeze: lightState.lsFreeze, pixelPattern: lightState.pixelPattern,
    pixelScroll: lightState.pixelScroll, pixelShift: lightState.pixelShift,
  };
  const DT = 0.016;
  const stageZ = DATA.stadium.goalLineSouthZ + 6;
  const origin = { x: DATA.stadium.pitch.center.x, z: stageZ };
  // 每档：setup 一次性配置，pre(i) 每帧微调（灯光秀时钟必须逐帧推进，否则权重不变）
  const cases = [
    ['off', () => { lightState.lampBanks = false; }, null],
    ['normal', () => { lightState.lampBanks = true; lightState.audienceMode = 'normal'; lightState.wave = null; }, null],
    ['wave', () => {
      lightState.lampBanks = true; lightState.audienceMode = 'normal';
      lightState.wave = { origin, t: 0, speed: 12, width: 6, ampBoost: 1.4, starts: [0, 3] };
    }, (i) => { lightState.wave.t = i * DT; }],
    ['stripe', () => { lightState.lampBanks = true; lightState.audienceMode = 'stripe'; lightState.wave = null; }, null],
    ['meet', () => { lightState.lampBanks = true; lightState.audienceMode = 'meet'; lightState.wave = null; }, null],
    ['chase', () => { lightState.lampBanks = true; lightState.audienceMode = 'chase'; lightState.wave = null; }, null],
    ['tide', () => { lightState.lampBanks = true; lightState.audienceMode = 'tide'; lightState.wave = null; }, null],
    ['pixel', () => { lightState.lampBanks = true; lightState.audienceMode = 'pixel'; lightState.wave = null; lightState.pixelScroll = false; }, null],
    ['ripple', () => { lightState.lampBanks = true; lightState.audienceMode = 'ripple'; lightState.wave = null; }, null],
    ['spiral', () => { lightState.lampBanks = true; lightState.audienceMode = 'spiral'; lightState.wave = null; }, null],
    ['duet', () => { lightState.lampBanks = true; lightState.audienceMode = 'duet'; lightState.wave = null; }, null],
    ['lightshow', () => {
      lightState.lampBanks = true; lightState.audienceMode = 'normal'; lightState.wave = null;
      lightState.lightShow = true; lightState.lightShowVariant = 'a'; lightState.lsFreeze = false;
    }, (i) => { lightState.lightShowT = i * DT; }],
  ];
  const out = [];
  try {
    for (const [label, setup, pre] of cases) {
      setup();
      if (pre) { for (let i = 0; i < warm; i++) pre(i); }
      for (let i = 0; i < warm; i++) {
        updateAudience(audienceGroup, i * DT, lightState);
        updateCrowd(crowdGroup, i * DT, lightState);
      }
      const t0 = performance.now();
      for (let i = 0; i < reps; i++) {
        if (pre) pre(warm + i);
        updateAudience(audienceGroup, (warm + i) * DT, lightState);
        updateCrowd(crowdGroup, (warm + i) * DT, lightState);
      }
      out.push([label, (performance.now() - t0) / reps]);
    }
  } finally {
    // 还原现场：基准跑完后把状态放回原样，避免污染截图与后续 QA
    Object.assign(lightState, saved);
    lightState.lampBanks = true;
  }
  const off = out[0][1];
  const lines = [`[bench] reps=${reps} unit=ms/frame (updateAudience+updateCrowd)`];
  for (const [label, ms] of out) {
    const d = label === 'off' ? '' : ` sticks=${(ms - off).toFixed(3)}`;
    lines.push(`[bench] ${label.padEnd(9, ' ')} ${ms.toFixed(3)}${d}`);
  }
  loadingError.textContent += lines.join('\n') + '\n';
}

// ---------- 初始机位 ----------
// QA 逐层显影：?layers=ground,stage,audience（缺省全部显示）
const LAYER_NAMES = ['bowl', 'ground', 'concert-field', 'stage', 'sound', 'stage-lights', 'audience', 'crowd', 'singer', 'band', 'led-ribbon', 'sky'];
function applyLayersParam(stadium) {
  const q = Q.get('layers');
  if (!q) return;
  const show = new Set(q.split(',').map((s) => s.trim()).filter(Boolean));
  const byName = {};
  for (const c of stadium.children) if (c.name) byName[c.name] = c; // 仅直接子级，避免 GLB 同名节点遮蔽
  byName.crowd = crowdGroup;
  byName.singer = singerGroup;
  byName.band = bandGroup;
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
    const base = (A.ribbonIntensityDay + (A.ribbonIntensityNight - A.ribbonIntensityDay) * night) * (lightsOff ? 0.15 : 1);
    // 记下氛围基准值：灯光秀 A 的环带层以它为锚点插值（否则每帧被这里覆盖）
    ribbonMesh.userData.lsBaseIntensity = base;
    ribbonMesh.material.emissiveIntensity = base;
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
  // 外部可用 apply(v) 只更新按钮态而不触发回调（用于其它入口改动状态后同步显示）
  return { apply: (v) => { on.classList.toggle('on', v); off.classList.toggle('on', !v); } };
}

let hudBuilt = false;
let currentViewName = '鸟瞰全景';
let currentViewId = 'aerial';
let orbitAngle = 0;
let statFrames = 0;
// 人浪分栏的光效按钮（常规放在人浪里，与潮汐/条纹/相遇/追逐并列）
const WAVE_FX_BTNS = [['normal', '常规'], ['tide', '潮汐'], ['stripe', '条纹'], ['meet', '相遇'], ['chase', '追逐']];
// 特效按钮注册表：fxEls[audienceMode] = [button, ...]，任何入口（HUD 按钮 / URL 参数 / 开场秀）
// 改 lightState.audienceMode 后调 syncFx 即可让所有分栏的按钮状态保持一致。
const fxEls = {};
const fxHooks = [];   // 非按钮类的联动（如「点阵屏」开关的 on 态）
let _lastSyncedFx = lightState.audienceMode;   // 上次同步时的模式（开场秀改状态后用于补一次 syncFx）
function syncFx() {
  const cur = lightState.audienceMode;
  for (const k of Object.keys(fxEls)) {
    for (const b of fxEls[k]) b.classList.toggle('on', k === cur);
  }
  for (const h of fxHooks) h(cur);
}
function setFx(id) {
  lightState.audienceMode = id;
  _lastSyncedFx = id;
  syncFx();
}
function regFx(id, btn) {
  (fxEls[id] || (fxEls[id] = [])).push(btn);
}
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

  // 观众（星海开关 + 点阵屏开关 + 点阵图案）
  const ga = grp('crowd', '👥', '观众');
  mkToggle(ga, '观众星海', true, (v) => {
    if (audienceGroup) audienceGroup.visible = v;
    if (crowdGroup) crowdGroup.visible = v;
    toast(v ? '观众星海已开' : '观众星海已关');
  });
  // 「点阵屏」是内场专属开关，与「人浪」分栏并列而不是挤在同一个三选一里：
  // 开 → audienceMode='pixel'（内场插棒显示图案，看台不参与），关 → 回到常规呼吸。
  const pixToggle = mkToggle(ga, '点阵屏', lightState.audienceMode === 'pixel', (v) => {
    setFx(v ? 'pixel' : 'normal');
    toast(v ? '内场点阵屏已开' : '内场点阵屏已关');
  });
  const patRow = document.createElement('div');
  patRow.className = 'hud-row';
  // 点阵屏只由内场插棒承担（看台应援棒不参与图案），故标签写明「内场」
  patRow.innerHTML = '<label>内场图案</label>';
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

  // 人浪（常规 / 潮汐 / 条纹 / 相遇 / 追逐）—— 观众光效的第二组
  const gWv = grp('wave', '🌊', '人浪');
  const wRow = document.createElement('div');
  wRow.className = 'hud-row';
  wRow.innerHTML = '<label>光效</label>';
  const wSeg = document.createElement('div');
  wSeg.className = 'seg';
  for (const [id, name] of WAVE_FX_BTNS) {
    const b = document.createElement('button');
    b.textContent = name;
    b.dataset.fx = id;
    if (id === lightState.audienceMode) b.classList.add('on');
    b.onclick = () => { setFx(id); toast(`人浪光效：${name}`); };
    regFx(id, b);
    wSeg.appendChild(b);
  }
  wRow.appendChild(wSeg);
  gWv.appendChild(wRow);
  // 「点阵屏」开关跟随 audienceMode（HUD 按钮 / URL 参数 / 开场秀都可能改它）
  fxHooks.push((mode) => pixToggle.apply(mode === 'pixel'));
  syncFx();
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

  // 灯光秀（两个视频的复刻，各自循环播放）
  const gls = grp('lightshow', '✨', '灯光秀');
  // 变体切换：A = 全环应援棒 + 屋顶环带 + 舞台光束；B = 舞台中央单光团
  const LS_VARIANTS = [['a', '灯光秀 A'], ['b', '灯光秀 B']];
  const lsVarRow = document.createElement('div');
  lsVarRow.className = 'hud-row';
  lsVarRow.innerHTML = '<label>版本</label>';
  const lsVarSeg = document.createElement('div');
  lsVarSeg.className = 'seg';
  const lsVarBtns = {};
  for (const [id, name] of LS_VARIANTS) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => {
      lightState.lightShowVariant = id;
      lightState.lightShowT = 0;      // 换变体后从头播，避免两个时间轴长度不同导致跳段
      lightState.lsFreeze = false;
      for (const k of Object.keys(lsVarBtns)) lsVarBtns[k].classList.toggle('on', k === id);
      lsDurText.textContent = `${lsDurOf(id).toFixed(1)}s`;
      toast(id === 'b' ? '切换到灯光秀 B（舞台中央光团）' : '切换到灯光秀 A（全环应援棒）');
    };
    lsVarBtns[id] = b;
    lsVarSeg.appendChild(b);
  }
  lsVarBtns[lightState.lightShowVariant]?.classList.add('on');
  lsVarRow.appendChild(lsVarSeg);
  gls.appendChild(lsVarRow);
  const lsDurOf = (id) => (id === 'b' ? lightShowBDuration(DATA.concert.lightShowB) : lightShowDuration(DATA.concert.lightShow));
  const lsToggle = mkToggle(gls, '播放灯光秀', lightState.lightShow, (v) => {
    lightState.lightShow = v;
    lightState.lsFreeze = false;
    if (v) lightState.lightShowT = 0;
    toast(v ? '灯光秀已开始' : '灯光秀已停止');
  });
  const lsInfo = document.createElement('div');
  lsInfo.className = 'hud-row';
  const lsDesc = document.createElement('label');
  lsDesc.style.cssText = 'color:var(--text-dim);font-size:10.5px;line-height:1.5';
  lsDesc.textContent = 'A：应援棒 + 屋顶环带 + 舞台光束 · B：舞台中央光团 · 循环播放';
  lsInfo.appendChild(lsDesc);
  gls.appendChild(lsInfo);
  const lsStage = document.createElement('div');
  lsStage.className = 'hud-row';
  lsStage.innerHTML = '<label>阶段</label><span style="color:var(--text-dim);font-size:11px">待机</span>'
    + '<span style="color:var(--text-dim);font-size:10.5px;margin-left:6px" data-dur></span>';
  gls.appendChild(lsStage);
  const lsStageVal = lsStage.querySelector('span');
  const lsDurText = lsStage.querySelector('[data-dur]');
  lsStageEl = lsStageVal;
  lsDurText.textContent = `${lsDurOf(lightState.lightShowVariant).toFixed(1)}s`;

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

// ---------- QA 性能探针（?perf=1）----------
// 每段耗时累加，满 30 帧把均值写进 #loading-error，headless dump-dom 一次取出。
// 只用于定位卡顿，正常运行零开销（perfMode=false 时 _p() 立即返回）。
const perfMode = Q.get('perf') === '1';
const _perfAcc = { n: 0, t: {}, last: 0 };
let _tSeg = 0;
const _p = (name) => {
  if (!perfMode) return;
  const n = performance.now();
  _perfAcc.t[name] = (_perfAcc.t[name] || 0) + (n - _tSeg);
  _tSeg = n;
};
function _pFlush() {
  if (!perfMode) return;
  const a = _perfAcc;
  a.n++;
  if (a.n < 30) return;
  const keys = ['atmos', 'show', 'hud', 'lights', 'ribbon', 'audience', 'crowd', 'band', 'singer', 'camera', 'render', 'tick'];
  const parts = keys.filter((k) => a.t[k] != null).map((k) => `${k}=${(a.t[k] / a.n).toFixed(2)}`);
  loadingError.textContent += `[perf] frames=${a.n} ${parts.join(' ')}\n`;
  a.n = 0; a.t = {}; a.last = performance.now();
}
const _lastGoodCam = { pos: new THREE.Vector3(-262, 175, 320), tgt: new THREE.Vector3(-32, 14, 49) };
function tickBody() {
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
  if (perfMode) _tSeg = performance.now();
  updateAtmosphere(timeOfDay, sceneState.lightsOff);
  _p('atmos');
  if (show) show.update(dt);
  if (show?.r?.fireworks) show.r.fireworks.update(dt);
  _p('show');
  // 灯光秀自身时钟：只在启用时推进（改 timeScale 只影响它，不动常态呼吸）
  const lsDef = lightState.lightShowVariant === 'b' ? DATA.concert.lightShowB : DATA.concert.lightShow;
  if (lightState.lightShow && !lightState.lsFreeze) lightState.lightShowT += dt * (lsDef?.timeScale ?? 1);
  // HUD 阶段指示
  if (lsStageEl && lightState.lightShow) {
    const isB = lightState.lightShowVariant === 'b';
    const ph = isB ? lightShowBPhaseAt(lightState.lightShowT, DATA.concert.lightShowB)
      : lightShowPhaseAt(lightState.lightShowT, DATA.concert.lightShow);
    const txt = `${LS_PHASE_LABEL[ph.name] || ph.name} ${ph.t.toFixed(1)}/${ph.total.toFixed(1)}s`;
    if (txt !== lsLastPhase) { lsLastPhase = txt; lsStageEl.textContent = txt; }
  } else if (lsStageEl && lsLastPhase !== '待机') {
    lsLastPhase = '待机';
    lsStageEl.textContent = '待机';
  }
  // 开场秀会直接改 lightState.audienceMode；HUD 建好后若发现不同步就刷新按钮态
  if (hudBuilt && lightState.audienceMode !== _lastSyncedFx) {
    _lastSyncedFx = lightState.audienceMode;
    syncFx();
  }
  if (lightsGroup) updateLights(lightsGroup, elapsed, lightState);
  _p('lights');
  // 环带层必须在 updateAtmosphere 之后覆写（那里刚写过常态值）。
  // 注意要无条件调用：关闭灯光秀时也要把 uLsMix 归 0，否则分段/去色着色会一直残留。
  const lsCur = lightShowOf(lightState, lightState.lightShowT);
  if (ribbonMesh) updateLightShowRibbon(ribbonMesh, lsCur, elapsed);
  _p('ribbon');
  // B 的中央光团本体：驱动舞台 LED 大屏（A 变体下 body 为 undefined → 自动归零）
  if (stadiumGroup?.userData?.stageGroup) updateLightShowBody(stadiumGroup.userData.stageGroup, lsCur, elapsed);
  if (audienceGroup) updateAudience(audienceGroup, elapsed, lightState);
  _p('audience');
  if (crowdGroup && crowdGroup.visible) updateCrowd(crowdGroup, elapsed, lightState);
  _p('crowd');
  if (bandGroup) updateBand(bandGroup, elapsed, lightState);
  _p('band');
  if (singerGroup && singerGroup.visible) updateSinger(singerGroup, dt);
  _p('singer');
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
  _p('camera');
  if (debugMode) updateDebugOverlay();
  statFrames++;
  composer.render();
  _p('render');
  // QA：渲染侧实况（shader 重复编译 / draw call / 三角形数）——判断卡顿是否在 GPU 侧
  if (perfMode && frameCount === 40) {
    const i = renderer.info;
    loadingError.textContent += `[ginfo] calls=${i.render.calls} tris=${i.render.triangles} `
      + `programs=${i.programs ? i.programs.length : -1} geometries=${i.memory.geometries} textures=${i.memory.textures} `
      + `pixelRatio=${renderer.getPixelRatio()} size=${renderer.domElement.width}x${renderer.domElement.height} `
      + `bloom=${bloom.strength.toFixed(2)} drawRange=${i.render.points}/${i.render.lines}\n`;
  }
  _pFlush();
  if (loaded) frameCount++;
  if (stillMode && loaded && frameCount >= 6) return;
  requestAnimationFrame(tick);
}
// 帧循环自愈：tickBody 内部任何异常都只跳过该帧，绝不打断 requestAnimationFrame 链条。
// 否则一次 ReferenceError 就会永久停帧（页面「卡住」但无报错弹窗，正是之前的症状）。
function tick() {
  try {
    tickBody();
  } catch (e) {
    window._tickErrCount = (window._tickErrCount || 0) + 1;
    if (window._tickErrCount <= 3) {
      loadingError.textContent += `[tick] ${e && e.message ? e.message : e}\n`;
      console.error('[tick]', e);
    }
    requestAnimationFrame(tick);
  }
}
tick();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// QA 辅助：外部可 window.__app 拿到关键对象
window.__app = {
  THREE, scene, camera, controls, renderer, composer, bloom, DATA, lightState, sceneState,
  get time() { return timeOfDay; }, set time(v) { timeOfDay = v; },
  // 分组引用：headless 验收需要读取看台实例颜色（instanceColor）
  get stage() { return stadiumGroup; },
  get audience() { return audienceGroup; },
  get crowd() { return crowdGroup; },
  get singer() { return singerGroup; },
  get band() { return bandGroup; },
  // 人浪光效：外部可 setFx('stripe') 切模式、dumpWaveFx() 出剖面
  setFx, syncFx, dumpWaveFx,
};
