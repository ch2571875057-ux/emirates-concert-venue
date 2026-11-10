// =====================================================================
// lightshowRegistry.js — 灯光秀变体注册表（单一真相）
//
// 每个变体是一个纯函数 at(t, P)，返回同一套契约：
//   { phase, name, p, t, total, w, sticks:{...}, ribbon:{...}, beam:{...} [, body:{...}] }
// 调用方（stadium.js / app.js）只认 id，不再写 `id === 'b' ? ... : ...` 的三目。
//
// 新增一套灯光秀要做的事：
//   1) 写 js/lightshowX.js，导出 at / phaseAt / duration 三个纯函数
//   2) 在 js/data.js 的 concert 下加 lightShowX 参数块
//   3) 在下面 LS_VARIANTS 里加一行
//   4) 在 app.js 的 LS_PHASE_LABEL 里加这套变体的阶段中文名
// =====================================================================
import { DATA } from './data.js';
import { lightShowAt, lightShowPhaseAt, lightShowDuration } from './lightshow.js';
import { lightShowBAt, lightShowBPhaseAt, lightShowBDuration } from './lightshowb.js';
import { lightShowCAt, lightShowCPhaseAt, lightShowCDuration } from './lightshowc.js';
import { lightShowDAt, lightShowDPhaseAt, lightShowDDuration } from './lightshowd.js';
import { lightShowEAt, lightShowEPhaseAt, lightShowEDuration } from './lightshowe.js';

/**
 * 变体表。顺序 = HUD 按钮顺序。
 * id        URL 参数 ?lightshow=<id> 的取值
 * label     HUD 按钮文案
 * desc      HUD 说明行（切到该变体时显示）
 * dataKey   DATA.concert 下的参数块名
 * body      该变体是否驱动舞台 LED 大屏本体（B/C/D/E 有，A 没有）
 * at/phaseAt/duration  纯函数引用
 */
export const LS_VARIANTS = [
  {
    id: 'a', label: 'A 环带', desc: 'A：应援棒 + 屋顶白带 + 光束（青白爆发 → 黑场 → 顶部巨带）',
    dataKey: 'lightShow', body: false,
    at: lightShowAt, phaseAt: lightShowPhaseAt, duration: lightShowDuration,
  },
  {
    id: 'b', label: 'B 光团', desc: 'B：舞台中央单光团（近白方体 → 横条闪爆 → 深蓝竖纹）',
    dataKey: 'lightShowB', body: true,
    at: lightShowBAt, phaseAt: lightShowBPhaseAt, duration: lightShowBDuration,
  },
  {
    id: 'c', label: 'C 环流', desc: 'C：多条光环绕场旋转 + 径向错拍，末段收拢成整片白光',
    dataKey: 'lightShowC', body: true,
    at: lightShowCAt, phaseAt: lightShowCPhaseAt, duration: lightShowCDuration,
  },
  {
    id: 'd', label: 'D 心跳', desc: 'D：全场同步拍点 + 暖白脉冲（唯一一套暖色编舞，中段拍频加倍）',
    dataKey: 'lightShowD', body: true,
    at: lightShowDAt, phaseAt: lightShowDPhaseAt, duration: lightShowDDuration,
  },
  {
    id: 'e', label: 'E 极光', desc: 'E：环向 + 径向双向慢波，中段折返，冷青到近白的缓慢漂移',
    dataKey: 'lightShowE', body: true,
    at: lightShowEAt, phaseAt: lightShowEPhaseAt, duration: lightShowEDuration,
  },
];

export const LS_BY_ID = Object.fromEntries(LS_VARIANTS.map((v) => [v.id, v]));
export const LS_DEFAULT = 'a';
export const LS_IDS = LS_VARIANTS.map((v) => v.id);

/** 未知 id 一律回落到默认变体（URL 容错：?lightshow=xyz 不该白屏） */
export const lsEntry = (id) => LS_BY_ID[id] || LS_BY_ID[LS_DEFAULT];

/** 该变体的参数块（DATA.concert 下的对象） */
export const lsParams = (id) => DATA.concert[lsEntry(id).dataKey];

/** 某一时刻的完整曲线 */
export function lightShowFor(id, t) {
  const e = lsEntry(id);
  return e.at(t, DATA.concert[e.dataKey]);
}

/** 某一时刻所处的阶段（HUD 阶段行用） */
export function lightShowPhaseFor(id, t) {
  const e = lsEntry(id);
  return e.phaseAt(t, DATA.concert[e.dataKey]);
}

/** 一轮总时长（秒） */
export function lightShowDurationFor(id) {
  const e = lsEntry(id);
  return e.duration(DATA.concert[e.dataKey]);
}

/** 该变体的时间缩放（tick 里的灯光秀时钟用） */
export function lightShowTimeScale(id) {
  const P = lsParams(id);
  return P && P.timeScale != null ? P.timeScale : 1;
}
