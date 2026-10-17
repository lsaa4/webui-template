/**
 * chipiotto 个人网站后端
 * 零依赖：Node 内置 http + node:sqlite + net (SLP/RCON)
 * 运行: node server.js   (端口 8080)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { exec } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
// MC 服务器：已从本机迁到游戏笔记本（局域网 192.168.2.107:43906，RCON 43907）
const MC_HOST = '192.168.2.107';
const MC_PORT = 43906;
const RCON_PORT = 43907;
const RCON_PASS = 'rcon2026chipiotto';
// 笔记本侧资源数据：由小主机 WSL 采集器定时写入（/root/mc-collect.sh）
const MC_REMOTE_JSON = path.join(__dirname, 'mc_remote.json');
const BANNER_DAYS = 797; // 网站运行天数起始值
const VISITS_OFFSET = 28990; // 累计访问显示偏移（真实计数 91 + 28990 = 29081）

/* ---------- SQLite ---------- */
const db = new DatabaseSync(path.join(ROOT, 'data.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    ip TEXT
  );
  CREATE TABLE IF NOT EXISTS mc_history (
    ts INTEGER PRIMARY KEY,
    online INTEGER,
    players INTEGER,
    mem REAL,
    cpu REAL,
    tps_over REAL
  );
`);
// 老表补列（幂等）
try { db.exec(`ALTER TABLE mc_history ADD COLUMN mem REAL`); } catch {}
try { db.exec(`ALTER TABLE mc_history ADD COLUMN cpu REAL`); } catch {}
try { db.exec(`ALTER TABLE mc_history ADD COLUMN tps_over REAL`); } catch {}
// 运行天数起点：首次启动 = 现在 - 797 天
let row = db.prepare(`SELECT value FROM meta WHERE key='start_ts'`).get();
let startTs = row ? Number(row.value) : 0;
if (!startTs) {
  startTs = Date.now() - BANNER_DAYS * 86400000;
  db.prepare(`INSERT OR REPLACE INTO meta VALUES('start_ts', ?)`).run(String(startTs));
}
function daysRun() {
  return Math.max(0, Math.floor((Date.now() - startTs) / 86400000));
}

/* ---------- SLP：Minecraft Server List Ping ---------- */
function varInt(n) {
  const b = [];
  while (true) {
    if ((n & ~0x7F) === 0) { b.push(n); return b; }
    b.push((n & 0x7F) | 0x80); n >>>= 7;
  }
}
function readVarInt(buf, off) {
  let val = 0, shift = 0;
  while (true) {
    const b = buf[off++];
    val |= (b & 0x7F) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return { val, off };
}
function pingSLP(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const sock = net.connect(port, host);
    const t = setTimeout(() => { sock.destroy(); resolve(null); }, timeout);
    sock.on('connect', () => {
      const proto = [0x00, ...varInt(765), ...varInt(host.length), ...Buffer.from(host), port >> 8 & 0xFF, port & 0xFF, 0x01];
      const handshake = Buffer.from([proto.length, ...proto]);
      sock.write(handshake);
      sock.write(Buffer.from([0x01, 0x00]));
    });
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      try {
        const len = readVarInt(buf, 0);       // 包长
        const pid = readVarInt(buf, len.off); // packetId = 0
        const jl = readVarInt(buf, pid.off);  // json 长度
        if (buf.length >= jl.off + jl.val) {
          clearTimeout(t);
          resolve(JSON.parse(buf.subarray(jl.off, jl.off + jl.val).toString('utf8')));
          sock.destroy();
        }
      } catch { /* 缓冲未完整，等待更多数据 */ }
    });
    sock.on('error', () => { clearTimeout(t); resolve(null); });
  });
}

/* ---------- RCON ---------- */
function rcon(host, port, pass, cmd, timeout = 3000) {
  return new Promise((resolve) => {
    const sock = net.connect(port, host);
    const t = setTimeout(() => { sock.destroy(); resolve(null); }, timeout);
    const out = [];
    let authed = false;
    sock.on('connect', () => {
      const body = Buffer.from(pass, 'utf8');
      // RCON 包: [id][type][body]\0\0
      const pkt = Buffer.concat([Buffer.from([1, 0, 0, 0]), Buffer.from([3, 0, 0, 0]), body, Buffer.from([0, 0])]);
      sock.write(Buffer.concat([Buffer.from([pkt.length, 0, 0, 0]), pkt]));
    });
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 14) {
        const len = buf.readInt32LE(0);
        if (buf.length < len + 4) break;
        const id = buf.readInt32LE(4);
        const type = buf.readInt32LE(8);
        const body = buf.subarray(12, len + 2).toString('utf8').replace(/\u0000/g, '');
        buf = buf.subarray(len + 4);
        if (type === 2 && id === 1) authed = true;
        if (type === 0 && id === 2) out.push(body);
        if (authed && !cmdSent) { cmdSent = true; sendCmd(); }
      }
      if (out.length) { clearTimeout(t); sock.destroy(); resolve(out.join('\n')); }
    });
    let cmdSent = false;
    function sendCmd() {
      const body = Buffer.from(cmd, 'utf8');
      const pkt = Buffer.concat([Buffer.from([2, 0, 0, 0]), Buffer.from([2, 0, 0, 0]), body, Buffer.from([0, 0])]);
      sock.write(Buffer.concat([Buffer.from([pkt.length, 0, 0, 0]), pkt]));
    }
    sock.on('error', () => { clearTimeout(t); resolve(null); });
  });
}

/* ---------- Java 进程内存 / CPU ---------- */
// 注意：WSL 下 exec 走 /bin/sh，命令里不能出现会被 shell 展开的 $_
function javaMem() {
  return new Promise((resolve) => {
    exec('powershell.exe -NoProfile -Command "(Get-Process java -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum/1MB"', { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const n = parseFloat(stdout.trim());
      resolve(isFinite(n) && n > 0 ? Math.round(n) : null); // MB
    });
  });
}

// CPU：两次采样 CPU 秒数差值 / 间隔 / 逻辑核数 = 使用率
let cpuSample = null;
function javaCpu() {
  return new Promise((resolve) => {
    exec('powershell.exe -NoProfile -Command "(Get-Process java -ErrorAction SilentlyContinue | Measure-Object CPU -Sum).Sum"', { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const sec = parseFloat(stdout.trim());
      const now = Date.now();
      if (!isFinite(sec) || sec <= 0) return resolve(null);
      if (!cpuSample) { cpuSample = { sec, ts: now }; return resolve(null); }
      const dt = (now - cpuSample.ts) / 1000;
      const oldSec = cpuSample.sec;
      cpuSample = { sec, ts: now };
      if (dt <= 0.5) return resolve(null);
      const cores = Math.max(1, os.cpus().length);
      const pct = Math.max(0, (sec - oldSec) / dt / cores * 100);
      resolve(Math.round(pct * 10) / 10); // %
    });
  });
}

/* ---------- MC 服务器配置（读文件，缓存） ---------- */
let mcConfigCache = null;
let mcConfigTs = 0;
// 兼容两种运行环境：WSL (node) 用 /mnt/c，Windows (node) 用 C:\
// ⚠️ MC 已迁到笔记本，这里只作为「采集器不可用」时的兜底（读的是旧的本地目录）
const MC_DIR = fs.existsSync('/mnt/c/MC server/server')
  ? '/mnt/c/MC server/server'
  : 'C:\\MC server\\server';

// 读取 WSL 采集器写入的笔记本侧数据（3 分钟无更新视为过期）
function remoteMc() {
  try {
    const st = fs.statSync(MC_REMOTE_JSON);
    if (Date.now() - st.mtimeMs > 180000) return null;
    return JSON.parse(fs.readFileSync(MC_REMOTE_JSON, 'utf8'));
  } catch { return null; }
}

const DIFF_CN = { hard: '困难', normal: '普通', easy: '简单', peaceful: '和平' };

function mcConfig() {
  // 1) 优先用笔记本采集器推来的真实配置
  const r = remoteMc();
  if (r && r.config) {
    if (mcConfigCache && mcConfigTs && Date.now() - mcConfigTs < 30000) return mcConfigCache;
    const c = r.config;
    mcConfigCache = {
      port: c.port != null ? String(c.port) : String(MC_PORT),
      maxPlayers: c.maxPlayers != null ? String(c.maxPlayers) : '20',
      onlineMode: (c.onlineMode === true || c.onlineMode === 'true') ? '正版' : '离线',
      difficulty: DIFF_CN[c.difficulty] || c.difficulty || '?',
      levelName: c.levelName || '?',
      mods: c.mods != null ? c.mods : 0,
      version: r.version || '?',
    };
    mcConfigTs = Date.now();
    return mcConfigCache;
  }
  // 2) 兜底：旧的本地目录
  if (mcConfigCache) return mcConfigCache;
  const p = MC_DIR + '\\server.properties';
  const cfg = { port: MC_PORT, maxPlayers: '20', onlineMode: '?', difficulty: '?', levelName: '?', mods: 0, version: '?' };
  try {
    const txt = fs.readFileSync(p, 'utf8');
    txt.split('\n').forEach((l) => {
      const i = l.indexOf('=');
      if (i < 0) return;
      const k = l.slice(0, i).trim(), v = l.slice(i + 1).trim();
      if (k === 'server-port') cfg.port = v;
      if (k === 'max-players') cfg.maxPlayers = v;
      if (k === 'online-mode') cfg.onlineMode = v === 'true' ? '正版' : '离线';
      if (k === 'difficulty') cfg.difficulty = DIFF_CN[v] || v;
      if (k === 'level-name') cfg.levelName = v;
    });
  } catch {}
  try {
    const modsDir = MC_DIR + '\\mods';
    cfg.mods = fs.readdirSync(modsDir).filter((f) => f.endsWith('.jar')).length;
  } catch {}
  mcConfigCache = cfg;
  return cfg;
}

/* ---------- MC 状态聚合 ---------- */
async function mcStatus() {
  // 笔记本采集器可用时，跳过本机 PowerShell 采样（省开销）
  const rem = remoteMc();
  const [slp, memLocal, cpuLocal] = await Promise.all([
    pingSLP(MC_HOST, MC_PORT),
    rem && rem.memMB != null ? Promise.resolve(null) : javaMem(),
    rem && rem.cpuPct != null ? Promise.resolve(null) : javaCpu(),
  ]);
  const mem = rem && rem.memMB != null ? rem.memMB : memLocal;
  const cpu = rem && rem.cpuPct != null ? rem.cpuPct : cpuLocal;
  let tps = null, tpsOver = null;
  if (slp) {
    const raw = await rcon(MC_HOST, RCON_PORT, RCON_PASS, 'forge tps');
    if (raw) {
      tps = [];
      raw.split('\n').forEach((l) => {
        const m = l.match(/^Dim\s+(.+?)(?:\(.*\))?:\s*Mean tick time:\s*[\d.]+\s*ms\.\s*Mean TPS:\s*([\d.]+)/);
        if (m) tps.push({ dim: m[1].trim().replace(/\s+\(.*\)$/, ''), tps: parseFloat(m[2]) });
      });
      const ov = tps.find((t) => t.dim === 'minecraft:overworld');
      tpsOver = ov ? ov.tps : (tps[0] ? tps[0].tps : null);
    }
  }
  const online = slp ? (slp.players?.online || 0) : 0;
  db.prepare(`INSERT INTO mc_history(ts, online, players, mem, cpu, tps_over) VALUES(?,?,?,?,?,?)`)
    .run(Date.now(), online > 0 || !!slp ? 1 : 0, online, mem, cpu, tpsOver);
  // 只留最近 1 天（5s 一条 ≈ 17280 行，足够画图）
  db.prepare(`DELETE FROM mc_history WHERE ts < ?`).run(Date.now() - 86400000);
  return {
    online: !!slp,
    host: MC_HOST,
    port: MC_PORT,
    players: slp?.players?.online ?? 0,
    maxPlayers: slp?.players?.max ?? mcConfig().maxPlayers,
    playerList: slp?.players?.sample?.map((p) => p.name) ?? [],
    version: slp?.version?.name ?? null,
    motd: slp?.description?.text ?? slp?.description ?? null,
    latency: null, // 简化
    tps,
    memMB: mem,
    cpuPct: cpu,
    config: { ...mcConfig(), version: slp?.version?.name ?? mcConfig().version },
    ts: Date.now(),
  };
}

/* ---------- MC 历史（画曲线用） ---------- */
function mcHistory(seconds = 600) {
  const rows = db.prepare(`SELECT ts, mem, cpu, tps_over FROM mc_history WHERE ts >= ? ORDER BY ts ASC`)
    .all(Date.now() - seconds * 1000);
  return rows.map((r) => ({ ts: r.ts, mem: r.mem, cpu: r.cpu, tps: r.tps_over }));
}

/* ---------- GitHub repos（代理 + 缓存） ---------- */
let reposCache = null, reposTs = 0;
async function githubRepos() {
  if (reposCache && Date.now() - reposTs < 5 * 60000) return reposCache;
  try {
    const r = await fetch('https://api.github.com/users/lsaa4/repos?sort=updated&per_page=100');
    if (!r.ok) return reposCache || [];
    const list = await r.json();
    reposCache = list.map((x) => ({
      name: x.name, desc: x.description || '', stars: x.stargazers_count,
      lang: x.language, url: x.html_url, updated: x.updated_at,
    }));
    reposTs = Date.now();
    return reposCache;
  } catch { return reposCache || []; }
}

/* ---------- HTTP ---------- */
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // API
  if (p === '/api/site') {
    const visits = db.prepare(`SELECT COUNT(*) c FROM visits`).get().c;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ days: daysRun(), startTs, visits: visits + VISITS_OFFSET, bannerDays: BANNER_DAYS }));
  }
  if (p === '/api/mc/status') {
    const s = await mcStatus();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(s));
  }
  if (p === '/api/mc/history') {
    const sec = Math.min(3600, Math.max(60, parseInt(url.searchParams.get('seconds') || '600', 10)));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(mcHistory(sec)));
  }
  if (p === '/api/github/repos') {
    const repos = await githubRepos();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(repos));
  }

  // 访问计数（页面）
  if (p === '/') db.prepare(`INSERT INTO visits(ts, ip) VALUES(?,?)`).run(Date.now(), req.socket.remoteAddress || '');

  // 静态文件
  let file = path.join(PUBLIC, p === '/' ? 'index.html' : p);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`[chipiotto] http://localhost:${PORT} 运行天数: ${daysRun()} 天`));
