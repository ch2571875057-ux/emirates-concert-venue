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
      fontPxMin: 28,             // 长歌名自动降字号的下限（见 stadium.js paintWaveText）
      padRatio: 0.06,            // 画布左右安全边距（占画布宽比例）
      songPadRatio: 0.30,        // 歌单曲名专用边距：浪体两侧卷边会转离镜头，文字要收进中间可见带
      wrapFill: 0.70,            // 两行排版时总高占画布高的比例（留上下余量，别被浪尖/浪底裁）
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
      // 点阵显示（仅内场观众参与：插棒按 50 列 × 31 排的平面网格编址成点阵屏）
      // 网格与插棒严格 1:1（50×31 = 1550 = 插棒数），每格恰好一支棒，无空洞
      pixel: {
        th: 0.55,                    // 5×5 超采样覆盖率 ≥ 此值 → 图案主体
        thEdge: 0.22,                // 覆盖率 ≥ 此值（且低于 th）→ 边缘过渡档
        margin: 0.06,                // 图案四周留白（占短边比例）
        size: 0.92,                  // 图案占方框的比例（<1 让四周仍有暗底包边）
        dim: 0.16,                   // 非图案光棒底光（保留可辨识暗蓝，不压黑）
        edge: 0.55,                  // 图案边缘过渡档亮度
        // 图案横向动效：**有界往复摆动**，绕屏幕中心来回，不做单向漂移。
        // 旧实现是 shift = elapsed * 0.06 的无界单向滚动，几十秒后图案就会永久歪到屏幕一侧
        // （看台视角尤其明显，看起来像"点阵偏右"），并且跨过 50 列边界后图案会被回卷切断。
        // 振幅取 1 列：屏幕上约 10px（<1% 屏宽），肉眼判定为居中，只留一点极轻微的"呼吸"感；
        // 所有图案的左右留白（最窄 heart 为 8 列）都远大于振幅，因此永远不会贴边或被切断。
        swayAmp: 1,                  // 摆动振幅（列，正负对称）
        swayPeriod: 22,              // 摆动周期（秒）
      },
    },
    // 伴奏乐队：舞台两侧的体素乐器（来自 sandbox/band-lab 的建模成果，GLB 已拷到 assets/band/）
    // 每件乐器原点在底面中心、正面朝 -Z（与主项目观众方向一致），所以摆到台面只需设 y = 台面高
    band: {
      scale: 1.5,                    // 统一放大：体素原尺寸偏小（吉他琴身仅 0.40m 宽），1.5 倍后在远机位仍可读
      deckY: null,                   // null = 自动取舞台台面高（groundY + 0.72 + stageV2.h = 7.32）
      // x = 相对舞台中轴的偏移（m），z = 绝对纵深（m），yaw = 绕 Y 偏航（度）
      // 左右两组各自朝内偏转，形成「乐手围在主唱两侧」的观感；全部 |x| ≤ 18 < 20，不侵入海浪雕塑区
      items: [
        { id: 'drums',   url: './assets/band/drums.glb',   x: -11.5, z: 107.0, yaw:  10, label: '架子鼓' },
        { id: 'guitar',  url: './assets/band/guitar.glb',  x: -15.0, z: 100.5, yaw:  18, label: '电吉他' },
        { id: 'amp',     url: './assets/band/amp.glb',     x: -17.5, z: 105.0, yaw: -16, label: '吉他音箱' },
        { id: 'keys',    url: './assets/band/keys.glb',    x:  12.0, z: 107.0, yaw: -10, label: '双层键盘' },
        { id: 'bass',    url: './assets/band/bass.glb',    x:  15.0, z: 100.5, yaw: -18, label: '电贝斯' },
        { id: 'ampbass', url: './assets/band/ampbass.glb', x:  17.5, z: 108.5, yaw:  16, label: '贝斯音箱' },
      ],
      // 材质修正：主项目没有环境贴图（无 PMREM / RoomEnvironment），metalness 高的银/铜件
      // 会渲染成纯黑，必须压到阈值内靠漫反射显固有色
      metalnessMax: 0.25,
      roughnessMin: 0.35,
      // 近白材质（琴键 f4f6fa / 银件 c9d2e0）在近场补光下会顶到 255 糊成一块白板，
      // 按固有色亮度等比压暗一档，键缝和高光层次才留得住
      whiteLum: 0.72, whiteMul: 0.55,
      // 夜色底光：乐器自身补一点自发光，避免暗场里整片只剩黑色剪影
      emissive: 0x2a3550, emissiveIntensity: 0.14,
      // 乐队区补光。乐器只有 1~2.2m 高，靠场馆顶灯吃不到照度，暗场里会比台面还暗。
      // 关键：**不能用正上方点光**——台面是 60×24m 的水平大面，顶光会把它整片照亮，
      // 实测台面从 46 提到 143，乐队反而被压掉（band-lab 的注释里也踩过这个坑）。
      // 改用「观众侧、接近水平的窄锥 SpotLight」：光轴几乎平行台面、只擦过台面，
      // 绝大部分能量落在乐器竖直立面上（乐器正面朝 -Z，即朝向观众/舞台前沿）。
      fill: {
        color: 0xfff0dc,
        intensity: 320, distance: 24, decay: 1.3,
        angle: 0.54, penumbra: 0.62,
        lift: 2.6,     // 灯位相对台面的高度
        aimLift: 1.1,  // 瞄准点相对台面的高度
        spots: [
          { x: -14.6, z: 95.8, tx: -14.6, tz: 106.5 }, // 左侧乐队组（drums/guitar/amp）
          { x:  14.6, z: 95.8, tx:  14.6, tz: 106.5 }, // 右侧乐队组（keys/bass/ampbass）
        ],
      },
      // 乐手：复用内场人模 crowd_a / crowd_b（不新增资源），每人站在自己乐器的**演奏位**。
      // 摆位关键（三条互相拉扯的约束，全部用 tools/_check_self.py 的三角形射线实测过）：
      //   ① 不能正对乐器正后方 —— 乐器比人还高（鼓 2.10m / 贝斯 2.18m / 吉他 1.88m），
      //      正后方会被乐器整片挡住，头都看不见；
      //   ② 也不能离太远 —— 远了就成了「乐器旁边站了个人」，没有在演奏的感觉；
      //   ③ 要「人贴着乐器、乐器挡住下半身」才有演奏感。
      // 折中：贴着乐器后沿站，横向微调到乐器的「留空侧」，使**头部在 6 个主用机位 100% 可见**，
      // 同时自家乐器挡住人体 40~60%（挡住的是腰以下，正是「人在乐器后面操作它」的观感）。
      // 另外用 tools/_penet_final.py 检查过身体不穿进乐器实体（鼓组 3.37m 很宽，必须横向让开）。
      // yaw 与 band-lab 一致：人模原生朝 +x，yaw≈90° 即转向 -z（朝观众）；88~92 的微差让四人略朝舞台中心。
      // lean = 上身前倾角（度），朝观众方向压下去 —— 这是「在演奏」而非「站着」的关键姿态。
      //        上限受乐器高度限制：吉他/贝斯 1.88/2.18m 高、人前倾后头顶会前探，超过 10° 头会顶进琴身，
      //        所以这两件取 9°；鼓与键盘较高矮搭配，可到 10°/9°。
      // sway = 各自的身体起伏频率（rad/s），四人不同步才像各弹各的。
      // scale 1.72 与 concert.crowd.scale 相同（模型高 0.986m → 1.70m）。
      performers: [
        // 鼓手站鼓组后方偏右（左侧是镲架，正后方会挡头）
        { id: 'p_drums',  model: 'crowd_b', x: -12.20, z: 108.80, yaw: 90, lean: 10, sway: 1.2, label: '鼓手' },
        // 吉他手贴琴身后方，琴身挡腰以下
        { id: 'p_guitar', model: 'crowd_a', x: -14.90, z: 101.40, yaw: 92, lean:  9, sway: 1.9, label: '吉他手' },
        // 键盘手站键盘后方，琴体挡腰以下
        { id: 'p_keys',   model: 'crowd_a', x:  11.55, z: 108.90, yaw: 90, lean:  9, sway: 1.6, label: '键盘手' },
        // 贝斯手贴琴身后方 0.29m，前倾 12°
        { id: 'p_bass',   model: 'crowd_b', x:  14.85, z: 101.12, yaw: 88, lean:  9, sway: 1.7, label: '贝斯手' },
      ],
      performerScale: 1.72,
      // 乐手贴图接近白（浅色 T 恤），在暖白补光下会整片溢出成白块，整体压暗一档
      // （band-lab 实测特写里 12.7% 像素被切到 250+，压到 0.55 后回到 5% 量级）
      performerColorMul: 0.55,
      // 极轻的呼吸/摆动：绕 Y 微转 + 上下微浮，相位各自随机避免同步像机械人
      performerSway: 1.5,        // 默认摆动角速度（rad/s），performers[].sway 可单独覆盖
      performerSwayYaw: 0.028,   // 绕 Y 摆幅（rad，约 ±1.6°）
      performerSwayBob: 0.012,   // 上下浮幅（m）
      // 前倾角的呼吸幅度（rad）：叠在 performers[].lean 静态前倾之上，让身体随节拍前后压。
      // 0.05 rad ≈ 2.9°，配合 9~12° 的静态前倾，观感是"在弹/在打"而不是"站着举着手"。
      performerLeanAmp: 0.05,
    },

    // 人浪光效（观众光效第二组：stripe 条纹 / meet 相遇 / chase 追逐）
    // 纯逻辑在 js/wavefx.js，这里只放可调参数。亮度值可 >1（HDR，供 Bloom 拾取）。
    waveFx: {
      // 统一的时间缩放：1 = 设计速度。改这个可以整体快慢，不影响各光效的比例
      timeScale: 1,

      // 1) 条纹：绕场交替的明暗竖带，整体环向缓慢漂移
      stripe: {
        bands: 6,           // 环向「亮/暗带对数」：6 对 = 12 条带。
                            // 上限受内场分辨率限制——内场只有 50 列，bands 太大就退化成细网格
                            // （bands=6 时每条约 4.1 列，看得出是「带」；bands=12 时只剩 2.1 列，糊成稀碎条纹）
        driftSpeed: 0.055,  // 环向漂移速度（带/秒，正数沿 u 增大方向 = 内场 col 增大方向）
        soft: 0.18,         // 带边软化宽度（占半带比例，0=硬边，1=完全渐变）
        lo: 0.16,           // 暗带亮度
        hi: 1.35,           // 亮带亮度
      },

      // 2) 相遇：从舞台两翼沿碗体各走半圈，在正对面合拢，然后全场亮起
      meet: {
        period: 9.0,        // 单轮完整周期（秒，含 run + hold）
        hold: 2.2,          // 合拢后全场满亮的保持时长（秒）
        speedEase: 1.7,     // 前沿推进缓动指数（>1 = 起步慢、临合拢加速）
        headGain: 0.7,      // 前沿 HDR 亮边增益（相对 lit 的倍数增量）
        headWidth: 0.06,    // 前沿亮边宽度（归一化距离）
        lit: 1.25,          // 已点亮区亮度
        dark: 0,            // 未点亮区亮度：0 = 彻底灭灯。光效没扫到的观众全黑，
                            // 只剩两翼推进的亮区，对比最强；留 0.1~0.2 的灰底会把画面糊平
        holdGain: 0.55,     // 满亮瞬间的闪光增益（之后 hold 内衰减到 0）
      },

      // 3) 追逐：一颗亮头绕场单向跑，身后拖长尾衰减（人浪的本体形态）
      chase: {
        period: 7.5,        // 绕场一周的时间（秒）
        dir: 1,             // 方向：+1 沿 u 增大，-1 反向
        tailWidth: 0.42,    // 尾长（归一化环向距离，1 = 整圈）
        tailPow: 1.6,       // 尾部衰减曲线（越大尾巴越"收"，越小越拖）
        headSharp: 0.035,   // 亮头锐度（归一化距离）
        headGain: 0.9,      // 亮头额外 HDR 增益
        base: 0,            // 尾外区域底光：0 = 彻底灭灯（只有亮头和长尾发光）
        gain: 1.25,         // 尾部主增益
        // 尾部亮度曲线：tail^tailPow 在尾端已经很暗，再乘一个下限抬升，
        // 避免尾巴后半段整体掉进「全黑」让长尾看起来突然断掉。
        tailFloor: 0.06,    // 尾端最低亮度（相对 gain），0 = 尾巴尖完全黑
      },

      // 4) 涟漪：以舞台为圆心的同心光环保向外扩散（图案主轴是径向 s，不是环向 u）
      ripple: {
        rings: 3.5,         // 全场同时存在的光环数（非整数 = 环缝不闭合，避免停在同一条线上）
        speed: 0.42,        // 扩散速度（环/秒，正数 = 由舞台向外）
        lo: 0.10,           // 环外底光
        hi: 1.45,           // 环峰亮度（HDR）
        falloff: 0.35,      // 远端衰减（0 = 内外一样亮，1 = 最远处完全没光）
      },

      // 5) 螺旋：光臂沿环向 + 径向同时推进，绕成螺旋（同一 u 上不同看台高度错拍）
      spiral: {
        turns: 2,           // 臂数（整数 = N 条对称臂）
        twist: 1.6,         // 内外倾斜量：越大，臂在内场/看台之间的错位越明显
        speed: 0.22,        // 旋转速度（圈/秒）
        sharp: 3.0,         // 臂宽（越大越窄，1 = 很宽的渐变，4+ = 细亮臂）
        lo: 0.08,
        hi: 1.50,
      },

      // 6) 对撞：两颗亮头沿环向相向奔跑，交错瞬间全场闪一下（唯一有「相遇瞬间」的形态）
      duet: {
        period: 6.4,        // 交错一次的周期（秒）
        headWidth: 0.10,    // 亮头半宽（归一化环向距离）
        base: 0.06,         // 头外底光
        gain: 0.85,         // 单头亮度
        flashWidth: 0.06,   // 交错闪光的触发半宽
        flashGain: 0.55,    // 交错时的额外闪光
      },

      // 光效模式表（单一真相）：HUD 按钮、模式分派、暗区判定全部从这里派生。
      // 顺序 = HUD 按钮顺序；新增一档光效只需在这里加一行 + 写 xxxAt 纯函数。
      //   id     lightState.audienceMode 的取值（也是 ?fx= 的取值）
      //   label  HUD 按钮文案
      //   dark   true = 灭灯型：没被光效扫到的观众彻底熄灭，且暗区几乎不摇摆
      modes: [
        { id: 'stripe', label: '条纹', dark: false },
        { id: 'meet', label: '相遇', dark: true },
        { id: 'chase', label: '追逐', dark: true },
        { id: 'ripple', label: '涟漪', dark: false },
        { id: 'spiral', label: '螺旋', dark: false },
        { id: 'duet', label: '对撞', dark: true },
      ],
    },

    // 灯光秀 A（三载体联动编舞：看台应援棒 + 屋顶 LED 环带 + 舞台光束阵列）
    // 形态取自素材视频的逐帧统计：呼吸 → 青白爆发 → 收成横贯全宽的细亮带 →
    // 黑场留白 → 顶部巨大纯白亮带 → 回落。纯逻辑在 js/lightshow.js。
    // 注意：坐席应援棒只驱动看台（audience），内场点阵屏不参与本编舞。
    lightShow: {
      enabled: true,
      timeScale: 1,          // 整体快慢（只影响灯光秀自身时钟，不影响常态呼吸）

      // 六段时长（秒），合计即一轮总时长。比例直接取自素材 12.17s 的分段占比：
      // 呼吸 0~3.4s(28%) / 爆发 3.5~4.5s(8%) / 收束 4.5~5.0s(4%) / 黑场 5.4~7.7s(19%)
      // / 白带 8.1~11.4s(28%) / 回落 11.7s~。合计 11.8s。
      breath: 3.2,           // 呼吸：暗青微光，缓慢起伏（素材里最长的一段铺垫）
      burst: 0.95,           // 爆发：冲到峰值后略回落，冷青迅速转纯白
      collapse: 0.5,         // 收束：应援棒灭掉，只留环带那一条细亮带
      black: 2.3,            // 黑场：近全暗，只余极弱余辉（对比全靠这段）
      band: 3.4,             // 顶部白带：环带纯白满亮 + 应援棒升起绕场行进的亮带
      fall: 1.0,             // 回落：权重收 0，插值回常态（不跳变）

      breathGain: [0.10, 0.26],   // 呼吸段应援棒亮度区间
      breathRibbon: [0.8, 1.5],   // 呼吸段环带 intensity 区间
      burstGain: 2.4,             // 爆发峰值：应援棒亮度（HDR，交给 Bloom）
      burstRibbon: 6.0,           // 爆发峰值：环带 intensity
      burstBeam: 1.35,            // 爆发峰值：光束增益（相对常态满开=1）
      blackGain: 0.02,            // 黑场应援棒底光（近黑但不全黑，留一点余辉）
      blackRibbon: 0.35,          // 黑场环带余辉
      bandGain: 1.9,              // 白带段应援棒亮度
      bandRibbon: 9.0,            // 白带段环带 intensity（画面顶部巨亮带的来源）
      bandBeam: 1.15,             // 白带段光束增益
      bandSpeed: 0.85,            // 应援棒亮带绕场行进速度（圈/段时长内）
      bandWidth: 0.09,            // 亮带宽度（归一化环向距离，0.09 ≈ 整环 9% ≈ 50m）
      bandFloor: 0.10,            // 亮带外的最低亮度（0 = 带外全黑）

      // 聚焦扇区：素材 0~4.5s 的亮块是「居中一团」而不是整圈均匀亮。
      // focusU 取正对舞台那一侧的环向位置（看台北弧，与内场点阵屏同一基准；
      // 看台 u = wrap01(theta/2π)，north 约为 0.75）。
      // focusBreathW / focusBurstW 是半角宽（0..0.5，0.5 = 整圈），focusFloor 是聚焦区外的底光。
      focusU: 0.75,
      focusFloor: 0.12,
      focusBreathW: 0.17,
      focusBurstW: 0.42,
    },

    // 灯光秀 B（居中单光团编舞：LED 大屏主光体 + 舞台光束 + 极暗看台底光）
    // 形态取自第二段素材的逐帧统计（720×1624 / 404 帧 / 13.07s）：
    //   · 横向几乎不动（质心漂移仅 11.7% 区宽）—— 不是环绕，是**一个居中的光体**
    //   · 面积 4.91 倍动态：0.24 → 1.00 @3.07s → 回落到 0.20~0.35
    //   · 纵横比 0.90（方形）→ 2.24（闪成横条）→ 稳定 1.3~1.9
    //   · 颜色三段：t<2.4s 近白(sat 10~19) → 2.4~3.6s 转冷(20~23) → t>3.6s 明显蓝(41~53)
    //   · 竖条纹理 6~10 条（周期 7~16px）—— 稀疏竖条，不是细密栅格
    // 与 A 的关键差别：B 的背景极暗（mean 24~47），所以看台应援棒几乎全灭，
    // 重量全压在舞台中央那个光体上。纯逻辑在 js/lightshowb.js。
    lightShowB: {
      enabled: true,
      timeScale: 1,

      // 六段时长（秒）。按素材分段占比换算到 13.0s：
      // 近白方体 0~2.4s / 横条闪爆 2.4~3.6s / 转冷 / 深蓝长段 3.6~11.5s / 竖条扫过 12.6s / 回落
      ignite: 2.1,           // 起势：近白方体缓缓涨亮
      flash: 1.5,            // 闪爆：纯白峰值，光体横向拉宽
      cool: 0.9,             // 转冷：白 → 蓝的过渡
      blue: 6.7,             // 深蓝呼吸：面积回落、竖条显形（素材最长的一段）
      stripe: 1.2,           // 竖条扫过：条纹对比拉满并快速横移
      fade: 0.6,             // 回落：权重收 0，插值回常态

      // ---- 主光体（LED 大屏）----
      bodyBase: 0.55,        // 底（未点亮时的屏面亮度基线）
      bodyIgnite: 1.60,      // 起势段屏面 emissiveIntensity
      bodyFlash: 3.20,       // 闪爆峰值（HDR，交给 Bloom 撑大光团）
      bodyBlue: 1.15,        // 深蓝段
      bodyStripe: 1.90,      // 竖条段
      scalePulse: 0.06,      // 面积脉冲用几何缩放补足（±6%，配合亮度变化读作「光团在涨缩」）

      // ---- 色温（0 = 纯白，1 = 深蓝；对应素材三段颜色）----
      igniteTint: 0.15,
      coolTint: 0.72,
      blueTint: 0.95,
      stripeTint: 0.80,

      // ---- 竖条纹理 ----
      stripeFreq: 7,         // 条纹条数（素材实测 6~10）
      stripeDrift: 0.12,     // 相位漂移速度（条/秒，让斑驳始终在动）
      stripeAmp: 0.62,       // 条间暗隙深度（0 = 无条纹，1 = 暗隙全黑）
      stripeBurstFreq: 1.5,  // 竖条段的条数倍率（更密）
      stripeSweep: 2.5,      // 竖条段的相位快扫量（整段内扫过的条数）

      // ---- 舞台光束 ----
      beamIgnite: 0.35,
      beamFlash: 1.20,
      beamBlue: 0.45,

      // ---- 看台应援棒（观众层）----
      // 素材把左右看台单独测过（相对各自暗态基线 P8）：
      //   0~2.5s   1.0×  观众基本不亮，只留环境余晖
      //   2.5~3.0s 1.4→4.3×  缓慢起势
      //   3.04~3.2s 12~14×  左右同时爆发白闪，与屏峰值同一刻
      //   3.2~4.5s 2~4×   快速衰减
      //   4.5~13s  1.5~3.5× 持续闪烁（FFT 主频 0.70Hz）+ 转蓝（B/R 1.6~1.8，sat 36~45）
      // 闪烁不是全场同步：把看台切成 3×3 子区两两相关只有 0.44，
      // 所以按环向分成 stickRegionN 个区，同区一起闪、跨区独立。
      stickDark: 0.02,       // 暗态底光（≈素材 0~2.5s 的不亮）
      stickPeak: 0.72,       // 闪爆峰值（≈暗态 14 倍）
      stickSustain: 0.13,    // 长段持续值（≈暗态 2.6 倍）
      stickStripe: 0.17,     // 竖条段的小幅抬升
      stickFlicker: 0.45,    // 闪烁幅度（相对当前值的比例）
      stickFlickerHz: 0.70,  // 闪烁主频
      stickRegionN: 12,      // 独立闪烁的区域数（素材子区相关 0.44 → 中等粒度）
      stickBlueMix: 0.90,    // 转蓝程度（0 = 冷白，1 = 深蓝）

      // ---- 屋顶 LED 环带 ----
      ribbonBase: 0.60,
      ribbonFlash: 2.40,
      ribbonBlue: 0.90,
    },

    // 灯光秀 C「环流」：多条光环绕场旋转 + 径向条纹错拍，末段收拢成整片白光。
    // 用到 sticks 的 ringN/ringT/ringAmp 与 radN/radT/radAmp 六个可选通道
    // （通道缺省为 0 → 乘性调制不起作用，所以 A/B 的曲线逐位不变）。
    lightShowC: {
      enabled: true,
      timeScale: 1,
      // 六段（合计 12.6s）
      enter: 0.6,            // 起势：条数 0→ringN，亮度缓起（w 从 0 渐入，接缝连续）
      run: 6.2,              // 主段：光环匀速绕场，径向条纹反向慢转
      split: 1.8,            // 分束：条数翻倍、转速加快、明暗对比拉大
      gather: 1.6,           // 收拢：条数收回、相位归零、幅度收到很小
      bloom: 1.6,            // 爆亮：整圈均匀满亮，光环消失
      out: 0.8,              // 回落：亮度回常态，w 收 0

      baseGain: 0.16,        // 起势底光
      runGain: 0.92,         // 主段底光
      splitGain: 1.35,       // 分束段底光
      bloomGain: 2.2,        // 爆亮峰值（HDR，交给 Bloom）

      ringN: 3,              // 环向光带条数
      ringSpeed: 0.42,       // 环向相位速度（圈/秒反比：0.42 = 一圈约 2.4s）
      ringAmp: 0.85,         // 环向调制幅度（0.85 = 亮处 1.85×、暗处 0.15×）
      radN: 2,               // 径向条纹条数
      radSpeed: -0.23,       // 径向相位速度（负 = 与环向反向）
      radAmp: 0.18,          // 径向调制幅度（小一点，只做上下层的错拍感）

      ribbonBase: 1.4,
      ribbonRun: 4.2,
      ribbonBloom: 7.6,
      beamRun: 1.05,
      beamBloom: 1.6,

      // 舞台 LED 大屏（C 也驱动它：冷青呼吸 + 细竖纹，不做几何缩放）
      bodyGain: 1.15,
      bodyTint: 0.55,
      bodyFreq: 9,
    },

    // 灯光秀 D「心跳」：全场同步拍点 + 暖白脉冲（唯一一套暖色编舞）。
    // 拍包络 beatEnv 是纯算术（分段线性 + 幂衰减），8870 支棒每帧只乘同一个标量。
    lightShowD: {
      enabled: true,
      timeScale: 1,
      // 五段（合计 11.0s）
      enter: 0.8,            // 起势：拍幅度从 0 涨到满
      beat: 4.8,             // 主段：一拍一亮，拍间底光
      double: 2.0,           // 加倍：拍频翻倍，推进感
      hold: 1.8,             // 悬停：整场憋在半亮不动（编舞的留白）
      out: 1.6,              // 泄掉：回常态，w 收 0

      baseGain: 0.14,
      beatGain: 1.05,        // 主段底光
      beatAmp: 0.95,         // 拍点调制幅度
      beatFloor: 0.10,       // 拍间最低亮度（相对峰值）
      beatRise: 0.10,        // 起音时间（占一拍比例，越小越「脆」）
      beatDecay: 2.6,        // 衰减指数（越大尾巴越短）
      bpm: 96,               // 拍频
      warm: 0.55,            // 暖色偏移（抬 R/G、压 B；0 = 冷青）
      regionN: 8,            // 独立错拍的区域数（人群不是整齐划一）
      regionFlicker: 0.10,

      ribbonBase: 1.6,
      ribbonBeat: 4.0,
      beamBeat: 1.2,
      bodyBase: 0.7,
      bodyBeat: 1.9,
      bodyFreq: 6,
      bodyPulse: 0.05,       // 屏体面积随拍点的缩放幅度
    },

    // 灯光秀 E「极光」：环向 + 径向双向慢波，中段 fold 让环向相位反向（波原路折回）。
    // 相位用整条连续函数算（sin 形折返），段边界不跳变。
    lightShowE: {
      enabled: true,
      timeScale: 1,
      // 五段（合计 14.4s）
      seep: 2.0,             // 渗透：极慢地浮起来
      drift: 5.0,            // 漂流：双向慢波匀速，白度缓慢来往
      fold: 3.0,             // 折返：环向相位平滑反向，径向反向，白度推到高位
      flare: 1.4,            // 爆亮：一次短促满亮
      out: 3.0,              // 退去：极慢回常态，w 收 0

      baseGain: 0.15,
      driftGain: 0.78,
      foldGain: 1.25,
      flareGain: 2.4,

      ringN: 3,              // 环向波数
      ringSpeed: 0.11,       // 环向相位速度（很慢，极光感）
      ringAmp: 0.62,
      radN: 2,               // 径向波数
      radSpeed: 0.07,
      radAmp: 0.30,

      ribbonBase: 1.3,
      ribbonDrift: 3.4,
      ribbonFold: 5.6,
      ribbonFlare: 8.4,
      beamDrift: 0.85,
      beamFold: 1.25,
      beamFlare: 1.7,
      bodyBase: 0.6,
      bodyDrift: 1.5,
      bodyFold: 2.0,
      bodyFlare: 2.9,
      bodyTint: 0.62,
      bodyFreq: 5,
      bodyDrift: 0.03,
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
    trussColor: 0x39404e,            // 音响塔格构钢材（原先缺这个键，材质 color 拿到 undefined，
                                     // three 会 warn 并退回纯白 —— 塔一直是白的，不是深灰钢构）
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

  // ---------- 演出歌单（右侧面板展示；数组顺序即曲目序号）----------
  playlist: {
    title: '歌单',
    sub: '王俊凯 · 演唱会曲目',
    songs: [
      '继续给十五岁的自己',
      '树读',
      '疑疑疑',
      '如期',
      '生长',
    ],
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
