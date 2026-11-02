/**
 * band-lab.js — 体素乐队沙盒（独立于主项目，不 import 任何项目文件）
 * 数据链路：
 *   tools/gen_models.py        体素网格（0.05 m/格）→ models/models.json
 *   tools/blender_build.py     Blender headless 建网格（只保留暴露面 + 贪心合并矩形）
 *                              → export/blender/<id>.glb（真多边形，Blender 原生 glTF 导出器）
 *   band-lab.js（本文件）：      GLTFLoader 读 GLB，按编制摆位放到舞台上
 * 坐标约定：
 *   模型原点 = 底面中心；模型「正面」朝 -Z（与主项目「舞台朝 -z、观众在 -z 侧」一致）
 *   LAYOUT 里的 x/z 是主项目坐标（x 为相对舞台中轴偏移，z 为绝对纵深，舞台前缘 z=92、后墙 z=116）
 *   场景内把主项目 z 映射到本地 z：local_z = (project_z - 92) - STAGE_D / 2
 *
 * QA 参数：?view=<name>&still=1&ui=0&cam=x,y,z&look=x,y,z&fov=<n>&time=<t>&mode=<solid|wire>
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------- 常量
const VOXEL = 0.05;                 // 米/格（与 gen_models.py 保持一致）
const DECK_Y = 0.0;                 // 沙盒里台面顶面 y
const STAGE_W = 60;                 // 主项目 stageV2.width
const STAGE_D = 24;                 // 主项目 stageV2.depth
const FRONT_Z = 92;                 // 主项目 stageV2.frontZ
const CENTER_Z = FRONT_Z + STAGE_D / 2;

/**
 * 编制摆位：x=相对中轴偏移，z=主项目绝对纵深，yaw=偏航角（度），s=缩放
 *
 * s = 1.5 是用户要求的「放大 1.5 倍以适配乐手」：体素模型按真实乐器尺寸建，
 * 但 1.7 m 的乐手站到旁边就显得乐器偏小（尤其吉他和贝斯，1.25 m 长在 1.7 m
 * 的人身前只到胸口以下）。整体放大到 1.5 倍后，乐器与乐手的视觉体量才对得上。
 * 缩放放在摆位里而不是改体素数据，是为了保留 5 cm 体素的方块颗粒度不变
 * （放大体素会让方块变粗，改数据则会重算全部三角面）。
 */
const SCALE = 1.5;

const LAYOUT = {
  drums:    { x: -11.5, z: 107.0, yaw: 10,  label: '架子鼓' },
  guitar:   { x: -15.0, z: 100.5, yaw: 18,  label: '电吉他' },
  amp:      { x: -17.5, z: 105.0, yaw: -16, label: '吉他音箱' },
  keys:     { x: 12.0,  z: 107.0, yaw: -10, label: '双层键盘' },
  bass:     { x: 15.0,  z: 100.5, yaw: -18, label: '电贝斯' },
  ampbass:  { x: 17.5,  z: 108.5, yaw: 16,  label: '贝斯音箱' },
};

/**
 * 乐手：主项目的观众模型（assets/crowd_a|crowd_b.glb）请上台当表演者。
 * 这两个 GLB 是 Tripo 静态单网格、约 480 三角面、高 0.99 m、原点在身体中部，
 * 原生朝向 +X（主项目 data.js 用 faceYaw=-90° 让它们面向 +Z，反过来即成立于此处）。
 * 本场景「面向观众 = 面向 -Z」，所以 yaw = +90° 时正对镜头，±6° 是演出时的自然偏身。
 * scale 1.72 与主项目 concert.crowd.scale 一致（0.99 m → 1.70 m 成人身高）。
 *
 * 站位：每人正对自己的乐器、横向与乐器对齐，乐器在自己身前 ——
 * 从观众席看过去乐器落在乐手胸前/手边，读成「人守着自己的乐器在演奏」，
 * 而不是「一件无人使用的乐器 + 旁边站了个人」。
 *   · 吉他 / 贝斯：站在落地琴架正后方 1.0 m（琴架藏在身体前面）
 *   · 架子鼓：站在鼓组后方（鼓手位），z 由鼓组旋转后的后沿反推
 *   · 双层键盘：站在键盘后方（键盘手位）
 * yaw ±6° 向内偏身，四人略朝舞台中心，像一个正在配合的乐队。
 */
