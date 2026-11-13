# 酋长球场 · 演唱会场馆

以酋长球场（Emirates Stadium）GLB 模型为底，按《体育场可移植建模复现范式》的方法论改造的**演唱会场馆交互网页**：Three.js（ES Module，无打包，零构建）。

## 运行

必须通过 HTTP 打开（ES Module 的 CORS 限制，`file://` 直接双击 index.html 打不开）。

**最省事：双击 `启动服务器.bat`** —— 它会自动定位到脚本所在目录、自动找到一个
真正可用的 Python（跳过 Microsoft Store 的占位程序）、起服务并打开浏览器。
**没有 Python 也能跑**：脚本会再找 Node.js，用 `server_nocache.mjs` 起同一个服务
（同样发 `no-store` 头），端口、行为完全一致。

手动启动（二选一，都禁缓存，改完刷新即生效）：

```bash
cd /e/concert1           # 或项目实际所在目录
python server_nocache.py # 有 Python 走这个
node server_nocache.mjs  # 没 Python 走这个
# 浏览器访问 http://127.0.0.1:8141/
```

> **注意（2026-11 排查记录）**：本机 PATH 里的 `python` 是
> `C:\Users\...\AppData\Local\Microsoft\WindowsApps\python.exe`，这是 Microsoft Store
> 的**占位空壳**，执行任何命令都没有输出也不报错，`python -m http.server` 会静默失败，
> 表现为「双击后浏览器打不开」。`启动服务器.bat` 通过真的执行一次 `print(1)` 来验证
> 候选解释器，能正确跳过它；Node 兜底分支同理，会真的跑一次 `--check` 才认。
> 若要一劳永逸，建议装一个真正的 Python 3 并勾选 Add to PATH。
>
> 脚本里**故意不用 `timeout /t`**：有些机器 PATH 里先命中的是 GNU coreutils 的
> `timeout`，不认 `/t` 参数会直接报错退出，服务其实起来了却被判成失败。
> 现在改成 `ping -n 2` 睡 1 秒 + 轮询 curl，最多等 15 秒。

依赖已全部本地化在 `vendor/`（three@0.169.0 及 addons，来自 unpkg），**断网可跑**。

## 在线版（不用装任何东西，发给别人也能看）

**<https://ch2571875057-ux.github.io/emirates-concert-venue/>**

### 为什么不能直接扔到 GitHub Pages

Pages 这条出口的带宽被限到约 36 KB/s（实测单连接 19–45 KB/s，8 并发聚合也只有 36 KB/s）。
首屏要约 7.5 MB，按这个速度**三分钟都开不完**，这就是「别的电脑打不开」的真实原因——
不是 404，也不是权限，是卡在下载上。

现在做成：**HTML 壳留在 Pages（几十 KB），代码与模型全部走 jsDelivr**（同一个 GitHub
仓库，零迁移、零构建）。实测 `fastly.jsdelivr.net` 拉 `Arsenal.glb` 2.2–4.5 MB/s，
`three.module.js` 经 brotli 后只传 261 KB。冷启动 **5–13 秒**，热启动 1–2 秒。

### 三种打开方式

| 方式 | 怎么做 | 说明 |
| --- | --- | --- |
| **在线** | 直接把上面那个 `github.io` 地址发过去 | 需要能连 jsDelivr |
| **本机直接双击** | 双击 `index.html`（`file://` 协议） | **不装 Python、不装 Node、不起服务器**，资源自动走 CDN |
| **本机起服务** | 双击 `启动服务器.bat` → `127.0.0.1:8141` | 完全断网可用，录屏首选 |

> `file://` 能跑是因为 `index.html` 里没有一行静态的 `<link>` / `<script src>` ——
> 全部由 `<head>` 里那段脚本在运行时挂载。

### 打不开怎么定位：`DIAG.html`

**<https://ch2571875057-ux.github.io/emirates-concert-venue/DIAG.html>**

让别人在那台机器上打开这个页面，**整页截图发回来**即可。它零依赖、不加载 three，
只查三件事：

1. **浏览器**：UA、内核版本、**是否支持 import map**（Chrome/Edge 89+、Safari 16.4+；
   微信内置浏览器、QQ 兼容模式、IE 都不支持，会直接白屏）
2. **资源节点**：四个 jsDelivr 镜像逐个探测（8 秒超时），报「好 · Nms」或「不通 · 原因」
3. **站点入口**：本站 `github.io`、`raw.githubusercontent.com`、`api.github.com`

页面底部会给一句结论，比如「浏览器没问题，资源节点也通了（最快：jsd.onmicrosoft.cn 478ms）」
或者「四个资源节点一个都连不上，这台机器的网络把 jsDelivr 全系列都拦了」。

### 实现（`index.html` `<head>` 里的一段脚本，约 150 行）

启动时按顺序做：

1. **探测**四个 CDN 镜像（`fastly` → `jsdelivr` → `onms` → `jsdmirror`），
   各拉 `js/wavefx.js`（2 KB）测速，单个 2.5 秒超时，整体 3.2 秒硬兜底；
   第一个通的直接用，全不通就回退同源（Pages，慢但一定打得开）。
2. **插 `<base href>`** 指向选中的节点，让 `js/data.js` 里的 `./assets/*.glb` 相对路径自动跟随。
3. **运行时生成 import map** —— 这是关键。`<script type="importmap">` 是**静态解析**的，
   `<base>` 改不了它的解析基准，写成静态标签的话 `three` 与 `three/addons/*`（1.3 MB）
   仍会从 Pages 拉。改成 `document.createElement('script')` 再 `textContent = JSON.stringify({...})`，
   `imports` 里写**绝对 URL**，才真正全走 CDN。
4. **动态挂载** `styles.css` 与 `js/app.js` —— 同理，HTML `<link>` / `<script src>` 在预扫描阶段
   就被预取了，那时 `<base>` 还不存在，这两项会漏回本机。

### 三个开关（都是 query 参数）

| 参数 | 作用 |
| --- | --- |
| `?cdn=off` | 强制同源（走 Pages，慢但一定打得开，用于排查） |
| `?cdn=1` | 本地也强制走 CDN（验证 CDN 链路） |
| `?cdn=<url>` | 换指定镜像，例如境内：`?cdn=https://jsd.onmicrosoft.cn/gh/ch2571875057-ux/emirates-concert-venue@<sha>/` |
| `?diag=1` | 把探测明细写进加载层（哪个节点通、各花多少毫秒） |

