// =====================================================================
// show.js — 开场秀：九段编舞（复用灯光秀 A/D/B 与涟漪/螺旋/点阵）+ 星芒烟花 + 全息投影
// ShowManager：段表驱动的时间轴状态机，驱动 lightState/sceneState/LED/副屏/歌手/全息
// Fireworks：星芒烟花（四芒星光斑粒子 + 放射长芒 + 闪光 + 池化 PointLight + 上升彗星）
// =====================================================================
import * as THREE from 'three';
import { DATA } from './data.js';
import { paintScreen, paintWaveText } from './stadium.js';
import { lightShowFor } from './lightshowRegistry.js';

const S = DATA.stadium;
const STAGE_ORIGIN = { x: S.pitch.center.x, z: S.goalLineSouthZ + 6 };

// ---------- 共享闪光贴图 ----------
const flameTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,244,220,0.85)');
  g.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

// ---------- 星芒烟花 ----------
export class Fireworks {
  constructor(scene, F, origin) {
    this.F = F;
    this.scene = scene;
    this.origin = origin; // 碗心 {x,z}，发射点为相对偏移
    this.launches = [];
    this.bursts = [];
    this.flashes = [];
    this.lights = [];
    for (let i = 0; i < F.maxConcurrent; i++) {
      const l = new THREE.PointLight(0xffffff, 0, F.flash.lightDistance, 2);
      scene.add(l);
      this.lights.push({ light: l, t: 9, life: 1 });
    }
  }