const PERFORMERS = {
  p_guitar: { x: -15.0, z: 101.5, yaw: 84, model: 'crowd_a', scale: 1.72, sway: 1.8, label: '吉他手' },
  p_bass:   { x: 15.0,  z: 101.5, yaw: 96, model: 'crowd_b', scale: 1.72, sway: 1.5, label: '贝斯手' },
  p_drums:  { x: -11.5, z: 109.4, yaw: 92, model: 'crowd_b', scale: 1.72, sway: 1.2, label: '鼓手' },
  p_keys:   { x: 12.0,  z: 108.4, yaw: 88, model: 'crowd_a', scale: 1.72, sway: 1.6, label: '键盘手' },
};

const q = new URLSearchParams(location.search);
const has = (k) => q.has(k);
const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
const SHOW_UI = q.get('ui') !== '0';
const STILL = q.get('still') === '1';

// ---------------------------------------------------------------- 渲染器
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(STILL ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = num('exp', 2.4);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070f);
scene.fog = new THREE.Fog(0x070b14, 42, 96);

const camera = new THREE.PerspectiveCamera(num('fov', 42), innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 4.2, -26);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 2;
controls.maxDistance = 90;
controls.enabled = !STILL;

// ---------------------------------------------------------------- 后期
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Bloom 只负责台前发光条和霓虹，阈值调高避免把乐器本体冲成一片蓝
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.34, 0.55, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let bloomOn = true;

// ---------------------------------------------------------------- 灯光（沿用主项目调性：冷蓝环境 + 暖侧光 + 蓝逆光）
// 注意：three r155+ 默认物理光照单位，灯强度需要按「坎德拉/瓦特」量级给值，
// 否则整体画面会压到近乎全黑（本轮实测踩过）。
// 另外乐器本体多为深色，冷色环境光过强会把它们全部染蓝，所以环境光保持中性偏冷；
// 暖色侧光要够分量才能看出木质/橙棕网布的固有色。
const hemi = new THREE.HemisphereLight(0x5b6f8c, 0x141a26, 0.85);
scene.add(hemi);

const amb = new THREE.AmbientLight(0x3a4356, 0.55);
scene.add(amb);

function sideLight(x, y, z, color, intensity, w = 7) {
  // 注意：这里原先用 RectAreaLight，但 vendor/jsm 里没有 RectAreaLightUniformsLib，
  // 拿不到 LTC 贴图时 RectAreaLight 不参与着色（等于没开灯），实测暖光完全不起作用。
  // 改成 PointLight：物理单位下靠 intensity 与 decay 控制衰减，软件渲染也便宜。
  const l = new THREE.PointLight(color, intensity, 46, 1.5);
  l.position.set(x, y, z);
  scene.add(l);
  return l;
}
// 观众侧左右各一组暖色面光，打在乐队区（x ≈ ±18、z ≈ 4）
const sideL1 = sideLight(-20, 9, -14, 0xffcf9a, 62, 11);
const sideL2 = sideLight(20, 9, -14, 0xffd7a8, 62, 11);

// 观众正前方的暖色补光：让正对观众的琴体/网布显出橙棕本色。
// 这里刻意用「近乎水平」的平行光而不是点光：乐器是竖直立面、台面是水平面，
// 水平入射光几乎全部打在乐器立面上、擦过台面（点光从上方打会把 60×24 m 的台面照亮，
// 实测台面亮度是乐器的 5 倍，把主体压掉）。
const frontFill = new THREE.DirectionalLight(0xffe0c0, 1.55);
frontFill.position.set(-1.5, 3.4, -30);
frontFill.target.position.set(0, 1.2, 2);
scene.add(frontFill, frontFill.target);

const frontFill2 = new THREE.DirectionalLight(0xffd2b0, 0.85);
frontFill2.position.set(9, 2.6, -26);
frontFill2.target.position.set(2, 1.0, 3);
scene.add(frontFill2, frontFill2.target);

const rim = new THREE.DirectionalLight(0x4f8bff, 0.95);
rim.position.set(-6, 8, 22);
scene.add(rim);

const rim2 = new THREE.DirectionalLight(0x7fb0ff, 0.55);
rim2.position.set(8, 6, 20);
scene.add(rim2);