加载层底部会显示当前用的是哪个源，形如 `fastly · 114ms` / `本站（本地）`。
25 秒还没加载完，会自己提示换网络 / `?cdn=off` / 改本地跑。

### 怎么选节点（踩过的坑）

探测用的是 **64 KB 的 `assets/crowd_a.glb`**，不是 2 KB 的小 js 文件 ——
小文件任何节点都在 400 ms 内返回，量出来的是 TTFB 不是吞吐量。
上一版就是被这个坑住：`cdn.jsdmirror.com` 探 396 ms 看着最快被选中，
实拉 `Arsenal.glb` 只有 7 KB/s，首屏 7.5 MB 变成几分钟。

选定后**按固定优先级**（`fastly` → `jsdelivr` → `onms` → `jsdmirror`）挑，不按测出的
KB/s 排序：64 KB 里 TLS 握手占一半，同一节点两次能测出 36 KB/s 和 2183 KB/s，排序会翻车。
`fastly` 在几十次实测里一直最快（`Arsenal.glb` 2.2–4.5 MB/s）。

另外探测**不能「谁先回来就用谁」**——那样选的是延迟最低的，而不是优先级最高的。
所以等四个探测都回来（或 3 秒硬兜底）再统一挑，这个等待会算在首屏里。

### 用固定 SHA，不用 `@main`

CDN 基址写的是**提交 SHA**（`index.html` 里的 `var REF`），不是 `@main`。

原因：jsDelivr 按分支引用缓存最长 12 小时。改完代码、Pages 也更新了，资源还从旧缓存来，
表现为「本地好好的，线上还是老样子」—— 这次就踩了：加载层已经补上 `visibility:hidden`，
线上仍挂旧样式，一度以为是改错了地方。

固定 SHA 后每个提交的内容是确定的，也不需要等缓存过期。

```
node tools/pin_ref.mjs --check   # 只校验，不改文件
node tools/pin_ref.mjs           # 把 REF 推到当前 HEAD
```

**发版顺序：先 commit 资源改动 → 再跑 `pin_ref` → 最后 commit `index.html`。**
这样 REF 指向的那个提交里已经装好了最新资源。

`--check` 只校验「REF 之后有没有 `js/`、`vendor/`、`assets/`、`styles.css` 的改动」，
改 README、改 tools 不算，不用为文档改动白推一次 REF。

> **一个坑**：CDN 的分支引用缓存是真的会咬着不放。这次 `styles.css` 已经补上
> `visibility:hidden`，提交也推上去了，但 `@main` 那条路径返回的还是旧文件——
> 浏览器里量到的 `#loading` 仍是 `visibility: visible`，看着像改动没生效。
> 换 `@dd1b3fe` 这样的固定 SHA 立刻拿到新文件。所以现在不用 `@main`。

> 例外：音频（`.m4a`）在 jsDelivr 会被 301 到 `raw.githubusercontent.com`（约 36–49 KB/s），
> 但本项目音频码率只有 ~8.7 KB/s（41 秒 360 KB），流式播放完全跟得上，实测点开即出声。

**录屏仍建议用本地** `http://127.0.0.1:8141/` —— 线上首屏慢几秒，且 CDN 缓存会让「同一镜重录」的
行为在 12 小时窗口内不一致。

## 看什么 / 怎么玩

- **侧边栏**：全高手风琴分组侧边栏（🎥视角 / 💡灯光 / 👥观众 / 🌊人浪 / 🎤歌手 / 🎆开场秀 / ✨灯光秀 / 🎮漫游），
  点击组头展开收起；可整体收起成 48px 图标轨（点图标直达分组）；底部状态栏实时显示
  视角名 · 时间 · FPS · draw calls；`?sb=collapsed` 初始收起，≤640px 小屏自动收起
- **歌单（右侧）**：固定曲目单 —— 特别的人 / 树读 / 疑疑疑 / 如期 / 生长（王俊凯）。
  点一条高亮该曲并在舞台两侧海浪副屏写出歌名（长歌名自动降字号）。
  每条的 ▶ 按钮播放 `assets/audio/` 里的音源，再点暂停：后四首是 **30 秒官方试听**（Apple iTunes），
  《特别的人》用的是用户自备的**完整曲**（`tebie.m4a`，41 s，360 KB：已去掉源文件的视频轨、moov 前置）。
  想再换音源：自行合法获取后同名覆盖 `assets/audio/*.m4a`，代码无需改动。
  `?pl=collapsed` 初始收起；点击按钮可整体收成 52px 竖条
- **视角**：侧边栏视角分组切换 鸟瞰全景 / 内场看舞台 / 看台视角 / 场馆外观 / 屋面俯视 / 自由，镜头自动补间并打字幕
- **时间**：拖动 0–24h 滑杆，天空/太阳/雾/Bloom/灯光随时间连续变化（默认 21:00 演唱会夜景）
- **灯光**：常亮 / 频闪 / 扫描三模式；**灯组开关**（舞台灯光/观众闪光灯联锁）与**场馆泛光**（环境照明/LED 环带）完全解耦，可任意组合
- **观众星海**：看台三层 + 内场站区的荧光棒光点，统一色相、96 色色轮每 6 秒流转、三频摇晃
- **第一人称漫游（v2）**：W/A/S/D 平移 · **Space/C 升降** · Shift 加速 · **按住拖拽转向**
  （FPS 风格，OrbitControls 漫游期间自动禁用）；眼高限制 6.1–58m，出界自动钳制
- 每个开关都有 toast 反馈
- **录视频**：直接开 <http://127.0.0.1:8141/STORYBOARD.html> —— 一镜一张卡，点「打开这一镜」自动跳过去，
  「计时开录」按镜头时长倒数，「已录好」打勾记进度（存本机浏览器）。纯文本版见 [STORYBOARD.md](STORYBOARD.md)；
  命令行 `node tools/storyboard.mjs --urls` 也能把 39 条完整地址打成一张表

## QA / 验收参数（固定机位复现）

