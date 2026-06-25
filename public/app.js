const state = {
  currentUser: null,
  shifts: [],
  authTab: "signin",
  settingsOpen: false,
  timers: {
    ui: null,
    notes: null,
  },
  statusMessages: {
    auth: "",
    export: "",
    settingsExport: "",
    reexport: "",
    manualShift: "",
    general: "",
  },
};

const elements = {
  authView: document.getElementById("authView"),
  dashboardView: document.getElementById("dashboardView"),
  authTabs: Array.from(document.querySelectorAll(".auth-tab")),
  authForms: {
    signin: document.getElementById("signinForm"),
    signup: document.getElementById("signupForm"),
  },
  authMessage: document.getElementById("authMessage"),
  welcomeHeading: document.getElementById("welcomeHeading"),
  settingsToggle: document.getElementById("settingsToggle"),
  settingsDrawer: document.getElementById("settingsDrawer"),
  settingsScrim: document.getElementById("settingsScrim"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  openHistoryBtn: document.getElementById("openHistoryBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  profileSummary: document.getElementById("profileSummary"),
  googleStatus: document.getElementById("googleStatus"),
  googleLinkBtn: document.getElementById("googleLinkBtn"),
  googleUnlinkBtn: document.getElementById("googleUnlinkBtn"),
  manualShiftForm: document.getElementById("manualShiftForm"),
  manualShiftStart: document.getElementById("manualShiftStart"),
  manualShiftEnd: document.getElementById("manualShiftEnd"),
  manualShiftBreakMinutes: document.getElementById("manualShiftBreakMinutes"),
  manualShiftNotes: document.getElementById("manualShiftNotes"),
  manualShiftFeedback: document.getElementById("manualShiftFeedback"),
  statusPill: document.getElementById("statusPill"),
  statusHeadline: document.getElementById("statusHeadline"),
  statusSubtext: document.getElementById("statusSubtext"),
  clockReadouts: Array.from(document.querySelectorAll("[data-clock-readout]")),
  clockFaces: Array.from(document.querySelectorAll("[data-clock-face]")),
  currentShiftDuration: document.getElementById("currentShiftDuration"),
  currentBreakDuration: document.getElementById("currentBreakDuration"),
  clockInBtn: document.getElementById("clockInBtn"),
  clockOutBtn: document.getElementById("clockOutBtn"),
  secondaryActions: document.querySelector(".secondary-actions"),
  breakButtons: Array.from(document.querySelectorAll(".break-btn")),
  endBreakBtn: document.getElementById("endBreakBtn"),
  notesPanel: document.getElementById("notesPanel"),
  recentPanel: document.getElementById("recentPanel"),
  shiftNotes: document.getElementById("shiftNotes"),
  shiftTimeline: document.getElementById("shiftTimeline"),
  unexportedList: document.getElementById("unexportedList"),
  selectUnexportedBtn: document.getElementById("selectUnexportedBtn"),
  exportSelectedBtn: document.getElementById("exportSelectedBtn"),
  exportFeedback: document.getElementById("exportFeedback"),
  settingsUnexportedList: document.getElementById("settingsUnexportedList"),
  settingsSelectUnexportedBtn: document.getElementById("settingsSelectUnexportedBtn"),
  settingsExportSelectedBtn: document.getElementById("settingsExportSelectedBtn"),
  settingsExportInvoiceBtn: document.getElementById("settingsExportInvoiceBtn"),
  settingsExportFeedback: document.getElementById("settingsExportFeedback"),
  historyList: document.getElementById("historyList"),
  historySearch: document.getElementById("historySearch"),
  selectReexportBtn: document.getElementById("selectReexportBtn"),
  reexportSelectedBtn: document.getElementById("reexportSelectedBtn"),
  reexportInvoiceBtn: document.getElementById("reexportInvoiceBtn"),
  reexportFeedback: document.getElementById("reexportFeedback"),
  invoiceNumber: document.getElementById("invoiceNumber"),
  invoiceIssuedOn: document.getElementById("invoiceIssuedOn"),
  invoiceDueOn: document.getElementById("invoiceDueOn"),
  invoiceCurrency: document.getElementById("invoiceCurrency"),
  invoiceProjectName: document.getElementById("invoiceProjectName"),
  invoiceClientName: document.getElementById("invoiceClientName"),
  invoiceClientBusiness: document.getElementById("invoiceClientBusiness"),
  invoiceClientEmail: document.getElementById("invoiceClientEmail"),
  invoiceClientAddress: document.getElementById("invoiceClientAddress"),
  invoiceHourlyRate: document.getElementById("invoiceHourlyRate"),
  invoiceUnitLabel: document.getElementById("invoiceUnitLabel"),
  invoiceNotes: document.getElementById("invoiceNotes"),
  emptyStateTemplate: document.getElementById("emptyStateTemplate"),
};

bootstrap();

async function bootstrap() {
  bindEvents();
  startUiTicker();
  await refreshSession();
  render();
}

function bindEvents() {
  elements.authTabs.forEach((tabButton) => {
    tabButton.addEventListener("click", () => {
      state.authTab = tabButton.dataset.tab;
      state.statusMessages.auth = "";
      renderAuthTabs();
      renderMessages();
    });
  });

  elements.authForms.signin.addEventListener("submit", handleSignin);
  elements.authForms.signup.addEventListener("submit", handleSignup);
  elements.settingsToggle.addEventListener("click", () => toggleSettings(true));
  elements.closeSettingsBtn.addEventListener("click", () => toggleSettings(false));
  elements.settingsScrim.addEventListener("click", () => toggleSettings(false));
  elements.openHistoryBtn.addEventListener("click", () => toggleSettings(true));
  elements.logoutBtn.addEventListener("click", handleLogout);
  elements.manualShiftForm.addEventListener("submit", handleManualShiftCreate);
  elements.clockInBtn.addEventListener("click", handleClockIn);
  elements.clockOutBtn.addEventListener("click", handleClockOut);
  elements.endBreakBtn.addEventListener("click", handleEndBreak);

  if (elements.selectUnexportedBtn) {
    elements.selectUnexportedBtn.addEventListener("click", () => selectVisibleEntries(elements.unexportedList, true));
  }
  if (elements.exportSelectedBtn) {
    elements.exportSelectedBtn.addEventListener("click", () => exportSelectedEntries(elements.unexportedList, "initial-export", "export"));
  }

  elements.settingsSelectUnexportedBtn.addEventListener("click", () => selectVisibleEntries(elements.settingsUnexportedList, true));
  elements.settingsExportSelectedBtn.addEventListener("click", () => exportSelectedEntries(elements.settingsUnexportedList, "initial-export", "csv", "settingsExport"));
  elements.settingsExportInvoiceBtn.addEventListener("click", () => exportSelectedEntries(elements.settingsUnexportedList, "initial-export", "invoice", "settingsExport"));
  elements.selectReexportBtn.addEventListener("click", () => selectVisibleEntries(elements.historyList, false));
  elements.reexportSelectedBtn.addEventListener("click", () => exportSelectedEntries(elements.historyList, "re-export", "csv", "reexport"));
  elements.reexportInvoiceBtn.addEventListener("click", () => exportSelectedEntries(elements.historyList, "re-export", "invoice", "reexport"));
  elements.historySearch.addEventListener("input", renderHistoryList);
  elements.shiftNotes.addEventListener("input", scheduleShiftNotesSave);

  elements.breakButtons.forEach((button) => {
    button.addEventListener("click", () => handleStartBreak(button.dataset.breakType));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.settingsOpen) {
      toggleSettings(false);
    }
  });

  if (elements.googleLinkBtn) {
    elements.googleLinkBtn.disabled = true;
  }
  if (elements.googleUnlinkBtn) {
    elements.googleUnlinkBtn.disabled = true;
  }
}

async function refreshSession() {
  try {
    const response = await apiRequest("/api/session");
    state.currentUser = response.user;
    if (state.currentUser) {
      await loadShifts();
    } else {
      state.shifts = [];
    }
  } catch (error) {
    state.currentUser = null;
    state.shifts = [];
    state.statusMessages.auth = error.message;
  }
}

async function loadShifts() {
  const response = await apiRequest("/api/shifts");
  state.shifts = response.shifts;
}

async function handleSignin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);

  try {
    const response = await apiRequest("/api/auth/signin", {
      method: "POST",
      body: {
        email: String(formData.get("email") || ""),
        password: String(formData.get("password") || ""),
      },
    });

    state.currentUser = response.user;
    state.statusMessages.auth = "";
    form.reset();
    await loadShifts();
    render();
  } catch (error) {
    state.statusMessages.auth = error.message;
    renderMessages();
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);

  try {
    const response = await apiRequest("/api/auth/signup", {
      method: "POST",
      body: {
        name: String(formData.get("name") || ""),
        email: String(formData.get("email") || ""),
        password: String(formData.get("password") || ""),
      },
    });

    state.currentUser = response.user;
    state.statusMessages.auth = "";
    form.reset();
    await loadShifts();
    render();
  } catch (error) {
    state.statusMessages.auth = error.message;
    renderMessages();
  }
}

