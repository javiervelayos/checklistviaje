// API de MiMaleta: cuentas de usuario + datos de cada usuario en Netlify Blobs + recuperación de contraseña por email (Brevo).
//   POST /api/register  { name, password, email? }  -> { token, user }
//   POST /api/login     { name, password }  -> { token, user }
//   GET  /api/data      (Authorization: Bearer <token>) -> { state }
//   PUT  /api/data      { state } -> fusiona con lo guardado y devuelve { state }
//   GET  /api/me        -> { user }   (user.admin = true para la cuenta administradora)
//   POST /api/password  { current, next } -> nueva sesión; cierra las demás sesiones de ese usuario
//   GET  /api/admin/users           (solo admin) -> { users: [{ name, createdAt, admin }] }
//   POST /api/admin/reset { name }  (solo admin) -> { password } contraseña temporal
//   GET  /api/admin/export          (solo admin) -> copia de usuarios y escapadas
//   POST /api/email     { email }   -> guarda o cambia el email de la cuenta ("" lo quita)
//   POST /api/forgot    { who }     -> si la cuenta (nombre o email) tiene email, envía un enlace válido 1 hora
//   POST /api/reset     { token, password } -> cambia la contraseña con el enlace y abre sesión
//   POST /api/admin/import (cabecera x-import-key = IMPORT_KEY) -> carga una exportación, solo si no hay usuarios
// Variables para el email: BREVO_API_KEY, MAIL_FROM, MAIL_FROM_NAME, APP_URL
// La cuenta administradora es la que se quedó las escapadas antiguas o, si no había, la primera creada.
// Variables de entorno opcionales:
//   ALLOW_SIGNUP=false  -> nadie más puede crear cuentas (las existentes siguen funcionando)
//   SESSION_SECRET      -> clave para firmar sesiones (si no existe se genera y se guarda en Blobs)
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const MAX_BYTES = 2_000_000;
const TOMBSTONE_TTL = 1000 * 60 * 60 * 24 * 180; // 180 días
const SESSION_DAYS = 365;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64u = (buf) => Buffer.from(buf).toString("base64url");

