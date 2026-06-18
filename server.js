const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "clock.sqlite");
const SESSION_COOKIE = "clock_keeper_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clock_in_at TEXT NOT NULL,
    clock_out_at TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS breaks (
    id TEXT PRIMARY KEY,
    shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT
  );

  CREATE TABLE IF NOT EXISTS shift_exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    batch_id TEXT NOT NULL,
    exported_at TEXT NOT NULL,
    type TEXT NOT NULL
  );
`);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Method not allowed");
      return;
    }

    serveStatic(res, url.pathname === "/" ? "/index.html" : url.pathname, req.method === "HEAD");
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Something went wrong on the server." });
  }
});

server.listen(PORT, () => {
  console.log(`Clock Keeper running at http://127.0.0.1:${PORT}`);
});

async function handleApi(req, res, url) {
  purgeExpiredSessions();

  if (req.method === "GET" && url.pathname === "/api/session") {
    const user = getSessionUser(req);
    sendJson(res, 200, { user: user ? serializeUser(user) : null });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/signup") {
    const body = await readJsonBody(req);
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!name || !email || password.length < 6) {
      sendJson(res, 400, { error: "Please provide a name, valid email, and password with at least 6 characters." });
      return;
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      sendJson(res, 409, { error: "That email already has an account." });
      return;
    }

    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      password_hash: hashPassword(password),
      created_at: now,
    };

    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(user.id, user.name, user.email, user.password_hash, user.created_at);

    createSession(res, user.id);
    sendJson(res, 201, { user: serializeUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/signin") {
    const body = await readJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

    if (!user || !verifyPassword(password, user.password_hash)) {
      sendJson(res, 401, { error: "We couldn't find a matching email and password." });
      return;
    }

    createSession(res, user.id);
    sendJson(res, 200, { user: serializeUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/signout") {
    destroySession(req, res);
    sendJson(res, 200, { ok: true });
    return;
  }

  const user = requireUser(req, res);
  if (!user) return;

  if (req.method === "GET" && url.pathname === "/api/shifts") {
    sendJson(res, 200, { shifts: getShiftsForUser(user.id) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/shifts/clock-in") {
    const activeShift = getActiveShiftForUser(user.id);
    if (activeShift) {
      sendJson(res, 409, { error: "You already have an active shift running." });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO shifts (id, user_id, clock_in_at, clock_out_at, notes, created_at) VALUES (?, ?, ?, NULL, '', ?)",
    ).run(crypto.randomUUID(), user.id, now, now);

    sendJson(res, 201, { shifts: getShiftsForUser(user.id) });
    return;
  }

  const clockOutMatch = url.pathname.match(/^\/api\/shifts\/([^/]+)\/clock-out$/);
  if (req.method === "POST" && clockOutMatch) {
    const shift = getOwnedShift(user.id, clockOutMatch[1]);
    if (!shift || shift.clock_out_at) {
      sendJson(res, 404, { error: "There is no active shift to clock out from." });
      return;
    }

    const body = await readJsonBody(req);
    const now = new Date().toISOString();
    db.prepare("UPDATE breaks SET end_at = ? WHERE shift_id = ? AND end_at IS NULL").run(now, shift.id);
    db.prepare("UPDATE shifts SET clock_out_at = ?, notes = ? WHERE id = ?").run(now, String(body.notes || "").trim(), shift.id);
    sendJson(res, 200, { shifts: getShiftsForUser(user.id) });
    return;
  }

  const startBreakMatch = url.pathname.match(/^\/api\/shifts\/([^/]+)\/breaks$/);
  if (req.method === "POST" && startBreakMatch) {
    const shift = getOwnedShift(user.id, startBreakMatch[1]);
    if (!shift || shift.clock_out_at) {
      sendJson(res, 404, { error: "Clock in before starting a break." });
      return;
    }

    const openBreak = db.prepare("SELECT id FROM breaks WHERE shift_id = ? AND end_at IS NULL").get(shift.id);
    if (openBreak) {
      sendJson(res, 409, { error: "Finish the current break before starting another one." });
      return;
    }

    const body = await readJsonBody(req);
    const type = String(body.type || "").trim() || "Break";
    db.prepare("INSERT INTO breaks (id, shift_id, type, start_at, end_at) VALUES (?, ?, ?, ?, NULL)").run(
      crypto.randomUUID(),
      shift.id,
      type,
      new Date().toISOString(),
    );
    sendJson(res, 201, { shifts: getShiftsForUser(user.id) });
    return;
  }

  const endBreakMatch = url.pathname.match(/^\/api\/shifts\/([^/]+)\/breaks\/([^/]+)\/end$/);
  if (req.method === "POST" && endBreakMatch) {
    const shift = getOwnedShift(user.id, endBreakMatch[1]);
    if (!shift) {
      sendJson(res, 404, { error: "There is no active break to end." });
      return;
    }

    const openBreak = db.prepare("SELECT * FROM breaks WHERE id = ? AND shift_id = ? AND end_at IS NULL").get(endBreakMatch[2], shift.id);
    if (!openBreak) {
      sendJson(res, 404, { error: "There is no active break to end." });
      return;
    }

    db.prepare("UPDATE breaks SET end_at = ? WHERE id = ?").run(new Date().toISOString(), openBreak.id);
    sendJson(res, 200, { shifts: getShiftsForUser(user.id) });
    return;
  }

  const notesMatch = url.pathname.match(/^\/api\/shifts\/([^/]+)\/notes$/);
  if (req.method === "PATCH" && notesMatch) {
    const shift = getOwnedShift(user.id, notesMatch[1]);
    if (!shift) {
      sendJson(res, 404, { error: "Shift not found." });
      return;
    }

    const body = await readJsonBody(req);
    db.prepare("UPDATE shifts SET notes = ? WHERE id = ?").run(String(body.notes || "").trim(), shift.id);
    sendJson(res, 200, { shifts: getShiftsForUser(user.id) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/exports") {
    const body = await readJsonBody(req);
    const shiftIds = Array.isArray(body.shiftIds) ? body.shiftIds.map(String) : [];
    const exportType = body.type === "re-export" ? "re-export" : "initial-export";

    if (!shiftIds.length) {
      sendJson(res, 400, { error: "Select at least one entry before exporting." });
      return;
    }

    const placeholders = shiftIds.map(() => "?").join(", ");
    const shifts = db
      .prepare(`SELECT * FROM shifts WHERE user_id = ? AND clock_out_at IS NOT NULL AND id IN (${placeholders}) ORDER BY clock_in_at DESC`)
      .all(user.id, ...shiftIds);

    if (!shifts.length) {
      sendJson(res, 400, { error: "No completed shifts were available to export." });
      return;
    }

    const hydratedShifts = hydrateShifts(shifts);
    const exportedAt = new Date().toISOString();
    const batchId = crypto.randomUUID();
    const filename = buildExportFileName(user.name, exportType, exportedAt);
    const csv = buildCsv(hydratedShifts, user, exportedAt, exportType);
    const insertExport = db.prepare(
      "INSERT INTO shift_exports (shift_id, batch_id, exported_at, type) VALUES (?, ?, ?, ?)",
    );

    for (const shift of hydratedShifts) {
      insertExport.run(shift.id, batchId, exportedAt, exportType);
    }

    sendJson(res, 200, {
      csv,
      filename,
      exportedCount: hydratedShifts.length,
      shifts: getShiftsForUser(user.id),
    });
    return;
  }

  sendJson(res, 404, { error: "Route not found." });
}

function serveStatic(res, pathname, headOnly) {
  const cleanedPath = pathname.replace(/^\/+/, "");
  const filePath = path.join(ROOT, cleanedPath);
  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  }[ext] || "application/octet-stream";

  res.writeHead(200, { "Content-Type": contentType });
  if (headOnly) {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function requireUser(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    sendJson(res, 401, { error: "Please sign in to continue." });
    return null;
  }
  return user;
}

function getSessionUser(req) {
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!token) return null;

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(token);
  if (!session) return null;
  if (session.expires_at <= new Date().toISOString()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
    return null;
  }

  return db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id) || null;
}

function createSession(res, userId) {
  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    token,
    userId,
    now.toISOString(),
    expiresAt,
  );
  setCookie(res, SESSION_COOKIE, token, SESSION_TTL_SECONDS);
}

function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (token) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
  }
  clearCookie(res, SESSION_COOKIE);
}

function purgeExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
}

