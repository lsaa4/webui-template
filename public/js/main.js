/* ============================================================
   MINULL — main.js
   1) 页头行为  2) 全屏菜单（含焦点管理）  3) 滚动揭示
   4) 作品 / 服务器状态数据  5) 图集灯箱
   ============================================================ */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ==========================================================
     1. 页头：滚动时描边 + 下滑隐藏、上滑出现
     ========================================================== */
  var header = $("#header");
  var lastY = window.scrollY;

  function onScroll() {
    var y = window.scrollY;
    header.classList.toggle("is-scrolled", y > 8);

    if (!document.body.classList.contains("is-menu-open")) {
      if (y > lastY && y > 320) header.classList.add("is-hidden");
      else header.classList.remove("is-hidden");
    }
    lastY = y;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ==========================================================
     2. 全屏菜单
     ========================================================== */
  var menu = $("#site-menu");
  var menuBtn = $("#menuBtn");
  var menuLabel = $("#menuLabel");
  var lastFocus = null;

  function menuIsOpen() { return menu.classList.contains("is-open"); }

  function openMenu() {
    lastFocus = document.activeElement;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    menuBtn.setAttribute("aria-expanded", "true");
    menuLabel.textContent = "CLOSE";
    document.body.classList.add("is-locked", "is-menu-open");

    // 页头必须留在最上层，否则会被菜单盖住
    header.style.zIndex = "100";
    var first = $(".p-menu__link", menu);
    if (first) first.focus({ preventScroll: true });
  }

  function closeMenu(restore) {
    if (!menuIsOpen()) return;
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    menuBtn.setAttribute("aria-expanded", "false");
    menuLabel.textContent = "MENU";
    document.body.classList.remove("is-locked", "is-menu-open");
    if (restore !== false && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  menuBtn.addEventListener("click", function () {
    if (menuIsOpen()) closeMenu();
    else openMenu();
  });

  $$(".p-menu__link, .p-menu__foot a", menu).forEach(function (a) {
    a.addEventListener("click", function () { closeMenu(false); });
  });

  // Esc 关闭 + Tab 焦点锁在菜单内
  document.addEventListener("keydown", function (e) {
    if (!menuIsOpen()) return;
    if (e.key === "Escape") { e.preventDefault(); closeMenu(); return; }
    if (e.key !== "Tab") return;

    var f = $$('a[href], button:not([disabled])', menu).filter(function (el) {
      return el.offsetParent !== null;
    });
    if (!f.length) return;
    var first = f[0];
    var last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ==========================================================
     3. 滚动揭示
     ========================================================== */
  var io = null;
  if ("IntersectionObserver" in window && !reduceMotion) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-inview");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -8% 0px" });
  }

  function scanReveal() {
    var els = $$("[data-inview]:not(.is-inview)");
    if (!io) { els.forEach(function (el) { el.classList.add("is-inview"); }); return; }
    els.forEach(function (el) { io.observe(el); });
  }

  /* ==========================================================
     4. 数据
     ========================================================== */
  function text(el, v) { if (el) el.textContent = v; }

  /* ---- 4.1 站点计数 ---- */
  function loadSite() {
    fetch("/api/site", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        text($("#heroVisits"), Number(d.visits || 0).toLocaleString("en-US"));
        text($("#footVisits"), Number(d.visits || 0).toLocaleString("en-US"));
        text($("#footDays"), d.days != null ? d.days : "—");
      })
      .catch(function () {});
  }

  /* ---- 4.2 GitHub 仓库 ---- */
  var grid = $("#repoGrid");
  var siteCard = $(".work--site", grid);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shortDate(d) { return d ? String(d).slice(0, 10) : "—"; }

  function renderRepos(list) {
    if (!Array.isArray(list) || !list.length) return;
    var items = list.slice(0, 3);
    var html = items.map(function (r) {
      return '<a class="work" href="' + esc(r.url) + '" target="_blank" rel="noopener">' +
        '<span class="work__top"><span class="work__lang">' + esc(r.lang || "CODE") + '</span>' +
        '<span class="work__stars">★ ' + Number(r.stars || 0) + '</span></span>' +
        '<h3 class="work__name">' + esc(r.name) + '</h3>' +
        '<p class="work__desc">' + esc(r.desc || "暂无简介") + '</p>' +
        '<span class="work__foot"><span class="work__date">' + esc(shortDate(r.updated)) + '</span>' +
        '<svg class="work__arrow" aria-hidden="true"><use href="#i-arrow"/></svg></span></a>';
    }).join("");

    grid.innerHTML = html;
    if (siteCard) grid.appendChild(siteCard);
  }

  function loadRepos() {
    fetch("/api/github/repos", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) renderRepos(d); })
      .catch(function () {});
  }

  /* ---- 4.3 MC 服务器状态 ---- */
  var mapFrame = $("#mapFrame");
  var mapOff = $("#mapOff");
  var mapLoaded = false;

  function fmtMem(mb) {
    if (mb == null || isNaN(mb)) return "—";
    return mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : Math.round(mb) + " MB";
  }

  function renderMc(s) {
    if (!s) return;

    var state = $("#mcState");
    var on = !!s.online;
    state.setAttribute("data-on", on ? "1" : "0");
    text($("#mcStateText"), on ? "在线" : "离线");
    text($("#mcHost"), (s.host || "") + ":" + (s.port || ""));

    text($("#mcPlayers"), on ? (s.players || 0) : "0");
    text($("#mcMax"), s.maxPlayers || "—");

    var names = $("#mcNames");
    names.innerHTML = "";
    if (on && s.playerList && s.playerList.length) {
      s.playerList.forEach(function (n) {
        var li = document.createElement("li");
        li.textContent = n;
        names.appendChild(li);
      });
    } else if (on) {
      var li = document.createElement("li");
      li.textContent = "当前无人在线";
      names.appendChild(li);
    }

    var tps = null;
    if (Array.isArray(s.tps) && s.tps.length) {
      var ov = s.tps.filter(function (t) { return /overworld/i.test(t.dim); })[0];
      tps = ov ? ov.tps : s.tps[0].tps;
    }
    text($("#mcTps"), tps != null ? Number(tps).toFixed(1) : "—");
    text($("#mcMem"), fmtMem(s.memMB));
    text($("#mcCpu"), s.cpuPct != null ? Number(s.cpuPct).toFixed(1) + "%" : "—");

    var ver = (s.config && s.config.version) || s.version || "—";
    var mods = s.config && s.config.mods;
    text($("#mcVersion"), ver + (mods ? " · " + mods + " MODS" : ""));

    var t = new Date(s.ts || Date.now());
    var hh = String(t.getHours()).padStart(2, "0");
    var mm = String(t.getMinutes()).padStart(2, "0");
    var ss = String(t.getSeconds()).padStart(2, "0");
    text($("#mcTime"), hh + ":" + mm + ":" + ss);
    text($("#mcTick"), hh + ":" + mm + ":" + ss);

    text($("#footStatus"), on ? "MC 在线 · " + (s.players || 0) + " 人在玩" : "MC 离线");

    // 地图只在开服后加载一次，避免离线时白等一个 404
    if (on && !mapLoaded && mapFrame) {
      var src = mapFrame.getAttribute("data-src");
      if (src) {
        mapFrame.src = src;
        mapFrame.hidden = false;
        if (mapOff) mapOff.hidden = true;
        mapLoaded = true;
      }
    }
    if (!on && mapLoaded && mapFrame) {
      mapFrame.removeAttribute("src");
      mapFrame.hidden = true;
      if (mapOff) mapOff.hidden = false;
      mapLoaded = false;
    }
  }

  function loadMc() {
    fetch("/api/mc/status", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) renderMc(d); })
      .catch(function () { text($("#mcStateText"), "离线"); });
  }

  /* ==========================================================
     4.5 服务状态卡片（UptimeRobot 公开状态页接口）
     ========================================================== */
  var SVC_API = "https://stats.uptimerobot.com/api/getMonitorList/exu8sUowds";
  var svcBusy = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function svcState(cls) {
    if (cls === "success") return "on";
    if (cls === "paused") return "paused";
    return "off";
  }

  function renderSvc(list) {
    var box = $("#svcList");
    if (!box) return;

    var rows = list.slice().sort(function (a, b) { return a.monitorId - b.monitorId; });
    box.innerHTML = rows.map(function (m) {
      var st = svcState(m.statusClass);
      var label = st === "on" ? "正常" : (st === "paused" ? "暂停" : "离线");
      var ratio = m["30dRatio"] && m["30dRatio"].ratio;
      var ratioText = ratio == null ? "—" : (Number(ratio).toFixed(Number(ratio) >= 100 ? 0 : 1) + "%");
      return '<li class="svc__item" data-state="' + st + '">' +
        '<i class="svc__dot" aria-hidden="true"></i>' +
        '<span class="svc__name">' + esc(m.name) + "</span>" +
        '<span class="svc__state">' + label + "</span>" +
        '<span class="svc__meta num" title="近 30 天可用率">' + ratioText + "</span>" +
        "</li>";
    }).join("");
  }

  function svcTick() {
    var t = new Date();
    var p = function (n) { return String(n).padStart(2, "0"); };
    text($("#svcTick"), p(t.getHours()) + ":" + p(t.getMinutes()) + ":" + p(t.getSeconds()));
  }

  function loadSvc() {
    if (svcBusy) return;
    svcBusy = true;
    fetch(SVC_API, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.data && d.data.length) {
          renderSvc(d.data);
          svcTick();
        } else {
          text($("#svcTick"), "读取失败");
        }
      })
      .catch(function () {
        var box = $("#svcList");
        if (box) box.innerHTML = '<li class="svc__item" data-state="off"><i class="svc__dot" aria-hidden="true"></i><span class="svc__name">状态数据读取失败</span><span class="svc__state">UNKNOWN</span><span class="svc__meta num">—</span></li>';
        text($("#svcTick"), "读取失败");
      })
      .then(function () { svcBusy = false; });
  }

  /* ==========================================================
     5. 图集灯箱
     ========================================================== */
  var shots = $$(".shot");
  var lb = $("#lightbox");
  var lbImg = $("#lbImg");
  var lbCap = $("#lbCap");
  var lbClose = $("#lbClose");
  var lbPrev = $("#lbPrev");
  var lbNext = $("#lbNext");
  var lbIndex = 0;
  var lbReturn = null;

  function showShot(i) {
    if (!shots.length) return;
    lbIndex = (i + shots.length) % shots.length;
    var btn = shots[lbIndex];
    var img = $("img", btn);
    lbImg.src = btn.getAttribute("data-full") || (img && img.src) || "";
    lbImg.alt = (img && img.alt) || "";
    lbCap.textContent = btn.getAttribute("data-cap") || "";
  }

  function openLightbox(i) {
    lbReturn = document.activeElement;
    showShot(i);
    lb.classList.add("is-open");
    lb.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-locked");
    lbClose.focus({ preventScroll: true });
  }

  function closeLightbox() {
    lb.classList.remove("is-open");
    lb.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-locked");
    if (lbReturn && lbReturn.focus) lbReturn.focus({ preventScroll: true });
  }

  shots.forEach(function (btn, i) {
    btn.addEventListener("click", function () { openLightbox(i); });
  });
  lbClose.addEventListener("click", closeLightbox);
  lbPrev.addEventListener("click", function () { showShot(lbIndex - 1); });
  lbNext.addEventListener("click", function () { showShot(lbIndex + 1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) closeLightbox(); });

  document.addEventListener("keydown", function (e) {
    if (!lb.classList.contains("is-open")) return;
    if (e.key === "Escape") { e.preventDefault(); closeLightbox(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); showShot(lbIndex - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); showShot(lbIndex + 1); }
    else if (e.key === "Tab") {
      e.preventDefault();
      lbClose.focus();
    }
  });

  /* ==========================================================
     启动
     ========================================================== */
  function boot() {
    scanReveal();
    loadSite();
    loadRepos();
    loadMc();
    loadSvc();

    setInterval(loadMc, 5000);
    setInterval(loadSite, 60000);
    setInterval(loadSvc, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
