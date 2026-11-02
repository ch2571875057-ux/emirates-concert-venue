# 乐队乐器沙盒（band-lab）

为演唱会舞台两侧增加一支伴奏乐队：**6 件体素乐器 + 4 位乐手**。乐器是本沙盒
从零建的像素方块模型；乐手直接复用主项目已有的观众模型，不新增资源。
整个沙盒独立于主项目，不改动 `index.html` / `js/*.js` / `assets/*` 任何现有文件。

![渲染总览](preview/render_sheet.png)

## 快速开始

> ⚠️ **本机 `.html` 被关联到 Internet Explorer**，双击 HTML 会乱码/白屏。
> 请用下面的 `.bat` 入口（会显式指定 Edge/Chrome），或直接打开 `总览.jpg`。

**三个入口，按「省事」排序**

| 入口 | 作用 | 依赖 |
| --- | --- | --- |
| **`总览.jpg`** | 16 张精选图拼一张长图，双击即可看 | 任何看图软件 |
| **`打开预览图册.bat`** | 完整图册（45 张），用 Edge 打开 | Edge/Chrome |
| **`打开乐队沙盒.bat`** | 三维实时场景，可转视角、切单件 | Edge/Chrome + Python |

`总览.jpg` 是最保底的一档：WPS 图片查看器或 Windows 照片都能开，跟浏览器无关。

**方式二：手动起服务器**

```powershell
cd C:\Users\25718\Desktop\concert1
python -m http.server 8152 --bind 127.0.0.1
# 用 Edge 打开 http://127.0.0.1:8152/sandbox/band-lab/index.html
```

> ⚠️ 直接双击 `index.html` 也会白屏。浏览器禁止 `file://` 页面加载 ES 模块和
> `.glb` 模型，必须通过 http 访问。页面对这种情况做了检测，会显示中文提示页。

**图册文件说明**：`gallery-bundled.html` 是图片全部内联的单文件版本（1.2 MB，
零外部依赖，传输/拷贝不会丢图）；`gallery.html` / `预览图册.html` 是引用
`preview/web/*.jpg` 的轻量版（2.1 MB 外链）。

页面右侧面板可切换机位（观众正视 / 45° / 顶视 / 左右侧 / 背视）、单件特写、
素模 / 线框 / 发光 / 地贴 / 1.7m 比例参考柱，左上角 HUD 显示编制与三角面统计。

## 编制与摆位

舞台中轴 `x = -32.4`（`js/data.js` 的 `pitch.center.x`），台面高 `y = 7.32`，
舞台前沿 `z = 92`、纵深 24 m，**观众在 −z 侧**，模型正面统一朝 −z。

表中 x 为**相对舞台中轴**的偏移，z 为绝对坐标。尺寸是 **×1.5 放大后**的实测值
（缩放施加在加载后的 group 上，体素颗粒度不变）。

| # | 乐器 | 模型 id | 数量 | x 偏移 | z | 偏航角 | 实测尺寸 (m) | 体素 | 三角面 |
|---|------|---------|-----|--------|----|--------|--------------|------|--------|
| 1 | 架子鼓（5 鼓 3 镲 + 鼓凳） | `drums` | 1 | −11.5 | 107.0 | +10° | 3.30 × 2.10 × 2.55 | 1306 | 3152 |
| 2 | 电吉他（落地琴架） | `guitar` | 1 | −15.0 | 100.5 | +18° | 0.60 × 1.88 × 0.45 | 169 | 248 |
| 3 | 吉他音箱堆（箱头 + 4×12） | `amp` | 1 | −17.5 | 105.0 | −16° | 1.20 × 1.50 × 0.60 | 1000 | 544 |
| 4 | 双层键盘（琴架 + 延音踏板） | `keys` | 1 | +12.0 | 107.0 | −10° | 1.50 × 1.65 × 1.12 | 570 | 1106 |
| 5 | 电贝斯（落地琴架） | `bass` | 1 | +15.0 | 100.5 | −18° | 0.60 × 2.17 × 0.45 | 175 | 228 |
| 6 | 贝斯一体音箱（4×10） | `ampbass` | 1 | +17.5 | 108.5 | +16° | 0.98 × 1.12 × 0.60 | 612 | 404 |

合计 **6 件乐器（6 种模型）、3832 个体素、5682 个三角面**，加载后场景
**7614 三角面 / 13428 顶点 / 42 个网格**（含 4 位乐手）。

> **为什么放大 1.5 倍**：原尺寸的吉他琴身只有 0.40 m 宽，站一个 1.70 m 的人
> 在旁边比例失衡（琴像玩具）。放大后吉他 1.88 m、贝斯 2.17 m，与乐手身高接近，
> 读成「乐器立在乐手身前」而不是「人旁边摆了个小摆件」。

### 乐手

| 角色 | 模型 | x 偏移 | z | 偏航角 | 高度 | 来源 |
|------|------|--------|----|--------|------|------|
| 吉他手 | `p_guitar` | −15.0 | 101.5 | +84° | 1.70 m | `assets/crowd_a.glb` |
| 贝斯手 | `p_bass` | +15.0 | 101.5 | +96° | 1.71 m | `assets/crowd_b.glb` |
| 鼓手 | `p_drums` | −11.5 | 109.4 | +92° | 1.71 m | `assets/crowd_b.glb` |
| 键盘手 | `p_keys` | +12.0 | 108.4 | +88° | 1.70 m | `assets/crowd_a.glb` |