async function handleLogout() {
  try {
    await apiRequest("/api/auth/signout", { method: "POST" });
  } catch {
    // Logout should still clear local UI state even if the request fails.
  }

  cancelPendingNotesSave();
  state.currentUser = null;
  state.shifts = [];
  state.settingsOpen = false;
  state.statusMessages = {
    auth: "",
    export: "",
    settingsExport: "",
    reexport: "",
    manualShift: "",
    general: "",
  };
  render();
}

async function handleClockIn() {
  try {
    const response = await apiRequest("/api/shifts/clock-in", { method: "POST" });
    state.shifts = response.shifts;
    clearFeedbackMessages();
    render();
  } catch (error) {
    state.statusMessages.export = error.message;
    renderMessages();
  }
}

async function handleClockOut() {
  const activeShift = getActiveShift();
  if (!activeShift) {
    state.statusMessages.export = "There's no active shift to clock out from.";
    renderMessages();
    return;
  }

  cancelPendingNotesSave();

  try {
    const response = await apiRequest(`/api/shifts/${activeShift.id}/clock-out`, {
      method: "POST",
      body: { notes: elements.shiftNotes.value.trim() },
    });
    state.shifts = response.shifts;
    clearFeedbackMessages();
    render();
  } catch (error) {
    state.statusMessages.export = error.message;
    renderMessages();
  }
}

