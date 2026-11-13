// tools/storyboard.mjs —— 分镜脚本的唯一真相 + 生成 / 校验
//
//   node tools/storyboard.mjs --write    重新生成 STORYBOARD.md
//   node tools/storyboard.mjs --check    校验镜头参数是否都真实存在（CI 用）
//   node tools/storyboard.mjs --urls     打印每条镜头的完整地址（录制时逐条复制）
//   node tools/storyboard.mjs --prompter 生成 STORYBOARD.html（可点击的排镜台，录制时边拍边打勾）
//
// 镜头数据只写在下面的 SHOTS 里，STORYBOARD.md 是生成物，不要手改。
// 每条 url 只写 query 串（不带域名/端口），脚本自己拼 BASE。
// 默认拼本地 http://127.0.0.1:8141/；线上版用 CONCERT_BASE 覆盖，例如
//   CONCERT_BASE=https://ch2571875057-ux.github.io/emirates-concert-venue/ node tools/storyboard.mjs --urls
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPrompterHtml } from './prompter-template.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'STORYBOARD.md');
const HTML = path.join(ROOT, 'STORYBOARD.html');
// 本地默认；线上：CONCERT_BASE=https://ch2571875057-ux.github.io/emirates-concert-venue/
const BASE = process.env.CONCERT_BASE || 'http://127.0.0.1:8141/';
const SITE = 'https://ch2571875057-ux.github.io/emirates-concert-venue/';

const { DATA } = await import(pathToFileURL(path.join(ROOT, 'js/data.js')).href);
const { LS_IDS, lsEntry } = await import(pathToFileURL(path.join(ROOT, 'js/lightshowRegistry.js')).href);
const { FX_MODES } = await import(pathToFileURL(path.join(ROOT, 'js/wavefx.js')).href);
const { PATTERN_NAMES } = await import(pathToFileURL(path.join(ROOT, 'js/pixel.js')).href);

const SEG = DATA.show.segments;
const SHOW_TOTAL = SEG.reduce((a, s) => a + s.dur, 0);
const VIEW_IDS = [...DATA.views, ...DATA.camAudience, ...DATA.camSinger].map((v) => v.id);
// ?fx= 直写 lightState.audienceMode，除 6 档光效外还有 normal / tide / pixel 三种基础态
const FX_OK = ['normal', 'tide', 'pixel', ...FX_MODES];
// HUD「内场图案」五颗按钮的 id（js/app.js buildHUD 里的 [['heart','❤'], ...]）
const PATTERN_OK = ['heart', 'note', 'smiley', 'star', 'text'];
const OB = 'debug=1&cam=-70,46,-10&look=-32,6,52&fov=55&chrome=0';

