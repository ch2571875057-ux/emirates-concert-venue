// =====================================================================
// show.js — 开场秀：灯光方案 → 星芒烟花替换光束
// ShowManager：时间轴状态机，驱动 lightState/sceneState/应援棒波浪/LED 重绘
// Fireworks：星芒烟花（四芒星光斑粒子 + 放射长芒 + 闪光 + 池化 PointLight + 上升彗星）
// =====================================================================
import * as THREE from 'three';
import { DATA } from './data.js';
import { paintScreen, paintWaveText } from './stadium.js';

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
export class ShowManager {
  constructor(refs) {
    // refs: { lightState, sceneState, fireworks, getLedMat, toast }
    this.r = refs;
    this.active = false;
    this.t = 0;
    this.launched = {};
    this.prev = null;
  }

  start() {
    const r = this.r;
    this.active = true;
    this.t = 0;
    this.launched = {};
    this.waveSet = false;
    this.waveTextSet = false;
    this.waveScroll = false;
    this.singerPhase = null;
    this.lastN = 0;
    this.prev = {
      mode: r.lightState.mode,
      lamp: r.lightState.lampBanks,
      off: r.sceneState.lightsOff,
    };
    r.lightState.dimmer = 1;
    r.toast('开场秀开始');
  }

  get total() {
    const P = DATA.show.phases;
    return P.countdown + P.wave + P.storm + P.fireworks + P.outro;
  }

