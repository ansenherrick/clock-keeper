const { pool } = require('./db');

async function getActiveShiftForUser(userId) {
  const result = await pool.query(
    'SELECT * FROM shifts WHERE user_id = $1 AND clock_out_at IS NULL ORDER BY clock_in_at DESC LIMIT 1',
    [userId],
  );
  return normalizeShiftRow(result.rows[0]) || null;
}

async function getOwnedShift(userId, shiftId) {
  const result = await pool.query('SELECT * FROM shifts WHERE id = $1 AND user_id = $2', [shiftId, userId]);
  return normalizeShiftRow(result.rows[0]) || null;
}

async function getShiftsForUser(userId) {
  const result = await pool.query('SELECT * FROM shifts WHERE user_id = $1 ORDER BY clock_in_at DESC', [userId]);
  return hydrateShifts(result.rows);
}

async function hydrateShifts(shiftRows) {
  if (!shiftRows.length) {
    return [];
  }

  const shiftIds = shiftRows.map((row) => row.id);
  const breakResult = await pool.query(
    'SELECT * FROM breaks WHERE shift_id = ANY($1::uuid[]) ORDER BY start_at ASC',
    [shiftIds],
  );
  const exportResult = await pool.query(
    'SELECT * FROM shift_exports WHERE shift_id = ANY($1::uuid[]) ORDER BY exported_at ASC, id ASC',
    [shiftIds],
  );

  const breaksByShift = new Map();
  for (const entry of breakResult.rows) {
    if (!breaksByShift.has(entry.shift_id)) {
      breaksByShift.set(entry.shift_id, []);
    }
    breaksByShift.get(entry.shift_id).push({
      id: entry.id,
      type: entry.type,
      startAt: entry.start_at,
      endAt: entry.end_at,
    });
  }

  const exportsByShift = new Map();
  for (const entry of exportResult.rows) {
    if (!exportsByShift.has(entry.shift_id)) {
      exportsByShift.set(entry.shift_id, []);
    }
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

function normalizeShiftRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    clockInAt: row.clock_in_at,
    clockOutAt: row.clock_out_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

module.exports = {
  getActiveShiftForUser,
  getOwnedShift,
  getShiftsForUser,
  hydrateShifts,
};