function getActiveShiftForUser(userId) {
  return db.prepare("SELECT * FROM shifts WHERE user_id = ? AND clock_out_at IS NULL ORDER BY clock_in_at DESC LIMIT 1").get(userId) || null;
}

function getOwnedShift(userId, shiftId) {
  return db.prepare("SELECT * FROM shifts WHERE id = ? AND user_id = ?").get(shiftId, userId) || null;
}

function getShiftsForUser(userId) {
  const rows = db.prepare("SELECT * FROM shifts WHERE user_id = ? ORDER BY clock_in_at DESC").all(userId);
  return hydrateShifts(rows);
}

function hydrateShifts(shiftRows) {
  if (!shiftRows.length) return [];

  const shiftIds = shiftRows.map((row) => row.id);
  const placeholders = shiftIds.map(() => "?").join(", ");
  const breaks = db.prepare(`SELECT * FROM breaks WHERE shift_id IN (${placeholders}) ORDER BY start_at ASC`).all(...shiftIds);
  const exports = db.prepare(`SELECT * FROM shift_exports WHERE shift_id IN (${placeholders}) ORDER BY exported_at ASC, id ASC`).all(...shiftIds);

  const breaksByShift = new Map();
  for (const entry of breaks) {
    if (!breaksByShift.has(entry.shift_id)) breaksByShift.set(entry.shift_id, []);
    breaksByShift.get(entry.shift_id).push({
      id: entry.id,
      type: entry.type,
      startAt: entry.start_at,
      endAt: entry.end_at,
    });
  }

  const exportsByShift = new Map();
  for (const entry of exports) {
    if (!exportsByShift.has(entry.shift_id)) exportsByShift.set(entry.shift_id, []);
    exportsByShift.get(entry.shift_id).push({
      id: entry.id,
      batchId: entry.batch_id,
      exportedAt: entry.exported_at,
      type: entry.type,
    });
  }

  return shiftRows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    clockInAt: row.clock_in_at,
    clockOutAt: row.clock_out_at,
    notes: row.notes,
    createdAt: row.created_at,
    breaks: breaksByShift.get(row.id) || [],
    exports: exportsByShift.get(row.id) || [],
  }));
}

