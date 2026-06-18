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

function buildExportFileName(name, exportType, exportedAt) {
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'employee';
  const stamp = exportedAt.replace(/[:.]/g, '-');
  return `${safeName}-${exportType === 're-export' ? 'reexport' : 'export'}-${stamp}.csv`;
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

module.exports = {
  buildCsv,
  buildExportFileName,
  calculateBreakMinutes,
  calculateShiftWorkedMinutes,
  getShiftStatus,
};