```
?debug=1&ui=0&view=free&cam=x,y,z&look=x,y,z&fov=50&time=21
&still=1                 # 定帧模式（headless 截图用）
&layers=bowl,ground,...  # 逐层显影（bowl/ground/concert-field/stage/sound/
                         #  stage-lights/audience/crowd/singer/band/led-ribbon/sky/holo）
&fx=normal|tide|pixel|stripe|meet|chase|ripple|spiral|duet   # 直接指定观众光效
&pattern=heart|note|smiley|star|text      # 点阵图案（会连带把模式设为 pixel）
&scroll=0                                # 冻结点阵横向摆动；&pshift=N 冻结到指定列偏移
&pixdump=heart            # 把内场真实 instanceColor 的 50×31 三态 ASCII 打到 #loading-error
&fxdump=stripe|meet|chase|ripple|spiral|duet  # 把看台 48 桶 / 内场 50 桶的平均亮度剖面打到 #loading-error
&lightshow=1             # 直接开启灯光秀 A（全环，循环播放）
&lightshow=b|c|d|e       # 直接开启灯光秀 B 深蓝 / C 环流 / D 心跳 / E 极光（循环播放）
&lsT=秒                  # 冻结灯光秀到指定时刻；&lsT=off 验证关闭后的归位
&lsdump=秒|off            # 把灯光秀各载体的真实数值（环带/屏 uniform、光束 alpha、看台 48 桶）打到 #loading-error
&song=1..5               # 直接选中第 N 首（同步写到舞台副屏），配 &ui=0&view=stagefront 截图验收
&pl=collapsed            # 右侧歌单初始收起
&chrome=0                # 隐藏左右面板与 debug 角标，但保留视角字幕与 toast（录屏用；&ui=0 会把字幕一起关掉）
&holo=0                  # 关闭全息投影
&holoPhase=materialize   # 把全息定格到指定姿态（hidden/pillar/materialize/pulse/rise/
                         #  spin/push/center/fly/docked）
&holoT=秒                # 冻结全息时钟（配合 holoPhase 出静帧）
```

headless 截图流水线（Edge 示例）：

```bash
msedge --headless=new --enable-unsafe-swiftshader \
  --use-angle=swiftshader --window-size=1600,900 --virtual-time-budget=20000 \
  --screenshot=out.png "http://127.0.0.1:8141/?ui=0&still=1&view=aerial&time=21"
```

> **踩坑**：新版 Edge（2026 年版本）加上 `--disable-gpu` 会让 WebGL 帧抓不到，
> 截图稳定输出全黑（约 6 KB 的纯黑 PNG），而页面本身正常（`#loading` 已是
> `class="done"`、canvas 尺寸正常）。去掉 `--disable-gpu` 即可出图。
> SwiftShader 下帧率很低，多给 `--virtual-time-budget`（20 s 以上），
> 否则应援棒星海还没点亮就截了。

`preview/` 内含全部验收截图与 8 帧建造序列（`preview/sequence/`），按主题
分目录（见下方「子目录约定」）；`render/` 为 1920×1080 最终交付图。

- **开场秀（9 段 / 62.35 s，复用灯光秀与人浪）**：HUD「开场秀」分组 ▶ 播放 / ■ 跳过。
  时间轴全部由 `DATA.show.segments` 驱动（`js/show.js` 只负责按段施加上下文，不再写死阶段），
  每段可指定 `audience`（人浪光效）/ `lightShow`（灯光秀版本）/ `dimmer` / `lightsOff` / `lampBanks` /
  `singer` / `led` / `waveText` / `holo`（全息姿态）/ `fireworks`。段表：

  | # | 段 | 时长 | 观众席 | 灯光秀 | 全息 | 内容 |
  |---|---|---|---|---|---|---|
  | 1 | `countdown` | 5.00 | normal | — | hidden | 暗场，LED 屏倒数 5→1，灯组关闭、dimmer 0.15 |
  | 2 | `wake` | 4.00 | **tide** | — | pillar | 灯组回升、dimmer 0.15→0.85，全息光柱先起 |
  | 3 | `ringA` | 11.35 | 灯光秀接管 | **A 环带** | materialize | 全息显形，与 A 的三载体联动同拍 |
  | 4 | `heartbeat` | 11.00 | 灯光秀接管 | **D 心跳** | pulse | 唯一暖色编舞，全息随拍点呼吸 |
  | 5 | `ripple` | 4.00 | **ripple 涟漪** | — | rise | 光效切回人浪，全息上浮 |
  | 6 | `spiral` | 4.00 | **spiral 螺旋** | — | spin | 螺旋臂绕场，全息自转 |
  | 7 | `heart` | 4.00 | **pixel 心形** | — | push | 点阵心形 + 3 发单发烟花 |
  | 8 | `finale` | 13.00 | 灯光秀接管 | **B 深蓝** | center | 深蓝光团 + 终章环碗口 6 发齐爆 |
  | 9 | `outro` | 6.00 | tide → normal（3 s 处切换） | — | fly | 全息缩小飞向舞台左侧常驻位 |

  **为什么灯光秀与人浪交替而不是叠加**：`updateAudience()` 的分支优先级是
  `lightShowOf().w > 0.001` → 灯光秀接管看台，其次才是 `WAVE_FX_MODES`，所以两者在看台上互斥；
  段表里每段只启用其中一个，交接处自然过渡。三段灯光秀的 `dur` 与 `lightShowDurationFor(id)` **严格相等**，
  保证段尾 `w` 收到 0、不会硬切。`ShowManager.start()` 快照 13 个状态字段，`end()` 全部还原，
  不再像旧版那样把用户手动设的 dimmer/观众模式留成开场秀的值。
  QA：`?show=1&showT=秒` 定格任意时刻；`?show=1&showT=63` 可直接看恢复常态后的现场。

- **全息投影（`js/holo.js` + `assets/holo.glb`）**：Q 版吉祥物以全息形态出现在舞台前沿
  （`(-32.4, 7.32, 95.5)`，脚底贴舞台台面，默认高 11.5 m），开场秀期间随段切换姿态（光柱 → 显形扫描 → 拍点呼吸
  → 上浮 → 自转 → 前推 → 居中），尾声**缩小 0.55 倍飞到舞台左侧常驻位**（`(-54.0, 7.32, 97.0)`，与台面同高）
  待机自转+上下浮动，可随时用 HUD「全息投影」开关隐藏/恢复。
  实现要点：`ShaderMaterial` 自定义片元（`vH` 用**模型局部高度**归一化，不是 uv；冷蓝重映射 +
  按身高扫描线 + 竖向流动亮带 + 菲涅尔边缘 + `uSweep` 显形扫描 + 行级 uv 抖动），
  `NormalBlending` 而非 Additive（否则白衣服被 bloom 洗白），`depthWrite:false` + `DoubleSide`。
  HUD 开关之外还有三个 QA 参数：`?holo=0` 关闭、`?holoPhase=<姿态>` 定格（hidden/pillar/
  materialize/pulse/rise/spin/push/center/fly/docked）、`?holoT=` 冻结时钟。
  `?layers=holo` 可单独隔离全息层。验收：`node tools/verify_holo.mjs`。

