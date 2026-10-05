/* DCAR — shared behaviour for every page (vanilla JS, no dependencies).
 * Loaded in <head> without defer so the state classes below exist before first paint;
 * everything that touches the DOM waits for DOMContentLoaded. All content is already in the HTML —
 * this file only adds motion and interaction. */
(function () {
  "use strict";

  var html = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    del: function (k) { try { sessionStorage.removeItem(k); } catch (e) { /* private mode */ } }
  };

  html.classList.add("js");

  // Preloader plays once per session
  if (store.get("dcar-intro") || reduce) html.classList.add("intro-seen");
  else store.set("dcar-intro", "1");

  // Arriving from an internal link: start with the transition columns covering the page
  if (store.get("dcar-transition")) {
    store.del("dcar-transition");
    if (!reduce) html.classList.add("is-entering");
  }

  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  document.addEventListener("DOMContentLoaded", function () {
    initTransitions();
    initHeader();
    initSplit();
    initFade();
    initHero();
    initSliders();
    initScrollScene();
    initForm();
    initToTop();
  });

  /* ------------------------------------------------------------ page transitions (Barba-style) */
  function initTransitions() {
    if (html.classList.contains("is-entering")) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          html.classList.add("is-revealing");
          setTimeout(function () { html.classList.remove("is-entering", "is-revealing"); }, 1000);
        });
      });
    }

    document.addEventListener("click", function (e) {
      var a = e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#" || /^(tel:|mailto:)/.test(href)) return;
      var url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;

      e.preventDefault();
      if (url.pathname === location.pathname && !url.hash) {
        document.dispatchEvent(new CustomEvent("dcar:close-menu"));
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        return;
      }
      if (reduce) { location.href = url.href; return; }
      document.dispatchEvent(new CustomEvent("dcar:close-menu"));
      store.set("dcar-transition", "1");
      html.classList.add("is-leaving");
      setTimeout(function () { location.href = url.href; }, 850);
    });

    // Back/forward cache restores the page mid-transition — reset it
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) html.classList.remove("is-leaving", "is-entering", "is-revealing");
    });
  }

  /* ------------------------------------------------------------ header + mega menus */
  function initHeader() {
    var header = $("[data-header]");
    if (!header) return;
    var overlay = $("[data-menu-overlay]");
    var panels = $$("[data-menu-panel]", header);
    var toggles = $$("[data-menu-toggle]", header);
    var homeHero = document.body.classList.contains("page-home");
    var open = null;
    var hideTimer = null;

    function syncScroll() {
      var scrolled = window.scrollY > 40;
      html.classList.toggle("is-scrolled", scrolled);
      html.classList.toggle("over-hero", homeHero && !scrolled && !open);
    }

    function setOpen(name) {
      var wasOpen = !!open;
      open = name;
      clearTimeout(hideTimer);
      header.setAttribute("data-open", name || "");
      toggles.forEach(function (t) { t.setAttribute("aria-expanded", String(t.getAttribute("data-menu-toggle") === name)); });
      html.classList.toggle("menu-open", !!name);
      syncScroll();

      if (!name) {
        // keep the panel painted while the clip-path closes
        hideTimer = setTimeout(function () { panels.forEach(function (p) { p.classList.remove("is-current", "is-shown"); }); }, 560);
        return;
      }
      panels.forEach(function (p) {
        var on = p.getAttribute("data-menu-panel") === name;
        p.classList.toggle("is-current", on);
        p.classList.remove("is-shown");
        if (!on) return;
        $$("[data-mi]", p).forEach(function (el, i) {
          el.style.setProperty("--i", i);
          el.style.setProperty("--d", wasOpen ? "0ms" : "250ms");
        });
        void p.offsetWidth; // restart the staggered entrance
        requestAnimationFrame(function () { p.classList.add("is-shown"); });
      });
    }

    toggles.forEach(function (t) {
      t.addEventListener("click", function () {
        var name = t.getAttribute("data-menu-toggle");
        setOpen(open === name ? null : name);
      });
    });
    if (overlay) overlay.addEventListener("click", function () { setOpen(null); });
    window.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) setOpen(null); });
    document.addEventListener("dcar:close-menu", function () { if (open) setOpen(null); });
    window.addEventListener("scroll", syncScroll, { passive: true });
    syncScroll();

    // Product list hover swaps the image and tagline
    $$("[data-hover]", header).forEach(function (a) {
      a.addEventListener("mouseenter", function () {
        var i = a.getAttribute("data-hover");
        $$("[data-hover-img]", header).forEach(function (el) { el.classList.toggle("is-active", el.getAttribute("data-hover-img") === i); });
        $$("[data-hover-tag]", header).forEach(function (el) { el.classList.toggle("is-active", el.getAttribute("data-hover-tag") === i); });
      });
    });
  }

  /* ------------------------------------------------------------ line-by-line text reveal */
  var splitItems = [];

  function splitLines(el) {
    var text = el.getAttribute("data-text") || el.textContent.replace(/\s+/g, " ").trim();
    el.setAttribute("data-text", text);
    el.textContent = "";
    var words = text.split(" ");
    var spans = words.map(function (w, i) {
      var s = document.createElement("span");
      s.textContent = w;
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
      return s;
    });
    var lines = [];
    var lastTop = null;
    spans.forEach(function (s, i) {
      var top = s.offsetTop;
      if (lastTop === null || Math.abs(top - lastTop) > 2) { lines.push([]); lastTop = top; }
      lines[lines.length - 1].push(words[i]);
    });
    el.textContent = "";
    lines.forEach(function (ws, i) {
      var line = document.createElement("span");
      var inner = document.createElement("span");
      line.className = "line";
      inner.className = "line__inner";
      inner.textContent = ws.join(" ");
      inner.style.setProperty("--i", i);
      line.appendChild(inner);
      el.appendChild(line);
    });
    el.classList.add("is-split");
  }

  function playIn(el, delay) {
    el.style.setProperty("--d", (delay || 0) + "ms");
    el.classList.remove("is-in", "is-done");
    void el.offsetWidth;
    el.classList.add("is-in");
    clearTimeout(el._doneTimer);
    el._doneTimer = setTimeout(function () { el.classList.add("is-done"); }, 1400 + (delay || 0));
  }

  function initSplit() {
    splitItems = $$("[data-split]");
    if (!splitItems.length) return;
    if (reduce) {
      splitItems.forEach(function (el) { el.classList.add("is-split", "is-in", "is-done"); });
      return;
    }
    var run = function () {
      splitItems.forEach(function (el) { try { splitLines(el); } catch (e) { el.classList.add("is-split", "is-in", "is-done"); } });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          playIn(en.target, 0);
          io.unobserve(en.target);
        });
      }, { rootMargin: "0px 0px -10% 0px" });
      splitItems.forEach(function (el) {
        if (el.hasAttribute("data-split-manual")) return;
        if (el.hasAttribute("data-split-now")) playIn(el, 200);
        else io.observe(el);
      });
      document.dispatchEvent(new CustomEvent("dcar:split-ready"));
    };
    // measure lines with the real font, not the fallback
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run); else run();

    var lastW = window.innerWidth;
    var t;
    window.addEventListener("resize", function () {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      clearTimeout(t);
      t = setTimeout(function () {
        splitItems.forEach(function (el) {
          var wasIn = el.classList.contains("is-in");
          splitLines(el);
          if (wasIn) el.classList.add("is-in", "is-done");
        });
      }, 200);
    });
  }

  /* ------------------------------------------------------------ staggered fade-in groups */
  function initFade() {
    var groups = $$("[data-fade]");
    if (!groups.length) return;
    groups.forEach(function (g) {
      Array.prototype.forEach.call(g.children, function (c, i) { c.style.setProperty("--i", i); });
    });
    if (reduce || !("IntersectionObserver" in window)) { groups.forEach(function (g) { g.classList.add("is-in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -15% 0px" });
    groups.forEach(function (g) { io.observe(g); });
  }

  /* ------------------------------------------------------------ home hero slider */
  var heroMedia = null;
  var heroEl = null;

  function initHero() {
    heroEl = $("[data-hero]");
    if (!heroEl) return;
    heroMedia = $("[data-hero-media]", heroEl);
    var imgs = $$("[data-hero-img]", heroEl);
    var slides = $$("[data-hero-slide]", heroEl);
    var tabs = $$("[data-hero-tab]", heroEl);
    var n = slides.length;
    var active = 0;
    var timer = null;
    var DURATION = 7000;

    function title(i) { return $("[data-split]", slides[i]); }

    function schedule() {
      clearTimeout(timer);
      if (!reduce) timer = setTimeout(function () { go(active + 1); }, DURATION);
    }

    function go(i) {
      i = (i + n) % n;
      if (i !== active) {
        var prevTitle = title(active);
        if (prevTitle) prevTitle.classList.remove("is-in", "is-done");
        [imgs, slides].forEach(function (list) { list.forEach(function (el, k) { el.classList.toggle("is-active", k === i); }); });
        slides.forEach(function (el, k) { el.inert = k !== i; });
        active = i;
      }
      tabs.forEach(function (t, k) {
        t.classList.remove("is-active");
        if (k === i) { void t.offsetWidth; t.classList.add("is-active"); }
      });
      var tt = title(i);
      if (tt && tt.classList.contains("is-split")) playIn(tt, 150);
      schedule();
    }

    $("[data-hero-prev]", heroEl).addEventListener("click", function () { go(active - 1); });
    $("[data-hero-next]", heroEl).addEventListener("click", function () { go(active + 1); });
    tabs.forEach(function (t) { t.addEventListener("click", function () { go(+t.getAttribute("data-hero-tab")); }); });
    $("[data-hero-down]", heroEl).addEventListener("click", function () {
      var y = heroEl.offsetTop + heroEl.offsetHeight - 76;
      window.scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
    });

    document.addEventListener("dcar:split-ready", function () { var t = title(0); if (t) playIn(t, html.classList.contains("intro-seen") ? 150 : 1900); });
    if (reduce) { var t0 = title(0); if (t0) t0.classList.add("is-in", "is-done"); }
    document.addEventListener("visibilitychange", function () { if (document.hidden) clearTimeout(timer); else schedule(); });
    schedule();
  }

  /* ------------------------------------------------------------ sliders + drag cursor */
  var cursor = null;
  var cursorPos = { x: 0, y: 0, tx: 0, ty: 0 };

  function initSliders() {
    var roots = $$("[data-slider]");
    if (!roots.length) return;
    cursor = $("[data-drag-cursor]");
    var fine = window.matchMedia("(pointer: fine)").matches;

    roots.forEach(function (root) {
      var track = $("[data-slider-track]", root);
      var prev = $("[data-slider-prev]", root);
      var next = $("[data-slider-next]", root);

      function edges() {
        prev.disabled = track.scrollLeft < 4;
        next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      }
      function go(dir) {
        var card = track.firstElementChild;
        track.scrollBy({ left: dir * (card ? card.offsetWidth + 16 : track.clientWidth * 0.8), behavior: reduce ? "auto" : "smooth" });
      }
      prev.addEventListener("click", function () { go(-1); });
      next.addEventListener("click", function () { go(1); });
      track.addEventListener("scroll", edges, { passive: true });
      window.addEventListener("resize", edges);
      edges();

      // mouse drag-to-scroll
      var down = false, moved = false, startX = 0, startLeft = 0;
      track.addEventListener("pointerdown", function (e) {
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        down = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft;
        track.classList.add("is-dragging");
        if (cursor) cursor.classList.add("is-down");
      });
      window.addEventListener("pointermove", function (e) {
        if (!down) return;
        var dx = e.clientX - startX;
        if (Math.abs(dx) > 4) moved = true;
        track.scrollLeft = startLeft - dx;
      });
      window.addEventListener("pointerup", function () {
        if (!down) return;
        down = false;
        track.classList.remove("is-dragging");
        if (cursor) cursor.classList.remove("is-down");
      });
      track.addEventListener("click", function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
      track.addEventListener("dragstart", function (e) { e.preventDefault(); });

      if (cursor && fine) {
        track.addEventListener("pointerenter", function (e) {
          if (window.innerWidth < 768) return;
          cursorPos.x = cursorPos.tx = e.clientX;
          cursorPos.y = cursorPos.ty = e.clientY;
          cursor.classList.add("is-visible");
        });
        track.addEventListener("pointermove", function (e) { cursorPos.tx = e.clientX; cursorPos.ty = e.clientY; });
        track.addEventListener("pointerleave", function () { cursor.classList.remove("is-visible"); });
      }
    });
  }

  /* ------------------------------------------------------------ scroll-linked scene: grid lines, image reveals, hero parallax */
  function initScrollScene() {
    var lines = $$("[data-lines]").map(function (el) { return { el: el, cur: reduce ? 1 : 0 }; });
    var reveals = $$("[data-reveal]").map(function (el) {
      var top = el.getBoundingClientRect().top + window.scrollY;
      return { el: el, img: $("img", el), fromTop: top < 100, cur: null };
    });
    lines.forEach(function (l) { l.el.style.setProperty("--progress", l.cur); });
    if (reduce) return;

    function frame() {
      var vh = window.innerHeight;

      lines.forEach(function (l) {
        var r = l.el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        // dvo: start "top 60%", end "bottom 60%", scrub 0.1
        var target = clamp((vh * 0.6 - r.top) / Math.max(1, r.height), 0, 1);
        l.cur += (target - l.cur) * 0.35;
        if (Math.abs(target - l.cur) < 0.0005) l.cur = target;
        l.el.style.setProperty("--progress", l.cur.toFixed(4));
      });

      reveals.forEach(function (rv) {
        var r = rv.el.getBoundingClientRect();
        if (rv.cur !== null && (r.bottom < -50 || r.top > vh + 50)) return;
        // dvo: start "top bottom" (or "top top" near the page top), end "bottom top", scrub 0.4
        var target = rv.fromTop ? clamp(-r.top / Math.max(1, r.height), 0, 1) : clamp((vh - r.top) / (vh + r.height), 0, 1);
        rv.cur = rv.cur === null ? target : rv.cur + (target - rv.cur) * 0.12;
        if (Math.abs(target - rv.cur) < 0.0005) rv.cur = target;
        var clip = 2 * (1 - clamp(rv.cur / 0.5, 0, 1));
        var inset = clip.toFixed(3) + "%";
        var far = (100 - clip).toFixed(3) + "%";
        rv.el.style.clipPath = "polygon(" + inset + " " + inset + ", " + far + " " + inset + ", " + far + " " + far + ", " + inset + " " + far + ")";
        if (rv.img) rv.img.style.transform = "scale(" + (1.15 - 0.15 * rv.cur).toFixed(4) + ")";
      });

      if (heroMedia && heroEl) {
        var hp = clamp(window.scrollY / heroEl.offsetHeight, 0, 1);
        heroMedia.style.transform = "translate3d(0," + (hp * 18).toFixed(3) + "%,0)";
      }

      if (cursor) {
        cursorPos.x += (cursorPos.tx - cursorPos.x) * 0.25;
        cursorPos.y += (cursorPos.ty - cursorPos.y) * 0.25;
        cursor.style.setProperty("--x", cursorPos.x.toFixed(1) + "px");
        cursor.style.setProperty("--y", cursorPos.y.toFixed(1) + "px");
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------ contact form (client-side confirmation) */
  function initForm() {
    var form = $("[data-contact-form]");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var wrap = form.closest("[data-form-wrap]");
      if (wrap) wrap.classList.add("is-sent");
      var ok = $(".form-success", wrap || document);
      if (ok) { ok.setAttribute("tabindex", "-1"); ok.focus({ preventScroll: true }); }
    });
  }

  /* ------------------------------------------------------------ back to top */
  function initToTop() {
    $$("[data-to-top]").forEach(function (b) {
      b.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); });
    });
  }
})();
