# chipiotto.top

个人主页 + 小主机状态面板（Node 原生实现，零第三方依赖）。

## 运行

需要 Node.js 22+（用到内置 `node:sqlite`）。

```bash
node server.js          # 默认监听 8080
```

Windows 也可直接双击 `start.bat` / `stop.bat`。

## 结构

```
server.js                 静态服务 + 状态 API + SQLite
public/index.html         单页站点（首屏 / 关于 / 作品 / 图集）
public/css/style.css      全部样式（毛玻璃 + 大字号排版）
public/js/main.js         灯箱、滚动动效、主题切换
public/img/               图片素材，art/ 下是立绘与插画
public/fonts/             自托管字体
README-改版说明.md          改版记录与素材映射表
index.local-test.html     早期 frp 隧道测试页，未对外使用
```

## 说明

- `data.db`、`server.log`、`mc_remote.json` 是运行时产物，已在 .gitignore 中排除。
- 图片走本地自托管，无外链依赖。