async function handleStartBreak(type) {
  const activeShift = getActiveShift();
  if (!activeShift) {
    state.statusMessages.export = "Clock in before starting a break.";
    renderMessages();
    return;
  }

  try {
    const response = await apiRequest(`/api/shifts/${activeShift.id}/breaks`, {
      method: "POST",
      body: { type },
    });
    state.shifts = response.shifts;
    clearFeedbackMessages();
    render();
  } catch (error) {
    state.statusMessages.export = error.message;
    renderMessages();
  }
}

async function handleEndBreak() {
  const activeShift = getActiveShift();
  const openBreak = activeShift ? getOpenBreak(activeShift) : null;
  if (!activeShift || !openBreak) {
    state.statusMessages.export = "There's no active break to end.";
    renderMessages();
    return;
  }

  try {
    const response = await apiRequest(`/api/shifts/${activeShift.id}/breaks/${openBreak.id}/end`, {
      method: "POST",
    });
    state.shifts = response.shifts;
    clearFeedbackMessages();
    render();
  } catch (error) {
    state.statusMessages.export = error.message;
    renderMessages();
  }
}

async function handleManualShiftCreate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);

  try {
    const response = await apiRequest("/api/shifts/manual", {
      method: "POST",
      body: {
        startAt: String(formData.get("startAt") || ""),
        endAt: String(formData.get("endAt") || ""),
        breakMinutes: String(formData.get("breakMinutes") || "0"),
        notes: String(formData.get("notes") || ""),
      },
    });

    state.shifts = response.shifts;
    state.statusMessages.manualShift = "Missed shift saved.";
    form.reset();
    seedManualShiftDefaults();
    render();
  } catch (error) {
    state.statusMessages.manualShift = error.message;
    renderMessages();
  }
}