// 主光：从观众席上方打向乐队区，负责阴影
const key = new THREE.SpotLight(0xfff1dc, 420, 60, Math.PI * 0.34, 0.6, 1.35);
key.position.set(2, 18, -10);
key.target.position.set(0, 0, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0006;
key.shadow.camera.near = 6;
key.shadow.camera.far = 52;
scene.add(key, key.target);

// 两组顶光分别压左右侧乐队，避免侧面机位全黑（用 PointLight，软件渲染下比 SpotLight 便宜）
const topL = new THREE.PointLight(0xffe8cf, 30, 30, 1.6);
topL.position.set(-13, 8.5, 4);
scene.add(topL);

const topR = new THREE.PointLight(0xffe8cf, 30, 30, 1.6);
topR.position.set(13, 8.5, 4);
scene.add(topR);

// 乐队专用近场补光：乐器只有 1–1.8 m 高，靠远处的侧光根本吃不到多少照度，
// 会让整片乐器比台面还暗。在乐器正上方 3 m 挂两盏暖白点光，专门照亮乐器立面。
const bandLights = [];
function bandLight(x, z, color, intensity) {
  const l = new THREE.PointLight(color, intensity, 16, 1.3);
  l.position.set(x, 3.1, z);
  scene.add(l);
  bandLights.push(l);
  return l;
}
bandLight(-14.5, -2.5, 0xfff0dc, 90);
bandLight(14.5, -2.5, 0xfff0dc, 90);
bandLight(0, -6.5, 0xffe6c8, 60);
bandLight(-16.5, 2.0, 0xfff2e2, 70);
bandLight(16.5, 2.0, 0xfff2e2, 70);

// 全局灯强倍率（QA 调参用，?lm=1.8）。灯光参数一旦定稿就固定，这里只作现场微调。
// 分组倍率：mf=正面补光 ms=侧光 mk=主光 mt=顶光 mb=乐队近场 mbg=环境
const LIGHT_MUL = num('lm', 1);
const mulOf = (k) => LIGHT_MUL * num(k, 1);
const lightGroups = {
  side: [sideL1, sideL2], fill: [frontFill, frontFill2], key: [key],
  top: [topL, topR], band: bandLights, amb: [hemi, amb, rim, rim2],
};
for (const [g, list] of Object.entries(lightGroups)) {
  const k = { side: 'ms', fill: 'mf', key: 'mk', top: 'mt', band: 'mb', amb: 'ma' }[g];
  const kk = mulOf(k);
  if (kk !== 1) list.forEach((l) => { l.intensity *= kk; });
}

// ---------------------------------------------------------------- 舞台
// 台体/台面刻意做成「不受光的死黑」：它们是布景不是主体。
// 用 MeshStandardMaterial + 各种灯打上去时，台面（60×24 m 的水平面）几乎正对
// 顶光，会被打得比乐器亮得多（实测台面亮度是乐器的 5 倍，整片乐器被埋进亮带里）。
// 改成 MeshBasicMaterial（不受光照、固定色）后，台面恒定在很暗的色阶，
// 画面里最亮的永远是乐器本身。
const deckMat = new THREE.MeshBasicMaterial({ color: 0x0a0f18 });
const deck = new THREE.Mesh(new THREE.BoxGeometry(STAGE_W, 0.9, STAGE_D), deckMat);
deck.name = 'deck';
deck.position.set(0, DECK_Y - 0.45, 0);
deck.receiveShadow = true;
scene.add(deck);

// 台面薄板：比台体更暗一档，用来兜住乐器投影
const top = new THREE.Mesh(
  new THREE.BoxGeometry(STAGE_W - 0.02, 0.04, STAGE_D - 0.02),
  new THREE.MeshBasicMaterial({ color: 0x11161f })
);
top.name = 'deckTop';
top.position.set(0, DECK_Y + 0.02, 0);
top.receiveShadow = true;
scene.add(top);

// 台前发光条 + 背屏（只作氛围，不做设计主体）
const glowMat = new THREE.MeshBasicMaterial({ color: 0x2f7fd0 });
const glow = new THREE.Mesh(new THREE.BoxGeometry(STAGE_W - 1.2, 0.10, 0.12), glowMat);
glow.name = 'glow';
glow.position.set(0, DECK_Y + 0.06, -STAGE_D / 2 + 0.10);
scene.add(glow);

// 背墙必须用不受光材质：它是 58×11 m 的大平面，几乎正对主光和顶光，
// 用受光材质会被整体打成一面「灯箱」，在正视机位里横跨画面、
// 亮度压过所有乐器（实测整条亮带 100% 来自这里）。
const backWall = new THREE.Mesh(
  new THREE.BoxGeometry(STAGE_W - 2, 11, 0.4),
  new THREE.MeshBasicMaterial({ color: 0x05080e })
);
backWall.name = 'backWall';
backWall.position.set(0, 5.5, STAGE_D / 2 + 0.2);
scene.add(backWall);

// 单件编号地贴
function makeFloorTag(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,16,28,.0)';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#5f8fc0';
  g.font = 'bold 40px "Microsoft YaHei", Consolas, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.375),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ---------------------------------------------------------------- 加载 GLB
const loader = new GLTFLoader();
const items = {};          // id -> { root, box, layout, label }
const group = new THREE.Group();
scene.add(group);

const hud = document.getElementById('hud');
const panel = document.getElementById('panel');

let stats = { tris: 0, verts: 0, meshes: 0 };

// 近白材质（琴键）压暗倍率，?wm= 可覆盖
const WMUL = num('wm', 0.42);

function projectToLocal(lay) {
  return { x: lay.x, z: lay.z - CENTER_Z };
}

function addItem(id, lay, gltf) {
  const root = new THREE.Group();
  const model = gltf.scene;
  // 1.5 倍放大：模型原点在底面中心，所以直接缩放 group 就能保持「落地」不变。
  model.scale.setScalar(SCALE);
  root.add(model);
  const p = projectToLocal(lay);
  root.position.set(p.x, DECK_Y, p.z);
  root.rotation.y = THREE.MathUtils.degToRad(lay.yaw);
  root.name = id;
  group.add(root);

  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.material) {
      // 金属材质在「没有环境贴图」的场景里会渲染成纯黑（vendor/jsm 无 environments/，
      // 拿不到 RoomEnvironment）。预览阶段把 metalness 压到 0.25 以内，
      // 让银/铜仍能靠漫反射显出固有色；正式合入主项目时应改成挂环境贴图。
      o.material.metalness = Math.min(o.material.metalness ?? 0, 0.25);
      o.material.roughness = Math.max(0.35, Math.min(1, o.material.roughness ?? 0.6));
      o.material.envMapIntensity = 0.7;
      // 近白材质（琴键 f4f6fa / c9d2e0）是纯漫反射，金属度调不动它：在乐队近场补光下
      // 它会顶到 255，整片琴键糊成一块白板。这里按固有色亮度等比压暗一档，
      // 观感仍是「白琴键」，但保住了键缝和高光层次。
      if (o.material.color) {
        const c = o.material.color;
        const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        if (lum > 0.72) c.multiplyScalar(WMUL);
      }
    }
    const g = o.geometry;
    stats.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    stats.verts += g.attributes.position.count;
    stats.meshes += 1;
  });

  const box = new THREE.Box3().setFromObject(root);
  const tag = makeFloorTag(lay.label);
  tag.position.set(p.x, DECK_Y + 0.03, p.z - 0.95 * SCALE);
  scene.add(tag);

  items[id] = { root, box, layout: lay, label: lay.label, tag };
}