- **舞台 v2（海洋主题，移植自 sandbox/stage-lab.js）**：箱体台+发光台口+中央发光
  阶梯、胶囊形 LED 月夜海面主屏（程序化 Canvas，开场秀倒计时重绘）、**双侧海浪雕塑**
  （双曲线放样曲面+发光浪脊/水线+浪花液滴）带**副屏文字层**（"LIVE IN CONCERT" 贴浪
  发光文字，开场秀切换滚动字幕）、双环灯架；旧延伸台/B台/拱桁架已移除。
- **光束 v2**：双层锥 ShaderMaterial（轴心亮 + 外壁保底 + 长度耗散 + 尘埃流动噪声），
  偶数束外扫、奇数束斜指内场，扫描/频闪模式实时摆场；地面光池 + 全场尘埃粒子。

- **灯光秀（五套编舞，A / B / C / D / E）**：HUD「灯光秀」分组 ✨ 里先选**版本**
  （A 呼吸 / B 深蓝 / C 环流 / D 心跳 / E 极光），再开「播放灯光秀」循环播放；
  开关与版本切换都会把编舞时间归零。五套都返回同一份契约，消费端零分支。

  **A —— 全环应援棒 + 屋顶环带 + 舞台光束三载体联动，11.35 s 六段**。时间占比按素材
  12.17 s 的真实节奏铺排：**呼吸 3.2 s**（看台北弧居中一团暗青微光缓慢起伏）→
  **爆发 0.95 s**（半角从 0.17 展开到 0.42，冷青迅速转纯白，环带冲到 6 倍）→
  **收束 0.5 s**（应援棒塌下，只留环带一条细亮带）→ **黑场 2.3 s**（近全暗，只余极弱
  余辉，对比全靠这段）→ **白带 3.4 s**（环带 64 段纯白满亮 + 应援棒上一道亮带绕场行进）
  → **回落 1.0 s**（权重收到 0，插值回常态，不跳变）。

  **B —— 舞台中央单光团，13.00 s 六段**，取自素材里「一个居中的光体在黑暗中呼吸」：
  **点亮 2.1 s**（近白方光缓缓涨亮）→ **闪白 1.5 s**（纯白峰值，光体横向拉宽）→
  **转冷 0.9 s**（白 → 冷青的过渡）→ **深蓝 6.7 s**（最长一段，面积回落、6~7 条稀疏竖纹
  显形、色温推到 RGB≈(95,99,160)）→ **竖纹 1.2 s**（条纹对比拉满并快速横移）→
  **隐去 0.6 s**（权重收到 0）。B 不靠全场亮：看台应援棒只留 0.08~0.22 的冷底光，
  重量全压在 **LED 大屏**上 —— 靠 `onBeforeCompile` 把贴图贡献按权重融成**纯自发光平面**，
  再叠 `tint`（0 纯白 → 1 深蓝）与沿 `uv.x` 的竖条明暗，并用 `emissiveIntensity` 做亮度包络
  （HDR 3.2 交给 Bloom 撑出光团半径），几何缩放只 ±6%（放大会露出屏框，像镜头推进）。

  **C —— 环流，12.60 s 六段**：应援棒层第一次引入**环向/径向正弦通道**（`ringN/ringT/
  ringAmp` 与 `radN/radT/radAmp`），亮度按 `1 + amp*sin(环向角*N + 相位)` 调制，于是整圈
  看台上跑的是**连续的三条亮度环带**而不是一颗亮头：起势 0.6 s（权重淡入，环带几乎静止）→
  环流 6.2 s（相位匀速推进，三条环带绕场回旋，环带沿半径方向被 `radN=2` 轻微掰弯）→
  分束 1.8 s（环距拉开、对比加深，环带像被撕成亮弧）→ 收拢 1.6 s（相位加速、弧段归拢到
  背台侧）→ 爆亮 1.6 s（gain 到 2.2，环带与环带之间也被填亮，环带 7.6 倍）→ 回落 0.8 s。
  C 的 LED 屏同步走冷青 `tint=0.55` + 竖纹，几何不缩放（只靠 HDR→Bloom 撑面积）。

  **D —— 心跳，11.00 s 五段**：唯一一套**暖色 + 全场同步**的编舞。拍点用纯算术包络
  `beatShape(ph, rise, decayPow, floor)`（不查表、不调 `Math.sin`），`bpm=96` 一拍约
  0.625 s：起势 0.8 s → 拍点 4.8 s（每拍全场应援棒同时抬起再衰减，剖面几乎均匀，
  是「观众被同一拍子推起来」的观感）→ 加倍 2.0 s（拍频翻倍、`beatAmp` 抬到 0.95）→
  悬停 1.8 s（拍点收成持续底光）→ 回落 1.6 s。`warm=0.55` 把颜色往暖白推
  （`r*1.16`、`g*1.03`、`b*0.81`），是五套里唯一的暖色场。

  **E —— 极光，14.40 s 五段**：环向 + 径向两路**极慢**正弦（`ringSpeed=0.11`、
  `radSpeed=0.07`），叠在一起形成缓慢游走的宽色带。关键在**折返**——环向相位不是
  线性累加，而是一个 C1 连续的全局函数：先按 `ringSpeed` 正向推，进入 fold 段后用
  `(Tf/π)*sin(π*p)` 让速度平滑过零再反向，净位移为 0，所以色带会**走过去再走回来**，
  不会在循环边界硬切向。渗透 2.0 s → 漂流 5.0 s → 折返 3.0 s → 爆亮 1.4 s（`flareGain=2.4`，
  环带 8.4 倍）→ 回落 3.0 s。E 是五套里最长、最暗、最慢的一套，专门用来做「安静段」。

  五套共用的机制：编舞每段返回 `w=1`，只有收尾段收到 0，消费端一律
  常态值*(1-w) + 编舞值*w，所以开关、切版本、收尾都不会跳变；环带层必须在
  `updateAtmosphere` **之后**覆写（那里每帧都写 `emissiveIntensity`），并以
  `userData.lsBaseIntensity` 为基准插值；环带着色、屏着色与光束颜色**每帧无条件写回**
  （即使灯光秀关闭），否则会停在纯白/分段/深蓝状态。变体分派集中在
  `stadium.js` 的 `lightShowOf(state, elapsed)` → `lightshowRegistry.js`。五套返回同一套
  顶层契约 `{ phase, name, p, t, total, w, sticks, ribbon, beam }`，其中 B/C/D/E 额外带
  `body`（LED 屏）与 `sticks.blue`/`beam.blue`；`sticks` 除 8 个必填字段外，
  C/D/E 还带可选的 `ringN/ringT/ringAmp/radN/radT/radAmp/beatAmp/beatEnv/warm`。
  消费端四条通道全部分支为零：`updateLights` 读 `beam`、`updateLightShowRibbon` 读
  `ribbon`、`updateAudience` 读 `sticks`、`updateLightShowBody` 读 `body`（用 body 是否存在
  判定权重，否则 A 会把屏压蓝）。
  编舞数学独立在 `js/lightshow.js` / `lightshowb.js` / `lightshowc.js` / `lightshowd.js` /
  `lightshowe.js`（纯函数无 three 依赖），参数在 `js/data.js` 的 `concert.lightShow` /
  `lightShowB` / `lightShowC` / `lightShowD` / `lightShowE`。变体表集中在
  `js/lightshowRegistry.js`（id / 中文名 / 一句话描述 / 参数键 / 编舞函数 / 总时长），
  新增一套只需往这张表加一行 + 一个纯函数文件，`stadium.js` 与 `app.js` 一行都不用改。
  `?lightshow=1|b|c|d|e` 直接开启，`?lsT=秒` 定格任意时刻，
  `?lsdump=秒|off` 把所有载体的真实数值打到 `#loading-error`。

  **B 的观众层**复刻参考素材里看台的行为（0~2.5s 完全不亮 → t≈3.07s 与屏同刻
  冲到暗态的 12~14 倍纯白 → 之后长段维持 2.5~3 倍并各自闪烁 → 颜色由白转深蓝
  B/R 1.6~1.8）。要点：① 暗底压到 `stickDark:0.02`，否则「不亮」段仍有底光，
  动态范围做不出来；② 闪烁**按环向分区**（`stickRegionN:12`，黄金角撒相位），
  因为素材里 3×3 子区两两相关只有 0.44 —— 人群是各自挥动，不是整场一个呼吸，
  统一正弦会看起来像电动装置；③ 转蓝只**压 R/G 分量**、不动 B
  （`_LS_BLUE_R/G`），对整色 lerp 会把暗底光一起提亮，变成「发白」而不是「发蓝」；
  ④ 内场 1550 支点阵应援棒**不参与** B 的观众层，保持暗底。