// Fusión por escapada: gana la versión con updatedAt más reciente.
export function mergeStates(a, b) {
  const deleted = {};
  const now = Date.now();
  for (const src of [a?.deleted || {}, b?.deleted || {}]) {
    for (const [id, t] of Object.entries(src)) {
      if (typeof t === "number" && now - t < TOMBSTONE_TTL) deleted[id] = Math.max(deleted[id] || 0, t);
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

function isValidState(s) {
  return (
    s && typeof s === "object" && Array.isArray(s.trips) && s.trips.length <= 1000 &&
    s.trips.every((t) => t && typeof t.id === "string" && Array.isArray(t.groups)) &&
    (s.deleted === undefined || (typeof s.deleted === "object" && !Array.isArray(s.deleted)))
  );
}

// ---------- Cuentas ----------
const normName = (n) => String(n || "").trim().replace(/\s+/g, " ");
const nameKey = (n) => normName(n).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const hashPassword = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString("hex");

// Escribe solo si la clave no existe (sin depender de onlyIfNew, que no todas las versiones de @netlify/blobs soportan).
async function setIfNew(store, key, value) {
  if ((await store.get(key)) !== null) return false;
  await store.set(key, typeof value === "string" ? value : JSON.stringify(value));
  return true;
}

async function getSecret(store) {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  await setIfNew(store, "meta/secret", b64u(crypto.randomBytes(32)));
  return store.get("meta/secret");
}

// Las escapadas de antes de existir las cuentas pasan a la primera cuenta que entra o se crea.
async function claimLegacy(store, user) {
  const legacy = await store.get("state", { type: "json" });
  if (!legacy) return;
  if (!(await setIfNew(store, "meta/legacy-owner", user.id))) return;
  const mine = (await store.get("data/" + user.id, { type: "json" })) || { trips: [], deleted: {} };
  await store.setJSON("data/" + user.id, mergeStates(mine, legacy));
  await store.delete("state");
}
function sign(payload, secret) {
  const body = b64u(JSON.stringify(payload));
  const mac = b64u(crypto.createHmac("sha256", secret).update(body).digest());
  return body + "." + mac;
}
function verify(token, secret) {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const expected = b64u(crypto.createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
async function getAdminId(store) {
  let id = await store.get("meta/admin");
  if (!id) {
    id = await store.get("meta/legacy-owner");
    if (!id) { // si no, la cuenta más antigua
      const { blobs } = await store.list({ prefix: "users/" });
      let oldest = null;
      for (const b of blobs) { const u = await store.get(b.key, { type: "json" }); if (u && (!oldest || u.createdAt < oldest.createdAt)) oldest = u; }
      id = oldest && oldest.id;
    }
    if (id) await store.set("meta/admin", id);
  }
  return id;
}
const publicUser = (user, adminId) => ({ id: user.id, name: user.name, email: user.email || "", admin: !!adminId && user.id === adminId, mustChange: !!user.mustChange });

// ---------- Email ----------
const normEmail = (e) => String(e || "").trim().toLowerCase();
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e);
const sha = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const escHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Asocia un email a un usuario (índice emails/<sha> -> clave del usuario). Devuelve error si ya lo usa otra cuenta.
async function setUserEmail(store, user, email) {
  const e = normEmail(email);
  if (e && !validEmail(e)) return "Ese email no parece válido";
  if (e) {
    const owner = await store.get("emails/" + sha(e));
    if (owner && owner !== nameKey(user.name)) return "Ese email ya lo usa otra cuenta";
  }
  if (user.email && normEmail(user.email) !== e) await store.delete("emails/" + sha(normEmail(user.email)));
  if (e) { await store.set("emails/" + sha(e), nameKey(user.name)); user.email = e; } else delete user.email;
  return null;
}

async function sendResetEmail(user, link) {
  const key = process.env.BREVO_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from) throw Object.assign(new Error("El envío de emails no está configurado"), { status: 503 });
  const appName = process.env.MAIL_FROM_NAME || "MiMaleta";
  const html = `<!doctype html><html><body style="margin:0;background:#F5EFE6;font-family:Helvetica,Arial,sans-serif;color:#22303A">
    <div style="max-width:480px;margin:0 auto;padding:32px 20px">
      <div style="background:#FFFDF9;border-radius:18px;padding:28px 24px;border:1px solid #E7DDCD">
        <div style="font-size:26px;font-weight:700;margin-bottom:6px">🧳 ${escHtml(appName)}</div>
        <p style="font-size:16px;line-height:1.5">Hola ${escHtml(user.name)}:</p>
        <p style="font-size:16px;line-height:1.5">Has pedido cambiar la contraseña de tu cuenta. Pulsa el botón para elegir una nueva. El enlace sirve una sola vez y caduca en 1 hora.</p>
        <p style="text-align:center;margin:28px 0"><a href="${link}" style="background:#E0603F;color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:12px;display:inline-block">Elegir nueva contraseña</a></p>
        <p style="font-size:13px;line-height:1.5;color:#8C9399">Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambiará.</p>
      </div>
    </div></body></html>`;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: from, name: appName },
      to: [{ email: user.email, name: user.name }],
      subject: `${appName}: cambia tu contraseña`,
      htmlContent: html,
      textContent: `Hola ${user.name}:\n\nPara elegir una nueva contraseña abre este enlace (válido 1 hora, un solo uso):\n${link}\n\nSi no lo has pedido tú, ignora este mensaje.`,
    }),
  });
  if (!res.ok) throw Object.assign(new Error("No se pudo enviar el email (" + res.status + ")"), { status: 502 });
}
const session = (user, secret, adminId) => ({
  token: sign({ uid: user.id, nk: nameKey(user.name), pwv: user.pwv || 0, exp: Date.now() + SESSION_DAYS * 864e5 }, secret),
  user: publicUser(user, adminId),
});
// Contraseña temporal fácil de dictar: 3 sílabas + 2 cifras, p. ej. "malore-47"
function tempPassword() {
  const c = "bcdfghjklmnprstvz", v = "aeiou", r = (s) => s[crypto.randomInt(s.length)];
  let w = "";
  for (let i = 0; i < 3; i++) w += r(c) + r(v);
  return w + "-" + String(crypto.randomInt(10, 100));
}
// Comprueba el token y que siga siendo válido para ese usuario (si cambió la contraseña, las sesiones viejas caducan).
async function authUser(req, store, secret) {
  const p = verify((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""), secret);
  if (!p) return null;
  let user = p.nk ? await store.get("users/" + p.nk, { type: "json" }) : null;
  if (!p.nk) { // sesiones de la primera versión: buscar por id
    const { blobs } = await store.list({ prefix: "users/" });
    for (const b of blobs) { const u = await store.get(b.key, { type: "json" }); if (u && u.id === p.uid) { user = u; break; } }
  }
  if (!user || user.id !== p.uid || (user.pwv || 0) !== (p.pwv || 0)) return null;
  return user;
}
const saveUser = (store, user) => store.setJSON("users/" + nameKey(user.name), user);

