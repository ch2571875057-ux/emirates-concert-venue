// =====================================================================
// data.js — 参数总表（范式第 2 章等价物）
// 全部数值来自对 assets/Arsenal.glb 的 Blender headless 实测。
// 坐标系：three.js（Y 向上）。实测原始值为 Blender 坐标（Z 向上），
// 换算关系：three.x = Bx, three.y = Bz, three.z = -By。
// 几何代码中禁止出现本表之外的魔法数字。
// =====================================================================

export const DATA = {

  asset: {
    url: './assets/Arsenal.glb',
  },

  // ---------- 实测：球场结构 ----------
  stadium: {
    groundY: 4.4,                    // 场地地面标高（实测 z≈4.39-4.77）
    pitch: {
      center: { x: -32.4, z: 49.2 }, // 草坪中心（长轴沿 three.z）
      widthX: 68,                    // 草坪宽（three.x 方向，68 m）
      lengthZ: 105,                  // 草坪长（three.z 方向，105 m）
    },
    // 草坪两端球门线（three.z）：实测球网外沿 z=+104.26 / -5.81，
    // 真实门线（草坪 105m 居中）= +101.7 / -3.3
    goalLineSouthZ: 101.7,
    goalLineNorthZ: -3.3,
    goalNetExtentZ: [104.26, -5.81],
    // 碗体（看台结构）外边界，实测 x -140.4..74.6 / z -82.8..179.8
    bowl: {
      centerX: -32.9, centerZ: 48.5,
      halfX: 107.5, halfZ: 131.3,
    },
    // 看台楼层带（实测 z 直方图，three.y = 实测 z）
    tierBands: [
      { name: 'field',  y: 4.4  },
      { name: 'lower',  y: 15.7 },
      { name: 'club',   y: 21.7 },
      { name: 'mid',    y: 31.9 },
      { name: 'box',    y: 35.4 },
      { name: 'upper',  y: 48.0 },
    ],
    // 屋盖：外缘 ≈ 215×262，内开口（roofwinder 实测 120.7×160.5）
    roof: {
      centerX: -32.9, centerZ: 48.5,
      outerHalfX: 107.6, outerHalfZ: 131.0,
      innerHalfX: 60.4, innerHalfZ: 80.2,
      bottomY: 43.4, topY: 61.6,
    },
    // 8 个三脚桅架（connectors 实测底面中心，three 坐标）
    pylons: [
      { x: -82.0,  z: 160.6 }, { x: 20.9,  z: 158.8 },
      { x: 63.0,   z: 96.9  }, { x: 60.6,  z: -2.8  },
      { x: 17.1,   z: -61.8 }, { x: -85.8, z: -60.0 },
      { x: -127.9, z: 1.9   }, { x: -125.5, z: 101.7 },
    ],
    pylonTopY: 53.0,                 // 桅架顶 z≈51.8-53.8
    // 改造时要从 GLB 里剔除/替换的材质名（实测）
    removeMaterials: ['goal net', 'goal net1'],
    groundMaterials: ['Google Earth Snapshot'],  // 航拍照片地面
    // 校园外围（照片贴图/围墙/围网），改造时剔除
    campusMaterials: ['outerwalls', '[Fencing_Mesh_Blue]', '*80', '*80.001'],
    // 程序化地面
    proceduralGround: {
      size: 900,                     // 平面边长
      colorAsphalt: '#1b1f27',
      colorPlaza: '#252a34',
      colorPlazaInner: '#2a303c',
      plazaMargin: 35,               // 广场椭圆 = 碗体外扩
      y: 4.34,                       // 略低于场地标高避免 z-fighting
    },
    // 门框识别阈值（three 坐标，米）
    goalFrame: { nearLine: 10, heightMin: 1.5, heightMax: 8, footprintMax: 40 },
  },

  // ---------- 演唱会布置（舞台端 = 南端 +z）----------
  concert: {
    // 海洋主题舞台 v2（移植自 sandbox/stage-lab.js；无延伸台/B台/拱桁架）
    stageV2: {
      frontZ: 92,
      width: 60, depth: 24, h: 2.2,
      color: 0x23262e, edgeColor: 0x4a5262,
      edgeGlowColor: 0x53e6ff, edgeGlowR: 0.1, edgeGlowI: 1.2,
      steps: { tierN: 4, rise: 0.55, tread: 1.15, spanW: 34, color: 0x2a2e38, noseColor: 0x53e6ff, noseI: 1.1 },
      screen: {
        w: 38, h: 16, cy: 16.8, z: 111.5, wallDepth: 1.6,
        wallColor: 0x0b0e18, artW: 1600, artH: 672, artSeed: 7,
        frameR: 0.3, frameColor: 0xdff2ff, frameI: 1.5, emissiveI: 0.95,
      },
      waves: {
        uSeg: 48, vSeg: 10, bulge: 0.7,
        dropletN: 90, dropletR: [0.08, 0.34],
        main: {
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
        beamN: 10, beamDir: [0.85, -0.5, 0.85],
        beamPalette: [0x37c8ff, 0x6a8cff, 0x9a5cff],
        beam: {
          len: 34,
          core: { topR: 0.22, botR: 0.55, edgeK: 4.0, alpha: 0.8 },
          glow: { topR: 0.3, botR: 1.7, edgeK: 2.2, alpha: 0.26 },
          fadePow: 1.6, dustAmp: 0.3, dustScale: 2.6, dustSpeed: 0.7,
        },
        headR: 0.28, headI: 4.2,
        pool: { y: 0.06, r: 2.4, edgeK: 3.0, alpha: 0.2, dustAmp: 0.35 },
        dust: { perBeam: 22, size: 0.5, alpha: 0.7, drift: 0.5, twinkleHz: 1.7 },
      },
    },
    // 海浪副屏文字层（浪模不动的贴身发光文字）
    waveText: {
      offset: 0.09,              // 文字层外扩（加到浪体 bulge 上）
      defaultText: 'LIVE IN CONCERT',
      showText: 'ARE YOU READY !!',
      fontPx: 150,
      glowColor: '#cfeeff', shadowColor: '#5ad8ff', shadowBlur: 26,
      scrollSpeed: 0.05,         // 开场秀 P1 滚动速度（UV/秒）
    },
    // 主唱歌手（41 骨骼 + 6 动画，源：figurine/model_web.glb）
    singer: {
      url: './assets/singer.glb',
      scale: 1.7,                // ~1.0m 原生 → 1.7m
      pos: { x: -32.4, z: 98 },  // 舞台中前区（台面 y=7.32）
      faceYaw: 1.5708,           // 模型原生正面为 +x（QA 实测），+90° 转向观众
      defaultClip: 'dance_01',
      clips: ['dance_01', 'cheer', 'clap', 'greet_01', 'agree', 'bow'],
      spotIntensity: 2600,       // 主唱追光（物理衰减下 24m 处足够照亮）
      fillIntensity: 45,         // 近距补光（保证人物本体夜景可读）
    },
    // 音响塔（Step 4）
    soundTowerOffsetX: 42,
    soundTowerZ: 86,
    soundTowerHeight: 16,
    towerLegSpan: 1.6,               // 塔身立柱间距
    towerRungStep: 2.6,              // 横撑层距
    towerArmLength: 4,               // 顶部吊臂伸向内侧
    lineArrayBoxes: 10,              // 线阵音箱数
    lineArrayTopY: 14,               // 串顶（相对地坪）
    lineArrayBoxH: 0.72,
    delayTower: { z: 10, height: 8, boxes: 2 },   // 北半场补声塔
    // 观众星海 v3（应援棒实体化）：位置仍来自 standProfile 剖面。
    // 两种应援棒（细圆柱 / 螃蟹款）+ 悬空蓝白小方片，统一蓝白色系（参考图）
    audience: {
      rowRise: 0.62,                 // 坡面行距（高度方向）
      arcSpacing: 2.4,               // 弧向棒间距（约每 2 席 1 棒）
      rInset: 0.3,                   // 相对坡面内缘的内收
      lift: [1.3, 1.8],              // 举起高度范围（棒底离座面）
      jitter: 0.35,                  // 水平抖动
      tiltMax: 0.18,                 // 手持最大倾斜（rad，约 ±10°）
      // 细圆柱应援棒（主体，约 70%）
      stickCyl: {
        ratio: 0.7,
        handleH: 0.28, handleR: 0.035,
        tubeH: 0.85, tubeR: 0.045,
        shellColor: 0x1c2340,
        glowColor: 0xbfe3ff, glowIntensity: 2.2,
      },
      // 蟹钳应援棒（按实拍重做：单体泪滴钳头 + 侧缘咬合缺口，通体发光，约 30%）
      stickClaw: {
        ratio: 0.3,
        handleH: 0.30, handleR: 0.042,   // 暗色柄
        collarR: 0.052, collarTube: 0.013, // 柄顶装饰环
        headH: 0.37,                      // 钳头总高（剪影 y 范围 0..headH）
        headDepth: 0.075, bevel: 0.024,   // 挤出厚度 / 倒角（圆润感）
        headScale: 0.95, lean: 0.10,      // 头部缩放 / 向左倾（rad）
        faceJitter: 1.0,                  // 宽面朝舞台 ± 抖动（rad）
        shellColor: 0x33456b,
        glowColor: 0x58b4f6, glowIntensity: 2.8,  // 实拍饱和天蓝（非近白）
      },
      // 悬空蓝白小方片（氛围光尘）
      squares: {
        count: 700, size: 0.30,
        color: 0xcfe6ff, opacity: 0.8,
        liftMin: 1.8, liftMax: 3.4,
        bobAmp: 0.35, bobSpeed: 0.5,  // 起伏幅度/速度
      },
      pulseSpeed: 1.3,               // 发光呼吸速度
      // 潮汐人浪（绕碗体环形传播的潮位波）
      tide: {
        speed: 1.15,                 // 潮波角速度（rad/s，绕场一周 ~5.5s）
        angleWaves: 2,               // 同时存在的潮峰数
        bobAmp: 0.55,                // 潮位物理起伏幅度（m）
        deep: 0x123a8f,              // 潮谷色（深蓝）
        foam: 0xeaf6ff,              // 浪峰色（近白）
      },
      // 点阵显示（看台光棒按 环向×排数 编址为点阵屏）
      pixel: {
        cols: 96, rows: 48,          // 点阵规格（列=环向，行=看台高度带）
        rowH: 0.8,                   // 行分箱高度（m）
        dim: 0.05,                   // 非图案光棒压暗亮度
        pitDim: 0.12,                // 点阵模式下内场插棒压暗
        scrollSpeed: 0.06,           // 图案滚动速度（列/秒）
      },
    },
    // 内场人模观众（近场）：整齐网格排列，全部面向舞台（南端 +z）
    crowd: {
      urlA: './assets/crowd_a.glb',
      urlB: './assets/crowd_b.glb',
      scale: 1.72,                   // 0.99m → 1.70m 成人身高
      heightVar: 0.04,               // 身高随机 ±4%
      rowSpacing: 1.4,               // 行距（z 向，面向舞台方向）
      colSpacing: 1.1,               // 列距（x 向）
      rowJitter: 0.08,               // 行向微抖动
      colJitter: 0.08,               // 列向微抖动
      faceYaw: -1.5708,               // 朝向大屏幕：模型原生正面为 +x，需 -90° 偏航（经用户现场确认）
      yawVar: 0.262,                  // 朝向随机 ±15°（rad）
      blockMargin: 0.4,              // 距站区块边缘
      tintMin: 0.8, tintVar: 0.4,    // 实例明度变化范围
      // 人模旁应援棒（右侧或正前方随机插地）
      pitStick: {
        rightOffset: 0.42,           // 右侧偏移
        frontOffset: 0.55,           // 正前方偏移
        clawRatio: 0.3,              // 蟹钳占比（与看台一致）
        tiltMax: 0.10,               // 随手插的最大倾斜
      },
      emissive: 0x9aa7c8,            // 夜景补光自发光
      emissiveIntensity: 0.10,
    },
    // 灯光模式参数（光束 alpha 由 updateLights 驱动；光束本体参数在 stageV2.rings）
    lights: {
      realSpotColor: 0xfff2d8,
      strobeHz: 15,                 // 频闪频率
      sweepSpeed: 0.55,             // 扫描速度（周期/秒）
      sweepDuty: 0.35,              // 扫描点亮占空
    },
    // 内场（Step 2）。地坪按实测草区（含草沿 103.5×130.6m）整块覆盖
    deckWidthX: 98,                  // 保护地坪宽（three.x）
    deckLengthZ: 124,                // 保护地坪长（three.z）
    deckCenterX: -33.5,              // 实测草区中心（x 略偏）
    deckCenterZ: 49.4,
    deckColor: '#3a3f4a',            // 地坪基色
    deckLineColor: '#464c59',        // 分格线色
    deckGrid: 6,                     // 分格尺寸（米）
    pitEdgeColor: '#7e8ba3',         // 站区描边条色
    // 站区分块：自南（舞台前）向北排列；zStart 为第一块南缘
    pitFirstRowZ: 78,                // 站区最南（距舞台前沿 4m 通道）
    pitBlockDepth: 12,               // 每块纵深
    pitBlockGap: 2.5,                // 块间横向通道
    pitWidth: 56,                    // 站区总宽（≤ 地坪内宽）
    pitBlocks: 4,                    // 纵向块数（每块之间是横向通道）
    pitColorA: '#2e3646',            // 站区双色 A
    pitColorB: '#39445a',            // 站区双色 B
    barrierHeight: 1.1,              // 隔离栏高度
    barrierColor: 0x9fb6d8,
  },

  // ---------- 灯光 ----------
  lighting: {
    bloom: { strength: 0.32, radius: 0.38, threshold: 0.90 },
    nightStrength: 1.35,             // 夜间 Bloom 加强
  },

  // ---------- 氛围与时间（Step 7）----------
  atmosphere: {
    skyRadius: 1500,
    nightTop: '#080d1f', nightBottom: '#141d38',
    dayTop: '#6fb7ef', dayBottom: '#dcebf7',
    duskTop: '#3a2c55', duskBottom: '#c96a4a',
    fogNight: 0.00055, fogDay: 0.00016,
    exposureNight: 1.12, exposureDay: 1.0,
    bloomNight: 0.5, bloomDay: 0.32,
    // LED 环带：屋盖内环下沿一圈
    ribbonY: 43.0,
    ribbonTubeR: 0.5,
    ribbonColor: 0x67d8ff,
    ribbonIntensityNight: 2.2,
    ribbonIntensityDay: 0.25,
    sunDayIntensity: 2.2,
    hemiNight: 0.16, hemiDay: 0.75,
  },

  // ---------- 开场秀 ----------
  show: {
    phases: { countdown: 6, wave: 8, storm: 12, fireworks: 15, outro: 5 }, // 总 46s
    wave: { speed: 55, width: 26 },  // 星海波浪：波前速度 m/s、波峰宽度 m（波源=舞台）
    waveStarts: [0, 4.2],            // P1 两轮波浪的起始时刻
    stormAmpBoost: 2.0,              // P2 摇摆增幅
    finaleInterval: 0.28,            // 终章环爆间隔
  },

  // ---------- 星芒烟花 ----------
  fireworks: {
    sparkCount: 220, sparkSize: 1.5,
    speed: [14, 26],                 // 粒子初速范围（球面）
    gravity: 5.4, drag: 0.985,       // 重力 / 每帧阻力（60fps 基准）
    life: [1.6, 2.6],
    colors: [0xffd27a, 0x58b4f6, 0xbfe3ff, 0xff8fb8], // 金/钳蓝/冰白/粉
    starSharp: 6.0,                  // 四芒星尖锐度（|cos2a|^k）
    starRotSpeed: 1.2,               // 星斑自转
    rays: { count: 10, length: 26, life: 0.9 }, // 放射长芒
    flash: { size: 60, life: 0.35, lightIntensity: 90000, lightDistance: 520 },
    launch: { speed: 34, startY: 26 }, // 上升彗星
    heightMin: 56, heightMax: 74,    // 爆高范围
    maxConcurrent: 3,                // PointLight 池上限
    // 发射点位（相对碗心；都在屋盖开口范围内）
    singles: [ { x: 0, z: 50 }, { x: -14, z: 32 }, { x: 14, z: 58 } ],
    finaleRing: [
      { x: 0, z: 50 }, { x: 40, z: 22 }, { x: 26, z: -46 },
      { x: -26, z: -46 }, { x: -40, z: 22 }, { x: 0, z: -10 },
    ],
  },

  // ---------- 默认状态 ----------
  defaults: {
    time: 21.0,                      // 默认夜景 21:00
  },

  colors: {
    nightSky: 0x0a1024,
    nightFog: 0x0a1024,
  },
  fog: { densityNight: 0.00055 },

  // ---------- 预设视角（three 坐标）----------
  views: [
    { id: 'aerial',  title: '鸟瞰全景', desc: '整座场馆与夜色', cam: [-262, 175, 320], look: [-32, 14, 49], fov: 50 },
    { id: 'stagefront', title: '内场看舞台', desc: '观众视角的主舞台', cam: [-32, 9, 22], look: [-32, 12, 118], fov: 55 },
    { id: 'stands',  title: '看台视角', desc: '从上层看台俯瞰内场', cam: [-32, 44, -40], look: [-32, 8, 80], fov: 55 },
    { id: 'facade',  title: '场馆外观', desc: '南立面与桅架', cam: [-32, 42, 402], look: [-32, 24, 49], fov: 42 },
    { id: 'roof',    title: '屋面俯视', desc: '屋盖开口与内场', cam: [-32, 330, 49.5], look: [-32, 4, 49], fov: 45 },
    { id: 'free',    title: '自由', desc: '', cam: [-262, 175, 320], look: [-32, 14, 49], fov: 50 },
  ],

  // ---------- 观众机位（坐席眼高，面向舞台）----------
  camAudience: [
    { id: 'aud-pit',   title: '内场前排',    desc: '站区最前排',      cam: [-32.4, 8.8, 68],  look: [-32.4, 9.5, 100], fov: 60 },
    { id: 'aud-north', title: '北看台中排',  desc: '正对舞台',        cam: [-32.4, 21, -42],  look: [-32.4, 10, 100],  fov: 52 },
    { id: 'aud-east',  title: '东看台',     desc: '侧面机位',        cam: [42, 20, 48],      look: [-32.4, 10, 92],   fov: 52 },
    { id: 'aud-west',  title: '西看台',     desc: '侧面机位',        cam: [-108, 20, 48],    look: [-32.4, 10, 92],   fov: 52 },
    { id: 'aud-south', title: '南看台·舞台后', desc: '越过舞台望星海',  cam: [-32.4, 36, 158],  look: [-32.4, 9, 30],    fov: 58 },
  ],

  // ---------- 歌手运镜机位 ----------
  camSinger: [
    { id: 'sg-close', title: '歌手特写',     desc: '正面近景',          cam: [-32.4, 9.0, 87],   look: [-32.4, 8.8, 98], fov: 30 },
    { id: 'sg-side',  title: '歌手侧写',     desc: '侧面轮廓',          cam: [-16, 9.2, 88],     look: [-32.4, 8.8, 98], fov: 34 },
    { id: 'sg-back',  title: '歌手背后·星海', desc: '越过肩头望观众席',   cam: [-32.4, 10.2, 105], look: [-32.4, 8, 20],   fov: 62 },
    { id: 'sg-orbit', title: '歌手环绕运镜',  desc: '自动环绕（拖拽退出）', cam: [-32.4, 9.6, 86],   look: [-32.4, 8.8, 98], fov: 38, cine: 'orbit' },
  ],

  // ---------- QA 固定机位（验收截图用；?debug=1&ui=0&view=free&cam=…&look=…&time=…）----------
  qa: {
    buildCam: 'cam=-262,175,320&look=-32,14,49&time=21',
    stageCam: 'cam=-32,9,22&look=-32,12,118&time=21',
    bowlCam: 'cam=-32,60,-120&look=-32,10,60&time=21',
    topCam: 'cam=-32,330,49.5&look=-32,4,49&time=21',
  },
};