## 结构

```
STORYBOARD.md   分镜脚本：录制镜头表 / 录屏工作流 / 已知坑（由 tools/storyboard.mjs 生成）
STORYBOARD.html 排镜台：一镜一卡，可跳转 / 计时 / 打勾（同上，生成物）
DIAG.html       打不开时的自检页：查浏览器内核 / 四个 CDN 节点 / 站点入口，零依赖
index.html      页面骨架 + HUD + 在线版引导脚本（探测 CDN、运行时挂 import map、
                动态挂载 styles.css 与 js/app.js，见「在线版」一节）
styles.css      视觉系统
js/app.js       渲染循环、相机补间、时间/氛围驱动、UI 状态机、右侧歌单、QA 参数
js/stadium.js   改造与设备层：convertGLB（删球门/删照片地面/换程序化地面）
                buildField（地坪/站区/隔离栏）buildStage（海洋主题舞台 v2/海浪副屏/LED）
                buildSound（音响塔）buildLights（灯光三模式）
                buildAudience（看台应援棒，按实测剖面）buildCrowd（内场人模
                InstancedMesh）buildBand（舞台两侧体素乐队）buildSky/buildRibbon（天空/LED 环带）
js/show.js      开场秀：ShowManager 时间轴状态机 + Fireworks 星芒烟花
                （星形 SDF 粒子/长芒/闪光/池化 PointLight/上升彗星）
js/data.js      参数总表（全部实测/调校常量，几何代码零魔法数字）
js/pixel.js     点阵屏编址与图案（内场 50×31 平面网格，纯逻辑无 three 依赖）
js/wavefx.js    人浪光效数学（条纹/相遇/追逐/涟漪/螺旋/对撞，纯函数无 three 依赖）
js/lightshow.js 灯光秀 A 呼吸（全环 + 环带 + 光束，六段式曲线，纯函数无 three 依赖）
js/lightshowb.js 灯光秀 B 深蓝（舞台中央单光团，六段式曲线，纯函数无 three 依赖）
js/lightshowc.js 灯光秀 C 环流（环向/径向正弦通道，六段式曲线）
js/lightshowd.js 灯光秀 D 心跳（拍点包络 + 暖色，五段式曲线）
js/lightshowe.js 灯光秀 E 极光（双路慢波 + 折返，五段式曲线）
js/lightshowRegistry.js 灯光秀变体表（id/名称/描述/参数键/编舞函数/时长，单一真相）
js/holo.js     全息投影（自定义 ShaderMaterial：按身高扫描线 + 菲涅尔 + 显形扫描 + 位姿状态机）
js/standProfile.js  24 扇区看台坡面剖面（tools/measure_stands.mjs 生成，勿手改）
tools/measure_stands.mjs  看台剖面测量工具（只读 Arsenal.glb，可复现）
assets/         Arsenal.glb（2.4 MB）+ crowd_a/b.glb（人模 0.06/0.18 MB）
                + singer.glb + band/*.glb（6 件体素乐器，共 333 KB）
                + audio/*.m4a（歌单 4 首官方试听（共 3.9 MB）+ 自备完整曲 1 首（0.35 MB））
                + holo.glb（全息吉祥物模型，1.0 MB）
vendor/         three@0.169.0 本地副本（MIT）
```

### 子目录约定

