/* Maleta — checklist de equipaje por escapada.
   Datos: se guardan en este dispositivo (localStorage) y se sincronizan con /api/data (Netlify Blobs). */
(() => {
  "use strict";

  const API = "/api/data";
  const LS_STATE = "maleta.state.v1";
  const LS_PIN = "maleta.pin";
  const LS_PREFS = "maleta.prefs";
  const POLL_MS = 20000;

  // ---------- Iconos ----------
  const I = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h8"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.7L3 8"/><path d="M3 3v5h5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 5.1A10.4 10.4 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-2.2 3.2M6.6 6.6A17.6 17.6 0 002 12s3.5 7 10 7a9.7 9.7 0 005.4-1.6M3 3l18 18M9.9 9.9a3 3 0 004.2 4.2"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20l5-5 5 5M7 4l5 5 5-5"/></svg>',
  };

  const TRIP_EMOJIS = ["🏖️","🏔️","🏙️","🏕️","✈️","🚗","🚆","⛷️","🌴","🏝️","🗺️","🎒","🌍","🚲","⛺","🏰","🎉","💼","❤️","🎿","🛳️","🌋","🍷","🎡"];
  const GROUP_EMOJIS = ["👕","👖","🧥","👟","🧦","🩲","🩱","🕶️","🧢","🧴","🪥","💊","🩹","📄","🛂","💳","🔌","📱","🎧","💻","📷","🔋","🏖️","☂️","🎒","🍫","📚","🎮","🧸","🍼","🐶","🥾","🧤","🧣","⛺","🧳","🗝️","💄","🏊","🚗","📦","✨"];
  const EMOJI_HINTS = [
    [/ropa|vestir|prendas/i, "👕"], [/calzado|zapat|zapa/i, "👟"], [/aseo|higiene|baño|neceser/i, "🧴"],
    [/medic|botiqu|salud|farmac/i, "💊"], [/document|papel|viaje|reserva/i, "📄"], [/electr|tecno|cargad|gadget/i, "🔌"],
    [/playa|piscina|sol/i, "🏖️"], [/monta|trek|senderi|camping|acampa/i, "🥾"], [/nieve|esqu|frío|frio/i, "🧤"],
    [/niñ|bebé|bebe|peque/i, "🧸"], [/comida|snack|picar|cocina/i, "🍫"], [/libro|lectura|ocio|jueg/i, "📚"],
    [/perro|mascota|gato/i, "🐶"], [/maquill|belleza/i, "💄"], [/coche|auto/i, "🚗"], [/casa|antes de salir|hogar/i, "🗝️"],
    [/dinero|pago|tarjeta/i, "💳"], [/foto|cámara|camara/i, "📷"], [/deporte|gym|nadar/i, "🏊"],
  ];
  const guessEmoji = (name) => (EMOJI_HINTS.find(([re]) => re.test(name)) || [, "📦"])[1];

  const TEMPLATES = {
    basica: [
      ["Documentos", "📄", ["DNI / Pasaporte", "Tarjetas y algo de efectivo", "Reservas (alojamiento, transporte)", "Tarjeta sanitaria / seguro"]],
      ["Ropa", "👕", ["Camisetas", "Pantalones", "Ropa interior", "Calcetines", "Pijama", "Chaqueta o sudadera", "Calzado cómodo"]],
      ["Aseo", "🧴", ["Cepillo y pasta de dientes", "Desodorante", "Champú y gel", "Peine / cepillo", "Medicinas habituales"]],
      ["Electrónica", "🔌", ["Móvil", "Cargador", "Auriculares", "Batería externa"]],
      ["Antes de salir", "🗝️", ["Cerrar ventanas y gas", "Sacar la basura", "Llaves de casa"]],
    ],
    playa: [
      ["Documentos", "📄", ["DNI / Pasaporte", "Tarjetas y algo de efectivo", "Reservas"]],
      ["Ropa", "👕", ["Camisetas", "Pantalones cortos", "Ropa interior", "Pijama", "Algo de abrigo para la noche"]],
      ["Playa", "🏖️", ["Bañador", "Toalla de playa", "Crema solar", "Chanclas", "Gafas de sol", "Gorra o sombrero", "After sun"]],
      ["Aseo", "🧴", ["Cepillo y pasta de dientes", "Desodorante", "Champú y gel", "Medicinas habituales"]],
      ["Electrónica", "🔌", ["Móvil", "Cargador", "Auriculares"]],
    ],
    montana: [
      ["Documentos", "📄", ["DNI", "Tarjetas y algo de efectivo", "Reservas / refugio"]],
      ["Ropa", "🧥", ["Capa térmica", "Forro polar", "Chaqueta impermeable", "Pantalón de montaña", "Calcetines técnicos", "Gorro y guantes"]],
      ["Equipo", "🥾", ["Botas", "Mochila", "Bastones", "Frontal", "Cantimplora", "Mapa / track descargado"]],
      ["Botiquín", "💊", ["Tiritas y apósitos", "Analgésicos", "Crema solar", "Protector labial"]],
      ["Comida", "🍫", ["Frutos secos", "Barritas", "Bocadillos"]],
    ],
  };

  // ---------- Utilidades ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clampText = (s, n = 200) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

  // ---------- Estado ----------
  let state = loadLocal();
  let prefs = (() => { try { return JSON.parse(localStorage.getItem(LS_PREFS)) || {}; } catch { return {}; } })();
  let syncStatus = "saving";
  let pendingRemoteRender = false;
  let focusAfterRender = null;

  function loadLocal() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_STATE));
      if (s && Array.isArray(s.trips)) return { trips: s.trips, deleted: s.deleted || {} };
    } catch {}
    return { trips: [], deleted: {} };
  }
  function saveLocal() {
    try { localStorage.setItem(LS_STATE, JSON.stringify(state)); } catch {}
  }
  function savePrefs() {
    try { localStorage.setItem(LS_PREFS, JSON.stringify(prefs)); } catch {}
  }

  // Misma lógica que en el servidor: por cada escapada gana la versión más reciente.
  function mergeStates(a, b) {
    const deleted = {};
    const now = Date.now();
    for (const src of [a?.deleted || {}, b?.deleted || {}]) {
      for (const [id, t] of Object.entries(src)) {
        if (typeof t === "number" && now - t < 1000 * 60 * 60 * 24 * 180) deleted[id] = Math.max(deleted[id] || 0, t);
      }
    }
    const byId = new Map();
    for (const t of [...(a?.trips || []), ...(b?.trips || [])]) {
      if (!t || typeof t.id !== "string") continue;
      const cur = byId.get(t.id);
      if (!cur || (t.updatedAt || 0) > (cur.updatedAt || 0)) byId.set(t.id, t);
    }
    const trips = [...byId.values()]
      .filter((t) => !(deleted[t.id] >= (t.updatedAt || 0)))
      .sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
    const sortedDeleted = Object.fromEntries(Object.entries(deleted).sort(([x], [y]) => (x < y ? -1 : 1)));
    return { trips, deleted: sortedDeleted };
  }
  const signature = (s) =>
    (s.trips || []).map((t) => t.id + ":" + (t.updatedAt || 0)).join(",") + "|" +
    Object.entries(s.deleted || {}).map(([k, v]) => k + ":" + v).join(",");

  const findTrip = (id) => state.trips.find((t) => t.id === id);
  const findGroup = (trip, gid) => trip.groups.find((g) => g.id === gid);

  // Cada cambio local pasa por aquí.
  let lastStamp = 0;
  function commit(trip, { render: doRender = true } = {}) {
    if (trip) {
      const now = Math.max(Date.now(), lastStamp + 1);
      lastStamp = now;
      trip.updatedAt = now;
    }
    saveLocal();
    schedulePush();
    if (doRender) render();
  }

  function stats(trip) {
    let total = 0, done = 0;
    for (const g of trip.groups) for (const i of g.items) { total++; if (i.done) done++; }
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function makeGroups(spec) {
    return spec.map(([name, emoji, items]) => ({
      id: uid(), name, emoji, collapsed: false,
      items: items.map((text) => ({ id: uid(), text, done: false })),
    }));
  }
  function copyGroups(trip) {
    return trip.groups.map((g) => ({
      id: uid(), name: g.name, emoji: g.emoji, collapsed: false,
      items: g.items.map((i) => ({ id: uid(), text: i.text, done: false })),
    }));
  }

  // ---------- Sincronización ----------
  let pushTimer = null, inflight = false, pushQueued = false, retryTimer = null;

  async function api(method, body) {
    const res = await fetch(API, {
      method,
      cache: "no-store",
      headers: { "content-type": "application/json", "x-app-pin": localStorage.getItem(LS_PIN) || "" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = new Error("HTTP " + res.status);
      err.status = res.status;
      throw err;
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) { const e = new Error("no json"); e.status = 404; throw e; }
    return res.json();
  }

  function setSync(s) {
    syncStatus = s;
    const el = $(".sync");
    if (!el) return;
    el.dataset.s = s;
    const labels = { ok: "Sincronizado", saving: "Guardando…", offline: "Sin conexión", error: "Error al sincronizar", local: "Solo en este dispositivo", pin: "Falta el PIN" };
    $(".label", el).textContent = labels[s] || "";
    el.title = s === "offline" ? "Los cambios se guardan en este dispositivo y se subirán al recuperar la conexión" :
               s === "local" ? "No se encontró el servidor: los datos solo se guardan en este navegador" : labels[s] || "";
  }

  function handleSyncError(err) {
    if (err.status === 401) { setSync("pin"); askPin(); return; }
    if (err.status === 404) { setSync("local"); return; }
    setSync(navigator.onLine ? "error" : "offline");
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => push(), 8000);
  }

  function adoptRemote(remote) {
    const before = signature(state);
    state = mergeStates(state, remote);
    saveLocal();
    if (signature(state) !== before) remoteRender();
    return signature(state) !== signature(mergeStates(remote, { trips: [], deleted: {} }));
  }

  async function pull() {
    if (inflight) return;
    try {
      const { state: remote } = await api("GET");
      const needsPush = adoptRemote(remote || { trips: [], deleted: {} });
      if (needsPush) schedulePush(0); else setSync("ok");
    } catch (e) { handleSyncError(e); }
  }

  function schedulePush(delay = 600) {
    setSync(syncStatus === "local" ? "local" : "saving");
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, delay);
  }

  async function push() {
    if (inflight) { pushQueued = true; return; }
    inflight = true;
    try {
      const { state: remote } = await api("PUT", { state });
      const needsPush = adoptRemote(remote);
      if (needsPush) pushQueued = true; else setSync("ok");
    } catch (e) { handleSyncError(e); }
    inflight = false;
    if (pushQueued) { pushQueued = false; schedulePush(300); }
  }

  function remoteRender() {
    if (isEditing()) { pendingRemoteRender = true; return; }
    render();
  }
  function isEditing() {
    const a = document.activeElement;
    return a && (a.tagName === "INPUT" || a.tagName === "SELECT") || document.body.classList.contains("dragging") || !!$(".modal");
  }
  document.addEventListener("focusout", () => {
    setTimeout(() => { if (pendingRemoteRender && !isEditing()) { pendingRemoteRender = false; render(); } }, 50);
  });

  // ---------- Router ----------
  const route = () => {
    const m = location.hash.match(/^#\/e\/([\w-]+)/);
    return m ? { view: "trip", id: m[1] } : { view: "home" };
  };
  window.addEventListener("hashchange", () => { closeOverlays(); render(); window.scrollTo(0, 0); });

  // ---------- Render ----------
  const app = $("#app");
  function render() {
    const r = route();
    if (r.view === "trip") {
      const trip = findTrip(r.id);
      if (!trip) { location.hash = ""; return; }
      renderTrip(trip);
    } else renderHome();
    setSync(syncStatus);
    if (focusAfterRender) {
      const el = $(focusAfterRender);
      focusAfterRender = null;
      if (el) el.focus({ preventScroll: false });
    }
  }

  const syncPill = () => `<div class="sync" data-s="${syncStatus}"><span class="dot"></span><span class="label"></span></div>`;
  const bar = (pct) => `<div class="bar ${pct === 100 ? "full" : ""}"><span style="width:${pct}%"></span></div>`;

  function renderHome() {
    document.title = "Maleta · Checklist de viaje";
    const trips = state.trips;
    const cards = trips.map((t) => {
      const s = stats(t);
      return `
        <div class="trip-card ${s.total && s.done === s.total ? "done-all" : ""}" role="link" tabindex="0" data-act="open-trip" data-id="${t.id}">
          <button class="icon-btn menu-btn" data-act="trip-menu" data-id="${t.id}" aria-label="Opciones">${I.dots}</button>
          <div class="t-emoji">${esc(t.emoji || "🧳")}</div>
          <div>
            <div class="t-name">${esc(t.name)}</div>
            ${t.when ? `<div class="t-when">${esc(t.when)}</div>` : ""}
          </div>
          <div class="t-foot">
            <div class="t-stat"><span>${s.total ? `${s.done} de ${s.total} listos` : "Sin ítems todavía"}</span><span>${s.total ? s.pct + "%" : ""}</span></div>
            ${bar(s.pct)}
          </div>
        </div>`;
    }).join("");

    app.innerHTML = `
      <header class="topbar">
        <div class="brand"><span class="brand-mark">🧳</span>Maleta</div>
        ${syncPill()}
      </header>
      <main>
        <section class="hero">
          <h1>Tus escapadas</h1>
          <p>Prepara la maleta sin olvidarte de nada.</p>
        </section>
        ${trips.length ? `
          <div class="trips">
            <button class="trip-card new" data-act="new-trip"><span class="plus">+</span>Nueva escapada</button>
            ${cards}
          </div>` : `
          <div class="empty">
            <div class="big">🗺️</div>
            <h2>Aún no hay escapadas</h2>
            <p>Crea la primera y empieza a llenar la maleta.</p>
            <p style="margin-top:20px"><button class="btn primary" data-act="new-trip">${I.plus} Nueva escapada</button></p>
          </div>`}
      </main>`;
  }

  function renderTrip(trip) {
    document.title = `${trip.name} · Maleta`;
    const s = stats(trip);
    const hideDone = !!prefs.hideDone;
    const groups = trip.groups.map((g) => {
      const done = g.items.filter((i) => i.done).length;
      const full = g.items.length > 0 && done === g.items.length;
      const pct = g.items.length ? (done / g.items.length) * 100 : 0;
      const items = g.items.map((i) => `
        <li class="item ${i.done ? "done" : ""}" data-iid="${i.id}">
          <span class="handle" aria-label="Arrastrar para mover">${I.grip}</span>
          <button class="check" data-act="toggle" aria-label="${i.done ? "Desmarcar" : "Marcar"}">${I.check}</button>
          <span class="text" data-act="edit-item">${esc(i.text)}</span>
          <button class="icon-btn del" data-act="del-item" aria-label="Eliminar">${I.x}</button>
        </li>`).join("");
      return `
        <section class="group ${g.collapsed ? "collapsed" : ""}" data-gid="${g.id}">
          <div class="group-head">
            <span class="handle g-handle" aria-label="Arrastrar grupo">${I.grip}</span>
            <button class="emoji-btn" data-act="group-emoji" aria-label="Cambiar icono">${esc(g.emoji || "📦")}</button>
            <span class="group-name editable" data-act="rename-group">${esc(g.name)}</span>
            <span class="count ${full ? "full" : ""}">${done}/${g.items.length}</span>
            <button class="icon-btn" data-act="collapse" aria-label="${g.collapsed ? "Desplegar" : "Plegar"}">${I.chev}</button>
            <button class="icon-btn" data-act="group-menu" aria-label="Opciones del grupo">${I.dots}</button>
          </div>
          <div class="group-progress ${full ? "full" : ""}"><span style="width:${pct}%"></span></div>
          <div class="group-body">
            <ul class="items" data-gid="${g.id}">${items}</ul>
            ${!g.items.length ? `<div class="empty-group">Grupo vacío: añade ítems o arrástralos aquí.</div>` : ""}
            ${hideDone && g.items.length && full ? `<div class="empty-group">✓ Todo listo en este grupo</div>` : ""}
            <form class="add-item" data-gid="${g.id}" autocomplete="off">
              <input name="text" placeholder="Añadir ítem…" enterkeyhint="done" aria-label="Añadir ítem a ${esc(g.name)}">
            </form>
          </div>
        </section>`;
    }).join("");

    app.innerHTML = `
      <header class="topbar">
        <a class="back" href="#">${I.back}Escapadas</a>
        ${syncPill()}
      </header>
      <main class="trip-view ${hideDone ? "hide-done" : ""}">
        <div class="trip-head">
          <button class="emoji-btn" data-act="trip-emoji" aria-label="Cambiar icono">${esc(trip.emoji || "🧳")}</button>
          <div class="titles">
            <h1 class="trip-title editable" data-act="rename-trip">${esc(trip.name)}</h1>
            <span class="trip-when editable ${trip.when ? "" : "placeholder"}" data-act="edit-when">${esc(trip.when || "Añadir fechas o nota…")}</span>
          </div>
          <button class="icon-btn" data-act="trip-menu" data-id="${trip.id}" aria-label="Opciones">${I.dots}</button>
        </div>
        <div class="summary">${bar(s.pct)}<span class="pct">${s.done}/${s.total} · ${s.pct}%</span></div>
        ${s.total && s.done === s.total ? `<div class="celebrate">🎉 ¡Maleta lista! Buen viaje.</div>` : ""}
        <div class="toolbar">
          <button class="btn primary" data-act="add-group">${I.plus} Grupo</button>
          <button class="btn ${hideDone ? "on" : ""}" data-act="hide-done">${hideDone ? I.eyeOff : I.eye} ${hideDone ? "Mostrando pendientes" : "Ocultar hechos"}</button>
          <button class="btn ghost collapse-all" data-act="collapse-all" title="Plegar / desplegar todos los grupos">${I.collapse}<span class="lbl">${trip.groups.every((g) => g.collapsed) ? "Desplegar" : "Plegar"} todo</span></button>
        </div>
        <div class="groups" id="groups">${groups}</div>
        ${trip.groups.length ? "" : `
          <div class="empty">
            <div class="big">🧳</div>
            <h2>Maleta vacía</h2>
            <p>Crea grupos como «Ropa», «Aseo» o «Documentos» y añade lo que necesitas.</p>
          </div>`}
        <button class="btn add-group-big" data-act="add-group">${I.plus} Añadir grupo</button>
      </main>`;

    setupSortable(trip);
  }

  // ---------- Arrastrar y soltar ----------
  // Implementación propia con Pointer Events (ratón y táctil), sin dependencias.
  function setupSortable(trip) {
    $$(".handle", app).forEach((h) => h.addEventListener("pointerdown", (e) => startDrag(e, h, trip)));
  }

  function startDrag(e, handle, trip) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    if (handle.hasPointerCapture && handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    const isGroup = handle.classList.contains("g-handle");
    const el = handle.closest(isGroup ? ".group" : ".item");
    const groupsEl = $("#groups");
    let x = e.clientX, y = e.clientY, started = false, clone, offX = 0, offY = 0, raf = 0;

    const begin = () => {
      started = true;
      document.body.classList.add("dragging", isGroup ? "dragging-groups" : "dragging-items");
      let r = el.getBoundingClientRect();
      offX = x - r.left;
      offY = y - r.top;
      if (isGroup) {
        // Al arrastrar grupos se pliegan todos: recolocamos el scroll para que el grupo siga bajo el dedo
        const nr = el.getBoundingClientRect();
        offY = Math.min(offY, nr.height / 2);
        window.scrollBy(0, nr.top + offY - y);
        r = el.getBoundingClientRect();
      }
      clone = el.cloneNode(true);
      clone.classList.add("drag-clone");
      clone.style.width = r.width + "px";
      document.body.appendChild(clone);
      el.classList.add("is-ghost");
      if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
      paint();
      raf = requestAnimationFrame(tick);
    };

    const paint = () => { clone.style.transform = `translate(${x - offX}px, ${y - offY}px) rotate(.8deg)`; };

    const reposition = () => {
      const gr = groupsEl.getBoundingClientRect();
      if (isGroup) {
        const others = $$(":scope > .group", groupsEl).filter((g) => g !== el);
        const before = others.find((g) => { const r = g.getBoundingClientRect(); return y < r.top + r.height / 2; });
        if (before) { if (el.nextElementSibling !== before) groupsEl.insertBefore(el, before); }
        else if (groupsEl.lastElementChild !== el) groupsEl.appendChild(el);
        return;
      }
      const probeX = Math.min(Math.max(x, gr.left + 12), gr.right - 12);
      const under = document.elementFromPoint(probeX, y);
      const grp = under && under.closest(".group");
      if (!grp || !groupsEl.contains(grp)) return;
      const ul = $(".items", grp);
      const lis = [...ul.children].filter((li) => li !== el && li.offsetParent !== null);
      const before = lis.find((li) => { const r = li.getBoundingClientRect(); return y < r.top + r.height / 2; });
      if (before) { if (el.nextElementSibling !== before) ul.insertBefore(el, before); }
      else if (lis.length) { const last = lis[lis.length - 1]; if (last.nextElementSibling !== el) last.after(el); }
      else if (el.parentNode !== ul) ul.appendChild(el);
    };

    const tick = () => {
      const edge = 90;
      let dy = 0;
      if (y < edge) dy = -Math.ceil((edge - y) / 5);
      else if (y > innerHeight - edge) dy = Math.ceil((y - (innerHeight - edge)) / 5);
      if (dy) { window.scrollBy(0, dy); reposition(); }
      raf = requestAnimationFrame(tick);
    };

    const onMove = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      x = ev.clientX; y = ev.clientY;
      if (!started) {
        if (Math.hypot(x - e.clientX, y - e.clientY) < 4) return;
        begin();
      }
      ev.preventDefault();
      paint();
      reposition();
    };
    const onUp = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (!started) return;
      cancelAnimationFrame(raf);
      clone.remove();
      el.classList.remove("is-ghost");
      document.body.classList.remove("dragging", "dragging-groups", "dragging-items");
      orderFromDom(trip);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function orderFromDom(trip) {
    const items = new Map();
    trip.groups.forEach((g) => g.items.forEach((i) => items.set(i.id, i)));
    const groups = new Map(trip.groups.map((g) => [g.id, g]));
    const before = JSON.stringify(trip.groups.map((g) => [g.id, g.items.map((i) => i.id)]));
    const next = $$("#groups > .group").map((sec) => {
      const g = groups.get(sec.dataset.gid);
      g.items = $$(".items > li", sec).map((li) => items.get(li.dataset.iid)).filter(Boolean);
      return g;
    });
    // Seguridad: no perder nada si el DOM no coincide
    const seen = new Set(next.flatMap((g) => g.items.map((i) => i.id)));
    if (next.length !== trip.groups.length || seen.size !== items.size) { render(); return; }
    trip.groups = next;
    if (JSON.stringify(trip.groups.map((g) => [g.id, g.items.map((i) => i.id)])) !== before) commit(trip);
    else render();
  }

  // ---------- Edición en línea ----------
  function inlineEdit(el, value, onSave, { placeholder = "", allowEmpty = false } = {}) {
    const input = document.createElement("input");
    input.className = "inline-input";
    input.value = value;
    input.placeholder = placeholder;
    input.maxLength = 200;
    const cs = getComputedStyle(el);
    input.style.fontSize = cs.fontSize;
    input.style.fontWeight = cs.fontWeight;
    input.style.fontFamily = cs.fontFamily;
    el.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const v = clampText(input.value);
      if (save && (v || allowEmpty) && v !== value) onSave(v);
      else render();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  }

  // ---------- Popovers, modales, toasts ----------
  const overlayRoot = $("#overlay-root");
  function closeOverlays() { overlayRoot.innerHTML = ""; }

  function popover(anchor, html, onClick) {
    closeOverlays();
    const back = document.createElement("div");
    back.className = "backdrop clear";
    const pop = document.createElement("div");
    pop.className = "popover";
    pop.innerHTML = html;
    overlayRoot.append(back, pop);
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.min(Math.max(8, r.right - pw), innerWidth - pw - 8);
    if (r.left + pw < innerWidth - 8 && r.right - pw < 8) left = r.left;
    let top = r.bottom + 6;
    if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    back.addEventListener("click", closeOverlays);
    pop.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      closeOverlays();
      onClick(b.dataset.v);
    });
  }

  function menu(anchor, entries, onPick) {
    popover(anchor, entries.map(([v, icon, label, cls]) =>
      `<button class="mi ${cls || ""}" data-v="${v}">${icon}${esc(label)}</button>`).join(""), onPick);
  }

  function emojiPicker(anchor, list, current, onPick) {
    popover(anchor, `<div class="emoji-grid">${list.map((e) =>
      `<button data-v="${esc(e)}" class="${e === current ? "sel" : ""}">${e}</button>`).join("")}</div>`, onPick);
  }

  function modal(html, onMount) {
    closeOverlays();
    const back = document.createElement("div");
    back.className = "backdrop";
    const m = document.createElement("div");
    m.className = "modal";
    m.setAttribute("role", "dialog");
    m.innerHTML = html;
    overlayRoot.append(back, m);
    const close = () => { closeOverlays(); if (pendingRemoteRender) { pendingRemoteRender = false; render(); } };
    back.addEventListener("click", close);
    m.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    $$("[data-close]", m).forEach((b) => b.addEventListener("click", close));
    onMount && onMount(m, close);
    const first = $("input[type=text], input[type=password]", m);
    if (first) setTimeout(() => first.focus(), 30);
  }

  function confirmDialog({ title, text, ok = "Eliminar", danger = true }, onOk) {
    modal(`
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
      <div class="modal-actions">
        <button class="btn ghost" data-close>Cancelar</button>
        <button class="btn ${danger ? "danger" : "primary"}" data-ok>${esc(ok)}</button>
      </div>`, (m, close) => {
      $("[data-ok]", m).addEventListener("click", () => { close(); onOk(); });
      setTimeout(() => $("[data-ok]", m).focus(), 30);
    });
  }

  function toast(msg, { undo, ms = 5000 } = {}) {
    const root = $("#toast-root");
    root.innerHTML = "";
    const t = document.createElement("div");
    t.className = "toast" + (undo ? "" : " plain");
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? "<button>Deshacer</button>" : ""}`;
    root.append(t);
    const timer = setTimeout(() => t.remove(), ms);
    if (undo) $("button", t).addEventListener("click", () => { clearTimeout(timer); t.remove(); undo(); });
  }

  // Deshacer: guarda una copia de la escapada antes de un cambio destructivo
  function withUndo(trip, msg, mutate) {
    const snapshot = clone(trip.groups);
    mutate();
    commit(trip);
    toast(msg, {
      undo: () => {
        const t = findTrip(trip.id);
        if (!t) return;
        t.groups = snapshot;
        commit(t);
      },
    });
  }

  // ---------- Diálogos ----------
  function newTripDialog() {
    let emoji = "✈️";
    const others = state.trips;
    modal(`
      <h2>Nueva escapada</h2>
      <label class="field"><span>Nombre</span><input type="text" name="name" placeholder="Ej. Lisboa en diciembre" maxlength="80"></label>
      <label class="field"><span>Cuándo (opcional)</span><input type="text" name="when" placeholder="Ej. 5–8 dic · 3 noches" maxlength="80"></label>
      <div class="field"><span>Icono</span><div class="emoji-row">${TRIP_EMOJIS.slice(0, 16).map((e) =>
        `<button type="button" data-e="${e}" class="${e === emoji ? "sel" : ""}">${e}</button>`).join("")}</div></div>
      <div class="field"><span>Empezar con</span>
        <div class="choices">
          <label class="choice"><input type="radio" name="tpl" value="basica" checked><div><b>Lista básica</b><small>Documentos, ropa, aseo, electrónica…</small></div></label>
          <label class="choice"><input type="radio" name="tpl" value="playa"><div><b>Playa</b><small>Lo básico + bañador, crema, toalla…</small></div></label>
          <label class="choice"><input type="radio" name="tpl" value="montana"><div><b>Montaña</b><small>Capas, equipo, botiquín, comida</small></div></label>
          ${others.length ? `<label class="choice"><input type="radio" name="tpl" value="copy"><div style="flex:1"><b>Copiar de otra escapada</b><small>Mismos grupos e ítems, todo sin marcar</small>
            <select name="copyFrom">${others.map((t) => `<option value="${t.id}">${esc((t.emoji || "") + " " + t.name)}</option>`).join("")}</select></div></label>` : ""}
          <label class="choice"><input type="radio" name="tpl" value="blank"><div><b>En blanco</b><small>Empiezas desde cero</small></div></label>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" data-close>Cancelar</button>
        <button class="btn primary" data-ok>Crear escapada</button>
      </div>`, (m, close) => {
      let emojiChosen = false;
      const paintEmoji = () => $$(".emoji-row button", m).forEach((x) => x.classList.toggle("sel", x.dataset.e === emoji));
      $$(".emoji-row button", m).forEach((b) => b.addEventListener("click", () => {
        emoji = b.dataset.e; emojiChosen = true; paintEmoji();
      }));
      $$("input[name=tpl]", m).forEach((r) => r.addEventListener("change", () => {
        const auto = { playa: "🏖️", montana: "🏔️", basica: "✈️" }[r.value];
        if (!emojiChosen && auto) { emoji = auto; paintEmoji(); }
      }));
      const sel = $("select[name=copyFrom]", m);
      if (sel) sel.addEventListener("focus", () => { $("input[value=copy]", m).checked = true; });
      const create = () => {
        const name = clampText($("input[name=name]", m).value, 80);
        if (!name) { $("input[name=name]", m).focus(); return; }
        const tpl = $("input[name=tpl]:checked", m).value;
        let groups = [];
        if (TEMPLATES[tpl]) groups = makeGroups(TEMPLATES[tpl]);
        if (tpl === "copy" && sel) { const src = findTrip(sel.value); if (src) groups = copyGroups(src); }
        const trip = { id: uid(), name, emoji, when: clampText($("input[name=when]", m).value, 80), createdAt: Date.now(), updatedAt: 0, groups };
        state.trips.unshift(trip);
        close();
        commit(trip, { render: false });
        location.hash = "#/e/" + trip.id;
      };
      $("[data-ok]", m).addEventListener("click", create);
      $$("input[type=text]", m).forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") create(); }));
    });
  }

  function newGroupDialog(trip) {
    modal(`
      <h2>Nuevo grupo</h2>
      <label class="field"><span>Nombre del grupo</span><input type="text" name="name" placeholder="Ej. Ropa, Aseo, Para el coche…" maxlength="60"></label>
      <div class="field"><span>Icono</span><div class="emoji-row" id="gemo">${GROUP_EMOJIS.slice(0, 24).map((e) =>
        `<button type="button" data-e="${e}">${e}</button>`).join("")}</div></div>
      <div class="modal-actions">
        <button class="btn ghost" data-close>Cancelar</button>
        <button class="btn primary" data-ok>Añadir grupo</button>
      </div>`, (m, close) => {
      let emoji = null, auto = "📦";
      const input = $("input[name=name]", m);
      const paint = () => $$("#gemo button", m).forEach((x) => x.classList.toggle("sel", x.dataset.e === (emoji || auto)));
      input.addEventListener("input", () => { auto = guessEmoji(input.value); paint(); });
      $$("#gemo button", m).forEach((b) => b.addEventListener("click", () => { emoji = b.dataset.e; paint(); }));
      const create = () => {
        const name = clampText(input.value, 60);
        if (!name) { input.focus(); return; }
        const g = { id: uid(), name, emoji: emoji || auto, collapsed: false, items: [] };
        trip.groups.push(g);
        close();
        focusAfterRender = `.add-item[data-gid="${g.id}"] input`;
        commit(trip);
      };
      $("[data-ok]", m).addEventListener("click", create);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
    });
  }

  function askPin() {
    if ($(".modal")) return;
    modal(`
      <h2>Introduce el PIN</h2>
      <p>Esta Maleta está protegida. Escribe el PIN para ver y guardar tus escapadas en este dispositivo.</p>
      <label class="field"><span>PIN</span><input type="password" name="pin" autocomplete="current-password" inputmode="numeric"></label>
      <div class="modal-actions">
        <button class="btn ghost" data-close>Ahora no</button>
        <button class="btn primary" data-ok>Entrar</button>
      </div>`, (m, close) => {
      const go = () => {
        localStorage.setItem(LS_PIN, $("input[name=pin]", m).value.trim());
        close();
        setSync("saving");
        pull();
      };
      $("[data-ok]", m).addEventListener("click", go);
      $("input[name=pin]", m).addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  }

  // ---------- Acciones ----------
  function tripMenu(anchor, trip) {
    const s = stats(trip);
    const inTrip = route().view === "trip";
    menu(anchor, [
      ["rename", I.edit, "Renombrar"],
      ["duplicate", I.copy, "Duplicar escapada"],
      ...(s.done ? [["reset", I.reset, "Desmarcar todo"]] : []),
      ["delete", I.trash, "Eliminar escapada", "danger"],
    ], (v) => {
      if (v === "rename") {
        if (inTrip) $(".trip-title").click();
        else modal(`
          <h2>Renombrar</h2>
          <label class="field"><span>Nombre</span><input type="text" name="name" maxlength="80" value="${esc(trip.name)}"></label>
          <div class="modal-actions"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-ok>Guardar</button></div>`,
          (m, close) => {
            const save = () => { const n = clampText($("input", m).value, 80); if (n) { trip.name = n; close(); commit(trip); } };
            $("[data-ok]", m).addEventListener("click", save);
            $("input", m).addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
          });
      }
      if (v === "duplicate") {
        const copy = { id: uid(), name: trip.name + " (copia)", emoji: trip.emoji, when: "", createdAt: Date.now(), updatedAt: 0, groups: copyGroups(trip) };
        state.trips.unshift(copy);
        commit(copy, { render: false });
        location.hash = "#/e/" + copy.id;
        toast("Escapada duplicada");
      }
      if (v === "reset") {
        withUndo(trip, "Todo desmarcado", () => trip.groups.forEach((g) => g.items.forEach((i) => (i.done = false))));
      }
      if (v === "delete") {
        confirmDialog({ title: "¿Eliminar escapada?", text: `Se borrará «${trip.name}» con todos sus grupos e ítems, en todos tus dispositivos.` }, () => {
          const idx = state.trips.indexOf(trip);
          state.trips.splice(idx, 1);
          state.deleted[trip.id] = Math.max(Date.now(), (trip.updatedAt || 0) + 1);
          if (inTrip) location.hash = "";
          commit(null);
          toast("Escapada eliminada", {
            undo: () => {
              trip.updatedAt = Date.now();
              state.trips.push(trip);
              state = mergeStates(state, { trips: [], deleted: {} });
              commit(findTrip(trip.id));
            },
          });
        });
      }
    });
  }

  function groupMenu(anchor, trip, g) {
    const done = g.items.filter((i) => i.done).length;
    menu(anchor, [
      ["rename", I.edit, "Renombrar"],
      ...(done ? [["uncheck", I.reset, "Desmarcar grupo"]] : []),
      ...(done ? [["clear-done", I.check, "Quitar marcados"]] : []),
      ["delete", I.trash, "Eliminar grupo", "danger"],
    ], (v) => {
      if (v === "rename") $(`.group[data-gid="${g.id}"] .group-name`).click();
      if (v === "uncheck") withUndo(trip, "Grupo desmarcado", () => g.items.forEach((i) => (i.done = false)));
      if (v === "clear-done") withUndo(trip, `${done} ítem${done > 1 ? "s" : ""} quitado${done > 1 ? "s" : ""}`, () => { g.items = g.items.filter((i) => !i.done); });
      if (v === "delete") {
        const del = () => withUndo(trip, `Grupo «${g.name}» eliminado`, () => { trip.groups = trip.groups.filter((x) => x.id !== g.id); });
        if (g.items.length > 3) confirmDialog({ title: "¿Eliminar grupo?", text: `«${g.name}» tiene ${g.items.length} ítems. Podrás deshacerlo justo después.` }, del);
        else del();
      }
    });
  }

  function addItems(trip, g, texts) {
    const clean = texts.map((t) => clampText(t)).filter(Boolean);
    if (!clean.length) return;
    clean.forEach((text) => g.items.push({ id: uid(), text, done: false }));
    if (g.collapsed) g.collapsed = false;
    focusAfterRender = `.add-item[data-gid="${g.id}"] input`;
    commit(trip);
  }

  app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    const r = route();
    const trip = r.view === "trip" ? findTrip(r.id) : el.dataset.id ? findTrip(el.dataset.id) : null;
    const gEl = el.closest(".group");
    const g = trip && gEl ? findGroup(trip, gEl.dataset.gid) : null;
    const li = el.closest(".item");
    const item = g && li ? g.items.find((i) => i.id === li.dataset.iid) : null;

    switch (act) {
      case "open-trip": location.hash = "#/e/" + el.dataset.id; break;
      case "new-trip": newTripDialog(); break;
      case "trip-menu": e.stopPropagation(); tripMenu(el, findTrip(el.dataset.id)); break;
      case "trip-emoji": emojiPicker(el, TRIP_EMOJIS, trip.emoji, (v) => { trip.emoji = v; commit(trip); }); break;
      case "rename-trip": inlineEdit(el, trip.name, (v) => { trip.name = v; commit(trip); }); break;
      case "edit-when": inlineEdit(el, trip.when || "", (v) => { trip.when = v; commit(trip); }, { placeholder: "Ej. 5–8 dic · 3 noches", allowEmpty: true }); break;
      case "add-group": newGroupDialog(trip); break;
      case "hide-done": prefs.hideDone = !prefs.hideDone; savePrefs(); render(); break;
      case "collapse-all": {
        const all = trip.groups.every((x) => x.collapsed);
        trip.groups.forEach((x) => (x.collapsed = !all));
        commit(trip);
        break;
      }
      case "collapse": g.collapsed = !g.collapsed; commit(trip); break;
      case "group-emoji": emojiPicker(el, GROUP_EMOJIS, g.emoji, (v) => { g.emoji = v; commit(trip); }); break;
      case "rename-group": inlineEdit(el, g.name, (v) => { g.name = v; commit(trip); }); break;
      case "group-menu": groupMenu(el, trip, g); break;
      case "toggle":
        item.done = !item.done;
        commit(trip);
        if (item.done) { const c = $(`.item[data-iid="${item.id}"] .check`); c && c.classList.add("pop"); }
        break;
      case "edit-item": inlineEdit(el, item.text, (v) => { item.text = v; commit(trip); }); break;
      case "del-item": withUndo(trip, `«${item.text}» eliminado`, () => { g.items = g.items.filter((i) => i.id !== item.id); }); break;
    }
  });

  app.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".trip-card[data-act=open-trip]")) {
      e.preventDefault();
      location.hash = "#/e/" + e.target.dataset.id;
    }
  });

  app.addEventListener("submit", (e) => {
    const form = e.target.closest(".add-item");
    if (!form) return;
    e.preventDefault();
    const trip = findTrip(route().id);
    const g = trip && findGroup(trip, form.dataset.gid);
    if (g) addItems(trip, g, [form.elements.text.value]);
  });

  // Pegar varias líneas = varios ítems
  app.addEventListener("paste", (e) => {
    const input = e.target.closest(".add-item input");
    if (!input) return;
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!/\n/.test(text)) return;
    e.preventDefault();
    const trip = findTrip(route().id);
    const g = trip && findGroup(trip, input.form.dataset.gid);
    if (g) addItems(trip, g, text.split(/\r?\n/).map((l) => l.replace(/^\s*[-*•·\d.)\]]+\s*/, "")));
  });

  // ---------- Arranque ----------
  render();
  pull();
  setInterval(() => { if (document.visibilityState === "visible") pull(); }, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pull(); });
  window.addEventListener("online", () => push());
  window.addEventListener("focus", () => pull());

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
})();