// ---------------------------------------------------------------- 乐手（主项目观众模型上台）
// 这两个 GLB 与体素乐器不同源：Tripo 出的大约 480 面静态网格，带烘焙贴图，
// 原点在身体中部（不是脚底），原生朝 +X。所以要单独处理三件事：
//   1) 落地：按包围盒把 min.y 压到台面，而不是简单设 y=0；
//   2) 朝向：绕 Y 转 +90° 让原生 +X 指向 -Z（观众方向）；
//   3) 比例：×1.72 与主项目 concert.crowd.scale 一致，0.99 m → 1.70 m。
// 另外给一点极轻的「呼吸/摆动」，静态截图（still=1）下不生效，只影响实时预览。
const performers = {};   // id -> { root, box, label, baseYaw, sway, phase }
// 乐手贴图整体压暗倍率（?pm= 可覆盖），见 addPerformer 里的说明
const PMUL = num('pm', 0.55);

function addPerformer(id, spec, gltf) {
  const root = new THREE.Group();
  const mesh = gltf.scene;

  mesh.scale.setScalar(spec.scale);
  mesh.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.material) {
      // 贴图已烘焙固有色，压掉金属度保证在任何灯下都能读出衣服颜色。
      // 另外整体压暗一档（PMUL）：这两张贴图本身接近白（浅色 T 恤），
      // 在曝光 2.4 + 五盏乐队近场补光下高光整片溢出，衣服褶皱全糊成白块
      // ——实测特写里 12.7% 的像素被切到 250 以上。压到 0.55 后回到 5% 量级。
      o.material.metalness = 0;
      o.material.roughness = 0.92;
      o.material.envMapIntensity = 0.7;
      o.material.color.multiplyScalar(PMUL);
    }
    const g = o.geometry;
    stats.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    stats.verts += g.attributes.position.count;
    stats.meshes += 1;
  });

  // 先算包围盒再落地，避免原点在身体中部导致半截埋进台里
  const raw = new THREE.Box3().setFromObject(mesh);
  mesh.position.y -= raw.min.y;
  root.add(mesh);

  const p = projectToLocal(spec);
  root.position.set(p.x, DECK_Y, p.z);
  root.rotation.y = THREE.MathUtils.degToRad(spec.yaw);
  root.name = id;
  group.add(root);

  const box = new THREE.Box3().setFromObject(root);
  const tag = makeFloorTag(spec.label);
  tag.position.set(p.x, DECK_Y + 0.03, p.z - 0.92);
  scene.add(tag);

  performers[id] = {
    root, box, label: spec.label,
    baseYaw: THREE.MathUtils.degToRad(spec.yaw),
    sway: spec.sway, phase: Math.random() * Math.PI * 2,
    act: spec.model, height: box.max.y - box.min.y,
  };
  items[id] = { root, box, layout: spec, label: spec.label, tag };
}

