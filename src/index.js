const express = require('express');
const path = require('node:path');
const { ensureSchema } = require('./lib/db');
const { attachUser } = require('./lib/auth');
const authRoutes = require('./routes/auth');
const shiftRoutes = require('./routes/shifts');
const exportRoutes = require('./routes/exports');

const app = express();

app.use(express.json());
app.use(async (req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (error) {
    next(error);
  }
});
app.use(attachUser);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', authRoutes);
app.use('/api', shiftRoutes);
app.use('/api', exportRoutes);

app.use('/api/*rest', (req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

module.exports = app;
