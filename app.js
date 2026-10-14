/* RoomPitch — front-end logic (plain JavaScript, no build step).
   Sections:
   1. Config: styles, room types, default price list
   2. State + saving settings on this device
   3. Language (English / Arabic)
   4. Photo upload
   5. Rendering (AI or demo)
   6. Before/after viewer + brush editing
   7. Budget
   8. Settings dialogs
   9. PDF proposal
*/
(() => {
  "use strict";

  /* ───────────── 1. CONFIG ───────────── */

  // Each style: label in both languages, the description sent to the AI,
  // and a tint used only in demo mode.
  const STYLES = [
    { id: "modern", en: "Modern", ar: "مودرن", tint: "#c9c3b8",
      prompt: "modern contemporary interior, clean lines, flat-panel joinery, warm neutral palette, matte finishes, concealed linear lighting, large-format porcelain floor" },
    { id: "japandi", en: "Japandi", ar: "جاباندي", tint: "#c8b59a",
      prompt: "Japandi interior, light oak wood, natural linen, low-profile furniture, muted earthy tones, paper lantern lighting, minimal calm decor" },
    { id: "neoclassic", en: "Neoclassic", ar: "نيوكلاسيك", tint: "#e2d3b5",
      prompt: "neoclassic luxury interior, wall moldings and panelling, cornice ceiling, cream and gold accents, marble floor, crystal chandelier, elegant upholstered furniture" },
    { id: "classic", en: "Classic", ar: "كلاسيك", tint: "#b08d5b",
      prompt: "classic traditional interior, carved wood furniture, rich fabrics, ornate ceiling details, warm lighting, patterned rug" },
    { id: "arabic", en: "Arabic Contemporary", ar: "عربي معاصر", tint: "#b98a5e",
      prompt: "contemporary Arabic interior, mashrabiya patterned screens, arches, warm sand and terracotta tones, brass details, low majlis-style seating, geometric patterns" },
    { id: "industrial", en: "Industrial", ar: "إندستريال", tint: "#7a756e",
      prompt: "industrial interior, exposed concrete, black steel frames, leather and reclaimed wood, Edison bulb pendants, polished concrete floor" },
    { id: "scandi", en: "Scandinavian", ar: "إسكندنافي", tint: "#e6e4df",
      prompt: "Scandinavian interior, white walls, pale wood floor, cozy textiles, simple functional furniture, soft daylight, plants" },
    { id: "minimal", en: "Minimalist", ar: "مينيمال", tint: "#efece6",
      prompt: "minimalist interior, very few pieces, monochrome warm white palette, hidden storage, seamless surfaces, soft indirect lighting" }
  ];

  const PRESERVE = {
    strict: "Keep the exact same camera angle, perspective, room dimensions, wall positions, window and door openings and ceiling height. Do not move or add walls, windows or doors.",
    balanced: "Keep the walls, windows and doors in the same positions and the same camera angle. You may redesign the ceiling, lighting and furniture layout.",
    creative: "Keep the same camera angle and the general shape of the room. You may freely redesign ceilings, add built-in joinery and architectural features."
  };

  const ROOMS = [
    { id: "living", en: "Living room", ar: "ليفينج" },
    { id: "majlis", en: "Majlis", ar: "مجلس" },
    { id: "bedroom", en: "Bedroom", ar: "غرفة نوم" },
    { id: "dining", en: "Dining room", ar: "سفرة" },
    { id: "office", en: "Office", ar: "مكتب" },
    { id: "kitchen", en: "Kitchen", ar: "مطبخ" }
  ];

  // Units: m2floor / m2wall / m2ceiling are calculated from the room size.
  // pc (piece) and lm (linear metre) quantities come from the room type below.
  const DEFAULT_PRICES = [
    { id: "floor",    en: "Flooring (porcelain / parquet)", ar: "أرضيات (بورسلين / باركيه)", unit: "m2floor",   price: 45 },
    { id: "paint",    en: "Wall paint incl. putty",         ar: "دهانات الحوائط شامل المعجون", unit: "m2wall",   price: 8 },
    { id: "ceiling",  en: "Gypsum ceiling + paint",         ar: "سقف جبس بورد + دهان",       unit: "m2ceiling", price: 30 },
    { id: "lighting", en: "Lighting points & fixtures",     ar: "نقاط وإضاءات",              unit: "pc", price: 40 },
    { id: "curtains", en: "Curtains (per window)",          ar: "ستائر (لكل شباك)",          unit: "pc", price: 250 },
    { id: "sofa",     en: "Sofa",                           ar: "كنبة",                      unit: "pc", price: 1200 },
    { id: "armchair", en: "Armchair",                       ar: "كرسي فوتيه",                unit: "pc", price: 450 },
    { id: "ctable",   en: "Coffee table",                   ar: "ترابيزة وسط",               unit: "pc", price: 300 },
    { id: "tvunit",   en: "TV unit",                        ar: "وحدة تلفزيون",              unit: "pc", price: 600 },
    { id: "rug",      en: "Rug",                            ar: "سجادة",                     unit: "pc", price: 350 },
    { id: "majlis",   en: "Majlis seating",                 ar: "جلسة مجلس",                 unit: "lm", price: 400 },
    { id: "bed",      en: "Bed",                            ar: "سرير",                      unit: "pc", price: 1100 },
    { id: "wardrobe", en: "Wardrobe",                       ar: "دولاب",                     unit: "pc", price: 1500 },
    { id: "nstand",   en: "Nightstand",                     ar: "كومودينو",                  unit: "pc", price: 200 },
    { id: "dtable",   en: "Dining table",                   ar: "ترابيزة سفرة",              unit: "pc", price: 900 },
    { id: "dchair",   en: "Dining chair",                   ar: "كرسي سفرة",                 unit: "pc", price: 150 },
    { id: "desk",     en: "Desk",                           ar: "مكتب",                      unit: "pc", price: 500 },
    { id: "ochair",   en: "Office chair",                   ar: "كرسي مكتب",                 unit: "pc", price: 300 },
    { id: "cabinets", en: "Kitchen cabinets",               ar: "دواليب مطبخ",               unit: "lm", price: 350 },
    { id: "decor",    en: "Decor & accessories package",    ar: "باقة ديكور وإكسسوارات",     unit: "pc", price: 400 }
  ];

  // Default quantities for each room type. Functions receive the room size.
  const ROOM_ITEMS = {
    living:  { lighting: 6, curtains: 2, sofa: 1, armchair: 2, ctable: 1, tvunit: 1, rug: 1, decor: 1 },
    majlis:  { lighting: 8, curtains: 2, majlis: d => Math.round(2 * (d.L + d.W) * 0.6), ctable: 2, rug: 2, decor: 1 },
    bedroom: { lighting: 4, curtains: 1, bed: 1, wardrobe: 1, nstand: 2, rug: 1, decor: 1 },
    dining:  { lighting: 4, curtains: 1, dtable: 1, dchair: 6, rug: 1, decor: 1 },
    office:  { lighting: 4, curtains: 1, desk: 1, ochair: 1, armchair: 1, decor: 1 },
    kitchen: { lighting: 6, cabinets: d => Math.round((d.L + d.W) * 10) / 10 }
  };

  const FINISH_MULT = { economy: 0.8, standard: 1, premium: 1.5 };
  const CURRENCIES = ["USD", "SAR", "AED", "QAR", "KWD", "BHD", "OMR", "EGP", "EUR", "GBP"];
  const MAX_SIDE = 1280; // photos are resized to this before sending to the AI

  /* ───────────── 2. STATE + STORAGE ───────────── */

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); }
      catch { toast("Could not save settings on this device (storage full or blocked)."); }
    }
  };

  const defaultSettings = () => ({
    lang: (navigator.language || "").startsWith("ar") ? "ar" : "en",
    currency: "USD", feePct: 15, vatPct: 0,
    prices: DEFAULT_PRICES.map(p => ({ id: p.id, price: p.price })),
    pricesEdited: false,
    studio: { name: "", designer: "", phone: "", email: "", logo: "" },
    accessCode: ""
  });

  const settings = Object.assign(defaultSettings(), store.get("rp_settings", {}));
  const saveSettings = () => store.set("rp_settings", settings);

  const state = {
    original: null,          // { src, w, h }
    renders: [],             // { id, src, w, h, label, styleId }
    activeId: null,
    styleId: "modern",
    preserve: "strict",
    roomType: "living",
    finish: "standard",
    lines: [],               // { id, qty, on, auto }
    editMode: false,
    busy: false,
    aiEnabled: null
  };

  const $ = sel => document.querySelector(sel);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  };

  /* ───────────── 3. LANGUAGE ───────────── */

  const t = (key, vars = {}, lang = settings.lang) => {
    let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  };
  const nameOf = (obj, lang = settings.lang) => obj[lang] || obj.en;

  function applyLang() {
    const lang = settings.lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach(n => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll("[data-i18n-ph]").forEach(n => { n.placeholder = t(n.dataset.i18nPh); });
    $("#btnLang").textContent = lang === "ar" ? "EN" : "ع";
    if (state.original) $(".drop-text").textContent = t("dropChange");
    $("#pdfLang").value = $("#pdfLang").dataset.touched ? $("#pdfLang").value : lang;
    renderRoomSelect();
    renderStyleChips();
    renderModeBadge();
    renderStrip();
    renderBudget();
  }

  /* ───────────── 4. PHOTO UPLOAD ───────────── */

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read this image"));
      img.src = src;
    });
  }

  // Resize to MAX_SIDE and re-encode as JPEG (keeps uploads small and fast).
  async function fileToResizedDataUrl(file, maxSide = MAX_SIDE, type = "image/jpeg") {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      // Most image models prefer dimensions divisible by 8.
      const w = Math.max(8, Math.round(img.naturalWidth * scale / 8) * 8);
      const h = Math.max(8, Math.round(img.naturalHeight * scale / 8) * 8);
      const c = el("canvas", { width: w, height: h });
      const ctx = c.getContext("2d");
      if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(img, 0, 0, w, h);
      return { src: c.toDataURL(type, 0.9), w, h };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function handlePhoto(file) {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      state.original = await fileToResizedDataUrl(file);
      state.renders = [];
      state.activeId = null;
      exitEditMode();
      $(".drop-text").textContent = t("dropChange");
      $("#drop").classList.add("has-photo");
      $("#drop").style.setProperty("--thumb", `url("${state.original.src}")`);
      showViewer();
    } catch (e) {
      toast(t("errGeneric", { msg: e.message }));
    }
  }

  /* ───────────── 5. RENDERING ───────────── */

  function buildRestylePrompt(styleId) {
    const style = STYLES.find(s => s.id === styleId);
    const room = ROOMS.find(r => r.id === state.roomType);
    const parts = [
      `Redesign this ${room.en.toLowerCase()} as a photorealistic interior design render.`,
      `Style: ${style.prompt}.`,
      PRESERVE[state.preserve]
    ];
    if ($("#construction").checked) {
      parts.push("The photo shows an unfinished construction site: complete it with finished plastered and painted walls, a finished floor and a finished ceiling, and remove all construction debris, tools and exposed wiring.");
    }
    const extra = $("#extraNotes").value.trim();
    if (extra) parts.push(`Client wishes: ${extra}.`);
    parts.push("Natural daylight, realistic materials and shadows, professional architectural photography, high detail. No people, no text, no watermark.");
    return parts.join(" ");
  }

  async function callApi(payload) {
    const res = await fetch("api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-code": settings.accessCode || "" },
      body: JSON.stringify(payload)
    });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON error page */ }
    if (res.status === 401) throw new Error(t("errAccess"));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  // Demo mode: no AI key yet, so we fake a render by tinting the photo.
  async function demoRender(baseSrc, tint, maskSrc) {
    await new Promise(r => setTimeout(r, 900 + Math.random() * 700));
    const base = await loadImage(baseSrc);
    const w = base.naturalWidth, h = base.naturalHeight;
    const c = el("canvas", { width: w, height: h });
    const ctx = c.getContext("2d");
    ctx.drawImage(base, 0, 0);

    // The restyled layer
    const layer = el("canvas", { width: w, height: h });
    const lc = layer.getContext("2d");
    lc.filter = "saturate(0.75) contrast(1.08) brightness(1.06)";
    lc.drawImage(base, 0, 0);
    lc.filter = "none";
    lc.globalCompositeOperation = "color";
    lc.globalAlpha = 0.55;
    lc.fillStyle = tint;
    lc.fillRect(0, 0, w, h);
    lc.globalAlpha = 1;

    if (maskSrc) {
      // Only keep the restyled layer inside the painted mask.
      const mask = await loadImage(maskSrc);
      lc.globalCompositeOperation = "destination-in";
      const mc = el("canvas", { width: w, height: h });
      const mctx = mc.getContext("2d");
      mctx.drawImage(mask, 0, 0, w, h);
      // turn the black/white mask into alpha
      const id = mctx.getImageData(0, 0, w, h);
      for (let i = 0; i < id.data.length; i += 4) { id.data[i + 3] = id.data[i]; }
      mctx.putImageData(id, 0, 0);
      lc.drawImage(mc, 0, 0);
    }
    lc.globalCompositeOperation = "source-over";
    ctx.drawImage(layer, 0, 0);

    // Label so nobody mistakes it for a real render
    const fs = Math.round(w / 34);
    ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
    const label = "DEMO — add FAL_KEY for real AI renders";
    const tw = ctx.measureText(label).width;
    // Bottom-right, so it stays visible on the "After" side of the comparison slider.
    const x = w - tw - fs * 1.8;
    ctx.fillStyle = "rgba(20,20,20,.62)";
    ctx.fillRect(x - fs * 0.6, h - fs * 2.4, tw + fs * 1.2, fs * 1.8);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x, h - fs * 1.1);
    return c.toDataURL("image/jpeg", 0.9);
  }

  async function renderStyle(styleId) {
    const style = STYLES.find(s => s.id === styleId);
    const prompt = buildRestylePrompt(styleId);
    const data = await callApi({ mode: "restyle", image: state.original.src, prompt });
    if (data.demo) {
      setAiEnabled(false);
      return { src: await demoRender(state.original.src, style.tint), styleId };
    }
    setAiEnabled(true);
    return { src: data.image, styleId };
  }

  async function addRender(src, label, styleId) {
    const img = await loadImage(src);
    const r = { id: "r" + Date.now() + Math.random().toString(36).slice(2, 6), src, w: img.naturalWidth, h: img.naturalHeight, label, styleId };
    state.renders.push(r);
    return r;
  }

  async function generate(styleIds) {
    if (state.busy) return;
    if (!state.original) return toast(t("needPhoto"));
    exitEditMode();
    startLoading(styleIds.length > 1 ? t("renderingN", { n: styleIds.length }) : t("rendering"));
    const t0 = performance.now();
    try {
      const results = await Promise.allSettled(styleIds.map(renderStyle));
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      let last = null, firstErr = null;
      for (const r of results) {
        if (r.status === "fulfilled") {
          const style = STYLES.find(s => s.id === r.value.styleId);
          last = await addRender(r.value.src, { kind: "render", styleId: style.id, secs }, style.id);
        } else if (!firstErr) firstErr = r.reason;
      }
      if (last) setActive(last.id);
      if (firstErr) toast(t("errGeneric", { msg: firstErr.message }));
      if (state.aiEnabled === false) toast(t("demoToast"));
    } finally {
      stopLoading();
    }
  }

  async function applyEdit() {
    if (state.busy) return;
    const active = activeRender();
    if (!active) return;
    if (!mask.painted) return toast(t("needMask"));
    const instruction = $("#editPrompt").value.trim();
    if (!instruction) return toast(t("needEditPrompt"));

    const maskSrc = mask.canvas.toDataURL("image/png");
    const style = STYLES.find(s => s.id === (active.styleId || state.styleId));
    const prompt = `${instruction}. Photorealistic interior, matching the surrounding ${style.en} style, lighting and perspective.`;
    startLoading(t("applying"));
    const t0 = performance.now();
    try {
      const data = await callApi({ mode: "edit", image: active.src, mask: maskSrc, prompt });
      const src = data.demo ? await demoRender(active.src, "#6d8f7a", maskSrc) : data.image;
      if (data.demo) setAiEnabled(false); else setAiEnabled(true);
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      const r = await addRender(src, { kind: "edit", secs }, active.styleId);
      exitEditMode();
      setActive(r.id);
      $("#editPrompt").value = "";
    } catch (e) {
      toast(t("errGeneric", { msg: e.message }));
    } finally {
      stopLoading();
    }
  }

  let timerHandle = null;
  function startLoading(text) {
    state.busy = true;
    $("#loadingText").textContent = text;
    $("#loading").hidden = false;
    document.querySelectorAll("#btnGenerate, #btnThree, #btnApplyEdit").forEach(b => (b.disabled = true));
    const t0 = performance.now();
    timerHandle = setInterval(() => {
      $("#timer").textContent = ((performance.now() - t0) / 1000).toFixed(1) + "s";
    }, 100);
  }
  function stopLoading() {
    state.busy = false;
    clearInterval(timerHandle);
    $("#loading").hidden = true;
    document.querySelectorAll("#btnGenerate, #btnThree, #btnApplyEdit").forEach(b => (b.disabled = false));
  }

  function setAiEnabled(on) {
    state.aiEnabled = on;
    renderModeBadge();
  }
  function renderModeBadge() {
    const b = $("#modeBadge");
    if (state.aiEnabled === null) { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = state.aiEnabled ? t("liveBadge") : t("demoBadge");
    b.classList.toggle("live", !!state.aiEnabled);
  }

  /* ───────────── 6. VIEWER + BRUSH ───────────── */

  const activeRender = () => state.renders.find(r => r.id === state.activeId) || null;

  function showViewer() {
    $("#app").classList.add("has-photo");
    $("#emptyState").hidden = true;
    $("#frame").hidden = false;
    $("#viewerTools").hidden = false;
    $("#imgBefore").src = state.original.src;
    fitFrame(state.original.w, state.original.h);
    updateCompareMode();
    renderStrip();
  }

  // Size the frame to the image's exact proportions (capped at 72% of screen height)
  // so the brush lines up with the picture pixel-for-pixel.
  function fitFrame(w, h) {
    const f = $("#frame");
    f.style.aspectRatio = `${w} / ${h}`;
    f.style.width = `min(100%, calc(72vh * ${(w / h).toFixed(4)}))`;
  }

  function setActive(id) {
    state.activeId = id;
    updateCompareMode();
    renderStrip();
  }

  function updateCompareMode() {
    const r = activeRender();
    const frame = $("#frame");
    if (r) {
      $("#imgAfter").src = r.src;
      $("#imgAfter").hidden = false;
      frame.classList.add("comparing");
      $("#renderMeta").textContent = renderLabel(r);
      $("#btnEditMode").disabled = false;
    } else {
      $("#imgAfter").hidden = true;
      frame.classList.remove("comparing");
      $("#renderMeta").textContent = "";
      $("#btnEditMode").disabled = true;
    }
    setComparePos($("#compare").value);
  }

  function setComparePos(v) {
    // In RTL the slider runs right-to-left, so mirror the position.
    $("#frame").style.setProperty("--pos", v + "%");
  }

  function renderLabel(r) {
    const style = STYLES.find(s => s.id === r.styleId);
    if (r.label.kind === "edit") return t("editOf", { s: r.label.secs });
    return t("renderOf", { style: style ? nameOf(style) : "", s: r.label.secs });
  }

  function renderStrip() {
    const strip = $("#strip");
    if (!strip) return;
    strip.innerHTML = "";
    if (!state.original) return;
    for (const r of state.renders) {
      const b = el("button", {
        class: "thumb" + (r.id === state.activeId ? " active" : ""),
        title: renderLabel(r),
        onclick: () => { exitEditMode(); setActive(r.id); }
      }, el("img", { src: r.src, alt: "" }), el("span", { text: renderLabel(r) }));
      strip.append(b);
    }
  }

  // Brush mask: drawn on a full-resolution offscreen canvas (white = change, black = keep),
  // while a visible overlay shows the strokes on screen.
  const mask = { canvas: null, ctx: null, painted: false, drawing: false, last: null };

  function enterEditMode() {
    const r = activeRender();
    if (!r) return;
    state.editMode = true;
    $("#editBar").hidden = false;
    $("#btnEditMode").hidden = true;
    $("#frame").classList.add("editing");
    fitFrame(r.w, r.h);
    const bc = $("#brushCanvas");
    bc.hidden = false;
    mask.canvas = el("canvas", { width: r.w, height: r.h });
    mask.ctx = mask.canvas.getContext("2d");
    clearMask();
    sizeBrushCanvas();
    $("#editPrompt").focus({ preventScroll: true });
  }

  function exitEditMode() {
    state.editMode = false;
    $("#editBar").hidden = true;
    $("#btnEditMode").hidden = false;
    $("#frame").classList.remove("editing");
    $("#brushCanvas").hidden = true;
    if (state.original) fitFrame(state.original.w, state.original.h);
  }

  function sizeBrushCanvas() {
    const bc = $("#brushCanvas");
    const rect = $("#frame").getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    bc.width = Math.round(rect.width * dpr);
    bc.height = Math.round(rect.height * dpr);
    redrawOverlay();
  }

  function clearMask() {
    if (!mask.ctx) return;
    mask.ctx.fillStyle = "#000";
    mask.ctx.fillRect(0, 0, mask.canvas.width, mask.canvas.height);
    mask.painted = false;
    redrawOverlay();
  }

  function redrawOverlay() {
    const bc = $("#brushCanvas");
    const ctx = bc.getContext("2d");
    ctx.clearRect(0, 0, bc.width, bc.height);
    if (!mask.canvas || !mask.painted) return;
    // Show white mask areas as a translucent accent colour.
    const tmp = el("canvas", { width: bc.width, height: bc.height });
    const tctx = tmp.getContext("2d");
    tctx.drawImage(mask.canvas, 0, 0, bc.width, bc.height);
    const id = tctx.getImageData(0, 0, bc.width, bc.height);
    for (let i = 0; i < id.data.length; i += 4) {
      const a = id.data[i];
      id.data[i] = 214; id.data[i + 1] = 92; id.data[i + 2] = 60; id.data[i + 3] = a * 0.55;
    }
    ctx.putImageData(id, 0, 0);
  }

  function pointerToMask(e) {
    const rect = $("#brushCanvas").getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * mask.canvas.width,
      y: (e.clientY - rect.top) / rect.height * mask.canvas.height,
      scale: mask.canvas.width / rect.width
    };
  }

  function paintTo(p) {
    const size = Number($("#brushSize").value) * p.scale;
    const ctx = mask.ctx;
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = size;
    if (mask.last) {
      ctx.beginPath();
      ctx.moveTo(mask.last.x, mask.last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    mask.last = p;
    mask.painted = true;
  }

  let overlayQueued = false;
  function queueOverlay() {
    if (overlayQueued) return;
    overlayQueued = true;
    requestAnimationFrame(() => { overlayQueued = false; redrawOverlay(); });
  }

  /* ───────────── 7. BUDGET ───────────── */

  const priceOf = id => (settings.prices.find(p => p.id === id) || {}).price || 0;
  const dims = () => ({
    L: Math.max(0, parseFloat($("#dimL").value) || 0),
    W: Math.max(0, parseFloat($("#dimW").value) || 0),
    H: Math.max(0, parseFloat($("#dimH").value) || 0)
  });
  const round1 = n => Math.round(n * 10) / 10;

  function autoQty(unit, d) {
    if (unit === "m2floor" || unit === "m2ceiling") return round1(d.L * d.W);
    // Wall area minus ~15% for doors and windows
    if (unit === "m2wall") return round1(2 * (d.L + d.W) * d.H * 0.85);
    return null;
  }

  // Rebuild the line items when the room type changes.
  function buildLines() {
    const d = dims();
    const preset = ROOM_ITEMS[state.roomType] || {};
    state.lines = DEFAULT_PRICES.map(item => {
      const auto = autoQty(item.unit, d);
      if (auto !== null) return { id: item.id, qty: auto, on: true, auto: true };
      const p = preset[item.id];
      const qty = typeof p === "function" ? p(d) : (p || 0);
      return { id: item.id, qty, on: qty > 0, auto: false };
    });
  }

  function refreshAutoQty() {
    const d = dims();
    for (const line of state.lines) {
      const item = DEFAULT_PRICES.find(i => i.id === line.id);
      if (line.auto) line.qty = autoQty(item.unit, d);
    }
  }

  function computeTotals() {
    const mult = FINISH_MULT[state.finish];
    const rows = state.lines
      .filter(l => l.on && l.qty > 0)
      .map(l => {
        const item = DEFAULT_PRICES.find(i => i.id === l.id);
        const unitPrice = priceOf(l.id) * mult;
        return { item, qty: l.qty, unitPrice, amount: unitPrice * l.qty };
      });
    const subtotal = rows.reduce((s, r) => s + r.amount, 0);
    const fee = subtotal * (settings.feePct || 0) / 100;
    const vat = (subtotal + fee) * (settings.vatPct || 0) / 100;
    return { rows, subtotal, fee, vat, total: subtotal + fee + vat };
  }

  const money = (n, lang = settings.lang) => {
    try {
      return new Intl.NumberFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
        style: "currency", currency: settings.currency, maximumFractionDigits: 0
      }).format(n);
    } catch { return `${Math.round(n).toLocaleString()} ${settings.currency}`; }
  };
  const unitLabel = (u, lang) => t("u_" + u, {}, lang);

  function renderBudget() {
    if (!state.lines.length) return;
    const tbody = $("#linesTable tbody");
    tbody.innerHTML = "";
    const mult = FINISH_MULT[state.finish];
    for (const line of state.lines) {
      const item = DEFAULT_PRICES.find(i => i.id === line.id);
      const amount = line.on ? priceOf(line.id) * mult * line.qty : 0;
      const tr = el("tr", { class: line.on ? "" : "off" },
        el("td", {}, el("input", {
          type: "checkbox", "aria-label": nameOf(item),
          ...(line.on ? { checked: "" } : {}),
          onchange: e => { line.on = e.target.checked; if (line.on && !line.qty) line.qty = 1; renderBudget(); }
        })),
        el("td", {}, el("span", { class: "item-name", text: nameOf(item) }), el("span", { class: "unit", text: unitLabel(item.unit) })),
        el("td", {}, el("input", {
          type: "number", class: "qty", min: "0", step: item.unit === "pc" ? "1" : "0.1", value: String(line.qty),
          inputmode: "decimal", "aria-label": t("qty"),
          onchange: e => { line.qty = Math.max(0, parseFloat(e.target.value) || 0); line.auto = false; line.on = line.qty > 0; renderBudget(); }
        })),
        el("td", { class: "num-col", text: line.on ? money(amount) : "—" })
      );
      tbody.append(tr);
    }
    const tot = computeTotals();
    const totals = $("#totals");
    totals.innerHTML = "";
    const row = (label, value, cls = "") => el("div", { class: "trow " + cls }, el("span", { text: label }), el("span", { text: value }));
    totals.append(
      row(t("subtotal"), money(tot.subtotal)),
      row(`${t("fee")} (${settings.feePct || 0}%)`, money(tot.fee))
    );
    if (settings.vatPct) totals.append(row(`${t("vat")} (${settings.vatPct}%)`, money(tot.vat)));
    totals.append(row(t("total"), money(tot.total), "grand"));
    $("#sampleNote").hidden = !!settings.pricesEdited;
  }

  /* ───────────── 8. SETTINGS DIALOGS ───────────── */

  function renderRoomSelect() {
    const sel = $("#roomType");
    sel.innerHTML = "";
    for (const r of ROOMS) sel.append(el("option", { value: r.id, text: nameOf(r) }));
    sel.value = state.roomType;
  }

  function renderStyleChips() {
    const wrap = $("#styleChips");
    wrap.innerHTML = "";
    for (const s of STYLES) {
      wrap.append(el("button", {
        class: "chip" + (s.id === state.styleId ? " active" : ""),
        type: "button",
        onclick: () => { state.styleId = s.id; renderStyleChips(); }
      }, el("span", { class: "swatch", style: `background:${s.tint}` }), el("span", { text: nameOf(s) })));
    }
  }

  function bindSegmented(id, key, onChange) {
    const seg = $(id);
    const sync = () => seg.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.v === state[key]));
    seg.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      state[key] = b.dataset.v;
      sync();
      onChange && onChange();
    });
    sync();
  }

  function openPrices() {
    const cur = $("#currency");
    cur.innerHTML = "";
    for (const c of CURRENCIES) cur.append(el("option", { value: c, text: c }));
    cur.value = settings.currency;
    $("#feePct").value = settings.feePct;
    $("#vatPct").value = settings.vatPct;
    const tbody = $("#priceTable tbody");
    tbody.innerHTML = "";
    for (const item of DEFAULT_PRICES) {
      tbody.append(el("tr", {},
        el("td", { text: nameOf(item) }),
        el("td", { class: "unit", text: unitLabel(item.unit) }),
        el("td", { class: "num-col" }, el("input", {
          type: "number", min: "0", step: "1", value: String(priceOf(item.id)), inputmode: "decimal", "aria-label": nameOf(item),
          onchange: e => {
            const p = settings.prices.find(x => x.id === item.id);
            if (p) p.price = Math.max(0, parseFloat(e.target.value) || 0);
            else settings.prices.push({ id: item.id, price: Math.max(0, parseFloat(e.target.value) || 0) });
            settings.pricesEdited = true;
            saveSettings(); renderBudget();
          }
        }))
      ));
    }
    $("#dlgPrices").showModal();
  }

  function openStudio() {
    const s = settings.studio;
    $("#stName").value = s.name; $("#stDesigner").value = s.designer;
    $("#stPhone").value = s.phone; $("#stEmail").value = s.email;
    $("#stAccess").value = settings.accessCode || "";
    renderLogoPreview();
    $("#dlgStudio").showModal();
  }

  function renderLogoPreview() {
    const box = $("#logoPreview");
    box.innerHTML = "";
    if (settings.studio.logo) box.append(el("img", { src: settings.studio.logo, alt: "" }));
    else box.append(el("span", { text: t("noLogo") }));
  }

  /* ───────────── 9. PDF PROPOSAL ───────────── */

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function buildProposal() {
    const lang = $("#pdfLang").value;
    const T = (k, v) => t(k, v, lang);
    const studio = settings.studio;
    const active = activeRender();
    const alternatives = state.renders.filter(r => r !== active).slice(-3);
    const style = STYLES.find(s => s.id === (active ? active.styleId : state.styleId));
    const room = ROOMS.find(r => r.id === state.roomType);
    const d = dims();
    const tot = computeTotals();
    const date = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "long" }).format(new Date());
    const m = n => money(n, lang);
    const finishName = T({ economy: "fEconomy", standard: "fStandard", premium: "fPremium" }[state.finish]);

    const rows = tot.rows.map(r => `
      <tr><td>${esc(nameOf(r.item, lang))}</td>
      <td class="c">${r.qty} ${esc(unitLabel(r.item.unit, lang))}</td>
      <td class="n">${m(r.unitPrice)}</td><td class="n">${m(r.amount)}</td></tr>`).join("");

    const p = $("#proposal");
    p.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    p.setAttribute("lang", lang);
    p.innerHTML = `
      <header class="pp-head">
        <div class="pp-studio">
          ${studio.logo ? `<img class="pp-logo" src="${studio.logo}" alt="">` : ""}
          <div>
            <div class="pp-studio-name">${esc(studio.name || "Your Studio")}</div>
            <div class="pp-contact">${[studio.designer, studio.phone, studio.email].filter(Boolean).map(esc).join(" · ")}</div>
          </div>
        </div>
        <div class="pp-date">${esc(T("pDate"))}: ${esc(date)}</div>
      </header>

      <h1 class="pp-title">${esc(T("pTitle"))}</h1>
      <div class="pp-meta">
        <div><span>${esc(T("pPreparedFor"))}</span><strong>${esc($("#clientName").value || "—")}</strong></div>
        <div><span>${esc(T("pProject"))}</span><strong>${esc($("#projectName").value || "—")}</strong></div>
        <div><span>${esc(T("pRoom"))}</span><strong>${esc(nameOf(room, lang))} · ${round1(d.L * d.W)} m²</strong></div>
        <div><span>${esc(T("pStyle"))}</span><strong>${esc(style ? nameOf(style, lang) : "—")} · ${esc(finishName)}</strong></div>
      </div>

      <section class="pp-visuals">
        ${active ? `<figure class="pp-hero"><img src="${active.src}" alt=""><figcaption>${esc(T("pProposed"))}</figcaption></figure>` : ""}
        <figure class="pp-before"><img src="${state.original.src}" alt=""><figcaption>${esc(T("pBefore"))}</figcaption></figure>
      </section>
      ${alternatives.length ? `
      <section class="pp-alts">
        <h2>${esc(T("pAlternatives"))}</h2>
        <div class="pp-alt-grid">${alternatives.map(r => {
          const s = STYLES.find(x => x.id === r.styleId);
          return `<figure><img src="${r.src}" alt=""><figcaption>${esc(s ? nameOf(s, lang) : "")}</figcaption></figure>`;
        }).join("")}</div>
      </section>` : ""}

      <section class="pp-costs">
        <h2>${esc(T("pBreakdown"))}</h2>
        <table>
          <thead><tr><th>${esc(T("item"))}</th><th class="c">${esc(T("qty"))}</th><th class="n">${esc(T("price"))}</th><th class="n">${esc(T("amount"))}</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr><td colspan="3">${esc(T("subtotal"))}</td><td class="n">${m(tot.subtotal)}</td></tr>
            <tr><td colspan="3">${esc(T("fee"))} (${settings.feePct || 0}%)</td><td class="n">${m(tot.fee)}</td></tr>
            ${settings.vatPct ? `<tr><td colspan="3">${esc(T("vat"))} (${settings.vatPct}%)</td><td class="n">${m(tot.vat)}</td></tr>` : ""}
            <tr class="grand"><td colspan="3">${esc(T("total"))}</td><td class="n">${m(tot.total)}</td></tr>
          </tfoot>
        </table>
      </section>

      ${$("#propNotes").value.trim() ? `<section class="pp-notes"><h2>${esc(T("pNotes"))}</h2><p>${esc($("#propNotes").value.trim())}</p></section>` : ""}

      <footer class="pp-foot">
        <p>${esc(T("pValid", { d: Math.max(1, parseInt($("#validity").value, 10) || 14) }))}</p>
        <p>${esc(T("pVisual"))}</p>
        <div class="pp-sign">
          <div><span></span>${esc(T("pSignClient"))}</div>
          <div><span></span>${esc(T("pSignDesigner"))}</div>
        </div>
      </footer>`;
  }

  async function exportPdf() {
    if (!state.original) return toast(t("needPhoto"));
    buildProposal();
    // Wait for every image in the proposal to decode before printing.
    await Promise.all([...$("#proposal").querySelectorAll("img")].map(img => img.decode().catch(() => {})));
    const prevTitle = document.title;
    const client = $("#clientName").value.trim();
    document.title = `Proposal${client ? " - " + client : ""} - ${settings.studio.name || "RoomPitch"}`;
    window.print();
    setTimeout(() => { document.title = prevTitle; }, 500);
  }

  /* ───────────── UTIL ───────────── */

  let toastHandle = null;
  function toast(msg) {
    const n = $("#toast");
    n.textContent = msg;
    n.classList.add("show");
    clearTimeout(toastHandle);
    toastHandle = setTimeout(() => n.classList.remove("show"), 4200);
  }

  /* ───────────── WIRING ───────────── */

  function init() {
    // Photo
    $("#fileInput").addEventListener("change", e => handlePhoto(e.target.files[0]));
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", e => handlePhoto(e.dataTransfer.files[0]));

    // Room
    $("#roomType").addEventListener("change", e => { state.roomType = e.target.value; buildLines(); renderBudget(); });
    ["#dimL", "#dimW", "#dimH"].forEach(id => $(id).addEventListener("input", () => { refreshAutoQty(); renderBudget(); }));

    // Style + generate
    bindSegmented("#preserveSeg", "preserve");
    bindSegmented("#finishSeg", "finish", renderBudget);
    $("#btnGenerate").addEventListener("click", () => generate([state.styleId]));
    $("#btnThree").addEventListener("click", () => {
      const i = STYLES.findIndex(s => s.id === state.styleId);
      generate([0, 1, 2].map(k => STYLES[(i + k) % STYLES.length].id));
    });

    // Compare slider
    $("#compare").addEventListener("input", e => setComparePos(e.target.value));

    // Brush editing
    $("#btnEditMode").addEventListener("click", enterEditMode);
    $("#btnCancelEdit").addEventListener("click", exitEditMode);
    $("#btnClearMask").addEventListener("click", clearMask);
    $("#btnApplyEdit").addEventListener("click", applyEdit);
    $("#editPrompt").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); applyEdit(); } });
    const bc = $("#brushCanvas");
    bc.addEventListener("pointerdown", e => {
      if (!state.editMode) return;
      bc.setPointerCapture(e.pointerId);
      mask.drawing = true; mask.last = null;
      paintTo(pointerToMask(e)); queueOverlay();
    });
    bc.addEventListener("pointermove", e => {
      if (!mask.drawing) return;
      paintTo(pointerToMask(e)); queueOverlay();
    });
    const stop = () => { mask.drawing = false; mask.last = null; };
    bc.addEventListener("pointerup", stop);
    bc.addEventListener("pointercancel", stop);
    window.addEventListener("resize", () => { if (state.editMode) sizeBrushCanvas(); });

    // Dialogs
    $("#btnPrices").addEventListener("click", openPrices);
    $("#btnStudio").addEventListener("click", openStudio);
    $("#currency").addEventListener("change", e => { settings.currency = e.target.value; saveSettings(); renderBudget(); });
    $("#feePct").addEventListener("input", e => { settings.feePct = Math.max(0, parseFloat(e.target.value) || 0); saveSettings(); renderBudget(); });
    $("#vatPct").addEventListener("input", e => { settings.vatPct = Math.max(0, parseFloat(e.target.value) || 0); saveSettings(); renderBudget(); });
    $("#btnResetPrices").addEventListener("click", () => {
      settings.prices = DEFAULT_PRICES.map(p => ({ id: p.id, price: p.price }));
      settings.pricesEdited = false;
      saveSettings(); openPrices(); renderBudget();
    });
    const studioField = (id, key) => $(id).addEventListener("input", e => { settings.studio[key] = e.target.value; saveSettings(); });
    studioField("#stName", "name"); studioField("#stDesigner", "designer");
    studioField("#stPhone", "phone"); studioField("#stEmail", "email");
    $("#stAccess").addEventListener("input", e => { settings.accessCode = e.target.value; saveSettings(); });
    $("#logoInput").addEventListener("change", async e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = await fileToResizedDataUrl(f, 360, "image/png");
      settings.studio.logo = r.src; saveSettings(); renderLogoPreview();
    });
    $("#btnRemoveLogo").addEventListener("click", () => { settings.studio.logo = ""; saveSettings(); renderLogoPreview(); });

    // Language
    $("#btnLang").addEventListener("click", () => { settings.lang = settings.lang === "ar" ? "en" : "ar"; saveSettings(); applyLang(); });
    $("#pdfLang").addEventListener("change", e => { e.target.dataset.touched = "1"; });

    // PDF
    $("#btnPdf").addEventListener("click", exportPdf);

    buildLines();
    applyLang();

    // Ask the server whether a real AI key is configured.
    fetch("api/generate").then(r => r.json()).then(d => setAiEnabled(!!d.aiEnabled)).catch(() => {});
  }

  init();
})();