  // QA：以固定步长快进到 T 秒（烟花物理同步推进，确定帧）
  fastForward(T) {
    const step = 0.1;
    let t = 0;
    while (t < T && this.active) {
      this.step(step);
      this.r.fireworks.update(step);
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
    if (this.waveScroll) {
      const sp = DATA.concert.waveText.scrollSpeed;
      for (const wm of this.r.getWaveTextMats()) wm.map.offset.x = (wm.map.offset.x - dt * sp) % 1;
    }
  }

  step(dt) {
    const P = DATA.show.phases;
    const W = DATA.show.wave;
    const t = this.t;
    const r = this.r;
    const P0 = P.countdown, P1 = P0 + P.wave, P2 = P1 + P.storm, P3 = P2 + P.fireworks;
    const stageWave = (t0, ampBoost, starts) => ({
      t: t - t0, origin: STAGE_ORIGIN, speed: W.speed, width: W.width, ampBoost, starts,
    });

    if (t < P0) {
      // P0 暗场倒计时：全场压暗，LED 5→1，碗口环带随 lightsOff 压暗
      r.lightState.lampBanks = false;
      r.sceneState.lightsOff = true;
      r.lightState.dimmer = 0.2;
      r.lightState.wave = null;
      const n = Math.max(1, Math.ceil(5 - t));
      if (n !== this.lastN) {
        this.lastN = n;
        const m = r.getLedMat();
        if (m) paintScreen(m, 'countdown', n);
      }
    } else if (t < P1) {
      // P1 星海点亮：扫描模式 + 应援棒两轮波浪
      r.lightState.lampBanks = true;
      r.sceneState.lightsOff = false;
      r.lightState.dimmer = 0.85;
      r.lightState.mode = 'sweep';
      r.lightState.wave = stageWave(P0, 1.2, DATA.show.waveStarts);
      if (!this.waveSet) {
        this.waveSet = true;
        const m = r.getLedMat();
        if (m) paintScreen(m, 'sea');
        const sg = r.getSinger && r.getSinger();
        if (sg) sg.userData.play('greet_01');
        if (!this.waveTextSet) {
          this.waveTextSet = true;
          const WT = DATA.concert.waveText;
          for (const wm of r.getWaveTextMats()) paintWaveText(wm, WT.showText);
          this.waveScroll = true;
        }
      }
    } else if (t < P2) {
      // P2 光束风暴：频闪→扫描，摇摆 ×2，歌手起舞
      const sg = r.getSinger && r.getSinger();
      if (sg && this.singerPhase !== 'dance') { this.singerPhase = 'dance'; sg.userData.play('dance_01'); }
      r.lightState.lampBanks = true;
      r.sceneState.lightsOff = false;
      r.lightState.dimmer = 1;
      r.lightState.mode = (t - P1) < P.storm / 2 ? 'strobe' : 'sweep';
      r.lightState.wave = stageWave(P0, DATA.show.stormAmpBoost, DATA.show.waveStarts);
    } else if (t < P3) {
      // P3 光束退场 · 星芒烟花
      const ft = t - P2;
      this.singerPhase = 'dance';
      r.lightState.lampBanks = true;
      r.sceneState.lightsOff = false;
      r.lightState.dimmer = Math.max(0.15, 1 - ft / 10);
      // 烟花绽放期间：看台点阵显示心形，与烟花呼应
      r.lightState.audienceMode = 'pixel';
      r.lightState.pixelPattern = 'heart';
      r.lightState.pixelScroll = false;
      r.lightState.mode = 'sweep';
      // 单发：0.8 / 2.8 / 4.8s（金蓝交替）
      const SG = DATA.fireworks.singles;
      for (let k = 0; k < SG.length; k++) {
        const tt = 0.8 + k * 2.0;
        if (ft >= tt && !this.launched['s' + k]) {
          this.launched['s' + k] = true;
          r.fireworks.launch(SG[k].x, SG[k].z, k % 2 === 0 ? 1 : 0, true);
        }
      }
      // 终章环爆：8s 起 6 发
      if (ft >= 8) {
        const R = DATA.fireworks.finaleRing;
        for (let i = 0; i < R.length; i++) {
          const tt = 8 + i * DATA.show.finaleInterval;
          if (ft >= tt && !this.launched['f' + i]) {
            this.launched['f' + i] = true;
            r.fireworks.launch(R[i].x, R[i].z, i % 2 === 0 ? 0 : 1, false);
          }
        }
      }
      // 爆点冲击波：以碗心为源的短亮波（近似每次爆闪点亮观众席）
      r.lightState.wave = {
        t: ft, origin: r.fireworks.origin, speed: 95, width: 34, ampBoost: 1.5,
        starts: [1.6, 3.6, 5.6, 8.8, 9.1, 9.4, 9.7, 10.0, 10.3],
      };
    } else if (t < this.total) {
      // P4 尾声：dimmer 回升，波浪停止，副屏文字还原，点阵熄灭，歌手鞠躬
      r.lightState.audienceMode = 'normal';
      const sg = r.getSinger && r.getSinger();
      if (sg && this.singerPhase !== 'bow') { this.singerPhase = 'bow'; sg.userData.play('bow'); }
      if (this.waveScroll) {
        this.waveScroll = false;
        const WT = DATA.concert.waveText;
        for (const wm of r.getWaveTextMats()) { paintWaveText(wm, WT.defaultText); wm.map.offset.x = 0; }
      }
      r.lightState.wave = null;
      r.lightState.dimmer = Math.min(1, 0.15 + ((t - P3) / P.outro) * 0.85);
    } else {
      this.end();
      return;
    }
    this.t += dt;
  }

  end() {
    const r = this.r;
    this.active = false;
    r.lightState.lampBanks = this.prev?.lamp ?? true;
    r.lightState.mode = this.prev?.mode ?? 'sweep';
    r.lightState.dimmer = 1;
    r.lightState.wave = null;
    r.sceneState.lightsOff = this.prev?.off ?? false;
    const m = r.getLedMat();
    if (m) paintScreen(m, 'sea');
    if (this.waveScroll) {
      const WT = DATA.concert.waveText;
      for (const wm of r.getWaveTextMats()) { paintWaveText(wm, WT.defaultText); wm.map.offset.x = 0; }
      this.waveScroll = false;
    }
    r.lightState.audienceMode = 'normal';
    const sg = r.getSinger && r.getSinger();
    if (sg) { sg.userData.play('dance_01'); this.singerPhase = null; }
    r.toast('开场秀结束');
  }
}
