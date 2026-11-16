// Función de Netlify que guarda y devuelve los datos de la app en Netlify Blobs.
// GET  /api/data  -> { state }
// PUT  /api/data  { state } -> fusiona con lo guardado y devuelve { state }
import { getStore } from "@netlify/blobs";

const KEY = "state";
const MAX_BYTES = 2_000_000;
const TOMBSTONE_TTL = 1000 * 60 * 60 * 24 * 180; // 180 días

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// Fusión por escapada: gana la versión con updatedAt más reciente.
// Las escapadas borradas se recuerdan en `deleted` (id -> fecha de borrado).
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

export default async (req) => {
  // PIN opcional: si defines la variable de entorno APP_PIN en Netlify, se exige.
  const pin = process.env.APP_PIN;
  if (pin && req.headers.get("x-app-pin") !== pin) return json({ error: "PIN incorrecto" }, 401);

  const store = getStore({ name: "maleta", consistency: "strong" });
  const current = (await store.get(KEY, { type: "json" })) || { trips: [], deleted: {} };

  if (req.method === "GET") return json({ state: current });

  if (req.method === "PUT") {
    const raw = await req.text();
    if (raw.length > MAX_BYTES) return json({ error: "Datos demasiado grandes" }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "JSON inválido" }, 400); }
    if (!isValidState(body?.state)) return json({ error: "Datos inválidos" }, 400);
    const merged = mergeStates(current, body.state);
    await store.setJSON(KEY, merged);
    return json({ state: merged });
  }

  return json({ error: "Método no permitido" }, 405);
};

export const config = { path: "/api/data" };