function scheduleShiftNotesSave(event) {
  const activeShift = getActiveShift();
  if (!activeShift) return;

  const nextNotes = event.target.value;
  cancelPendingNotesSave();
  state.timers.notes = window.setTimeout(async () => {
    try {
      const response = await apiRequest(`/api/shifts/${activeShift.id}/notes`, {
        method: "PATCH",
        body: { notes: nextNotes },
      });
      state.shifts = response.shifts;
      renderRecentTimeline();
      renderHistoryList();
    } catch {
      // Leave the current draft in the field. The user can still clock out and save notes then.
    }
  }, 500);
}

async function exportSelectedEntries(sourceElement, exportType, format, messageKey) {
  const checked = Array.from(sourceElement.querySelectorAll('input[type="checkbox"]:checked'));
  if (!checked.length) {
    state.statusMessages[messageKey] = "Select at least one entry before exporting.";
    renderMessages();
    return;
  }

  try {
    const response = await apiRequest("/api/exports", {
      method: "POST",
      body: {
        shiftIds: checked.map((input) => input.value),
        type: exportType,
        format,
        invoice: format === "invoice" ? collectInvoiceOptions() : undefined,
      },
    });

    downloadFile(response.content, response.filename, response.mimeType);
    state.shifts = response.shifts;
    state.statusMessages[messageKey] = `${response.exportedCount} entr${response.exportedCount === 1 ? "y was" : "ies were"} exported as ${format === "invoice" ? ".invoice" : "CSV"}.`;
    render();
  } catch (error) {
    state.statusMessages[messageKey] = error.message;
    renderMessages();
  }
}

function render() {
  const isAuthenticated = Boolean(state.currentUser);
  elements.authView.classList.toggle("hidden", isAuthenticated);
  elements.dashboardView.classList.toggle("hidden", !isAuthenticated);
  document.body.classList.remove("status-off", "status-on", "status-break");

  renderAuthTabs();
  updateClockFaces();

  if (!isAuthenticated) {
    document.body.classList.add("status-off");
    toggleSettings(false);
    renderMessages();
    return;
  }

  elements.welcomeHeading.textContent = `Welcome, ${state.currentUser.name}`;
  renderDashboard(state.currentUser);
  renderSettings();
  renderMessages();
}

function renderAuthTabs() {
  elements.authTabs.forEach((button) => {
    const active = button.dataset.tab === state.authTab;
    button.classList.toggle("active", active);
    elements.authForms[button.dataset.tab].classList.toggle("active", active);
  });
}

function renderDashboard(currentUser) {
  const activeShift = getActiveShift();
  const openBreak = activeShift ? getOpenBreak(activeShift) : null;

  if (!activeShift) {
    document.body.classList.add("status-off");
    elements.statusPill.textContent = "Off the clock";
    elements.statusHeadline.textContent = "Ready when you are";
    elements.statusSubtext.textContent = "Clock in to start recording today's shift.";
    elements.currentShiftDuration.textContent = "00:00";
    elements.currentBreakDuration.textContent = "00:00";
    elements.shiftNotes.value = "";
    elements.notesPanel.classList.add("hidden");
    elements.recentPanel.classList.remove("hidden");
    elements.clockInBtn.classList.remove("hidden");
    elements.clockOutBtn.classList.add("hidden");
    elements.secondaryActions.classList.add("hidden");
  } else if (openBreak) {
    document.body.classList.add("status-break");
    elements.statusPill.textContent = `${openBreak.type} break`;
    elements.statusHeadline.textContent = "Break in progress";
    elements.statusSubtext.textContent = `Started ${formatDateTime(openBreak.startAt)}.`;
    elements.currentShiftDuration.textContent = formatDuration(calculateShiftWorkedMinutes(activeShift));
    elements.currentBreakDuration.textContent = formatDuration(calculateBreakMinutes(activeShift));
    elements.shiftNotes.value = activeShift.notes || "";
    elements.notesPanel.classList.remove("hidden");
    elements.recentPanel.classList.add("hidden");
    elements.clockInBtn.classList.add("hidden");
    elements.clockOutBtn.classList.remove("hidden");
    elements.secondaryActions.classList.remove("hidden");
  } else {
    document.body.classList.add("status-on");
    elements.statusPill.textContent = "Clocked in";
    elements.statusHeadline.textContent = "Shift is running";
    elements.statusSubtext.textContent = `Clocked in at ${formatTime(activeShift.clockInAt)}.`;
    elements.currentShiftDuration.textContent = formatDuration(calculateShiftWorkedMinutes(activeShift));
    elements.currentBreakDuration.textContent = formatDuration(calculateBreakMinutes(activeShift));
    elements.shiftNotes.value = activeShift.notes || "";
    elements.notesPanel.classList.remove("hidden");
    elements.recentPanel.classList.add("hidden");
    elements.clockInBtn.classList.add("hidden");
    elements.clockOutBtn.classList.remove("hidden");
    elements.secondaryActions.classList.remove("hidden");
  }

  elements.clockInBtn.disabled = Boolean(activeShift);
  elements.clockOutBtn.disabled = !activeShift;
  elements.breakButtons.forEach((button) => {
    button.disabled = !activeShift || Boolean(openBreak);
  });
  elements.endBreakBtn.disabled = !openBreak;
  elements.endBreakBtn.classList.toggle("hidden", !openBreak);

  renderRecentTimeline(currentUser);
  renderUnexportedList(currentUser);
  renderHistoryList();
}