const SHOTS = [
  // ---------------- A 片头空镜 ----------------
  { id: 'A1', ch: 'A', title: '黄昏鸟瞰', dur: 8, main: true,
    q: 'view=aerial&time=17.4&chrome=0',
    act: '打开即录，无需操作',
    cap: '酋长球场 · 黄昏',
    note: '实测 mean 38.8。同一机位到 19 点只剩 5.4–5.7，全黑不可用。' },
  { id: 'A2', ch: 'A', title: '南立面', dur: 7, main: true,
    q: 'view=facade&time=17.9&chrome=0',
    act: '打开即录',
    cap: '北伦敦 · 开场前',
    note: '实测 36.1。桅架与屋盖轮廓清楚。' },
  { id: 'A3', ch: 'A', title: '场馆侧影', dur: 7, main: true,
    q: 'debug=1&cam=-90,60,150&look=-32,20,49&fov=52&time=17.5&chrome=0',
    act: '打开即录（自定义机位，必须带 debug=1）',
    cap: '同一片夜色',
    note: '实测 28.5（time=17.8 只有 23.6，偏暗，所以提前到 17.5）。原计划的 view=roof 在 21 点 mean 5.8 全黑，已换成这个侧机位；chrome=0 会把 debug 角标一起藏掉。' },

  // ---------------- B 开场秀 ----------------
  { id: 'B0', ch: 'B', title: '开场秀 · 主机位全场', dur: 62.4, main: false,
    q: 'view=stagefront&show=1&chrome=0',
    act: '打开后等 1.5 s 稳定帧即开录，一口气录满 62.4 s',
    cap: '（无字幕，后期统一加）',
    note: '主轴线。stagefront 离舞台约 75 m，全场可见但全息只有约 130 px 高；细部靠下面的分段补镜。' },
  { id: 'B1', ch: 'B', title: '倒计时', dur: 5, main: true,
    q: 'view=aud-north&show=1&showT=0&chrome=0',
    act: '打开即录', cap: '19:30 · 开场',
    note: '全长最暗的一镜（实测 mean 13.7，属设计）：灯组关闭、dimmer 0.15，画面主体只有 LED 大数字 5→1；调色时不要提亮，否则后面的爆发没有对比。' },
  { id: 'B2', ch: 'B', title: '星海点亮 · 全息光柱', dur: 4, main: true,
    q: 'view=stagefront&show=1&showT=5&chrome=0',
    act: '打开即录', cap: '星海',
    note: '看台切 tide 潮汐，全息 pose=pillar 升起光柱，dimmer 0.25→1 抬亮。' },
  { id: 'B3', ch: 'B', title: '环带呼吸（灯光秀 A）', dur: 11.4, main: true,
    q: 'view=aud-east&show=1&showT=9&chrome=0',
    act: '打开即录', cap: '第一束光',
    note: '11.35 s，与灯光秀 A 时长严格对齐；全息 materialize 显形。' },
  { id: 'B4', ch: 'B', title: '心跳（灯光秀 D）', dur: 11, main: true,
    q: 'view=stagefront&show=1&showT=20.35&chrome=0',
    act: '打开即录', cap: '心跳',
    note: '不要用 aud-pit 拍这一段：该机位下 LED 白椭圆被 bloom 冲爆、全息变成白剪影（实测 mean 134.9、blown 0.81%）。' },
  { id: 'B5', ch: 'B', title: '涟漪扩散', dur: 4, main: true,
    q: 'view=aud-north&show=1&showT=31.35&chrome=0',
    act: '打开即录', cap: '涟漪',
    note: '看台同心环由内场向外扩散。' },
  { id: 'B6', ch: 'B', title: '螺旋上升', dur: 4, main: true,
    q: 'view=aud-east&show=1&showT=35.35&chrome=0',
    act: '打开即录', cap: '螺旋',
    note: '斜向单臂旋转，侧机位最容易看出方向。' },
  { id: 'B7', ch: 'B', title: '心形点阵 + 首发烟花', dur: 4, main: true,
    q: 'view=aud-pit&show=1&showT=39.35&chrome=0',
    act: '打开即录', cap: '你',
    note: '内场点阵拼心形，同时 0.6/1.8/3.0 s 三发烟花；内场前排视角仰看。' },
  { id: 'B8', ch: 'B', title: '深蓝终章（灯光秀 B + 环形烟花）', dur: 13, main: true,
    q: 'view=aud-south&show=1&showT=43.35&chrome=0',
    act: '打开即录', cap: '终章',
    note: '实测 86.4。south 机位越过舞台看星海，烟花在画面上方展开。' },
  { id: 'B9', ch: 'B', title: '谢幕 · 全息飞向常驻位', dur: 6, main: true,
    q: 'view=stagefront&show=1&showT=56.35&chrome=0',
    act: '打开即录', cap: '谢谢',
    note: '全息缩到 0.55 倍、2.4 s 内飞到舞台左侧 (-54, 7.32, 97) 常驻；歌手 bow。' },

  // ---------------- C 功能展示 ----------------
  { id: 'C1', ch: 'C', title: '视角切换 + 字幕', dur: 12, main: true,
    q: 'view=stagefront&pl=collapsed',
    act: '保留左侧栏（这一段就是要拍 UI）：依次点「鸟瞰全景」→「看台视角」→「内场看舞台」，每颗间隔 4 s；每次切换会补间 1.7 s 并弹出 3.4 s 字幕',
    cap: '（由 HUD 自动给出：视角名 + 说明）',
    note: '实测 70.6。不能用 chrome=0，面板藏了就点不到按钮；右侧歌单收成细条。默认机位是夜景鸟瞰（几乎全黑），所以用 view=stagefront 起步。看台视角机位 y=44 正卡在 LED 环带高度，画面会有一条过曝白带，只当「字幕演示」用。' },
  { id: 'C2a', ch: 'C', title: '灯光秀 A · 环带', dur: 11.4, main: true,
    q: 'view=aud-east&lightshow=a&chrome=0',
    act: '打开即录整段（11.35 s），剪辑时取精彩 4 s', cap: 'A 环带',
    note: '呼吸→爆发→收束→暗场→白带→回落。' },
  { id: 'C2b', ch: 'C', title: '灯光秀 B · 光团', dur: 13, main: false,
    q: 'view=aud-west&lightshow=b&chrome=0',
    act: '打开即录整段（13.0 s）', cap: 'B 光团',
    note: '点亮→闪白→转冷→深蓝→竖纹→隐去；LED 屏会被压成深蓝底。' },
  { id: 'C2c', ch: 'C', title: '灯光秀 C · 环流', dur: 12.6, main: true,
    q: 'view=aud-east&lightshow=c&chrome=0',
    act: '打开即录整段（12.6 s）', cap: 'C 环流',
    note: '实测 aud-east mean 110，五套里最亮最好看的一套。' },
  { id: 'C2d', ch: 'C', title: '灯光秀 D · 心跳', dur: 11, main: false,
    q: 'view=aud-west&lightshow=d&chrome=0',
    act: '打开即录整段（11.0 s）', cap: 'D 心跳',
    note: '全场同步拍点，唯一暖色编舞。' },
  { id: 'C2e', ch: 'C', title: '灯光秀 E · 极光', dur: 14.4, main: true,
    q: 'view=aud-west&lightshow=e&chrome=0',
    act: '打开即录整段（14.4 s）', cap: 'E 极光',
    note: '实测 aud-west mean 113，最亮；折返段环向相位真反向。' },
  { id: 'C3a', ch: 'C', title: '人浪 · 常规', dur: 3, main: false,
    q: OB + '&fx=normal', act: '打开即录 3 s', cap: '常规',
    note: '基线对照，其他七档的差别一眼可辨。' },
  { id: 'C3b', ch: 'C', title: '人浪 · 潮汐', dur: 3, main: false,
    q: OB + '&fx=tide', act: '打开即录 3 s', cap: '潮汐', note: '环向明暗推进。' },
  { id: 'C3c', ch: 'C', title: '人浪 · 条纹', dur: 3, main: false,
    q: OB + '&fx=stripe', act: '打开即录 3 s', cap: '条纹', note: '六道竖条缓慢漂移。' },
  { id: 'C3d', ch: 'C', title: '人浪 · 相遇', dur: 3, main: false,
    q: OB + '&fx=meet', act: '打开即录 3 s', cap: '相遇', note: '两侧向中心点亮，撞上后整场闪一次。' },
  { id: 'C3e', ch: 'C', title: '人浪 · 追逐', dur: 3, main: false,
    q: OB + '&fx=chase', act: '打开即录 3 s', cap: '追逐', note: '单头绕场追赶，带尾迹。' },
  { id: 'C3f', ch: 'C', title: '人浪 · 涟漪', dur: 3, main: true,
    q: OB + '&fx=ripple', act: '打开即录 3 s', cap: '涟漪', note: '同心环由舞台向外扩散。' },
  { id: 'C3g', ch: 'C', title: '人浪 · 螺旋', dur: 3, main: true,
    q: OB + '&fx=spiral', act: '打开即录 3 s', cap: '螺旋', note: '斜向单臂旋转。' },
  { id: 'C3h', ch: 'C', title: '人浪 · 对撞', dur: 3, main: false,
    q: OB + '&fx=duet', act: '打开即录 3 s', cap: '对撞', note: '两个亮头反向绕场，交错时闪一下。' },
  { id: 'C4a', ch: 'C', title: '点阵 · 心形', dur: 3, main: true,
    q: OB + '&pattern=heart&scroll=0', act: '打开即录 3 s', cap: '心形', note: '内场 50×31 点阵拼心形。' },
  { id: 'C4b', ch: 'C', title: '点阵 · 音符', dur: 3, main: false,
    q: OB + '&pattern=note&scroll=0', act: '打开即录 3 s', cap: '音符', note: '♪ 高音谱号，和心形一样是参数曲线描出来的。' },
  { id: 'C4c', ch: 'C', title: '点阵 · 笑脸', dur: 3, main: false,
    q: OB + '&pattern=smiley&scroll=0', act: '打开即录 3 s', cap: '笑脸', note: '☺ 两只眼睛 + 弧形嘴。' },
  { id: 'C4d', ch: 'C', title: '点阵 · 星星', dur: 3, main: false,
    q: OB + '&pattern=star&scroll=0', act: '打开即录 3 s', cap: '星星', note: '★ 五角星，五个顶点连线后光栅化成点阵。' },
  { id: 'C4e', ch: 'C', title: '点阵 · 字母', dur: 3, main: false,
    q: OB + '&pattern=text&scroll=0', act: '打开即录 3 s', cap: 'BB', note: 'BB 字样。' },
  { id: 'C5a', ch: 'C', title: '歌手特写', dur: 4, main: true,
    q: 'view=sg-close&chrome=0', act: '打开即录 4 s', cap: '主唱',
    note: '实测 mean 153，偏亮但人形清楚；追光打在脸上。' },
  { id: 'C5b', ch: 'C', title: '歌手环绕运镜', dur: 6, main: true,
    q: 'view=sg-orbit&orbitT=3.2&chrome=0', act: '打开即录 6 s', cap: '环绕',
    note: '自动绕歌手转圈；拖拽会退出环绕。' },
  { id: 'C6a', ch: 'C', title: '歌单 · 点播《树读》', dur: 8, main: true,
    q: 'view=stagefront&sb=collapsed',
    act: '保留右侧歌单：点第 2 条「树读」的 ▶，等面板高亮、副屏写出歌名、出声后录 8 s',
    cap: '《树读》',
    note: '实测 69.1。首个音频文件约有 1.5 s 解码预热（按钮先显示「…」再变「⏸」），剪辑时切掉。' },
  { id: 'C6b', ch: 'C', title: '歌单 · 《特别的人》', dur: 6, main: false,
    q: 'view=stagefront&sb=collapsed',
    act: '点第 1 条「特别的人」的 ▶，录 6 s（全曲 41 s，也可多录几段做背景音）',
    cap: '《特别的人》',
    note: '用户自备全曲，已去视频轨 + faststart，360 KB。' },
  { id: 'C7', ch: 'C', title: '全息常驻待机', dur: 4, main: true,
    q: 'debug=1&cam=-54,12,80&look=-54,9.5,97&fov=45&chrome=0&holoPhase=docked&holoT=1', act: '打开即录 4 s', cap: '吉祥物',
    note: '实测 107。常驻位在舞台左侧 (-54, 7.32, 97)、0.55 倍（6.3 m 高）；机位放在观众侧正对它，背后是海浪屏与环带。缓慢自转 + 上下浮动。' },
  { id: 'C8', ch: 'C', title: '第一人称漫游', dur: 6, main: true,
    q: 'walk=1&walkAt=-32.4,22,60&walkYaw=3.14159&chrome=0',
    act: '打开后按住 W 前进，录 6 s',
    cap: '走两步',
    note: '实测 99.8。站在观众席上方（y=22、z=60）朝舞台看，前景是人群剪影；按住 W 前进就是一段「飞向舞台」。walk 的高度被钳在 6.1–58，站在内场 z<78 会贴到人墙、画面全是巨型人头，别放那儿。' },

  // ---------------- D 片尾 ----------------
  { id: 'D1', ch: 'D', title: '夜景鸟瞰收尾', dur: 8, main: true,
    q: 'view=aerial&time=21&ui=0',
    act: '打开即录', cap: '酋长球场 · 灯光未熄',
    note: '实测 mean 3.8：纯空镜，ui=0 连字幕与面板一起关掉，只留画面。夜间鸟瞰偏暗是刻意的收尾感；想更亮可换 time=19.5。' },
];