```
tools/           正式工具链（20 个）
  measure_stands.mjs       看台剖面测量（生成 standProfile.js）
  export_sticks.mjs        点阵编址导出
  verify_wavefx.mjs        人浪 6 档离线断言（形状/方向/周期/边界 + 与 modes 表交叉校验）
  verify_lightshow_variants.mjs  灯光秀 5 变体同契约断言（全时段无 NaN / 字段齐全 / 互不相同）
  verify_lightshow_seam.mjs      灯光秀循环接缝断言（防 A/B 历史上 1.000→0.180 的突跳）
  verify_lightshowb.mjs    灯光秀 B 编舞断言（六段全覆盖 / 色温单调 / 观众暗态）
  verify_pixel_layout.mjs  点阵编址与图案断言
  verify_show_timeline.mjs 开场秀段表断言（段表/时长/互斥/烟花时刻/全息姿态序列）
  verify_holo.mjs          全息投影断言（姿态插值/着色器要点/状态机）
  verify_pixel_sway.mjs    点阵横摆幅度断言（≤2% 屏宽）
  fetch_audio.mjs          抓取歌单官方 30 秒试听到 assets/audio/（--check 只体检）
  verify_playlist.mjs      歌单契约与音频素材断言（id/文件/魔数/时长/文档一致）
  storyboard.mjs           分镜脚本（--write 生成 md+html / --check 校验 / --urls 打印地址）
  prompter-template.mjs    排镜台页面模板（被 storyboard.mjs 引用，不单独运行）
  pin_ref.mjs              把 index.html 里 CDN 的 REF 固定到某个提交（--check 只校验）
  pixel_*.py stick_bbox.py 点阵 ASCII 与统计
  _check_self.py           三角形级射线可见性检查（README 验收用）
  _penet_final.py          摆动全程穿模检查（README 验收用）
  verify_diff.py           逐像素差分
  face_test.html           面部材质试验页
  scratch/                 55 个一次性调试脚本存档（已 gitignore，见其 README）

preview/         验收截图（约 90 MB，整目录 gitignore），按主题分：
  stage/         sb*   舞台迭代 v2–v21（105 张）
  wave/          w*    开场秀与灯光风暴迭代（40 张）
  pixel/         v15+  点阵图案 / 潮汐（43 张）
  audience/      c* v2–v10  观众机位、人模、应援棒蟹钳（28 张）
  singer/        s* t* u*   歌手动作与运镜（16 张）
  lightshow-a/   ls_a*  灯光秀 A 六段定格（8 张）
  lightshow-b/   lsb*   灯光秀 B 六段定格 + 观众层（11 张）
  qa/            qa_*   分层验收（9 张）
  ui/ walk/ misc/       侧边栏、第一人称漫游、临时记录
  sequence/      8 帧建造序列 01_site → 08_all

sandbox/         建模试验场（band-lab 体素乐队实验室、stage-lab 舞台原型）
render/          5 张 1920×1080 最终交付图
```

### 观众系统 v2

- **看台应援棒（实体化）**：位置来自 `tools/measure_stands.mjs` 对 GLB 的「三角形×24
  扇区竖直剖切面」采样，三层（下层/俱乐部/上层）逐行贴合真实坡面、角部随碗体收窄。
  两种应援棒 InstancedMesh（共 ~6200 支）：**细圆柱发光棒**（约 70%，蓝白发光长管）
  与**蟹钳造型棒**（约 30%，按实拍重做：暗柄+装饰环、单体泪滴钳头带咬合缺口、
  通体**饱和天蓝**发光（实拍取色），宽面朝向舞台 ±57° 抖动），统一蓝白色系，
  发光呼吸动画；另有 **~700 片悬空蓝白小方片**（氛围光尘）缓慢起伏旋转。
  看台应援棒带**独立相位摇摆**（模拟真实观众晃动）。灯组开关联锁（关灯全暗）。
- **潮汐人浪（"潮汐"模式）**：看台+内场应援棒亮度与物理高度随"潮位"绕碗体环形传播
  （深海蓝→浪峰白渐变，2 个潮峰、约 5.5s 绕场一周），如海潮涌动，呼应海洋主题舞台
- **点阵显示屏（"点阵"模式）**：**仅内场观众参与**——站区内每支插棒都按「**50 列 × 31
  排**」的平面网格编址成一块 ~55.2×44.8 m 的巨型点阵屏（4 个站区块 7+8+8+8 排，区块间
  站立间距不计入像素高度）。网格格数 50×31 = 1550 与插棒数**严格 1:1**，每格恰好一支棒、
  无空洞，所以不需要「膨胀补稀」；图案边缘用 5×5 超采样覆盖率分两档过渡。
  图案在 `[-1,1]²` 方形设计空间里用方程/参数曲线绘制，再按**逐图案包围盒等比居中**映射
  到屏幕（❤ 心形用经典参数曲线保证顶部凹口够深 / ♪ 音符 / ☺ 笑脸 / ★ 星星 / BB 文字）。
  横向动效是**绕屏幕中心的有界往复摆动**（振幅 1 列 = 点阵屏自身宽度的 2%、约 1.1 m，
  周期 22s，在任何机位下都在居中判读范围内）——
  早期用的是 `shift = elapsed * scrollSpeed` 单向滚动，几十秒后图案会永久歪到一侧（看台
  视角看像"偏右"），且跨过 50 列边界会被回卷切断，现已改为摆动；点亮格 HDR 超亮（主体）、
  边缘过渡档 0.55、其余保留 0.16 底光
  （**不再压黑**，整片内场始终可见），instanceColor 直通自发光（onBeforeCompile 补丁）
  + HDR 超亮（>1 颜色值）保证远距离 Bloom 可见。**看台应援棒不再参与图案**，只保留
  呼吸摇摆与潮汐/波浪模式。
  编址与图案逻辑独立在 `js/pixel.js`，可用 `node tools/verify_pixel_layout.mjs` 离线校验