/**
 * 乐器与乐手一起计数：任何一方失败都不阻塞其余加载，
 * 但只有全部到齐才进入 onReady()，否则截图会拍在空舞台上。
 */
const IDS = Object.keys(LAYOUT);
const PIDS = Object.keys(PERFORMERS);
const TOTAL = IDS.length + PIDS.length;
let loaded = 0;
let failed = 0;

function step(id, ok) {
  loaded += 1;
  if (!ok) failed += 1;
  if (loaded === TOTAL) {
    if (failed) hud.textContent = `有 ${failed} 个模型加载失败，详见控制台`;
    onReady();
  }
}

IDS.forEach((id) => {
  loader.load(`./export/blender/${id}.glb`, (gltf) => {
    addItem(id, LAYOUT[id], gltf);
    step(id, true);
  }, undefined, (err) => {
    console.error('GLB 加载失败', id, err);
    hud.textContent = `加载失败：${id}.glb\n（请确认已运行 tools/blender_build.py 导出）`;
    step(id, false);
  });
});

// 四个乐手只用两个模型文件（crowd_a / crowd_b 各被两人复用）。
// 按文件分组、每个文件只下载解析一次，第二个人用 clone(true) 复用几何与材质，
// 省一次 200 KB 请求，也避免两份独立的贴图实例。
const filesNeeded = [...new Set(PIDS.map((id) => PERFORMERS[id].model))];

filesNeeded.forEach((file) => {
  loader.load(`../../assets/${file}.glb`, (gltf) => {
    for (const id of PIDS) {
      if (PERFORMERS[id].model !== file) continue;
      addPerformer(id, PERFORMERS[id], { scene: gltf.scene.clone(true) });
      step(id, true);
    }
  }, undefined, (err) => {
    console.error('乐手 GLB 加载失败', file, err);
    for (const id of PIDS) {
      if (PERFORMERS[id].model === file) step(id, false);
    }
  });
});