async function readBody(req) {
  const raw = await req.text();
  if (raw.length > MAX_BYTES) throw Object.assign(new Error("Datos demasiado grandes"), { status: 413 });
  try { return JSON.parse(raw || "{}"); } catch { throw Object.assign(new Error("JSON inválido"), { status: 400 }); }
}

export default async (req) => {
  const store = getStore({ name: "maleta", consistency: "strong" });
  const path = new URL(req.url).pathname;
  try {
    const secret = await getSecret(store);

    if (path === "/api/register" && req.method === "POST") {
      if (String(process.env.ALLOW_SIGNUP).toLowerCase() === "false") return json({ error: "No se pueden crear cuentas nuevas" }, 403);
      const { name, password, email } = await readBody(req);
      const n = normName(name), k = nameKey(name);
      if (email && !validEmail(normEmail(email))) return json({ error: "Ese email no parece válido" }, 400);
      if (email && (await store.get("emails/" + sha(normEmail(email))))) return json({ error: "Ese email ya lo usa otra cuenta" }, 409);
      if (n.length < 2 || n.length > 30) return json({ error: "El nombre debe tener entre 2 y 30 caracteres" }, 400);
      if (String(password || "").length < 4) return json({ error: "La contraseña debe tener al menos 4 caracteres" }, 400);
      const salt = b64u(crypto.randomBytes(16));
      const user = { id: b64u(crypto.randomBytes(12)), name: n, salt, hash: hashPassword(password, salt), createdAt: Date.now() };
      if (!(await setIfNew(store, "users/" + k, user))) return json({ error: "Ese nombre ya está en uso" }, 409);
      if (email) { await setUserEmail(store, user, email); await saveUser(store, user); }
      await claimLegacy(store, user);
      return json(session(user, secret, await getAdminId(store)));
    }

    if (path === "/api/login" && req.method === "POST") {
      const { name, password } = await readBody(req);
      const user = await store.get("users/" + nameKey(name), { type: "json" });
      if (!user || hashPassword(password, user.salt) !== user.hash) {
        await sleep(600);
        return json({ error: "Nombre o contraseña incorrectos" }, 401);
      }
      await claimLegacy(store, user);
      return json(session(user, secret, await getAdminId(store)));
    }

    if (path === "/api/forgot" && req.method === "POST") {
      const { who } = await readBody(req);
      const w = String(who || "").trim();
      const generic = { ok: true, message: "Si esa cuenta tiene un email guardado, te hemos enviado un enlace. Revisa también la carpeta de spam." };
      if (!w) return json({ error: "Escribe tu nombre o tu email" }, 400);
      let user = null;
      if (w.includes("@")) {
        const k = await store.get("emails/" + sha(normEmail(w)));
        if (k) user = await store.get("users/" + k, { type: "json" });
      } else user = await store.get("users/" + nameKey(w), { type: "json" });
      if (!user || !user.email) { await sleep(400); return json(generic); }
      // Máximo un email cada 2 minutos por cuenta
      const rl = "ratelimit/" + nameKey(user.name);
      const last = Number(await store.get(rl)) || 0;
      if (Date.now() - last < 120e3) return json(generic);
      await store.set(rl, String(Date.now()));
      const token = b64u(crypto.randomBytes(32));
      await store.setJSON("resets/" + sha(token), { nk: nameKey(user.name), uid: user.id, exp: Date.now() + 3600e3 });
      const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
      await sendResetEmail(user, `${base}/#/restablecer/${token}`);
      return json(generic);
    }

    if (path === "/api/reset" && req.method === "POST") {
      const { token, password } = await readBody(req);
      const key = "resets/" + sha(token || "");
      const r = await store.get(key, { type: "json" });
      if (!r || r.exp < Date.now()) { if (r) await store.delete(key); return json({ error: "El enlace no es válido o ha caducado. Pide uno nuevo." }, 400); }
      if (String(password || "").length < 4) return json({ error: "La contraseña debe tener al menos 4 caracteres" }, 400);
      const user = await store.get("users/" + r.nk, { type: "json" });
      if (!user || user.id !== r.uid) { await store.delete(key); return json({ error: "La cuenta ya no existe" }, 400); }
      user.salt = b64u(crypto.randomBytes(16));
      user.hash = hashPassword(password, user.salt);
      user.pwv = (user.pwv || 0) + 1;
      delete user.mustChange;
      await saveUser(store, user);
      await store.delete(key);
      return json(session(user, secret, await getAdminId(store)));
    }

    // Carga inicial desde una exportación de Maleta. Solo con IMPORT_KEY y si todavía no hay usuarios.
    if (path === "/api/admin/import" && req.method === "POST") {
      const ik = process.env.IMPORT_KEY;
      const given = req.headers.get("x-import-key") || "";
      if (!ik || given.length !== ik.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(ik))) return json({ error: "No autorizado" }, 403);
      const existing = await store.list({ prefix: "users/" });
      if (existing.blobs.length) return json({ error: "Ya hay usuarios: la importación solo se hace una vez" }, 409);
      const dump = await readBody(req);
      if (!Array.isArray(dump.users)) return json({ error: "Exportación no válida" }, 400);
      let users = 0, trips = 0;
      for (const u of dump.users) {
        if (!u || !u.id || !u.name || !u.hash || !u.salt) continue;
        await store.setJSON("users/" + nameKey(u.name), u);
        if (u.email) await store.set("emails/" + sha(normEmail(u.email)), nameKey(u.name));
        const st = dump.data && dump.data[u.id];
        if (st && isValidState(st)) { await store.setJSON("data/" + u.id, st); trips += st.trips.length; }
        users++;
      }
      for (const k of ["meta/admin", "meta/legacy-owner"]) if (dump.meta && dump.meta[k]) await store.set(k, dump.meta[k]);
      return json({ ok: true, users, trips });
    }

    // A partir de aquí todo requiere sesión
    const me = await authUser(req, store, secret);
    if (!me) return json({ error: "Sesión no válida" }, 401);

    if (path === "/api/me" && req.method === "GET") {
      return json({ user: publicUser(me, await getAdminId(store)) });
    }

    if (path === "/api/email" && req.method === "POST") {
      const { email } = await readBody(req);
      const err = await setUserEmail(store, me, email);
      if (err) return json({ error: err }, 400);
      await saveUser(store, me);
      return json({ user: publicUser(me, await getAdminId(store)) });
    }

    if (path === "/api/password" && req.method === "POST") {
      const { current, next } = await readBody(req);
      if (hashPassword(current, me.salt) !== me.hash) { await sleep(600); return json({ error: "La contraseña actual no es correcta" }, 400); }
      if (String(next || "").length < 4) return json({ error: "La nueva contraseña debe tener al menos 4 caracteres" }, 400);
      me.salt = b64u(crypto.randomBytes(16));
      me.hash = hashPassword(next, me.salt);
      me.pwv = (me.pwv || 0) + 1;
      delete me.mustChange;
      await saveUser(store, me);
      return json(session(me, secret, await getAdminId(store)));
    }

    if (path.startsWith("/api/admin/")) {
      if (me.id !== (await getAdminId(store))) return json({ error: "Solo la cuenta administradora puede hacer esto" }, 403);
      if (path === "/api/admin/users" && req.method === "GET") {
        const adminId = await getAdminId(store);
        const { blobs } = await store.list({ prefix: "users/" });
        const users = [];
        for (const b of blobs) {
          const u = await store.get(b.key, { type: "json" });
          if (u) users.push({ name: u.name, createdAt: u.createdAt, admin: u.id === adminId, hasEmail: !!u.email });
        }
        users.sort((a, b) => (b.admin - a.admin) || a.name.localeCompare(b.name, "es"));
        return json({ users });
      }
      // Copia completa (usuarios, escapadas) para trasladar los datos a otra instalación, p. ej. MiMaleta.
      if (path === "/api/admin/export" && req.method === "GET") {
        const out = { exportedAt: Date.now(), users: [], data: {}, meta: {} };
        for (const k of ["meta/admin", "meta/legacy-owner"]) { const v = await store.get(k); if (v) out.meta[k] = v; }
        const { blobs } = await store.list({ prefix: "users/" });
        for (const b of blobs) {
          const u = await store.get(b.key, { type: "json" });
          if (!u) continue;
          out.users.push(u);
          out.data[u.id] = (await store.get("data/" + u.id, { type: "json" })) || { trips: [], deleted: {} };
        }
        return json(out);
      }
      if (path === "/api/admin/reset" && req.method === "POST") {
        const { name } = await readBody(req);
        const u = await store.get("users/" + nameKey(name), { type: "json" });
        if (!u) return json({ error: "No existe ese usuario" }, 404);
        if (u.id === me.id) return json({ error: "Para tu propia cuenta usa «Cambiar contraseña»" }, 400);
        const password = tempPassword();
        u.salt = b64u(crypto.randomBytes(16));
        u.hash = hashPassword(password, u.salt);
        u.pwv = (u.pwv || 0) + 1;   // cierra sus sesiones abiertas
        u.mustChange = true;        // al entrar tendrá que elegir otra
        await saveUser(store, u);
        return json({ name: u.name, password });
      }
    }

    if (path === "/api/data") {
      const key = "data/" + me.id;
      const current = (await store.get(key, { type: "json" })) || { trips: [], deleted: {} };
      if (req.method === "GET") return json({ state: current });
      if (req.method === "PUT") {
        const body = await readBody(req);
        if (!isValidState(body?.state)) return json({ error: "Datos inválidos" }, 400);
        const merged = mergeStates(current, body.state);
        await store.setJSON(key, merged);
        return json({ state: merged });
      }
    }
    return json({ error: "No encontrado" }, 404);
  } catch (e) {
    return json({ error: e.message || "Error" }, e.status || 500);
  }
};

export const config = { path: ["/api/data", "/api/register", "/api/login", "/api/me", "/api/password", "/api/admin/users", "/api/admin/reset", "/api/admin/export", "/api/admin/import", "/api/email", "/api/forgot", "/api/reset"] };