const CHAPTERS = [
  { id: 'A', title: '片头空镜', desc: '黄昏窗口内三个外景，建立场地。' },
  { id: 'B', title: '开场秀', desc: '9 段 62.35 s；B0 是主机位全场，B1–B9 逐段补镜。' },
  { id: 'C', title: '功能展示', desc: '视角、5 套灯光秀、8 档人浪、5 种点阵、歌手、歌单音频、全息常驻、漫游。' },
  { id: 'D', title: '片尾', desc: '夜间鸟瞰收尾。' },
];

// ---------------- 校验 ----------------
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

function paramsOf(q) {
  return new URLSearchParams(q);
}

function validate() {
  ok(SHOTS.length > 0, 'SHOTS 为空');
  const ids = new Set();
  let tMain = 0, tAll = 0;
  for (const s of SHOTS) {
    ok(/^[A-Z]\d+[a-z]?$/.test(s.id), `镜号格式不对: ${s.id}`);
    ok(!ids.has(s.id), `镜号重复: ${s.id}`);
    ids.add(s.id);
    ok(CHAPTERS.some((c) => c.id === s.ch), `${s.id} 的章节 ${s.ch} 不存在`);
    ok(typeof s.dur === 'number' && s.dur > 0, `${s.id} 时长非法`);
    ok(!!s.act && !!s.cap, `${s.id} 缺少 操作/字幕`);
    tAll += s.dur;
    if (s.main) tMain += s.dur;

    const p = paramsOf(s.q);
    const view = p.get('view');
    if (view != null) ok(VIEW_IDS.includes(view), `${s.id} view=${view} 不在机位表里`);
    const fx = p.get('fx');
    if (fx != null) ok(FX_OK.includes(fx), `${s.id} fx=${fx} 不是合法特效`);
    const pat = p.get('pattern');
    if (pat != null) {
      ok(PATTERN_NAMES.includes(pat), `${s.id} pattern=${pat} 不在 PATTERN_NAMES 里`);
      ok(PATTERN_OK.includes(pat), `${s.id} pattern=${pat} 不在 HUD 五颗按钮里`);
    }
    const ls = p.get('lightshow');
    if (ls != null) ok(LS_IDS.includes(ls), `${s.id} lightshow=${ls} 不在注册表里`);
    if (p.get('lsT') != null) {
      // lsT 会冻结动画：录视频会变成静帧，禁止出现在镜头表里
      fails.push(`${s.id} 带了 lsT=，会冻结灯光秀；录制请只写 lightshow=`);
    }
    const showT = p.get('showT');
    if (showT != null) {
      const v = parseFloat(showT);
      ok(isFinite(v) && v >= 0 && v < SHOW_TOTAL, `${s.id} showT=${showT} 超出 0–${SHOW_TOTAL}`);
      ok(p.get('show') === '1', `${s.id} 有 showT 却没 show=1`);
    }
    if (p.get('cam') != null) {
      ok(p.get('debug') === '1', `${s.id} 用了 cam= 却忘了 debug=1（cam 只在 debug 下生效）`);
      const parts = p.get('cam').split(',').map(Number);
      ok(parts.length === 3 && parts.every((x) => isFinite(x)), `${s.id} cam 不是三个数字`);
    }
    const time = p.get('time');
    if (time != null) {
      const v = parseFloat(time);
      ok(isFinite(v) && v >= 0 && v <= 24, `${s.id} time=${time} 超出 0–24`);
    }
    if (p.get('still') === '1') fails.push(`${s.id} 带了 still=1，6 帧后会彻底停帧，录屏不能用`);
    if (s.ch === 'A' && time != null) {
      const v = parseFloat(time);
      ok(v >= 17 && v <= 18.5, `${s.id} 空镜 time=${v} 不在黄昏窗口 17–18.5（19 点后全黑）`);
    }
  }
  ok(SHOTS.filter((s) => s.ch === 'B').length === 10, 'B 章应为 B0 + 9 段补镜');
  return { tMain, tAll };
}