// ---------------------------------------------------------------- 视图
// 模型正面朝 -Z，观众在 -Z 侧。
// 乐队横向占到 x = ±18，所以正视机位必须留够横向余量，否则最外侧的
// 电吉他（-15）与贝斯音箱（+17.5）会被画幅切掉（实测过）。
const VIEWS = {
  // 距离由 tools/fit_views.py 二分求解：10 个对象（6 乐器 + 4 乐手）包围盒
  // 8 角点全部落在 NDC ±0.90 内。乐器按 SCALE=1.5 放大后的尺寸参与求解。
  front:   { pos: [0, 5.05, -22.64],      look: [0, 0.95, 3],  fov: 58 },
  front45: { pos: [22.42, 14.28, -15.13], look: [0, 1.2, 2],   fov: 52 },
  top:     { pos: [0.03, 31.05, 3.83],    look: [0, 0.6, 2],   fov: 46 },
  left:    { pos: [-22.28, 3.88, -0.78],  look: [-13, 1.1, 2], fov: 56 },
  right:   { pos: [22.36, 3.91, -0.81],   look: [13, 1.1, 2],  fov: 56 },
  // 背视必须把相机放在背墙以内（墙面在 z≈12.2），否则整面墙挡在镜头前。
  // fit_views 解出的 z=25.69 在墙外不可用，所以这里用超广角在近距离内装下整支乐队。
  back:    { pos: [0, 9.5, 11.2],         look: [0, 1.0, -2],  fov: 100 },
};

function applyView(name) {
  const v = VIEWS[name];
  if (!v) return;
  camera.fov = v.fov; camera.updateProjectionMatrix();
  camera.position.set(...v.pos);
  controls.target.set(...v.look);
  controls.update();
  currentView = name;
  markButtons();
}

let currentView = 'front45';

/**
 * 单件特写：按包围盒自动取景（3/4 视角）。
 * 用二分法求「刚好把包围盒 8 个角点都收进 NDC ±FILL」的最近距离。
 * 早先用 max(size) 估包围球，细高件只占画面 11%；后来改轴向投影估算，
 * 又因为 hExt 公式低估了斜视时的竖向投影，吉他/贝斯竖向出画（实测 h=125%）。
 * 直接投影角点最准，和 tools/qa_framing.py 用同一套判定。
 */
function focusItem(id) {
  const it = items[id];
  if (!it) return;
  const c = it.box.getCenter(new THREE.Vector3());
  const fov = 42;
  camera.fov = fov;
  camera.near = 0.05;
  camera.far = 400;
  camera.updateProjectionMatrix();
  const dir = new THREE.Vector3(0.62, 0.42, -0.66).normalize();
  // QA：?fdir=x,y,z 覆盖特写机位方向，用来给某件东西挑一个背景更干净的视角
  if (has('fdir')) {
    const d = q.get('fdir').split(',').map(Number);
    dir.set(d[0], d[1], d[2]).normalize();
  }

  const FILL = 0.86;
  const { min: bmin, max: bmax } = it.box;
  const corners = [];
  for (const x of [bmin.x, bmax.x]) {
    for (const y of [bmin.y, bmax.y]) {
      for (const z of [bmin.z, bmax.z]) corners.push(new THREE.Vector3(x, y, z));
    }
  }

  const tmp = new THREE.Vector3();
  const fits = (d) => {
    camera.position.copy(c).addScaledVector(dir, d);
    camera.lookAt(c);
    camera.updateMatrixWorld();
    for (const p of corners) {
      tmp.copy(p).project(camera);
      if (Math.abs(tmp.x) > FILL || Math.abs(tmp.y) > FILL || tmp.z > 1) return false;
    }
    return true;
  };

  let lo = 0.4, hi = 60;
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid; else lo = mid;
  }
  const dist = Math.max(hi, 0.6);

  camera.position.copy(c).addScaledVector(dir, dist);
  controls.target.copy(c);
  controls.update();
  focused = id;
  markButtons();
}

let focused = null;

// ---------------------------------------------------------------- 显示开关
const state = { solid: false, wire: false, ao: true, tags: true, ref: false, group: true };

const matSolid = new THREE.MeshStandardMaterial({ color: 0xb9bfc9, roughness: 0.62, metalness: 0.05 });
const matWire = new THREE.MeshBasicMaterial({ color: 0x4d7fb5, wireframe: true });

