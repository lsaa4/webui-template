# chipiotto.top 个人站 · NEONOVA 风格改版说明

改版日期：2026-10-17
旧版备份：`C:\Users\kkmi\Desktop\08_归档备份\chipiotto_旧版_20261017_1348\`

---

## 一、这次改了什么

原来的站是 Vue 3 运行时（`vue.global.prod.js`）+ 三个 JS 文件拼起来的，视觉上偏常规卡片排版。
现在换成 **零依赖纯静态**：一个 HTML、一个 CSS、一个原生 JS，视觉语言取自 ultralmtm（NEONOVA 风格）——
描边大标题、巨型跑马灯、超大留白、黑色反差区块、mono 小字标注、方角细节。

不改的地方：**`server.js` 一行未动**，`/api/site`、`/api/github/repos`、`/api/mc/status` 三个接口原样复用。

带来的好处：

- 首屏不再依赖 100KB+ 的 Vue 运行时，JS 总量约 11KB
- 无构建链，改完文件刷新即生效
- 关掉 JS 也能看到完整内容（`.js` 类门控，未执行 JS 时所有元素默认可见）

---

## 二、文件结构

```
C:\web\
  server.js                 未改动（Node 原生 http，端口 8080）
  public\
    index.html              ★ 重写（531 行）
    css\style.css           ★ 重写（单文件自包含，约 36KB，1429 行）
    js\main.js              ★ 重写（原生 JS，约 11.5KB）
    fonts\                  JetBrains Mono（自托管，沿用旧文件）
    img\art\                8 张作品图（由桌面「图片」文件夹压缩而来）
    img\favicon.svg         ★ 新增
```

已清理：`public/js/app.js`、`public/js/site.js`、`public/js/vue.global.prod.js`（均不再被引用；
旧版备份里仍存有原件）。

---

## 三、图片素材映射（原图 → `public/img/art/`）

| 文件 | 用在哪 |
| --- | --- |
| `choco-hero.jpg` | 首屏主图（C 位，1086×1448 竖构图，object-position 52% 18%）|
| `choco-portrait.jpg` | 关于区「巧克力」卡头像（1254² 方形）|
| `choco-full.jpg` | 图集首图（跨 2 列，object-position 50% 8% 保脸）|
| `chocolate.jpg` | 旧版形象图，已不在页面引用（保留备份）|
| `sakura.jpg` | 图集 · 樱花银发 |
| `miku-garden.jpg` | 图集 · 花房蝴蝶 |
| `blade.jpg` | 图集 · 刀与逆光（跨行）|
| `miku-summer.jpg` | 图集 · 夏日水花（跨行）|
| `moonlight.jpg` | 图集 · 月下女仆 |
| `miku-hai.jpg` | 图集 · 睡衣早安 |
| `miku-teal.jpg` | 图集 · 青色侧脸 |

统一压到长边 1400px、质量 82 的 JPEG，最大单张约 300KB 以内。

---

## 四、页面板块

1. **Hero** — 左文右图，中文主标「把想法，做成真的」，右缘 01~05 章节索引，左缘竖排站点标签
2. **跑马灯** — `MINULL ✳ STUDENT DEVELOPER ✳ CHIPIOTTO.TOP` 无缝滚动
3. **关于** — 两张卡：Minull（学生 / 项目数 / GitHub / X）+ 巧克力（AI 助理，介绍自己的能力）
4. **日志** — 左栏 sticky「最近在做」，右栏 4 条时间线条目
5. **作品** — 4 张卡，前 3 张由 `/api/github/repos` 实时覆盖，第 4 张是本站
6. **图集** — 8 图不等格（含跨列/跨行），点击开灯箱
7. **服务器** — 黑卡显示 MC 在线状态（每 5 秒轮询 `/api/mc/status`）+ BlueMap 占位
8. **页脚** — 巨型 MINULL + 4 列链接

---

## 五、启动与停止

站点当前已在跑（`http://127.0.0.1:8080` 返回 200）。

```cmd
:: 启动（后台最小化窗口）
cmd.exe /c start "" /min cmd /c "cd /d C:\web && node server.js"

:: 局域网访问
http://192.168.1.245:8080
```

⚠️ **不要用 `taskkill /IM node.exe`**：会连带杀掉 5173 端口的 Lantern 服务。
只停本站就按 PID 杀，或者关掉那个最小化的 cmd 窗口。

---

## 六、改样式时的两个注意点

1. **缓存参数**：改 `style.css` 或 `main.js` 后，记得把 `index.html` 里的
   `?v=4` 递增成 `?v=5`，否则浏览器可能读旧缓存。
2. **描边标题**：`.hero__title-outline` / `.sec__title-outline` 用的是
   `-webkit-text-fill-color: #fff` + 四向 `text-shadow`（`calc(0.012em + 0.5px)`），
   `letter-spacing` 必须是 `0`，否则相邻字的描边会互相压住、糊成一团。

---

## 七、已验证 / 已知限制

已验证（Edge 无头 1600px + 同源 iframe 390px + 真实浏览器交互）：

- 390px 无横向溢出（只有主图 4px 设计性出血、跑马灯轨道由父级裁切）
- 全屏菜单：开合、Esc、焦点锁、背景滚动锁定、关闭后焦点回到按钮
- 图集灯箱：8 张、左右方向键、循环、点背景/Esc 关闭、关闭后焦点回到触发缩略图
- 三个 API 均 200，图片 11/11 加载成功，无 4xx 资源
- 无 JS 时内容完整可见；`prefers-reduced-motion` 下动画全部关闭

已知限制：

- BlueMap (`/map/`) 依赖 MC 服务器在线，离线时显示占位说明（当前就是离线状态）
- **你这台机器的系统设置开了「减少动态效果」**，浏览器会据此关掉跑马灯与揭示动画。
  想看完整动效：Windows 设置 → 辅助功能 → 视觉效果 → 打开「动画效果」。