// ---------------- 渲染 ----------------
const fmt = (sec) => {
  // 先取整再拆分钟，否则 179.5 s 会渲染成 2:60
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const esc = (x) => String(x == null ? '' : x).replace(/\|/g, '\\|');

function render() {
  const { tMain, tAll } = validate();
  const L = [];
  L.push('# 分镜脚本（录制用）');
  L.push('');
  L.push('> 本文由 `tools/storyboard.mjs` 生成，**不要手改**。要改镜头请改脚本里的 `SHOTS`，再运行 `node tools/storyboard.mjs --write`；');
  L.push('> 校验用 `node tools/storyboard.mjs --check`（会逐条检查机位 id、特效 id、灯光秀 id、`showT` 范围，并确认本文与脚本一致）。');
  L.push('>');
  L.push(`> 主片 ${SHOTS.filter((s) => s.main).length} 镜 ≈ ${fmt(tMain)}；含可选补镜共 ${SHOTS.length} 镜 ≈ ${fmt(tAll)}。`);
  L.push('');
  L.push('## 一、这次要拍什么');
  L.push('');
  L.push('一条能讲清「这是什么、能玩什么」的演示片：黄昏外景 → 62 秒开场秀（拆成 10 个机位）→ 功能展示（视角 / 灯光秀 / 人浪 / 点阵 / 歌手 / 歌单 / 全息）→ 夜景收尾。');
  L.push('');
  L.push('**要边拍边看的话别读本文，直接开排镜台**：一镜一张卡，能一键跳转、按时长倒数、打勾记进度。本文是它的纯文本版 + 背景说明。');
  L.push('');
  L.push(`- 线上（不用装任何东西、发给别人也能看）：<${SITE}STORYBOARD.html>`);
  L.push('  - 线上首屏比本地慢几秒（模型走 CDN），**录屏一律用本地 `127.0.0.1:8141`**，同一镜重录行为才一致。');
  L.push('- 本地（自己机器上）：<http://127.0.0.1:8141/STORYBOARD.html>');
  L.push('');
  L.push('所有镜头都用现成的 URL 参数 + HUD 点击达成，不改任何场景代码。');
  L.push('');
  L.push('## 二、零基础操作手册（第一次用就照这个做）');
  L.push('');
  L.push('这一节假设你完全没碰过命令行、也没配过录屏软件。一步一步来，每步做完再做下一步。');
  L.push('');
  L.push('### 第 0 步：确认你能打开页面');
  L.push('');
  L.push('**最省事：用线上版**，不需要起服务、不需要装任何东西，打开就是完整场景：');
  L.push('');
  L.push(`<${SITE}>`);
  L.push('');
  L.push('线上版和本地版是同一份代码（`main` 分支推上去后 GitHub Pages 自动发布）。区别只有一个：线上第一次打开要下载模型，慢一些；本地有 no-cache 服务、且改代码后立刻生效。');
  L.push('');
  L.push('**要用本地版**（改了代码要立刻看效果，或线上打不开）就照下面做：');
  L.push('');
  L.push('');
  L.push('1. 打开文件夹 `E:\\concert1`。');
  L.push('2. 找到 **`启动服务器.bat`**，**双击**它。');
  L.push('3. 会弹出一个**黑色命令行窗口**，里面出现类似这样的两行：');
  L.push('');
  L.push('   ```');
  L.push('   concert1 本地服务器（Node, no-cache）');
  L.push('     serving http://127.0.0.1:8141/  from  E:\\concert1');
  L.push('   ```');
  L.push('');
  L.push('4. 浏览器会自动打开页面。**这个黑窗口从头到尾都不要关** —— 关了服务就停了，页面会变成「打不开」。');
  L.push('5. 如果浏览器没自动打开，手动在地址栏输入 `http://127.0.0.1:8141/` 再回车。');
  L.push('');
  L.push('> 页面打不开的两种常见情况：①黑窗口闪一下就没了 → 说明有东西挡住了，重来一次，看清楚窗口里最后一行写什么；②黑窗口还开着但浏览器报「无法访问」→ 检查地址是不是 `127.0.0.1:8141`（不是 `localhost`，也不要加 `https`）。');
  L.push('');
  L.push('### 第 1 步：打开排镜台');
  L.push('');
  L.push(`线上：地址栏输入 **<${SITE}STORYBOARD.html>**；本地：**<http://127.0.0.1:8141/STORYBOARD.html>**。`);
  L.push('');
  L.push('排镜台会自己认出当前站点，「打开这一镜」永远指向你正在看的那个地址 —— 所以同一份页面在线上、本地都能用。');
  L.push('');
  L.push('这一页就是你的拍摄清单：39 张卡片，每张是一个镜头，卡片上写着「怎么操作 / 多长 / 字幕打什么 / 有什么要注意」。');
  L.push('');
  L.push('### 第 2 步：摆好浏览器窗口');
  L.push('');
  L.push('这一步决定成片清不清晰，别跳过。');
  L.push('');
  L.push('1. 把浏览器窗口拖到能占满屏幕，或者直接按 **`F11`** 全屏。');
  L.push('2. 按 **`Ctrl + Shift + B`** 收起书签栏（有的浏览器是 `Ctrl + Shift + B`，Chrome/Edge 都一样）。');
  L.push('3. 确认浏览器缩放是 **100%**：按 `Ctrl + 0`（数字零）就回到 100%。');
  L.push('4. 屏幕分辨率要是 **1920×1080** 或更高。Windows 里：桌面右键 →「显示设置」→「显示分辨率」。');
  L.push('');
  L.push('> 如果你的屏幕是 2K/4K，Windows 默认会把缩放设成 125% 或 150%，页面会被放大、边缘被裁掉。两种处理：把 Windows 缩放调回 100%（字会变小），或者接受这一点，只录 1080p 输出。');
  L.push('');
  L.push('### 第 3 步：装并设置录屏软件（OBS）');
  L.push('');
  L.push('1. 搜「OBS Studio」下载安装（免费开源，官网 obsproject.com）。');
  L.push('2. 打开 OBS，左下「来源」框里点 **`+`** → 选 **「窗口采集」** → 确定。');
  L.push('3. 弹出的窗口列表里选你的**浏览器窗口**（标题通常含「酋长球场」或「排镜台」）。如果列表里是黑的，选「采集方式」里的另一项试试。');
  L.push('4. 右下「设置」→「输出」：录像格式选 MP4，编码器默认就行；「视频」里把**帧率设成 60**。');
  L.push('5. 「设置」→「音频」：麦克风那几项全部**禁用**（只要系统声音，避免录进环境噪音）。');
  L.push('6. 设置好了点「开始录制」，OBS 底部会变红点 + 计时。');
  L.push('');
  L.push('> 用 Windows 自带的 `Win + G` 也能录，但画质和帧率不如 OBS，且容易录到鼠标。既然要做成片，建议直接 OBS。');
  L.push('');
  L.push('### 第 4 步：录第一镜（拿 A1 练手）');
  L.push('');
  L.push('1. 在排镜台页面找到 **A1 黄昏鸟瞰** 这张卡。');
  L.push('2. 点卡片上的 **「打开这一镜」** —— 会新开一个标签页，自动是这一镜该有的画面。');
  L.push('3. 等画面里的**进度条走完**（约 1.5–3 秒）。');
  L.push('4. **再等 1.5 秒**（让镜头稳定、光影算完，否则第一帧会跳）。');
  L.push('5. 切到 OBS，点「开始录制」。');
  L.push('6. 切回排镜台，点这一镜的 **「计时开录」** —— 计时器开始走，走到卡片标的时长（A1 是 8 秒）会显示「到了，停录」。');
  L.push('7. 切回 OBS 点「停止录制」。');
  L.push('8. 回到排镜台，勾上这张卡的 **「已录好」** —— 顶部进度条会前进一格。');
  L.push('');
  L.push('把录下来的文件重命名成镜号（`A1.mp4`），放进一个专门的文件夾（比如 `E:\\concert1\\.video\\`）。');
  L.push('');
  L.push('### 第 5 步：把剩下的录完');
  L.push('');
  L.push('按 **A → B → C → D** 的顺序，重复第 4 步。为什么是这个顺序：');
  L.push('');
  L.push('- **B 章最花时间**（10 镜、两分多钟，其中 B0 一口气 62 秒），状态好的时候先干它；');
  L.push('- **A 章只有 22 秒**，但要黄昏画面，别拖到最后没耐心了随便录；');
  L.push('- **C 章都是 3–14 秒的短镜**，可以连着刷；');
  L.push('- **D1 是纯空镜**，随时可补。');
  L.push('');
  L.push('标了「补镜」的镜头是可选素材，主片用不上就不录；标了「主片」的 25 镜剪起来正好 3 分钟。');
  L.push('');
  L.push('### 第 6 步：不用录的镜和容易翻车的镜');
  L.push('');
  L.push('- **C1**：这一镜要在**左边面板上手动点三个视角按钮**（鸟瞰全景 → 看台视角 → 内场看舞台），点一次等 4 秒。它的意义是展示「切换视角时字幕会弹出来」。');
  L.push('- **C6a / C6b**：这一镜要在**右边歌单上点播放按钮**（第 2 条「树读」、第 1 条「特别的人」），等下方面板高亮 + 舞台副屏写出歌名 + 听到声音，再录。');
  L.push('- **带 `showT=` 的 B 章镜头**：页面加载时会先「快进」到那个时间点，然后**继续实时往前跑**。也就是说开录晚了这段就过去了 —— 重新点「打开这一镜」再来一次即可，参数不会坏。');
  L.push('- **C8 漫游**：要按住 `W` 键前进才有效果，不按就是静止画面。');
  L.push('');
  L.push('### 第 7 步：剪辑（可选）');
  L.push('');
  L.push('1. 剪映（免费、中文界面）新建项目，把 `A1.mp4`… 按顺序拖进时间线。');
  L.push('2. 片段之间可以加 0.2 秒交叉淡化，衔接会顺很多。');
  L.push('3. 字幕按每镜卡片上的「字幕」文案打，放在画面下方三分之一处；1080p 下字号别小于 40。');
  L.push('4. 想配背景音乐，用页面里歌单那几首（点播放后用 OBS 一起录进系统声音，或者单独导一份音轨）。');
  L.push('5. 导出选 1080p、60 帧、H.264。');
  L.push('');
  L.push('### 卡住了怎么办');
  L.push('');
  L.push('| 症状 | 先查这个 |');
  L.push('| --- | --- |');
  L.push('| 页面白屏 / 转圈不动 | 本地版：黑窗口（服务器）是不是被关了、地址是不是 `127.0.0.1:8141`；线上版：等首屏模型下完（约 5 MB，慢网 10–30 秒） |');
  L.push('| 画面全黑但按钮能点 | 这一镜的机位就是夜景（A1/B1/D1 正常），或者你改了地址里的 `time=` |');
  L.push('| 点「打开这一镜」没反应 | 浏览器拦截了弹窗，地址栏右侧点「始终允许」 |');
  L.push('| 录出来画面很糊 | 浏览器缩放不是 100%（`Ctrl+0`），或 OBS 采集的是「显示器」被系统缩放拉糊了 |');
  L.push('| 录出来的声音很小 | OBS 音频里「桌面音频」音量条拉高，或系统音量本身太小 |');
  L.push('| 打勾的进度没了 | 打勾存在浏览器本地，换了浏览器 / 清了缓存会丢（文件本身不会丢） |');
  L.push('');
  L.push('## 三、录制前准备');
  L.push('');
  L.push('### 机器');
  L.push('');
  L.push('- 分辨率 **1920×1080**，帧率 60 fps；浏览器窗口按 1080p 摆放、缩放 100%（`renderer` 的 `pixelRatio` 上限 2，高分屏上画布会 2 倍采样）。');
  L.push('- 用 OBS（或同等）**窗口采集**，音频只收系统声音，不要开麦克风。');
  L.push('- 起服务：双击 `启动服务器.bat`（没有 Python 会自动走 Node 兜底），或手动 `node server_nocache.mjs`，然后访问 `http://127.0.0.1:8141/`。');
  L.push('- **不要用 `?still=1`**：那是给截图用的，第 6 帧之后彻底停帧。');
  L.push('');
  L.push('### 画面干净程度三档');
  L.push('');
  L.push('| 参数 | 左右面板 | 视角字幕 | toast | 适用 |');
  L.push('| --- | --- | --- | --- | --- |');
  L.push('| 默认 | 都有 | 有 | 有 | 要拍 UI 的镜头（C1） |');
  L.push('| `?sb=collapsed` / `?pl=collapsed` | 收成 52px 细条 | 有 | 有 | 要保留一侧面板（C6 歌单） |');
  L.push('| `?chrome=0` | 全隐藏 | **保留** | 保留 | 纯画面镜头（A / B / C2–C5、C7） |');
  L.push('| `?ui=0` | 全隐藏 | **一起消失** | 消失 | 只要空镜（D1） |');
  L.push('');
  L.push('`chrome=0` 同时会把 `?debug=1` 的绿色参数角标藏掉，所以自定义机位可以放心用 `debug=1&cam=…`。');
  L.push('');
  L.push('### 每条镜头的操作流程');
  L.push('');
  L.push('1. 改地址栏成该镜的「完整地址」（见下表）。');
  L.push('2. 等加载完成（进度条走完，约 1.5–3 s）。');
  L.push('3. 再等 **1.5 s** 稳定（避免第一帧的着色器编译、相机补间入镜）。');
  L.push('4. 开录 → 按表里的时长录 → 停录。');
  L.push('5. 文件按镜号命名（`A1.mp4`、`B3.mp4`…），方便后期按表拼。');
  L.push('');
  L.push('带 `showT=` 的镜头是「加载时先快进到该秒数，然后继续实时播放」，所以快进那一瞬不会入镜——但**开录后它只会往前跑**，录晚了就错过这一段，需要重新加载。');
  L.push('');
  L.push('## 四、镜头表');
  L.push('');
  for (const ch of CHAPTERS) {
    const rows = SHOTS.filter((s) => s.ch === ch.id);
    if (!rows.length) continue;
    const sum = rows.reduce((a, s) => a + s.dur, 0);
    L.push(`### ${ch.id}. ${ch.title}（${rows.length} 镜，共 ${sum.toFixed(1)} s）`);
    L.push('');
    L.push(ch.desc);
    L.push('');
    L.push('| 镜号 | 时长 | 地址（`http://127.0.0.1:8141/?` 之后） | 操作 | 字幕文案 | 画面要点 / 注意 |');
    L.push('| --- | --- | --- | --- | --- | --- |');
    for (const s of rows) {
      const url = '`' + s.q + '`';
      const title = s.opt ? `${s.title}（可选）` : s.title;
      L.push(`| **${s.id}** ${esc(title)} | ${s.dur} s | ${url} | ${esc(s.act)} | ${esc(s.cap)} | ${esc(s.note)} |`);
    }
    L.push('');
  }
  L.push('## 五、开场秀 9 段 ↔ 镜号');
  L.push('');
  L.push(`总长 ${SHOW_TOTAL} s（\`DATA.show.segments\`）。`);
  L.push('');
  L.push('| # | 段 | 时间窗 | 内容 | 观众席 | 灯光秀 | 全息 | 对应镜号 |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  let t0 = 0;
  SEG.forEach((s, i) => {
    const shot = SHOTS.find((x) => x.id === `B${i + 1}`);
    const name = s.lightShow ? `${s.lightShow.toUpperCase()} ${lsEntry(s.lightShow).label.replace(/^[A-E] /, '')}` : '—';
    L.push(`| ${i + 1} | ${esc(s.label)} | ${t0.toFixed(2)}–${(t0 + s.dur).toFixed(2)} | ${esc(s.id)} | ${esc(s.audience || '—')} | ${esc(name)} | ${esc(s.holo)} | ${shot ? '**' + shot.id + '**' : '—'} |`);
    t0 += s.dur;
  });
  L.push('');
  L.push('> 灯光秀与人浪在看台上是**互斥**的（`updateAudience()` 里灯光秀优先接管），所以 9 段只能是交替编排，不能叠加。');
  L.push('');
  L.push('## 六、录制工作流（推荐顺序）');
  L.push('');
  L.push('1. **先定片子长度**：主片按 `main` 标记的镜头剪，约 ' + fmt(tMain) + '；其余补镜当素材库，用不上就丢。');
  L.push('2. **先录 B 章**：开场秀是主体，且 `showT` 只能从段首开始录，一次录错就得重来；趁手热先干这一段。');
  L.push('3. **再录 A 章**：黄昏窗口只有 `time=17.2–18.5`，但 `time` 是参数不是真实时间，随时可回。');
  L.push('4. **最后录 C 章**：都是 3–13 s 的短镜，可以批量刷；C1 / C6 要动鼠标，单独录。');
  L.push('5. **D1 收尾**：`ui=0` 纯空镜，可反复录。');
  L.push('6. **后期**：片段之间 0.2 s 交叉淡化；字幕按「字幕文案」列上屏（下三分之一，字号不小于 720p 的 28 px）。');
  L.push('');
  L.push('## 七、已知坑（都实测过）');
  L.push('');
  L.push('| 坑 | 现象 | 处理 |');
  L.push('| --- | --- | --- |');
  L.push('| `?still=1` | 第 6 帧后画面彻底不动 | 录制一律不带 |');
  L.push('| `?ui=0` | 视角字幕与 toast 一起消失 | 要字幕用 `chrome=0` |');
  L.push('| `?view=stands` | 机位 y=44 正卡 LED 环带，画面横贯过曝白带 | 只用来演示字幕，不用来拍画面 |');
  L.push('| `?view=aud-pit` 拍舞台 | LED 白椭圆被 bloom 冲成纯白、全息变白剪影 | 全息/歌手镜头换 `stagefront` / `aud-north` |');
  L.push('| 夜间 `aerial` / `facade` / `roof` | `time≥19` 时 mean 只有 5.4–5.7，几乎全黑 | 空镜只用 17.2–18.5；`roof` 直接放弃 |');
  L.push('| `?walk=1` 站在内场 | 高度被钳到 6.1，贴着人墙，全是巨型人头 | 站到观众席上方（y≥20、z≤70，见 C8） |');
  L.push('| `?cam=` 不生效 | 画面还是默认机位 | `cam` / `look` 只在 `debug=1` 下生效 |');
  L.push('| `?showT=` 录晚 | 段已经过去，录到的是下一段 | 重新加载该 URL 再录 |');
  L.push('| `?lsT=` | 灯光秀被冻结成静帧 | 镜头表不写 `lsT`，只写 `lightshow=`，整段录完再剪 |');
  L.push('');
  L.push('## 八、可复现的检查');
  L.push('');
  L.push('```bash');
  L.push('node tools/storyboard.mjs --check     # 镜头参数与本文一致性');
  L.push('```');
  L.push('');
  L.push('`--check` 会验证：每个 `view=` 都在 15 个机位里、`fx=` 在 8 档里、`pattern=` 在 5 种里、`lightshow=` 在 5 套里、');
  L.push('`showT=` 不超过 ' + SHOW_TOTAL + ' s、`cam=` 一定配了 `debug=1`、空镜时间落在黄昏窗口、以及本文与脚本逐字节一致。');
  L.push('');
  return L.join('\n');
}

// ---------------- 入口 ----------------
const mode = process.argv[2] || '--check';
if (mode === '--write') {
  const md = render();
  if (fails.length) {
    console.error('[storyboard] 校验未通过，拒绝写入：');
    for (const f of fails) console.error('  - ' + f);
    process.exit(1);
  }
  fs.writeFileSync(DOC, md, 'utf8');
  fs.writeFileSync(HTML, buildPrompterHtml(SHOTS, CHAPTERS, BASE.replace(/\/$/, ''), SHOW_TOTAL), 'utf8');
  const { tMain, tAll } = validate();
  console.log(`[storyboard] 已写入 ${path.relative(ROOT, DOC)} + ${path.relative(ROOT, HTML)}  shots=${SHOTS.length} main=${fmt(tMain)} all=${fmt(tAll)}`);
} else if (mode === '--urls') {
  // 打印可直接粘到地址栏的完整地址，录制时逐条复制
  if (fails.length) {
    for (const f of fails) console.error('  - ' + f);
    process.exit(1);
  }
  for (const s of SHOTS) console.log(`${s.id}\t${BASE}?${s.q}`);
} else if (mode === '--prompter') {
  if (fails.length) {
    for (const f of fails) console.error('  - ' + f);
    process.exit(1);
  }
  fs.writeFileSync(HTML, buildPrompterHtml(SHOTS, CHAPTERS, BASE.replace(/\/$/, ''), SHOW_TOTAL), 'utf8');
  console.log(`[storyboard] 已写入 ${path.relative(ROOT, HTML)}（浏览器打开 ${BASE}STORYBOARD.html）`);
} else if (mode === '--check') {
  render();
  if (fails.length) {
    console.error('[storyboard] FAILED');
    for (const f of fails) console.error('  - ' + f);
    process.exit(1);
  }
  const onDisk = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';
  const htmlWant = buildPrompterHtml(SHOTS, CHAPTERS, BASE.replace(/\/$/, ''), SHOW_TOTAL);
  const htmlNow = fs.existsSync(HTML) ? fs.readFileSync(HTML, 'utf8') : '';
  if (htmlNow !== htmlWant) {
    fails.push('STORYBOARD.html 与脚本不一致（运行 --write）');
  }
  if (onDisk !== render()) {
    console.error('[storyboard] STORYBOARD.md 与脚本不一致，请运行 --write 重新生成');
    process.exit(1);
  }
  const { tMain, tAll } = validate();
  console.log(`[storyboard] OK  shots=${SHOTS.length} main=${fmt(tMain)} all=${fmt(tAll)}`);
} else {
  console.error('usage: node tools/storyboard.mjs --write | --check | --urls | --prompter');
  process.exit(2);
}