function renderRecentTimeline() {
  elements.shiftTimeline.innerHTML = "";
  const completedShifts = state.shifts.filter((shift) => Boolean(shift.clockOutAt)).slice(0, 2);

  if (!completedShifts.length) {
    elements.shiftTimeline.appendChild(cloneEmptyState("No completed shifts yet."));
    return;
  }

  completedShifts.forEach((shift) => {
    const card = document.createElement("article");
    card.className = "timeline-card";
    card.innerHTML = `
      <div class="entry-topline">
        <div>
          <div class="entry-title">${formatCalendarDate(shift.clockInAt)}</div>
          <div class="entry-meta">${formatTime(shift.clockInAt)} - ${formatTime(shift.clockOutAt)}</div>
        </div>
        <span class="status-tag tag-success">Done</span>
      </div>
      <p class="entry-meta">Worked ${formatHours(calculateShiftWorkedMinutes(shift))} hrs | Break ${formatHours(calculateBreakMinutes(shift))} hrs</p>
      ${shift.notes ? `<p class="entry-note">Notes: ${escapeHtml(shift.notes)}</p>` : ""}
    `;
    elements.shiftTimeline.appendChild(card);
  });
}

function renderUnexportedList(currentUser) {
  const shifts = state.shifts.filter((shift) => !shift.exports.length && Boolean(shift.clockOutAt));
  const containers = [elements.unexportedList, elements.settingsUnexportedList].filter(Boolean);
  containers.forEach((container) => {
    container.innerHTML = "";
  });

  if (!shifts.length) {
    containers.forEach((container) => {
      container.appendChild(cloneEmptyState("Everything completed has already been exported."));
    });
    return;
  }

  shifts.forEach((shift) => {
    containers.forEach((container) => {
      container.appendChild(buildSelectableShiftCard(shift, currentUser, "unexported"));
    });
  });
}

