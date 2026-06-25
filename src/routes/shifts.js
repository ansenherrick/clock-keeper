const express = require('express');
const crypto = require('node:crypto');
const { pool } = require('../lib/db');
const { requireUser } = require('../lib/auth');
const { getActiveShiftForUser, getOwnedShift, getShiftsForUser } = require('../lib/shifts');

const router = express.Router();

router.get('/shifts', requireUser, async (req, res, next) => {
  try {
    const shifts = await getShiftsForUser(req.user.id);
    res.json({ shifts });
  } catch (error) {
    next(error);
  }
});

router.post('/shifts/manual', requireUser, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const startAt = normalizeIsoDateTime(req.body.startAt);
    const endAt = normalizeIsoDateTime(req.body.endAt);
    const breakMinutes = Math.max(0, Number.parseInt(req.body.breakMinutes, 10) || 0);
    const notes = String(req.body.notes || '').trim();

    if (!startAt || !endAt) {
      res.status(400).json({ error: 'Choose both a start and end time for the missed shift.' });
      return;
    }

    if (new Date(endAt) <= new Date(startAt)) {
      res.status(400).json({ error: 'The shift end time must be later than the start time.' });
      return;
    }

    const totalMinutes = Math.round((new Date(endAt) - new Date(startAt)) / 60000);
    if (breakMinutes >= totalMinutes) {
      res.status(400).json({ error: 'Break minutes must be less than the total shift length.' });
      return;
    }

    const shiftId = crypto.randomUUID();

    await client.query('BEGIN');
    await client.query(
      'INSERT INTO shifts (id, user_id, clock_in_at, clock_out_at, notes, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [shiftId, req.user.id, startAt, endAt, notes],
    );

    if (breakMinutes > 0) {
      const breakEnd = new Date(endAt);
      const breakStart = new Date(breakEnd.getTime() - breakMinutes * 60000);
      await client.query(
        'INSERT INTO breaks (id, shift_id, type, start_at, end_at) VALUES ($1, $2, $3, $4, $5)',
        [crypto.randomUUID(), shiftId, 'Manual Break', breakStart.toISOString(), breakEnd.toISOString()],
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ shifts: await getShiftsForUser(req.user.id) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

router.post('/shifts/clock-in', requireUser, async (req, res, next) => {
  try {
    const activeShift = await getActiveShiftForUser(req.user.id);
    if (activeShift) {
      res.status(409).json({ error: 'You already have an active shift running.' });
      return;
    }

    const now = new Date().toISOString();
    await pool.query(
      'INSERT INTO shifts (id, user_id, clock_in_at, clock_out_at, notes, created_at) VALUES ($1, $2, $3, NULL, $4, $5)',
      [crypto.randomUUID(), req.user.id, now, '', now],
    );

    res.status(201).json({ shifts: await getShiftsForUser(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.post('/shifts/:shiftId/clock-out', requireUser, async (req, res, next) => {
  try {
    const shift = await getOwnedShift(req.user.id, req.params.shiftId);
    if (!shift || shift.clockOutAt) {
      res.status(404).json({ error: "There is no active shift to clock out from." });
      return;
    }

    const now = new Date().toISOString();
    await pool.query('UPDATE breaks SET end_at = $1 WHERE shift_id = $2 AND end_at IS NULL', [now, shift.id]);
    await pool.query('UPDATE shifts SET clock_out_at = $1, notes = $2 WHERE id = $3', [
      now,
      String(req.body.notes || '').trim(),
      shift.id,
    ]);

    res.json({ shifts: await getShiftsForUser(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.post('/shifts/:shiftId/breaks', requireUser, async (req, res, next) => {
  try {
    const shift = await getOwnedShift(req.user.id, req.params.shiftId);
    if (!shift || shift.clockOutAt) {
      res.status(404).json({ error: 'Clock in before starting a break.' });
      return;
    }

    const openBreak = await pool.query('SELECT id FROM breaks WHERE shift_id = $1 AND end_at IS NULL', [shift.id]);
    if (openBreak.rows[0]) {
      res.status(409).json({ error: 'Finish the current break before starting another one.' });
      return;
    }

    const type = String(req.body.type || '').trim() || 'Break';
    await pool.query(
      'INSERT INTO breaks (id, shift_id, type, start_at, end_at) VALUES ($1, $2, $3, $4, NULL)',
      [crypto.randomUUID(), shift.id, type, new Date().toISOString()],
    );

    res.status(201).json({ shifts: await getShiftsForUser(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.post('/shifts/:shiftId/breaks/:breakId/end', requireUser, async (req, res, next) => {
  try {
    const shift = await getOwnedShift(req.user.id, req.params.shiftId);
    if (!shift) {
      res.status(404).json({ error: "There is no active break to end." });
      return;
    }

    const openBreak = await pool.query(
      'SELECT * FROM breaks WHERE id = $1 AND shift_id = $2 AND end_at IS NULL',
      [req.params.breakId, shift.id],
    );
    if (!openBreak.rows[0]) {
      res.status(404).json({ error: "There is no active break to end." });
      return;
    }

    await pool.query('UPDATE breaks SET end_at = $1 WHERE id = $2', [new Date().toISOString(), req.params.breakId]);
    res.json({ shifts: await getShiftsForUser(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.patch('/shifts/:shiftId/notes', requireUser, async (req, res, next) => {
  try {
    const shift = await getOwnedShift(req.user.id, req.params.shiftId);
    if (!shift) {
      res.status(404).json({ error: 'Shift not found.' });
      return;
    }

    await pool.query('UPDATE shifts SET notes = $1 WHERE id = $2', [String(req.body.notes || '').trim(), shift.id]);
    res.json({ shifts: await getShiftsForUser(req.user.id) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

function normalizeIsoDateTime(value) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}