**两个 GLB 各用两次**：`crowd_a` → 吉他手 + 键盘手，`crowd_b` → 贝斯手 + 鼓手。
加载时按文件去重，每个 GLB 只下载解析一次，第二个乐手用 `gltf.scene.clone(true)`。

- 前两位（吉他手 / 贝斯手）站定在自己的琴正后方，横向与琴对齐（仅 0.15 m 的肩位差），
  琴在身前 0.8 m —— 从观众席看过去，琴体正落在乐手胸前，读成「人守着自己的琴在演奏」。
  z = 101.5 是包围盒反推的下限：人的前缘（z − 0.53）刚好不插进琴体背面。
- 鼓手在鼓组后方（z 109.4，鼓组后沿 108.54），键盘手在键盘后方（z 108.4，键盘后沿
  107.68），都留了 0.5 m 以上净空。
- 两个 GLB 都是 **Tripo 导出的静态单网格**（无骨骼、无动画，486 / 480 三角面），
  原点在身体中部而不是脚底，所以加载后按回读包围盒把脚底对齐到台面。
- 姿态本身就是双手张开上举的欢呼造型，当作「激情演奏」读得通；页面里另加了
  极小幅的摆身与 1 cm 起伏（`animate()` 里 `sway` / `phase`），幅度刻意压小，
  避免变成纸片人抽搐。
- 原生朝向 **+X**，场景里观众在 −Z，所以 yaw ≈ +90° 才正对镜头，取 ±8° 向内偏身。
- **麦克风架（`micstand`）已按要求从编制中移除**，模型与 GLB 仍保留在
  `export/blender/`，需要时可随时加回。

摆位由 `tools/qa_layout.py` 客观校验通过：全部落在台面内、不侵入海浪雕塑区
（|x 偏移| ≥ 20）、不穿屏墙（z ≥ 110.5）、与主唱（z 98, 半径 0.9）净空 > 0.35 m、
两两无重叠；左右两侧最外沿都是 |x| = 18.05 m（各 5 件），对称误差 0.00 m。

## 体素规格

- **体素边长 0.05 m（5 cm）**。原计划用 0.2 m，但 0.2 m 时吉他琴体真宽 0.32 m
  只有 1–2 格、琴颈不足 1 格，四视图完全无法辨认，故改小到 5 cm。
- 13 色调色板，取自参考图主色（`models/models.json` 的 `palette`）：

  | 代号 | 色值 | 用途 |
  |------|------|------|
  | `K` | `#101219` | 炭黑（琴体、鼓五金、琴架） |
  | `N` | `#1b2330` | 深蓝黑（箱体阴影面） |
  | `G` | `#2a2f3a` | 深灰（支架、盆架） |
  | `M` | `#6e7686` | 中灰（防尘帽、金属件） |
  | `C` | `#c9d2e0` | 亮银（鼓圈、琴桥、支柱） |
  | `W` | `#f4f6fa` | 白（白键、云台） |
  | `B` | `#2b6fd6` | 舞台蓝（点缀） |
  | `Y` | `#d8b24a` | 黄铜（镲片、铜管） |
  | `T` | `#8a5a2b` | 木色（鼓腔、吉他琴体） |
  | `O` | `#d9a05a` | 枫木（指板、面板） |
  | `S` | `#35251b` | 深棕（暗部木纹） |
  | `R` | `#c0392b` | 红（旋钮点缀） |
  | `A` | `#c0703a` | 橙棕（音箱网布，取自参考图 `#cb7137`） |

## 目录结构

```
sandbox/band-lab/
  index.html              沙盒页（importmap 引 ../../vendor/three.module.js）
  band-lab.js             场景/灯光/机位/交互（约 590 行）
  models/
    models.json           体素数据（每件一个 layers 层数组 + 尺寸 + 调色板）
    <id>.js               每件模型的 ES 模块包装（export const MODEL）
    index.js              汇总 ALL
  refs/                   7 张参考图 + _analysis.json（长宽比/主色）
  fourview/               四视图（正/背/顶/左/右 + 参考原图并排）
  render/                 Blender Cycles 渲染（每件 3/4、正视、侧视 + 全景）
  shots/                  沙盒页 headless 截图（14 个机位）
  preview/                总览拼版（render_sheet.png / shots_sheet.png）+ web/ 压缩图
  export/blender/
    <id>.glb              7 件独立 GLB（6 件乐器 + 保留的 micstand）
    band_all.glb          按编制摆位合成的全景（330 KB，已不含 micstand）
    stats.json            体素/顶点/三角/尺寸统计
  tools/
    voxel_kit.py          体素网格基础库（米制 API、连通修复、ASCII 投影）
    gen_models.py         7 件乐器的几何构建脚本
    analyze_refs.py       参考图去背、长宽比、主色提取
    build_fourview.py     四视图渲染（2× 超采样）
    qa_fourview.py        四视图版面校验
    blender_voxel.py      体素 → Blender 网格（暴露面剔除 + 贪心矩形合并）
    blender_build.py      Blender 建模、导出 GLB、Cycles 渲染
    blender_verify.py     GLB 回读校验（尺寸/面朝向/三角数）
    qa_render.py          渲染图客观检查（全黑/空帧/过曝/出画）
    qa_layout.py          摆位碰撞与对称校验
    qa_shots.py           沙盒截图客观检查
    qa_framing.py         机位取景复算（不连浏览器）
    fit_views.py          相机距离二分求解
    shot.py               Edge --screenshot 多机位截图
    make_sheets.py        总览拼版
    ascii_img.py / _look.py  截图 → ASCII 亮度图（无图像输入时判读用）
```