  launch(relX, relZ, colorIdx, big) {
    const F = this.F;
    const x = this.origin.x + relX, z = this.origin.z + relZ;
    const y = F.heightMin + Math.random() * (F.heightMax - F.heightMin);
    const mat = new THREE.SpriteMaterial({
      map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xbfe3ff,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.setScalar(2.6);
    sp.position.set(x, F.launch.startY, z);
    this.scene.add(sp);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(20 * 3), 3));
    const line = new THREE.Line(lg, new THREE.LineBasicMaterial({
      color: 0x9fd4ff, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(line);
    this.launches.push({ x, y, z, sp, line, t: 0, dur: (y - F.launch.startY) / F.launch.speed, colorIdx, big });
  }

  // 生成一发爆：星形粒子 Points + 放射长芒 + 闪光 + 灯
  burst(x, y, z, colorIdx, big) {
    const F = this.F;
    const n = F.sparkCount;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const life = new Float32Array(n);
    const fade = new Float32Array(n);
    const sizes = new Float32Array(n);
    const phases = new Float32Array(n);
    const cols = new Float32Array(n * 3);
    const base = new THREE.Color(F.colors[colorIdx % F.colors.length]);
    const alt = new THREE.Color(F.colors[(colorIdx + 2) % F.colors.length]);
    for (let i = 0; i < n; i++) {
      // 球面均匀方向（y 略压扁）
      const u = Math.random() * 2 - 1;
      const ph = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const sp = F.speed[0] + Math.random() * (F.speed[1] - F.speed[0]);
      vel[i * 3] = s * Math.cos(ph) * sp;
      vel[i * 3 + 1] = u * 0.88 * sp;
      vel[i * 3 + 2] = s * Math.sin(ph) * sp;
      life[i] = F.life[0] + Math.random() * (F.life[1] - F.life[0]);
      sizes[i] = F.sparkSize * (0.6 + Math.random() * 0.8);
      phases[i] = Math.random() * Math.PI * 2;
      const c = Math.random() < 0.75 ? base : alt;
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uPx: { value: Math.min(window.devicePixelRatio || 1, 2) }, uSharp: { value: F.starSharp } },
      vertexShader: /* glsl */`
        attribute float aFade; attribute float aSize; attribute float aPhase;
        uniform float uPx;
        varying float vFade; varying float vPhase; varying vec3 vColor;
        void main() {
          vFade = aFade; vPhase = aPhase; vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPx * (1.0 + aFade * 0.9) * (170.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uT; uniform float uSharp;
        varying float vFade; varying float vPhase; varying vec3 vColor;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.0) discard;
          float a = atan(p.y, p.x) + vPhase + uT * ${F.starRotSpeed.toFixed(2)};
          float star = pow(abs(cos(2.0 * a)), uSharp);      // 四芒
          float rad = mix(0.28, 1.0, star);
          float body = smoothstep(rad, rad * 0.45, r);
          float glow = exp(-r * 3.0) * 0.55;
          float tw = 0.8 + 0.2 * sin(uT * 18.0 + vPhase * 7.0); // 闪烁
          float alpha = (body + glow) * vFade * tw;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(vColor * (0.7 + 0.9 * vFade), alpha);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    for (let i = 0; i < n; i++) { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; }
    this.scene.add(points);
    const b = { points, geo, mat, pos, vel, life, fade, n, t: 0, maxLife: F.life[1] + 0.3, x, y, z };
    this.bursts.push(b);

    // 放射长芒
    const RC = F.rays;
    const rpos = new Float32Array(RC.count * 2 * 3);
    const rdirs = [];
    for (let i = 0; i < RC.count; i++) {
      const u = Math.random() * 2 - 1;
      const ph = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      rdirs.push([s * Math.cos(ph), u, s * Math.sin(ph)]);
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
    const rmat = new THREE.LineBasicMaterial({
      color: base, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const rays = new THREE.LineSegments(rgeo, rmat);
    rays.frustumCulled = false;
    this.scene.add(rays);
    b.rays = { mesh: rays, geo: rgeo, mat: rmat, dirs: rdirs, t: 0, big };

    // 闪光 + 池化灯
    const fmat = new THREE.SpriteMaterial({
      map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false,
      color: base, opacity: 1,
    });
    const fs = new THREE.Sprite(fmat);
    fs.position.set(x, y, z);
    fs.scale.setScalar(6);
    this.scene.add(fs);
    this.flashes.push({ sp: fs, mat: fmat, t: 0, life: F.flash.life, size: F.flash.size });
    const slot = this.lights.find((L) => L.t >= L.life);
    if (slot) {
      slot.light.position.set(x, y, z);
      slot.light.color.copy(base);
      slot.t = 0; slot.life = 0.5;
    }
  }

  update(dt) {
    const F = this.F;
    // 上升彗星
    for (let i = this.launches.length - 1; i >= 0; i--) {
      const L = this.launches[i];
      L.t += dt;
      const f = Math.min(1, L.t / L.dur);
      const y = F.launch.startY + (L.y - F.launch.startY) * f;
      L.sp.position.set(L.x, y, L.z);
      const arr = L.line.geometry.attributes.position.array;
      for (let k = arr.length / 3 - 1; k > 0; k--) {
        arr[k * 3] = arr[(k - 1) * 3]; arr[k * 3 + 1] = arr[(k - 1) * 3 + 1]; arr[k * 3 + 2] = arr[(k - 1) * 3 + 2];
      }
      arr[0] = L.x; arr[1] = y; arr[2] = L.z;
      L.line.geometry.attributes.position.needsUpdate = true;
      L.line.material.opacity = 0.7 * (1 - f * 0.4);
      if (f >= 1) {
        this.scene.remove(L.sp, L.line);
        L.sp.material.dispose(); L.line.geometry.dispose(); L.line.material.dispose();
        this.launches.splice(i, 1);
        this.burst(L.x, L.y, L.z, L.colorIdx, L.big);
      }
    }
    // 爆炸粒子（CPU 积分：阻力 + 重力）
    for (let bi = this.bursts.length - 1; bi >= 0; bi--) {
      const b = this.bursts[bi];
      b.t += dt;
      const dragF = Math.pow(F.drag, dt * 60);
      const alive = b.t < b.maxLife;
      for (let i = 0; i < b.n; i++) {
        if (b.life[i] > 0) {
          b.life[i] -= dt;
          b.vel[i * 3] *= dragF; b.vel[i * 3 + 1] *= dragF; b.vel[i * 3 + 2] *= dragF;
          b.vel[i * 3 + 1] -= F.gravity * dt;
          b.pos[i * 3] += b.vel[i * 3] * dt;
          b.pos[i * 3 + 1] += b.vel[i * 3 + 1] * dt;
          b.pos[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
          b.fade[i] = Math.max(0, Math.min(1, b.life[i] / 0.9));
        } else {
          b.fade[i] = 0;
        }
      }
      b.geo.attributes.position.needsUpdate = true;
      b.geo.attributes.aFade.needsUpdate = true;
      b.mat.uniforms.uT.value = b.t;
      // 长芒
      if (b.rays) {
        b.rays.t += dt;
        const f = Math.min(1, b.rays.t / F.rays.life);
        const len = F.rays.length * (1 - Math.pow(1 - f, 3));
        const arr = b.rays.geo.attributes.position.array;
        for (let k = 0; k < b.rays.dirs.length; k++) {
          const d = b.rays.dirs[k];
          arr[k * 6] = b.x; arr[k * 6 + 1] = b.y; arr[k * 6 + 2] = b.z;
          arr[k * 6 + 3] = b.x + d[0] * len; arr[k * 6 + 4] = b.y + d[1] * len; arr[k * 6 + 5] = b.z + d[2] * len;
        }
        b.rays.geo.attributes.position.needsUpdate = true;
        b.rays.mat.opacity = 0.9 * (1 - f);
        if (f >= 1) { this.scene.remove(b.rays.mesh); b.rays.geo.dispose(); b.rays.mat.dispose(); b.rays = null; }
      }
      if (!alive) {
        this.scene.remove(b.points);
        b.geo.dispose(); b.mat.dispose();
        this.bursts.splice(bi, 1);
      }
    }
    // 闪光
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const p = f.t / f.life;
      if (p >= 1) {
        this.scene.remove(f.sp); f.mat.dispose();
        this.flashes.splice(i, 1);
        continue;
      }
      const ease = 1 - Math.pow(1 - Math.min(1, p * 1.6), 3);
      f.sp.scale.setScalar(6 + (f.size - 6) * ease);
      f.mat.opacity = 1 - p;
    }
    // 池化灯
    for (const L of this.lights) {
      if (L.t < L.life) {
        L.t += dt;
        const p = Math.min(1, L.t / L.life);
        L.light.intensity = this.F.flash.lightIntensity * Math.pow(1 - p, 1.6);
      } else {
        L.light.intensity = 0;
      }
    }
  }
}

// ---------- 开场秀时间轴 ----------
// 九段编舞由 DATA.show.segments 驱动（见 data.js 的注释）。
// 关键约束：updateAudience() 里「灯光秀」与「人浪/点阵」互斥
// （lightShowOf().w>0.001 时人浪分支走不到），所以段与段之间只能交替，不能叠加。
const SEGMENTS = (() => {
  let t = 0;
  return DATA.show.segments.map((s) => {
    const seg = Object.assign({}, s, { t0: t, t1: t + s.dur });
    t += s.dur;
    return seg;
  });
})();

export function showTotal() {
  return SEGMENTS.length ? SEGMENTS[SEGMENTS.length - 1].t1 : 0;
}

export function showSegments() {
  return SEGMENTS;
}

export function showSegmentAt(t) {
  if (t <= 0) return SEGMENTS[0];
  for (let i = 0; i < SEGMENTS.length; i++) if (t < SEGMENTS[i].t1) return SEGMENTS[i];
  return SEGMENTS[SEGMENTS.length - 1];
}

const lerpNum = (a, b, k) => a + (b - a) * k;

export class ShowManager {
  constructor(refs) {
    // refs: { lightState, sceneState, fireworks, getLedMat, getWaveTextMats,
    //         getSinger, getHolo, toast }
    this.r = refs;
    this.active = false;
    this.t = 0;
    this.launched = {};
    this.prev = null;
    this.holoCmd = { pose: 'docked' };
  }

  start() {
    const r = this.r;
    this.active = true;
    this.t = 0;
    this.launched = {};
    this.segId = null;
    this.singerPhase = null;
    this.lastN = 0;
    this.waveTextOn = false;
    // 全量快照：旧版只存了 3 项，导致 dimmer/audienceMode/wave 被秀改完后回不去
    this.prev = {
      mode: r.lightState.mode,
      lampBanks: r.lightState.lampBanks,
      lightsOff: r.sceneState.lightsOff,
      dimmer: r.lightState.dimmer,
      audienceMode: r.lightState.audienceMode,
      pixelPattern: r.lightState.pixelPattern,
      pixelScroll: r.lightState.pixelScroll,
      wave: r.lightState.wave,
      lightShow: r.lightState.lightShow,
      lightShowT: r.lightState.lightShowT,
      lightShowVariant: r.lightState.lightShowVariant,
      lsFreeze: r.lightState.lsFreeze,
    };
    r.lightState.dimmer = 1;
    r.toast('开场秀开始');
  }

  get total() {
    return showTotal();
  }

  // QA：以固定步长快进到 T 秒（烟花物理与全息姿态同步推进，结果确定）
  fastForward(T) {
    const step = 0.1;
    let t = 0;
    while (t < T && this.active) {
      this.step(step);
      this.r.fireworks.update(step);
      if (this.r.holoStep) this.r.holoStep(step);
      t += step;
    }
  }

  skip() {
    if (!this.active) return;
    this.t = this.total;
    this.step(0.001);
  }

  update(dt) {
    if (!this.active) return;
    this.step(dt);
    if (this.waveTextOn) {
      const sp = DATA.concert.waveText.scrollSpeed;
      for (const wm of this.r.getWaveTextMats()) wm.map.offset.x = (wm.map.offset.x - dt * sp) % 1;
    }
  }

  step(dt) {
    if (!this.active) return;
    const t = this.t;
    if (t >= this.total) { this.end(); return; }
    const seg = showSegmentAt(t);
    const p = seg.dur > 0 ? Math.min(1, (t - seg.t0) / seg.dur) : 0;
    this.applySegment(seg, p, t);
    this.t += dt;
  }

  applySegment(seg, p, t) {
    const r = this.r;
    const L = r.lightState;

    // ---- 段进入时的一次性动作 ----
    if (this.segId !== seg.id) {
      this.segId = seg.id;
      if (seg.led === 'sea') {
        const m = r.getLedMat();
        if (m) paintScreen(m, 'sea');
      }
      if (seg.waveText === 'show' && !this.waveTextOn) {
        const WT = DATA.concert.waveText;
        for (const wm of r.getWaveTextMats()) paintWaveText(wm, WT.showText);
        this.waveTextOn = true;
      } else if (seg.waveText === 'default' && this.waveTextOn) {
        const WT = DATA.concert.waveText;
        for (const wm of r.getWaveTextMats()) { paintWaveText(wm, WT.defaultText); wm.map.offset.x = 0; }
        this.waveTextOn = false;
      }
    }

    // ---- LED 倒计时数字（按秒变化才重绘） ----
    if (seg.led === 'countdown') {
      const n = Math.max(1, Math.ceil(seg.dur - (t - seg.t0)));
      if (n !== this.lastN) {
        this.lastN = n;
        const m = r.getLedMat();
        if (m) paintScreen(m, 'countdown', n);
      }
    }

    // ---- 全局光照 ----
    if (typeof seg.lightsOff === 'boolean') r.sceneState.lightsOff = seg.lightsOff;
    if (typeof seg.lampBanks === 'boolean') L.lampBanks = seg.lampBanks;
    if (seg.mode) L.mode = seg.mode;
    if (Array.isArray(seg.dimmer)) L.dimmer = lerpNum(seg.dimmer[0], seg.dimmer[1], p);
    else if (typeof seg.dimmer === 'number') L.dimmer = seg.dimmer;

    // ---- 看台：灯光秀 / 人浪 / 点阵（三者互斥，交给对应的状态字段） ----
    if (seg.lightShow) {
      L.lightShow = true;
      L.lightShowVariant = seg.lightShow;
      L.lightShowT = t - seg.t0;   // 段内时间：每段都从 0 起跑完整变体
      L.lsFreeze = true;           // 由 show 独占推进，避免 tick 里再累加一次
      if (seg.pixelPattern) L.pixelPattern = seg.pixelPattern;
      if (typeof seg.pixelScroll === 'boolean') L.pixelScroll = seg.pixelScroll;
    } else {
      L.lightShow = false;
      L.lsFreeze = true;
      if (seg.audience) {
        L.audienceMode = seg.audience;
        if (seg.pixelPattern) L.pixelPattern = seg.pixelPattern;
        if (typeof seg.pixelScroll === 'boolean') L.pixelScroll = seg.pixelScroll;
      }
      if (seg.audienceSwitch && (t - seg.t0) >= seg.audienceSwitch.at) {
        L.audienceMode = seg.audienceSwitch.to;
      }
    }
    L.wave = null;

    // ---- 歌手 ----
    if (seg.singer && this.singerPhase !== seg.singer) {
      this.singerPhase = seg.singer;
      const sg = r.getSinger && r.getSinger();
      if (sg) sg.userData.play(seg.singer);
    }

    // ---- 烟花 ----
    const ft = t - seg.t0;
    const FW = seg.fireworks;
    if (FW) {
      if (FW.singleAt) {
        const SG = DATA.fireworks.singles;
        for (let k = 0; k < FW.singleAt.length && k < SG.length; k++) {
          if (ft >= FW.singleAt[k] && !this.launched[seg.id + 's' + k]) {
            this.launched[seg.id + 's' + k] = true;
            r.fireworks.launch(SG[k].x, SG[k].z, k % 2 === 0 ? 1 : 0, true);
          }
        }
      }
      if (FW.ringFrom != null) {
        const RG = DATA.fireworks.finaleRing;
        const gap = DATA.fireworks.finaleInterval;
        for (let i = 0; i < RG.length; i++) {
          if (ft >= FW.ringFrom + i * gap && !this.launched[seg.id + 'r' + i]) {
            this.launched[seg.id + 'r' + i] = true;
            r.fireworks.launch(RG[i].x, RG[i].z, i % 2 === 0 ? 0 : 1, false);
          }
        }
      }
    }

    // ---- 全息投影姿态 ----
    let beat = 0;
    if (seg.lightShow) {
      const R = lightShowFor(seg.lightShow, t - seg.t0);
      if (R && R.sticks && typeof R.sticks.beatEnv === 'number') beat = R.sticks.beatEnv;
    }
    this.holoCmd = { pose: seg.holo || 'hidden', beat };
  }

  end() {
    const r = this.r;
    const L = r.lightState;
    const P = this.prev;
    this.active = false;
    if (P) {
      L.mode = P.mode;
      L.lampBanks = P.lampBanks;
      r.sceneState.lightsOff = P.lightsOff;
      L.dimmer = P.dimmer ?? 1;
      L.audienceMode = P.audienceMode;
      L.pixelPattern = P.pixelPattern;
      L.pixelScroll = P.pixelScroll;
      L.wave = P.wave;
      L.lightShow = P.lightShow;
      L.lightShowT = P.lightShowT;
      L.lightShowVariant = P.lightShowVariant;
      L.lsFreeze = P.lsFreeze;
    } else {
      L.dimmer = 1;
      L.audienceMode = 'normal';
      L.wave = null;
      L.lightShow = false;
    }
    const m = r.getLedMat();
    if (m) paintScreen(m, 'sea');
    if (this.waveTextOn) {
      const WT = DATA.concert.waveText;
      for (const wm of r.getWaveTextMats()) { paintWaveText(wm, WT.defaultText); wm.map.offset.x = 0; }
      this.waveTextOn = false;
    }
    const sg = r.getSinger && r.getSinger();
    if (sg) sg.userData.play('dance_01');
    this.singerPhase = null;
    this.segId = null;
    // 秀结束后全息不消散，缩到舞台左侧常驻（用户选的方案）
    this.holoCmd = { pose: 'docked', beat: 0 };
    if (r.onShowEnd) r.onShowEnd();
    r.toast('开场秀结束');
  }
}
