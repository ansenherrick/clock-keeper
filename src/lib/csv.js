function buildCsv(shifts, user, exportedAt, exportType) {
  const headers = [
    'shift_id',
    'employee_name',
    'account_email',
    'shift_date',
    'clock_in_date',
    'clock_in_time',
    'clock_out_date',
    'clock_out_time',
    'break_count',
    'break_details',
    'total_break_minutes',
    'worked_minutes',
    'worked_hours_decimal',
    'shift_status',
    'notes',
    'exported_at',
    'export_type',
  ];

  const rows = shifts.map((shift) => {
    const workedMinutes = calculateShiftWorkedMinutes(shift);
    const breakMinutes = calculateBreakMinutes(shift);
    const breakDetails = shift.breaks
      .map((entry) => `${entry.type} (${formatDateTime(entry.startAt)} to ${entry.endAt ? formatDateTime(entry.endAt) : 'Open'})`)
      .join(' | ');

    return [
      shift.id,
      user.name,
      user.email,
      formatCalendarDate(shift.clockInAt),
      formatDateOnly(shift.clockInAt),
      formatTime(shift.clockInAt),
      shift.clockOutAt ? formatDateOnly(shift.clockOutAt) : '',
      shift.clockOutAt ? formatTime(shift.clockOutAt) : '',
      String(shift.breaks.length),
      breakDetails,
      String(breakMinutes),
      String(workedMinutes),
      (workedMinutes / 60).toFixed(2),
      getShiftStatus(shift),
      shift.notes || '',
      formatDateTime(exportedAt),
      exportType,
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

function buildInvoice(shifts, user, exportedAt, invoiceOptions = {}) {
  const issuedOn = invoiceOptions.issuedOn || formatDateOnly(exportedAt);
  const dueOn = invoiceOptions.dueOn || addDays(issuedOn, Number(invoiceOptions.dueInDays || 7));
  const invoiceNumber = invoiceOptions.invoiceNumber || buildInvoiceNumber(issuedOn);
  const currency = invoiceOptions.currency || 'USD';
  const projectName = invoiceOptions.projectName || '';
  const clientName = invoiceOptions.clientName || user.name;
  const clientBusiness = invoiceOptions.clientBusiness || '';
  const clientEmail = invoiceOptions.clientEmail || '';
  const clientAddress = invoiceOptions.clientAddress || '';
  const notes = invoiceOptions.notes || 'Clock Keeper export';
  const hourlyRate = normalizeMoney(invoiceOptions.hourlyRate);

  const lines = [
    'INVC1',
    `inv=${escapeInvoiceValue(invoiceNumber)}`,
    `iss=${escapeInvoiceValue(issuedOn)}`,
    `due=${escapeInvoiceValue(dueOn)}`,
    `cur=${escapeInvoiceValue(currency)}`,
    `prj=${escapeInvoiceValue(projectName)}`,
    `cn=${escapeInvoiceValue(clientName)}`,
    `cb=${escapeInvoiceValue(clientBusiness)}`,
    `ce=${escapeInvoiceValue(clientEmail)}`,
    `ca=${escapeInvoiceValue(clientAddress)}`,
    'txr=0',
    'txa=',
    'dsc=0',
    `nts=${escapeInvoiceValue(notes)}`,
  ];

  for (const shift of shifts) {
    const workedHours = (calculateShiftWorkedMinutes(shift) / 60).toFixed(2);
    const itemTask = shift.notes || projectName || `Shift on ${formatDateOnly(shift.clockInAt)}`;
    const itemNotes = shift.notes
      ? `Clock Keeper export - ${shift.notes}`
      : 'Clock Keeper export';

    lines.push(
      `it=${[
        escapeInvoiceValue(itemTask),
        workedHours,
        hourlyRate,
        escapeInvoiceValue(invoiceOptions.unitLabel || 'hours'),
        formatDateOnly(shift.clockInAt),
        escapeInvoiceValue(itemNotes),
      ].join('|')}`,
    );
  }

  return lines.join('\n');
}

function buildExportFileName(name, exportType, exportedAt, format = 'csv') {
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'employee';
  const stamp = exportedAt.replace(/[:.]/g, '-');
  const suffix = exportType === 're-export' ? 'reexport' : 'export';
  return `${safeName}-${suffix}-${stamp}.${format === 'invoice' ? 'invoice' : 'csv'}`;
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
  if (shift.clockOutAt) {
    return 'Completed';
  }
  return shift.breaks.some((entry) => !entry.endAt) ? 'On Break' : 'Clocked In';
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatCalendarDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateOnly(value) {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function csvEscape(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function buildInvoiceNumber(issuedOn) {
  return `INV-${issuedOn}`;
}

function normalizeMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2).replace(/\.00$/, '') : '0';
}

function escapeInvoiceValue(value) {
  return String(value ?? '')
    .replaceAll('\n', '; ')
    .replaceAll('\r', '')
    .replaceAll('|', '/');
}

function addDays(isoDate, daysToAdd) {
  const base = new Date(`${isoDate}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + (Number.isFinite(daysToAdd) ? daysToAdd : 7));
  return formatDateOnly(base.toISOString());
}

module.exports = {
  buildCsv,
  buildInvoice,
  buildExportFileName,
  calculateBreakMinutes,
  calculateShiftWorkedMinutes,
  getShiftStatus,
};