function applyState() {
  for (const id of Object.keys(items)) {
    const it = items[id];
    it.root.visible = state.group;
    if (it.tag) it.tag.visible = state.tags && state.group;
    it.root.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.userData.origMat) o.userData.origMat = o.material;
      // 素模/线框只作用于体素乐器；乐手靠贴图读出人形，替换掉就成了一团灰
      if (performers[id]) return;
      o.material = state.wire ? matWire : (state.solid ? matSolid : o.userData.origMat);
    });
  }
  bloomOn = state.bloom !== false;
  markButtons();
}

state.bloom = true;

// 1.7 m 比例参考柱（明确不是人物模型，只用于对比尺度）
const refGroup = new THREE.Group();
{
  const h = 1.7;
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, h, 12),
    new THREE.MeshStandardMaterial({ color: 0x2e6fb8, transparent: true, opacity: 0.30, roughness: 0.4 })
  );
  col.position.set(0, h / 2, 0);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x74a8dd, transparent: true, opacity: 0.5 })
  );
  cap.position.set(0, h, 0);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.10, 0.16, 20),
    new THREE.MeshBasicMaterial({ color: 0x4f88c4, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  refGroup.add(col, cap, ring);
}
refGroup.position.set(0, DECK_Y, -6.5);
refGroup.visible = false;
scene.add(refGroup);

// ---------------------------------------------------------------- UI
function markButtons() {
  if (!panel) return;
  panel.querySelectorAll('button[data-view]').forEach((b) => {
    b.classList.toggle('on', b.dataset.view === currentView && !focused);
  });
  panel.querySelectorAll('button[data-focus]').forEach((b) => {
    b.classList.toggle('on', b.dataset.focus === focused);
  });
}

function buildPanel() {
  if (!SHOW_UI || !panel) return;
  const viewRows = [
    ['front', '观众正前'], ['front45', '45°'], ['top', '顶视'],
    ['left', '左侧'], ['right', '右侧'], ['back', '台后'],
  ];
  let html = '<h4>机位</h4><div class="row">';
  html += viewRows.map(([k, t]) => `<button data-view="${k}">${t}</button>`).join('');
  html += '</div><h4>单件特写</h4><div class="row">';
  html += Object.keys(LAYOUT).map((k) => `<button data-focus="${k}">${LAYOUT[k].label}</button>`).join('');
  html += '</div><h4>乐手特写</h4><div class="row">';
  html += Object.keys(PERFORMERS).map((k) => `<button data-focus="${k}">${PERFORMERS[k].label}</button>`).join('');
  html += '</div><h4>显示</h4>';
  html += `<label><input type="checkbox" data-flag="group" checked>整组</label>`;
  html += `<label><input type="checkbox" data-flag="tags" checked>地贴标签</label>`;
  html += `<label><input type="checkbox" data-flag="solid">素模（去材质）</label>`;
  html += `<label><input type="checkbox" data-flag="wire">线框</label>`;
  html += `<label><input type="checkbox" data-flag="bloom" checked>Bloom</label>`;
  html += `<label><input type="checkbox" data-flag="ref">1.7m 比例参考柱</label>`;
  html += '<hr><div id="legend">体素 0.05 m/格 · 舞台 60×24 m<br>原点=底面中心，正面朝 -Z</div>';
  panel.innerHTML = html;

  panel.querySelectorAll('button[data-view]').forEach((b) => {
    b.onclick = () => { focused = null; applyView(b.dataset.view); };
  });
  panel.querySelectorAll('button[data-focus]').forEach((b) => {
    b.onclick = () => focusItem(b.dataset.focus);
  });
  panel.querySelectorAll('input[data-flag]').forEach((cb) => {
    cb.onchange = () => {
      const f = cb.dataset.flag;
      if (f === 'group') state.group = cb.checked;
      else if (f === 'tags') state.tags = cb.checked;
      else if (f === 'solid') { state.solid = cb.checked; if (cb.checked) state.wire = false; }
      else if (f === 'wire') { state.wire = cb.checked; if (cb.checked) state.solid = false; }
      else if (f === 'bloom') state.bloom = cb.checked;
      else if (f === 'ref') { state.ref = cb.checked; refGroup.visible = state.ref; }
      applyState();
      // 同步 checkbox 互斥状态
      const s = panel.querySelector('input[data-flag=solid]');
      const w = panel.querySelector('input[data-flag=wire]');
      if (s) s.checked = state.solid;
      if (w) w.checked = state.wire;
    };
  });
}

// ---------------------------------------------------------------- HUD
function updateHud() {
  if (!hud) return;
  const names = IDS.filter((id) => items[id]).map((id) => LAYOUT[id].label).join(' / ');
  const pn = PIDS.filter((id) => items[id]).map((id) => PERFORMERS[id].label).join(' / ');
  hud.innerHTML =
    `<b>Band Lab</b> · 体素乐队沙盒\n` +
    `乐器：${IDS.length} 件 / ${IDS.length} 种模型 —— ${names}\n` +
    `乐手：${PIDS.length} 位 —— ${pn}\n` +
    `三角面 ${Math.round(stats.tris).toLocaleString()} · 顶点 ${stats.verts.toLocaleString()} · mesh ${stats.meshes}\n` +
    `体素边长 ${VOXEL} m · 舞台 ${STAGE_W}×${STAGE_D} m\n` +
    `<span style="color:#5f7d9e">拖拽旋转 · 滚轮缩放 · 右键平移</span>`;
}

// ---------------------------------------------------------------- 启动
function onReady() {
  buildPanel();
  applyState();
  updateHud();

  // 覆盖参数
  if (has('mode')) {
    state.wire = q.get('mode') === 'wire';
    state.solid = q.get('mode') === 'solid';
  }
  if (has('ref')) { state.ref = q.get('ref') !== '0'; refGroup.visible = state.ref; }
  if (has('bloom')) { state.bloom = q.get('bloom') !== '0'; }
  if (has('bg')) {
    scene.background = new THREE.Color('#' + q.get('bg'));
    scene.fog = null;
  }
  applyState();
  // QA：按名字隐藏布景，用来判断某块亮色到底是模型还是环境。
  // 必须放在最后一次 applyState() 之后 —— applyState() 会把每个 item 的
  // root.visible 重设回 state.group，提前隐藏会被它无声地撤销（踩过一次）。
  if (has('hide')) {
    for (const n of q.get('hide').split(',')) {
      const o = scene.getObjectByName(n);
      if (o) o.visible = false;
    }
  }

  if (has('cam')) {
    const c = q.get('cam').split(',').map(Number);
    camera.position.set(c[0], c[1], c[2]);
  }
  if (has('look')) {
    const c = q.get('look').split(',').map(Number);
    controls.target.set(c[0], c[1], c[2]);
    controls.update();
  }
  if (has('focus')) focusItem(q.get('focus'));
  else if (has('view')) applyView(q.get('view'));

  if (!SHOW_UI) {
    hud.style.display = 'none';
    panel.style.display = 'none';
  }

  // still 模式：渲染若干帧后置标记，供截图脚本判断
  if (STILL) {
    let n = 0;
    const tick = () => {
      n += 1;
      render();
      if (n < 8) requestAnimationFrame(tick);
      else document.body.dataset.ready = '1';
    };
    requestAnimationFrame(tick);
    return;
  }
  renderer.setAnimationLoop(animate);
}

function render() {
  if (bloomOn) composer.render();
  else renderer.render(scene, camera);
}

const clock = new THREE.Clock();
const KEY_BASE = key.intensity;
function animate() {
  const t = clock.getElapsedTime();
  controls.update();
  // 呼吸感的灯光微动（很轻，不抢戏）
  key.intensity = KEY_BASE + Math.sin(t * 0.9) * KEY_BASE * 0.043;
  glow.material.color.setHSL(0.58, 0.62, 0.42 + Math.sin(t * 1.6) * 0.04);
  // 乐手轻微摇摆：静态模型没有骨骼，只能靠整体微转 + 微沉浮做出「在演奏」的感觉。
  // 幅度刻意压得很小（2° 以内、1 cm 以内），太大会像纸片人抽搐。
  for (const id of PIDS) {
    const pf = performers[id];
    if (!pf) continue;
    const k = Math.sin(t * pf.sway + pf.phase);
    pf.root.rotation.y = pf.baseYaw + k * 0.028;
    pf.root.position.y = DECK_Y + Math.abs(k) * 0.012;
  }
  render();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// 供外部脚本读取的调试接口
window.__bandLab = {
  get items() { return items; },
  get performers() { return performers; },
  get stats() { return stats; },
  applyView, focusItem, LAYOUT, PERFORMERS, VIEWS,
};