function renderHistoryList() {
  const query = elements.historySearch.value.trim().toLowerCase();
  const shifts = state.shifts.filter((shift) => {
    if (!shift.clockOutAt) return false;
    if (!query) return true;
    const searchable = [
      formatCalendarDate(shift.clockInAt),
      getShiftStatus(shift).label,
      shift.notes || "",
      shift.clockOutAt ? formatCalendarDate(shift.clockOutAt) : "",
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(query);
  });

  elements.historyList.innerHTML = "";

  if (!shifts.length) {
    elements.historyList.appendChild(cloneEmptyState("No matching entries found."));
    return;
  }

  shifts.forEach((shift) => {
    elements.historyList.appendChild(buildSelectableShiftCard(shift, state.currentUser, "history"));
  });
}

function buildSelectableShiftCard(shift, currentUser, variant) {
  const wrapper = document.createElement("article");
  wrapper.className = variant === "history" ? "history-card" : "selection-card";
  const status = getShiftStatus(shift);
  const exportCount = shift.exports.length;

  wrapper.innerHTML = `
    <div class="history-header">
      <div>
        <div class="history-title">${formatCalendarDate(shift.clockInAt)}</div>
        <div class="entry-meta">${formatDateTime(shift.clockInAt)}${shift.clockOutAt ? ` to ${formatDateTime(shift.clockOutAt)}` : ""}</div>
      </div>
      <div class="status-tag-row">
        <span class="status-tag ${status.tagClass}">${status.label}</span>
        <span class="status-tag">${exportCount ? `${exportCount} export${exportCount > 1 ? "s" : ""}` : "Never exported"}</span>
      </div>
    </div>
    <p class="entry-meta">Worked ${formatHours(calculateShiftWorkedMinutes(shift))} hours | Break ${formatHours(calculateBreakMinutes(shift))} hours</p>
    <p class="export-hint">${buildExportHint(shift, currentUser)}</p>
    ${shift.notes ? `<p class="entry-note">Notes: ${escapeHtml(shift.notes)}</p>` : ""}
    <label class="checkbox-row">
      <input type="checkbox" value="${shift.id}" data-exported="${shift.exports.length ? "true" : "false"}" />
      <span>${variant === "history" ? "Select for re-export" : "Select for initial export"}</span>
    </label>
  `;

  return wrapper;
}

function renderSettings() {
  elements.settingsDrawer.classList.toggle("hidden", !state.settingsOpen);
  elements.settingsScrim.classList.toggle("hidden", !state.settingsOpen);
  elements.settingsDrawer.setAttribute("aria-hidden", String(!state.settingsOpen));

  if (!state.currentUser) return;

  elements.profileSummary.textContent = `${state.currentUser.name} | ${state.currentUser.email}`;
  elements.googleStatus.textContent = "Google linking is disabled in this build for now.";
  seedManualShiftDefaults();
  seedInvoiceDefaults();
}

function renderMessages() {
  elements.authMessage.textContent = state.statusMessages.auth;
  elements.exportFeedback.textContent = state.statusMessages.export;
  elements.settingsExportFeedback.textContent = state.statusMessages.settingsExport;
  elements.reexportFeedback.textContent = state.statusMessages.reexport;
  elements.manualShiftFeedback.textContent = state.statusMessages.manualShift;
}

function toggleSettings(nextState) {
  state.settingsOpen = nextState;
  elements.settingsDrawer.classList.toggle("hidden", !nextState);
  elements.settingsScrim.classList.toggle("hidden", !nextState);
  elements.settingsDrawer.setAttribute("aria-hidden", String(!nextState));
}

function selectVisibleEntries(container, onlyUnexported) {
  if (!container) return;
  container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = onlyUnexported ? checkbox.dataset.exported !== "true" : true;
  });
}

function clearFeedbackMessages() {
  state.statusMessages.export = "";
  state.statusMessages.settingsExport = "";
  state.statusMessages.reexport = "";
  state.statusMessages.manualShift = "";
}

function getActiveShift() {
  return state.shifts.find((shift) => !shift.clockOutAt) || null;
}

function getOpenBreak(shift) {
  return shift.breaks.find((entry) => !entry.endAt) || null;
}

function getShiftStatus(shift) {
  if (!shift.clockOutAt) {
    return getOpenBreak(shift)
      ? { label: "On Break", tagClass: "tag-warning" }
      : { label: "Clocked In", tagClass: "tag-danger" };
  }
  return { label: "Completed", tagClass: "tag-success" };
}

function buildExportHint(shift, currentUser) {
  if (!shift.exports.length) {
    return `Ready to export for ${currentUser.name}.`;
  }
  const latest = shift.exports[shift.exports.length - 1];
  const formatLabel = latest.format === "invoice" ? ".invoice" : "CSV";
  return `Last ${latest.type} ${formatLabel} at ${formatDateTime(latest.exportedAt)}.`;
}

function calculateBreakMinutes(shift) {
  return shift.breaks.reduce((total, item) => {
    const end = item.endAt ? new Date(item.endAt) : new Date();
    const start = new Date(item.startAt);
    return total + Math.max(0, Math.round((end - start) / 60000));
  }, 0);
}