## 重新生成

```powershell
# 1) 体素建模（改几何后先跑这个，产出 models/models.json）
python tools/gen_models.py

# 2) 四视图
python tools/build_fourview.py && python tools/qa_fourview.py

# 3) Blender 导出 GLB + 渲染（约 8 分钟，19 张 Cycles 图；micstand 已排除）
& "C:\Users\25718\AppData\Local\Programs\Blender Foundation\Blender 4.5\blender.exe" -b --factory-startup -P tools/blender_build.py
python tools/blender_verify.py

# 4) 沙盒页截图与验收
python tools/shot.py && python tools/qa_shots.py
python tools/qa_framing.py && python tools/qa_layout.py
python tools/make_sheets.py
```

## 关键实现说明

**体素 → 网格**：先在整件模型的体素集合上求暴露面（只保留邻居为空的 6 个方向），
再按所属体素的颜色分组做贪心矩形合并。先分组再求面会漏剔除异色相邻的内部隔墙，
三角数会多出约 26%。

**面朝向**：按色拆分的子网格不闭合，不能用 `recalc_normals`。`blender_voxel.py`
的 `face_quad()` 为每个方向显式写死绕序，并在映射到 Blender 坐标后校验带符号体积，
若为负则整体反转面序。`blender_verify.py` 会回读每个 GLB 复算体积并断言为正。

**坐标系**：体素 `(i, j, k)` → Blender `x = i·V`、`y = (nz−1−k)·V`、`z = j·V`，
原点归到底面中心，**正面朝 +Y**。glTF 导出时 `(x,y,z) → (x,z,−y)`，所以
**正面最终落在 glTF 的 −Z**，与主项目「舞台朝 −z、观众在 −z 侧」一致。

**沙盒页灯光**（踩过的坑都写在注释里）：
- three r155+ 默认物理光照单位，旧的低强度配置整体压成近乎全黑的画面。
- `RectAreaLight` 需要 `RectAreaLightUniformsLib` 提供 LTC 贴图，本项目 `vendor/jsm`
  里没有，缺贴图时面光源等于没开 —— 改用 `PointLight` 做侧光/补光。
- 没有环境贴图时 `metalness > 0.3` 的材质渲染成纯黑，加载 GLB 后统一压到 ≤ 0.25。
- **布景大平面（背墙、台面）必须用 `MeshBasicMaterial`**：受光材质会被主光打成
  一条比乐器还亮的横向灯箱，实测亮带 100% 来自背墙。
- 曝光基准 `toneMappingExposure = 2.4`（页面可用 `?exp=` 覆盖）。

**headless 截图**：不用 CDP 长连接（swiftshader 下连续导航会拖崩 GPU 进程，
报 `ConnectionAbortedError [WinError 10053]`），改为一个机位一个 Edge 进程 +
`--screenshot` 一次性出图，`--virtual-time-budget=16000` 等 GLB 加载完。
注意 `--only` 是单值参数，一次只能指定一个机位；单张偶发 7 KB 灰图是首帧
时序竞态，重拍即好。

**乐手**：两个 crowd GLB 直接 `GLTFLoader` 加载（路径 `../../assets/crowd_a.glb`），
`scale = 1.72` 与主项目 `js/data.js` 的 crowd 配置一致。原点在身体中部，
所以先 `Box3.setFromObject` 回读包围盒，再把 `mesh.position.y -= raw.min.y`
让脚底落到台面。素模/线框开关**不作用于乐手**（`applyState()` 里直接 return），
否则会变成无法辨认的灰块。

## 后续合入主项目（本次未执行）

1. `js/data.js` 的 `concert` 下新增 `band` 段，照抄上面的 6 条乐器摆位 + 2 条乐手摆位。
2. `js/stadium.js` 新增 `buildBand()`，用 `GLTFLoader` 加载 `export/blender/band_all.glb`
   或逐件加载后按 `LAYOUT` 摆位；乐手复用已有的 `crowd_a/crowd_b` 加载结果；
   复用现有 `sanitizeNormals()` 兜底。
3. `js/app.js` 的 `LAYER_NAMES` 增加 `'band'` 图层开关。
4. 主项目已有环境贴图/IBL 时，可去掉 `band-lab.js` 里压 `metalness` 的那段，
   金属件（`C` 亮银、`Y` 黄铜）会正常出高光。
