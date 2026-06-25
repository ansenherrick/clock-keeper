const express = require('express');
const crypto = require('node:crypto');
const { pool } = require('../lib/db');
const { requireUser } = require('../lib/auth');
const { hydrateShifts, getShiftsForUser } = require('../lib/shifts');
const { buildCsv, buildInvoice, buildExportFileName } = require('../lib/csv');

const router = express.Router();

router.post('/exports', requireUser, async (req, res, next) => {
  try {
    const shiftIds = Array.isArray(req.body.shiftIds) ? req.body.shiftIds.map(String) : [];
    const exportType = req.body.type === 're-export' ? 're-export' : 'initial-export';
    const format = req.body.format === 'invoice' ? 'invoice' : 'csv';

    if (!shiftIds.length) {
      res.status(400).json({ error: 'Select at least one entry before exporting.' });
      return;
    }

    const shiftResult = await pool.query(
      'SELECT * FROM shifts WHERE user_id = $1 AND clock_out_at IS NOT NULL AND id = ANY($2::uuid[]) ORDER BY clock_in_at DESC',
      [req.user.id, shiftIds],
    );

    if (!shiftResult.rows.length) {
      res.status(400).json({ error: 'No completed shifts were available to export.' });
      return;
    }

    const hydratedShifts = await hydrateShifts(shiftResult.rows);
    const exportedAt = new Date().toISOString();
    const batchId = crypto.randomUUID();
    const filename = buildExportFileName(req.user.name, exportType, exportedAt, format);
    const content = format === 'invoice'
      ? buildInvoice(hydratedShifts, req.user, exportedAt, req.body.invoice || {})
      : buildCsv(hydratedShifts, req.user, exportedAt, exportType);
    const mimeType = format === 'invoice'
      ? 'text/plain;charset=utf-8'
      : 'text/csv;charset=utf-8';

    for (const shift of hydratedShifts) {
      await pool.query(
        'INSERT INTO shift_exports (shift_id, batch_id, exported_at, type, format) VALUES ($1, $2, $3, $4, $5)',
        [shift.id, batchId, exportedAt, exportType, format],
      );
    }

    res.json({
      content,
      filename,
      mimeType,
      format,
      exportedCount: hydratedShifts.length,
      shifts: await getShiftsForUser(req.user.id),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