function calculateShiftWorkedMinutes(shift) {
  const start = new Date(shift.clockInAt);
  const end = shift.clockOutAt ? new Date(shift.clockOutAt) : new Date();
  const totalMinutes = Math.max(0, Math.round((end - start) / 60000));
  return Math.max(0, totalMinutes - calculateBreakMinutes(shift));
}

function startUiTicker() {
  if (state.timers.ui) return;
  updateClockFaces();
  state.timers.ui = window.setInterval(() => {
    updateClockFaces();
    if (state.currentUser) {
      const activeShift = getActiveShift();
      if (!activeShift) return;
      elements.currentShiftDuration.textContent = formatDuration(calculateShiftWorkedMinutes(activeShift));
      elements.currentBreakDuration.textContent = formatDuration(calculateBreakMinutes(activeShift));
    }
  }, 1000);
}

function updateClockFaces() {
  const now = new Date();
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const hourRotation = hours * 30 + minutes * 0.5;
  const minuteRotation = minutes * 6 + seconds * 0.1;
  const secondRotation = seconds * 6;

  elements.clockReadouts.forEach((node) => {
    node.textContent = formatClockReadout(now);
  });

  elements.clockFaces.forEach((face) => {
    face.querySelector('[data-hand="hour"]').style.transform = `rotate(${hourRotation}deg)`;
    face.querySelector('[data-hand="minute"]').style.transform = `rotate(${minuteRotation}deg)`;
    face.querySelector('[data-hand="second"]').style.transform = `rotate(${secondRotation}deg)`;
  });
}

function cancelPendingNotesSave() {
  if (state.timers.notes) {
    window.clearTimeout(state.timers.notes);
    state.timers.notes = null;
  }
}

async function apiRequest(url, options = {}) {
  const fetchOptions = {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
  };

  const response = await fetch(url, fetchOptions);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}.`);
  }

  return data;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatHours(totalMinutes) {
  return (totalMinutes / 60).toFixed(2);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCalendarDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatClockReadout(value) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cloneEmptyState(message = "No entries yet.") {
  const node = elements.emptyStateTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector("p").textContent = message;
  return node;
}

function collectInvoiceOptions() {
  return {
    invoiceNumber: elements.invoiceNumber.value.trim(),
    issuedOn: elements.invoiceIssuedOn.value,
    dueOn: elements.invoiceDueOn.value,
    currency: elements.invoiceCurrency.value.trim().toUpperCase() || "USD",
    projectName: elements.invoiceProjectName.value.trim(),
    clientName: elements.invoiceClientName.value.trim(),
    clientBusiness: elements.invoiceClientBusiness.value.trim(),
    clientEmail: elements.invoiceClientEmail.value.trim(),
    clientAddress: elements.invoiceClientAddress.value.trim(),
    hourlyRate: elements.invoiceHourlyRate.value.trim(),
    unitLabel: elements.invoiceUnitLabel.value.trim() || "hours",
    notes: elements.invoiceNotes.value.trim(),
  };
}

function seedManualShiftDefaults() {
  if (elements.manualShiftStart.value || elements.manualShiftEnd.value) {
    return;
  }

  const now = new Date();
  const start = new Date(now);
  start.setHours(9, 0, 0, 0);
  const end = new Date(now);
  end.setHours(17, 0, 0, 0);
  elements.manualShiftStart.value = formatDateTimeLocalInput(start);
  elements.manualShiftEnd.value = formatDateTimeLocalInput(end);
}

function seedInvoiceDefaults() {
  const today = formatDateInput(new Date());
  if (!elements.invoiceIssuedOn.value) {
    elements.invoiceIssuedOn.value = today;
  }
  if (!elements.invoiceDueOn.value) {
    const due = new Date();
    due.setDate(due.getDate() + 7);
    elements.invoiceDueOn.value = formatDateInput(due);
  }
  if (!elements.invoiceCurrency.value) {
    elements.invoiceCurrency.value = "USD";
  }
  if (!elements.invoiceUnitLabel.value) {
    elements.invoiceUnitLabel.value = "hours";
  }
}

function formatDateInput(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTimeLocalInput(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