- **人浪光效（HUD 新分栏 🌊 人浪）**：观众光效拆成两组——👥观众管「星海 / 点阵屏 /
  内场图案」，🌊人浪管「常规 / 潮汐 / 条纹 / 相遇 / 追逐 / 涟漪 / 螺旋 / 对撞」八个动态光效
  （三档新光效的按钮排在第二行，`.seg` 已允许换行）。算法全部是
  `js/wavefx.js` 里的纯数学函数（不 import three，返回亮度标量，可 >1 走 HDR + Bloom），
  `stadium.js` 只负责把亮度写成 instanceColor 并给亮部加摇摆增幅（被点亮的观众抬得更高）：
  - **条纹**：绕场交替的明暗竖带整体缓慢漂移（`bands` 对带宽，带边 `soft` 软化）。
    内场只有 50 列，`bands=6`（每带约 4.1 列）才看得出是带；再细就糊成稀碎网格。
  - **相遇**：从舞台两翼各走半圈、沿碗体推进，在正对面（背台侧）合拢，随后全场满亮
    `hold` 秒并带一次衰减闪光。看台用「距舞台的归一化角距 s」，内场用「距最近一侧的
    归一化距离」——内场是矩形没有环，所以表现为左右两股向中线推进。
    前沿叠一条 HDR 亮边（`headGain`），推进用 `speedEase` 缓动（起步慢、临合拢加速）。
  - **追逐**：一颗亮头绕场单向跑、身后拖长尾递减——这是「人浪」的本体形态
    （观众依次站起、依次坐下），区别于潮汐的驻波。
  - **相遇 / 追逐是「灭灯型」光效**：`meet.dark = 0`、`chase.base = 0`，没被光效扫到的
    观众彻底熄灭（不是压暗），只剩推进亮区 / 亮头与长尾发光，对比最强。配套的两处细节：
    ① 暗区摇摆幅度压到 `0.10`（观众是坐着的，只有亮区才抬身）；
    ② 悬空小方片透明度乘 `0.30`，否则满场飘着的 700 片亮方块会把灭灯对比冲淡。
    相遇前沿向外用 2.5 倍 `headWidth` 的平方曲线回落到全黑，避免 2.1 的 HDR 亮边
    直接贴着纯黑出现一道像渲染接缝的硬边。追逐的尾巴末端用 `tailFloor` 抬到 6%，
    防止长尾最后一段突然掉进纯黑、看起来像被切断。
  - **涟漪**：以舞台为中心的**同心环**从内场向外扩散（看台用「距舞台的归一化角距 s」，
    内场用「距最近一侧的归一化距离」），环峰位置 `s = (k+0.5+t*speed)/rings`，往外
    按 `1-falloff*s` 逐环衰减——内圈亮、外圈淡，像水波推上碗体。与「相遇」的区别：
    相遇是**单向推进的一次性事件**（推完 hold 满场亮），涟漪是**持续驻波**（环不停往外走）。
    非灭灯型（`dark=false`），暗处仍有底光，观感偏柔。
  - **螺旋**：`phase = wrap01(u*turns + s*twist - t*speed)`，环向与径向**不绕 0 叠加**，
    于是同相位等值线在 (u,s) 平面里是一条斜带，绕场看就是**几支旋臂在转**（`turns=2`
    即臂数）。`sharp` 控制臂的粗细（越大越细）。判旋转方向必须**只在 `[0,1/turns)`
    这一个臂的窗口里找峰**，否则 argmax 会在多个臂之间乱跳。
  - **对撞**：两个亮头从 `u=0` 与 `u=0.5` 反向出发，在 `u=0.25` / `u=0.75` 处**交错对撞**
    （`ph=0.25`，不是 0.5——两头各走 1/4 圈就相遇），交错瞬间叠 `flashGain` 闪光。
    灭灯型（`dark=true`），只剩两个亮头，是六档里对比最强的。
  亮度区间由 `fxRange()` 统一给出（含 meet 的前沿/满亮峰值、duet 的双头叠加峰值，
  避免归一化溢出把暗部压到 0）。
  参数集中在 `js/data.js` 的 `concert.waveFx`，`timeScale` 一处改全局快慢；
  可用光效清单本身也是一处真相——`concert.waveFx.modes`（id / 中文名 / 是否灭灯型），
  HUD 按钮、`updateAudience` 的分派表、离线断言都从它派生，新增一档只加一条。
  可用 `node tools/verify_wavefx.mjs` 跑离线断言（形状/方向/周期/边界，六档全覆盖），
  浏览器验收用 `?fxdump=stripe|meet|chase|ripple|spiral|duet` 把看台 48 桶 / 内场 50 桶的平均亮度剖面
  打到 `#loading-error`（直接读真实 instanceColor，不依赖截图采样）。
- **应援棒的自发光补丁（glowPatch，两处坑都要绕）**：应援棒的发光材质靠
  `onBeforeCompile` 把 `vec3 totalEmissiveRadiance = emissive;` 改成乘 `vColor`，
  这样 `setColorAt` 写的 instanceColor 才能真正决定亮度。这里踩过两次坑：
  ① **无条件替换会编译失败**——`normal` 档从不写实例色，`instanceColor` 还是 `null`，
  three 就不会定义 `vColor`，片段着色器报 `'vColor' : undeclared identifier`，
  整块发光材质静默失效（只进 console，不写 `#loading-error`）。
  ② **`#ifdef USE_INSTANCING_COLOR` 在片段着色器里恒为假**——three 只在**顶点**前缀里
  定义 `USE_INSTANCING_COLOR`，片段前缀给的是 `USE_COLOR`（`color_pars_fragment` 用
  `#if defined(USE_COLOR_ALPHA) ... #elif defined(USE_COLOR) varying vec3 vColor;`）。
  所以补丁必须按 `USE_COLOR_ALPHA / USE_COLOR / else` 三分支写，不能用
  `USE_INSTANCING_COLOR`——否则编译通过但颜色被整个丢掉，**点阵/潮汐/人浪/灯光秀的
  看台层全部静默失效**，而默认 `normal` 档完全看不出来。
  改完用 `gl.getShaderSource(program.fragmentShader)` 复查片段里出现
  `emissive * vColor` 才算生效。
- **观众机位（新增）**：内场前排 / 北看台中排 / 东看台 / 西看台 / 南看台·舞台后——
  坐席眼高的固定机位，每组独立切换
- **歌手运镜（新增）**：歌手特写 / 侧写 / 歌手背后·星海 / **歌手环绕运镜**（自动绕
  主唱环绕，拖拽即暂停）
- **主唱歌手**：Q 版歌手（41 骨骼 + 6 动画，`assets/singer.glb`）站在舞台上，默认
  循环 dance_01；HUD「歌手」分组可切换 6 段动作（dance/cheer/clap/greet/agree/bow，
  0.35s 交叉淡入）；开场秀联动——`wake` 打招呼 → `ringA` 跳舞 → `heartbeat` 拍手 → `ripple`/`spiral`
  跳舞 → `heart`/`finale` 欢呼 → `outro` 鞠躬谢幕 → 结束还原（动作逐段写在 `DATA.show.segments[].singer`）；
  专属追光 + 近距补光保证夜景可读。QA：`?singerClip=名&singerT=秒` 定格任意动作。