function buildCsv(shifts, user, exportedAt, exportType) {
  const headers = [
    "shift_id",
    "employee_name",
    "account_email",
    "shift_date",
    "clock_in_date",
    "clock_in_time",
    "clock_out_date",
    "clock_out_time",
    "break_count",
    "break_details",
    "total_break_minutes",
    "worked_minutes",
    "worked_hours_decimal",
    "shift_status",
    "notes",
    "exported_at",
    "export_type"
  ];

  const rows = shifts.map((shift) => {
    const workedMinutes = calculateShiftWorkedMinutes(shift);
    const breakMinutes = calculateBreakMinutes(shift);
    const breakDetails = shift.breaks
      .map((entry) => `${entry.type} (${formatDateTime(entry.startAt)} to ${entry.endAt ? formatDateTime(entry.endAt) : "Open"})`)
      .join(" | ");

    return [
      shift.id,
      user.name,
      user.email,
      formatCalendarDate(shift.clockInAt),
      formatDateOnly(shift.clockInAt),
      formatTime(shift.clockInAt),
      shift.clockOutAt ? formatDateOnly(shift.clockOutAt) : "",
      shift.clockOutAt ? formatTime(shift.clockOutAt) : "",
      String(shift.breaks.length),
      breakDetails,
      String(breakMinutes),
      String(workedMinutes),
      (workedMinutes / 60).toFixed(2),
      getShiftStatus(shift),
      shift.notes || "",
      formatDateTime(exportedAt),
      exportType,
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function buildExportFileName(name, exportType, exportedAt) {
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "employee";
  const stamp = exportedAt.replace(/[:.]/g, "-");
  return `${safeName}-${exportType === "re-export" ? "reexport" : "export"}-${stamp}.csv`;
}

function calculateBreakMinutes(shift) {
  return shift.breaks.reduce((total, entry) => {
    const start = new Date(entry.startAt);
    const end = new Date(entry.endAt || Date.now());
    return total + Math.max(0, Math.round((end - start) / 60000));
  }, 0);
}

function calculateShiftWorkedMinutes(shift) {
  const start = new Date(shift.clockInAt);
  const end = new Date(shift.clockOutAt || Date.now());
  const totalMinutes = Math.max(0, Math.round((end - start) / 60000));
  return Math.max(0, totalMinutes - calculateBreakMinutes(shift));
}

function getShiftStatus(shift) {
  if (shift.clockOutAt) return "Completed";
  return shift.breaks.some((entry) => !entry.endAt) ? "On Break" : "Clocked In";
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue) {
  const [salt, storedHash] = String(storedValue).split(":");
  if (!salt || !storedHash) return false;

  const derivedHash = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(storedHash, "hex");
  return storedBuffer.length === derivedHash.length && crypto.timingSafeEqual(storedBuffer, derivedHash);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at,
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    const size = chunks.reduce((total, item) => total + item.length, 0);
    if (size > 1024 * 1024) {
      throw new Error("Request body too large.");
    }
  }

  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function parseCookies(cookieHeader) {
  return cookieHeader.split(";").reduce((allCookies, segment) => {
    const [rawName, ...rawValue] = segment.trim().split("=");
    if (!rawName) return allCookies;
    allCookies[rawName] = decodeURIComponent(rawValue.join("="));
    return allCookies;
  }, {});
}

function setCookie(res, name, value, maxAgeSeconds) {
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatCalendarDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateOnly(value) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
