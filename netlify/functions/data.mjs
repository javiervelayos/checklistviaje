// API de Maleta: cuentas de usuario + datos de cada usuario en Netlify Blobs.
//   POST /api/register  { name, password }  -> { token, user }
//   POST /api/login     { name, password }  -> { token, user }
//   GET  /api/data      (Authorization: Bearer <token>) -> { state }
//   PUT  /api/data      { state } -> fusiona con lo guardado y devuelve { state }
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
const session = (user, secret) => ({
  token: sign({ uid: user.id, exp: Date.now() + SESSION_DAYS * 864e5 }, secret),
  user: { id: user.id, name: user.name },
});

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
      const { name, password } = await readBody(req);
      const n = normName(name), k = nameKey(name);
      if (n.length < 2 || n.length > 30) return json({ error: "El nombre debe tener entre 2 y 30 caracteres" }, 400);
      if (String(password || "").length < 4) return json({ error: "La contraseña debe tener al menos 4 caracteres" }, 400);
      const salt = b64u(crypto.randomBytes(16));
      const user = { id: b64u(crypto.randomBytes(12)), name: n, salt, hash: hashPassword(password, salt), createdAt: Date.now() };
      if (!(await setIfNew(store, "users/" + k, user))) return json({ error: "Ese nombre ya está en uso" }, 409);
      await claimLegacy(store, user);
      return json(session(user, secret));
    }

    if (path === "/api/login" && req.method === "POST") {
      const { name, password } = await readBody(req);
      const user = await store.get("users/" + nameKey(name), { type: "json" });
      if (!user || hashPassword(password, user.salt) !== user.hash) {
        await sleep(600);
        return json({ error: "Nombre o contraseña incorrectos" }, 401);
      }
      await claimLegacy(store, user);
      return json(session(user, secret));
    }

    if (path === "/api/data") {
      const auth = req.headers.get("authorization") || "";
      const s = verify(auth.replace(/^Bearer\s+/i, ""), secret);
      if (!s) return json({ error: "Sesión no válida" }, 401);
      const key = "data/" + s.uid;
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

export const config = { path: ["/api/data", "/api/register", "/api/login"] };