- **内场人模**：两个低模（各 ~730 三角）`InstancedMesh` 实例化共 ~1280 人（≈93 万
  三角、2 draw call），站区内**整齐网格排列**（行距 1.4m / 列距 1.1m，微抖动保持
  自然），**全部面向舞台**（随机 ±15°），随机身高 ±4%/明度变化，站区填满（旧延伸台
  已移除），脚底贴合站区块；**每人右手侧或正前方随机插一支应援棒**（圆柱/蟹钳 7:3，与看台
  同资产同灯光联动），带轻微呼吸晃动。
- 「观众星海」开关同时控制两者；`?layers=` 支持 `crowd` 分层显隐。

### 伴奏乐队（舞台两侧）

- **6 件体素乐器**：架子鼓 / 电吉他 / 贝斯 / 键盘 / 两只音箱，来自 `sandbox/band-lab/`
  的体素建模成果，导出为独立 GLB 放在 `assets/band/`，运行时逐件加载（单件失败只跳过
  它自己，不拖垮主场景）。
- **摆位**：左右各一组，整体横向 ±18 m（不侵入两侧海浪雕塑），全部落在台面内
  （x∈[-62.4,-2.4]、z∈[92,116]），乐器底面贴合台面 y=7.32，单件带 ±10~18° 朝向偏转。
- **材质适配**：band-lab 用高金属度（银/铜件 metalness 0.55~0.85），而主项目**没有环境
  贴图**，直接搬进来会渲染成纯黑——所以合入时统一压 `metalness ≤ 0.25`、抬
  `roughness ≥ 0.35`、近白材质乘 0.55，并给一点冷蓝自发光（0x2a3550 @ 0.14）打底。
- **补光**：乐器只有 1~2.2 m 高，场馆顶灯照度吃不到，暗场里会比台面还暗。用**观众侧
  接近水平的窄锥 SpotLight**（左右各一盏，光轴几乎平行台面、只擦过台面）照亮乐器立面；
  实测台面中心亮度仅 57→61（几乎不变），而乐器立面 p50 提升到 118~133。**不能用正上方
  点光**——台面是 60×24 m 的大水平面，顶光会把它整片照亮（实测 46→143），乐队反被压掉。
- 补光随全场 `dimmer` / 灯组开关联动缩放，但**留 0.35 底限**：开场秀倒计时把 dimmer 压到
  0.2 并关灯组时，乐队不能跟着全黑（那会显得舞台"缺了一块"）。
- **4 位乐手**：鼓手 / 吉他手 / 键盘手 / 贝斯手，复用内场人模 `assets/crowd_a.glb` /
  `crowd_b.glb`（不新增资源），每人站在自己乐器的**演奏位**（贴着乐器后沿，横向微调到
  琴体留空一侧）。人模 GLB 原点在身体中部（min.y ≈ −0.494），所以先按缩放后包围盒把
  **脚底落到台面**，再按 yaw 88°~92° 转向观众。材质**必须 clone**——直接改共享材质会连
  内场 1550 个人模一起变暗。
- **摆位的三条互斥约束**（全部用 `tools/_check_self.py` 的三角形级射线实测）：
  ① 不能正对乐器正后方 —— 乐器比人还高（鼓 2.10 m / 贝斯 2.18 m / 吉他 1.88 m），正后方会
  连头一起挡住；② 也不能离太远 —— 那就成了「乐器旁边站了个人」，没有演奏感；③ 要「贴着
  乐器、乐器挡住下半身」才像在操作它。最终解：**头部在 7 个主用机位 100% 可见**，同时自家
  乐器挡住人体 23%（吉他/贝斯/键盘）~60%（鼓手，鼓组 3.37 m 很宽）。
- **演奏姿态**：静态上身前倾 `lean` 9°~10°（绕**脚底**支点的局部 Z 轴，朝观众压下去），
  再叠加 `performerLeanAmp` 0.05 rad 的呼吸摆动 + 各自不同频率的绕 Y 微转与上下微浮
  （`performers[].sway`），四人不同步才像各弹各的。前倾**会让最低点比台面低约 8 cm**，
  所以建组后用世界包围盒回补一次，四个乐手 y 下限都精确等于 7.32（身高 1.80~1.82 m）。
  前倾角有上限：吉他/贝斯 1.88/2.18 m 高，前倾后头顶前探，超过 10° 会顶进琴身
  （`tools/_penet_final.py` 做过摆动全程的穿模检查）。
- `?nopperf=1` 可隐藏全部乐手，用于差分验收。
- `?layers=` 支持 `band` 分层显隐；`window.__app.band` 可取到该组。


关键实测参数（详见 `js/data.js`，Blender headless 从 GLB 实测）：
草坪 105×68 m（长轴 three.z，中心 (-32.4, 49.2)）、碗体 ≈203×246 m、
屋盖外缘 ≈215×262 m / 内开口 ≈120×160 m / 下弦 y≈43.4、8 个三脚桅架位置、
看台楼层带 y ≈ 4.4 / 15.7 / 21.7 / 31.9 / 35.4 / 48。

## 与范式的偏离（经确认）

范式要求“零素材、几何全程序化”；本项目按用户选择**直接加载 Arsenal.glb**，
改造在运行时完成（删球门、删航拍照片地面与校园围墙、换程序化地面）。
演唱会设备（舞台/桁架/音响塔/灯光/观众）仍全部参数方程生成；
分步施工、固定机位截图验收、参数先行、灯光解耦、星海统一色相等方法论照旧。

## 版权

- 代码：MIT
- `assets/Arsenal.glb`：模型版权归原建模方/俱乐部所有，仅在 `data.js` 中读出参数并在运行时加载展示，**不在 MIT 许可范围内**
- `assets/audio/*.m4a`：Apple iTunes 提供的 30 秒官方试听片段，词曲版权与录音版权归原权利人，
  仅作本地演示用，**不在 MIT 许可范围内**；抓取脚本见 `tools/fetch_audio.mjs`
- 《体育场建模复现范式》文档：归原作者所有，不在本仓库许可范围内
