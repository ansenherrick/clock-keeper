const express = require('express');
const crypto = require('node:crypto');
const { pool } = require('../lib/db');
const { createSession, destroySession, hashPassword, verifyPassword } = require('../lib/auth');

const router = express.Router();

router.get('/session', (req, res) => {
  res.json({ user: req.user || null });
});

router.post('/auth/signup', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!name || !email || password.length < 6) {
      res.status(400).json({ error: 'Please provide a name, valid email, and password with at least 6 characters.' });
      return;
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) {
      res.status(409).json({ error: 'That email already has an account.' });
      return;
    }

    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: hashPassword(password),
      createdAt: now,
    };

    await pool.query(
      'INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)',
      [user.id, user.name, user.email, user.passwordHash, user.createdAt],
    );

    await createSession(res, user.id);
    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/auth/signin', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: "We couldn't find a matching email and password." });
      return;
    }

    await createSession(res, user.id);
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/auth/signout', async (req, res, next) => {
  try {
    await destroySession(req, res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

module.exports = router;
