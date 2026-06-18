const crypto = require('node:crypto');
const { pool } = require('./db');

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'clock_keeper_session';
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 30);

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((allCookies, segment) => {
    const [rawName, ...rawValue] = segment.trim().split('=');
    if (!rawName) {
      return allCookies;
    }
    allCookies[rawName] = decodeURIComponent(rawValue.join('='));
    return allCookies;
  }, {});
}

async function attachUser(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) {
      req.user = null;
      next();
      return;
    }

    const sessionResult = await pool.query(
      `SELECT sessions.id, sessions.user_id, sessions.expires_at, users.id AS user_id_value, users.name, users.email, users.created_at
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = $1`,
      [token],
    );

    const session = sessionResult.rows[0];
    if (!session) {
      req.user = null;
      next();
      return;
    }

    if (new Date(session.expires_at) <= new Date()) {
      await pool.query('DELETE FROM sessions WHERE id = $1', [token]);
      req.user = null;
      next();
      return;
    }

    req.user = {
      id: session.user_id,
      name: session.name,
      email: session.email,
      createdAt: session.created_at,
    };
    next();
  } catch (error) {
    next(error);
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue) {
  const [salt, storedHash] = String(storedValue).split(':');
  if (!salt || !storedHash) {
    return false;
  }

  const derivedHash = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(storedHash, 'hex');
  return storedBuffer.length === derivedHash.length && crypto.timingSafeEqual(storedBuffer, derivedHash);
}

async function createSession(res, userId) {
  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();

  await pool.query(
    'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
    [token, userId, now.toISOString(), expiresAt],
  );

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) {
    await pool.query('DELETE FROM sessions WHERE id = $1', [token]);
  }

  res.cookie(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
}

function requireUser(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }
  next();
}

module.exports = {
  attachUser,
  createSession,
  destroySession,
  hashPassword,
  parseCookies,
  requireUser,
  verifyPassword,
};
