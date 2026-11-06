// UI: the settings dialog (gear on the sidebar rail) and today's focus editor.
//
// DOM. Not portable.
//
// Backup/restore RULES live in js/core/backup.js — this file only presents
// them and performs the download, because handing the user a file is a
// platform concern (a native build offers a share sheet instead).
//
// Import is destructive and irreversible, so the flow is deliberately
// two-step: pick the file, read a summary of what it contains
// (describeBackup), and only then confirm. Never collapse that into one click.

let _ctx = null;
export function configure(c) { _ctx = c; }
const ctx = new Proxy({}, { get: (_, k) => _ctx[k] });

// SETTINGS
// One organized home for app-level options. Future settings (theme
// color, blob animation behavior, notification frequency…) each get
// their own cat-modal-section block inside openSettingsModal().
// =========================================================


export function downloadExport() {
  const blob = new Blob([JSON.stringify(ctx.collectExportPayload(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `day-by-day-backup-${ctx.getTodayString()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openSettingsModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay cat-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'cat-modal settings-modal';

  const header = document.createElement('div');
  header.className = 'cat-modal-header';
  const title = document.createElement('h3');
  title.className = 'cat-modal-title';
  title.textContent = 'Settings';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'cat-modal-close';
  closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  closeBtn.addEventListener('click', () => overlay.remove());
  header.append(title, closeBtn);

  // ── Data ─────────────────────────────────────────────────
  const dataSection = document.createElement('div');
  dataSection.className = 'cat-modal-section';
  const dataLabel = document.createElement('p');
  dataLabel.className = 'cat-modal-label';
  dataLabel.textContent = 'Data';
  const dataHint = document.createElement('p');
  dataHint.className = 'settings-hint';
  dataHint.textContent = 'Everything lives in this browser. Export a backup now and then — clearing browser data would erase the app.';

  const dataRow = document.createElement('div');
  dataRow.className = 'settings-row';
  const dataStatus = document.createElement('p');
  dataStatus.className = 'settings-hint settings-status';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-primary';
  exportBtn.textContent = 'Export backup';
  exportBtn.addEventListener('click', () => {
    downloadExport();
    dataStatus.textContent = 'Backup downloaded.';
  });

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-ghost';
  importBtn.textContent = 'Import backup…';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.className = 'hidden';
  importBtn.addEventListener('click', () => fileInput.click());

  // Import confirmation — shown once a file parses as a backup.
  const confirmArea = document.createElement('div');
  confirmArea.className = 'settings-confirm hidden';
  const confirmText = document.createElement('p');
  confirmText.className = 'settings-hint';
  const confirmRow = document.createElement('div');
  confirmRow.className = 'settings-row';
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-primary settings-danger-btn';
  confirmBtn.textContent = 'Replace & reload';
  const cancelImportBtn = document.createElement('button');
  cancelImportBtn.className = 'btn btn-ghost';
  cancelImportBtn.textContent = 'Cancel';
  confirmRow.append(confirmBtn, cancelImportBtn);
  confirmArea.append(confirmText, confirmRow);

  let pendingImport = null;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let payload = null;
      try { payload = JSON.parse(reader.result); } catch (e) {}
      if (!payload || payload.app !== 'day-by-day' || !payload.keys) {
        dataStatus.textContent = 'That file isn\'t a Day by Day backup.';
        confirmArea.classList.add('hidden');
        return;
      }
      pendingImport = payload;
      const when = payload.exportedAt ? new Date(payload.exportedAt).toLocaleDateString() : 'an unknown date';
      confirmText.textContent = `Backup from ${when} — ${ctx.describeBackup(payload)}. Importing replaces everything currently in the app.`;
      dataStatus.textContent = '';
      confirmArea.classList.remove('hidden');
    };
    reader.readAsText(file);
  });

  confirmBtn.addEventListener('click', () => {
    if (!pendingImport) return;
    const err = ctx.applyImportPayload(pendingImport);
    if (err) {
      dataStatus.textContent = err;
      confirmArea.classList.add('hidden');
      pendingImport = null;
      return;
    }
    location.reload();
  });
  cancelImportBtn.addEventListener('click', () => {
    pendingImport = null;
    confirmArea.classList.add('hidden');
  });

  dataRow.append(exportBtn, importBtn);
  dataSection.append(dataLabel, dataHint, dataRow, confirmArea, dataStatus, fileInput);

  // ── About ────────────────────────────────────────────────
  const aboutSection = document.createElement('div');
  aboutSection.className = 'cat-modal-section';
  const aboutLabel = document.createElement('p');
  aboutLabel.className = 'cat-modal-label';
  aboutLabel.textContent = 'About';
  const aboutText = document.createElement('p');
  aboutText.className = 'settings-hint';
  aboutText.textContent = `Day by Day v${ctx.APP_VERSION} — a finitude-aware daily focus app. Your data never leaves this browser.`;
  aboutSection.append(aboutLabel, aboutText);

  modal.append(header, dataSection, aboutSection);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) overlay.remove(); });
}

const settingsBtn = document.getElementById('settings-btn');
if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);

// =========================================================
// TODAY'S FOCUS EDITOR — sidebar row → picker modal.
// Set focus areas if the day-start modal was skipped, or change them
// mid-day when the plan isn't working out. Same chips + up-to-3 rule
// as the day-transition modal; zero selected = no filter.
// =========================================================
export function openEditFocusModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay cat-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'cat-modal focus-edit-modal';

  const header = document.createElement('div');
  header.className = 'cat-modal-header';
  const title = document.createElement('h3');
  title.className = 'cat-modal-title';
  title.textContent = 'Today\'s focus';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'cat-modal-close';
  closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  closeBtn.addEventListener('click', () => overlay.remove());
  header.append(title, closeBtn);

  const hint = document.createElement('p');
  hint.className = 'settings-hint';
  hint.textContent = 'Pick up to 3 life areas for today — the backlog card and sidebar follow along. Plans change; that\'s allowed.';

  // Same chip grid + selection rule as the day-transition modal.
  const catGrid = document.createElement('div');
  catGrid.className = 'day-modal-cat-grid';
  const selectedCats = new Set(ctx.state.focusCategoryIds || []);

  ctx.activeCategories().forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'day-modal-cat-btn' + (selectedCats.has(cat.id) ? ' selected' : '');
    btn.dataset.catId = cat.id;
    const allTimeHours = cat.totalHours || 0;
    btn.innerHTML = `<span class="dmc-emoji">${cat.emoji}</span><span class="dmc-name">${cat.name}</span>${allTimeHours > 0 ? `<span class="dmc-hours">${allTimeHours.toFixed(0)}h</span>` : ''}`;
    btn.addEventListener('click', () => {
      if (selectedCats.has(cat.id)) {
        selectedCats.delete(cat.id);
        btn.classList.remove('selected');
      } else {
        if (selectedCats.size >= 3) {
          // Drop the oldest *pick*, FIFO. A Set preserves insertion order, so
          // its first value is the earliest selection — querySelector would
          // instead return whichever selected button sits leftmost in the
          // grid, which is rarely the one chosen first.
          const oldestId = selectedCats.values().next().value;
          selectedCats.delete(oldestId);
          const oldestBtn = catGrid.querySelector(`.day-modal-cat-btn[data-cat-id="${oldestId}"]`);
          if (oldestBtn) oldestBtn.classList.remove('selected');
        }
        selectedCats.add(cat.id);
        btn.classList.add('selected');
      }
      intentionFields.refresh();
    });
    catGrid.appendChild(btn);
  });

  // Same optional time intentions as the morning modal, so they can be
  // adjusted mid-day without waiting for tomorrow.
  const intentionFields = ctx.makeIntentionFields(
    () => Array.from(selectedCats),
    ctx.state.focusIntentions,
  );

  const actions = document.createElement('div');
  actions.className = 'cat-modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Set focus';
  saveBtn.addEventListener('click', () => {
    ctx.state.focusCategoryIds = Array.from(selectedCats);
    ctx.state.focusIntentions = intentionFields.collect();
    ctx.saveState();
    ctx.renderSidebar();
    ctx.renderBacklog(); // backlog card filters by focus categories
    ctx.applyBlobColors();
    overlay.remove();
  });
  actions.append(cancelBtn, saveBtn);

  modal.append(header, hint, catGrid, intentionFields.el, actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) overlay.remove(); });
}

