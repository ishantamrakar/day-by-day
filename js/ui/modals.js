// UI: the modal dialogs — category editing, quick-add, new area, task detail.
//
// DOM. Not portable.
//
// Each modal owns a single module-level handle (activeQuickAdd, activePicker,
// activeModal) and closes any previous one before opening. That is deliberate:
// stacked modals would fight over the page-inert rule (see
// docs/design-system.md § Modals), so there is only ever one.
//
// The MutationObserver in app.js watches for overlays entering and leaving the
// body and drives the `modal-open` class from that, so every close path —
// including a stray overlay.remove() — is covered without each modal having to
// remember to clean up after itself.

import { formatHours, hexToRgb } from '../core/format.js';
import { makeTimeAddRing } from './time-ring.js';
import { COLOR_SWATCHES, emojiToColor } from '../core/palette.js';

// Appends a rainbow "custom color" button to a container.
// Clicking opens a small positioned popover with a visible <input type="color">,
// a live preview swatch, and Cancel / OK buttons.
// onPick(hex) is called only when OK is confirmed.
export function appendColorPickerSwatch(container, currentColor, onPick, extraClass) {
  const btn = document.createElement('button');
  btn.className = 'cat-modal-swatch swatch-rainbow' + (extraClass ? ' ' + extraClass : '');
  btn.title = 'Custom color';
  btn.type = 'button';

  btn.addEventListener('click', e => {
    e.stopPropagation();
    // Remove any existing custom picker popover
    document.querySelectorAll('.custom-color-pop').forEach(p => p.remove());

    let pendingColor = currentColor || '#40916c';

    const pop = document.createElement('div');
    pop.className = 'custom-color-pop';

    const title = document.createElement('div');
    title.className = 'custom-color-pop-title';
    title.textContent = 'Custom color';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = pendingColor;
    colorInput.className = 'custom-color-input';

    const preview = document.createElement('div');
    preview.className = 'custom-color-preview';
    const previewSwatch = document.createElement('span');
    previewSwatch.className = 'custom-color-preview-swatch';
    previewSwatch.style.background = pendingColor;
    const previewHex = document.createElement('span');
    previewHex.className = 'custom-color-preview-hex';
    previewHex.textContent = pendingColor;
    preview.append(previewSwatch, previewHex);

    colorInput.addEventListener('input', () => {
      pendingColor = colorInput.value;
      previewSwatch.style.background = pendingColor;
      previewHex.textContent = pendingColor;
    });

    const actions = document.createElement('div');
    actions.className = 'custom-color-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.style.fontSize = '0.75rem';
    cancelBtn.style.padding = '5px 10px';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', e => { e.stopPropagation(); pop.remove(); });

    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-primary';
    okBtn.style.fontSize = '0.75rem';
    okBtn.style.padding = '5px 10px';
    okBtn.textContent = 'OK';
    okBtn.type = 'button';
    okBtn.addEventListener('click', e => {
      e.stopPropagation();
      onPick(pendingColor);
      pop.remove();
    });

    actions.append(cancelBtn, okBtn);
    pop.append(title, colorInput, preview, actions);
    document.body.appendChild(pop);

    // Position near the trigger button
    const r = btn.getBoundingClientRect();
    const popW = 180;
    let left = r.left;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    pop.style.left = left + 'px';
    pop.style.top = (r.bottom + 6) + 'px';

    // Close on outside click
    setTimeout(() => {
      const close = ev => {
        if (!pop.contains(ev.target) && ev.target !== btn) {
          pop.remove();
          document.removeEventListener('pointerdown', close, true);
        }
      };
      document.addEventListener('pointerdown', close, true);
    }, 50);
  });

  container.appendChild(btn);
}

let _ctx = null;
export function configure(c) { _ctx = c; }
const ctx = new Proxy({}, { get: (_, k) => _ctx[k] });

// =========================================================
// INLINE CATEGORY EDIT — replaces card top row on pencil click
// =========================================================
export function openCatInlineEdit(cat, card, top, editBtn) {
  // Swap the top row for an edit row
  const editRow = document.createElement('div');
  editRow.className = 'sidebar-cat-edit-row';

  // Emoji button — clicking cycles through a small inline emoji picker
  const emojiBtn = document.createElement('button');
  emojiBtn.className = 'sidebar-cat-edit-emoji';
  emojiBtn.textContent = cat.emoji || '●';
  emojiBtn.title = 'Change emoji';

  // Simple inline emoji grid popover
  emojiBtn.addEventListener('click', e => {
    e.stopPropagation();
    const existing = document.querySelector('.sidebar-emoji-picker-pop');
    if (existing) { existing.remove(); return; }
    const EMOJIS = ['💪','💼','❤️','🧹','⚡','🎯','📚','🎨','💡','🏃','🧘','💰','🌱','🔧','🎵','✈️','🍎','🧠','🤝','🏠'];
    const pop = document.createElement('div');
    pop.className = 'sidebar-emoji-picker-pop';
    EMOJIS.forEach(em => {
      const btn = document.createElement('button');
      btn.className = 'sidebar-emoji-pick-btn';
      btn.textContent = em;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        emojiBtn.textContent = em;
        pop.remove();
      });
      pop.appendChild(btn);
    });
    document.body.appendChild(pop);
    const r = emojiBtn.getBoundingClientRect();
    pop.style.left = r.left + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    setTimeout(() => {
      const close = ev => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('pointerdown', close, true); } };
      document.addEventListener('pointerdown', close, true);
    }, 50);
  });

  const nameInput = document.createElement('input');
  nameInput.className = 'sidebar-cat-edit-input';
  nameInput.value = cat.name;
  nameInput.maxLength = 30;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary sidebar-cat-edit-save';
  saveBtn.textContent = 'Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost sidebar-cat-edit-cancel';
  cancelBtn.textContent = '✕';

  // Color dot — shows current color, click to open popover
  let editColor = cat.color || emojiToColor(cat.emoji);
  const colorDot = document.createElement('button');
  colorDot.className = 'sidebar-color-dot';
  colorDot.style.background = editColor;
  colorDot.title = 'Change color';

  editRow.append(emojiBtn, nameInput, colorDot, saveBtn, cancelBtn);

  // Popover — shown when colorDot is clicked
  let colorPop = null;
  function openColorPop() {
    if (colorPop) { colorPop.remove(); colorPop = null; return; }
    colorPop = document.createElement('div');
    colorPop.className = 'sidebar-color-pop';
    // Deleted areas free their color; archived ones keep holding it
    const usedByOthers = new Set(ctx.categories.filter(c => c.id !== cat.id && !c.deleted).map(c => c.color).filter(Boolean));
    COLOR_SWATCHES.forEach(color => {
      const taken = usedByOthers.has(color);
      const sw = document.createElement('button');
      sw.className = 'cat-modal-swatch sidebar-swatch-sm' + (color === editColor ? ' selected' : '') + (taken ? ' swatch-taken' : '');
      sw.style.background = color;
      sw.title = taken ? 'Already used by another life area' : '';
      sw.disabled = taken;
      sw.addEventListener('click', e => {
        e.stopPropagation();
        if (taken) return;
        editColor = color;
        colorDot.style.background = color;
        colorPop.remove(); colorPop = null;
        // Also sync if emoji just changed
        const suggested = emojiToColor(emojiBtn.textContent.trim());
        if (color !== suggested) colorDot.title = 'Change color'; // user override
      });
      colorPop.appendChild(sw);
    });
    // Custom color picker
    appendColorPickerSwatch(colorPop, editColor, hex => {
      editColor = hex;
      colorDot.style.background = hex;
      // Close the palette popover after OK — color is committed
      if (colorPop) { colorPop.remove(); colorPop = null; }
    }, 'sidebar-swatch-sm');

    colorDot.insertAdjacentElement('afterend', colorPop);
    setTimeout(() => {
      const close = ev => {
        if (colorPop && !colorPop.contains(ev.target) && ev.target !== colorDot) {
          colorPop.remove(); colorPop = null;
          document.removeEventListener('pointerdown', close, true);
        }
      };
      document.addEventListener('pointerdown', close, true);
    }, 50);
  }
  colorDot.addEventListener('click', e => { e.stopPropagation(); openColorPop(); });

  // Auto-update color dot when emoji changes in the picker
  const emojiObserver = new MutationObserver(() => {
    const suggested = emojiToColor(emojiBtn.textContent.trim());
    editColor = suggested;
    colorDot.style.background = suggested;
    if (colorPop) { colorPop.remove(); colorPop = null; }
  });
  emojiObserver.observe(emojiBtn, { childList: true, characterData: true, subtree: true });

  function confirmEdit() {
    const newName = nameInput.value.trim();
    if (!newName) { nameInput.focus(); return; }
    emojiObserver.disconnect();
    cat.emoji = emojiBtn.textContent;
    cat.name = newName;
    cat.color = editColor;
    ctx.saveCategories();
    ctx.renderSidebar();
  }

  function cancelEdit() {
    emojiObserver.disconnect();
    if (colorPop) { colorPop.remove(); colorPop = null; }
    editRow.replaceWith(top);
    editBtn.style.display = '';
  }

  saveBtn.addEventListener('click', e => { e.stopPropagation(); confirmEdit(); });
  cancelBtn.addEventListener('click', e => { e.stopPropagation(); cancelEdit(); });
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  });

  top.replaceWith(editRow);
  editBtn.style.display = 'none';
  nameInput.focus();
  nameInput.select();
}

// =========================================================
// QUICK-ADD MODAL (opened from sidebar emoji buttons)
// =========================================================
let activeQuickAdd = null;

export function closeQuickAdd() {
  if (activeQuickAdd) { activeQuickAdd.remove(); activeQuickAdd = null; }
}

export function openQuickAddModal(cat) {
  closeQuickAdd();
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay quick-add-modal-overlay';
  activeQuickAdd = overlay;

  const modal = document.createElement('div');
  modal.className = 'quick-add-modal';

  // Header with category badge
  const header = document.createElement('div');
  header.className = 'quick-add-header';

  const badge = document.createElement('div');
  badge.className = 'quick-add-cat-badge';
  badge.textContent = cat.emoji || '●';
  badge.style.background = cat.color + '22';
  badge.style.border = `1.5px solid ${cat.color}44`;

  const titleBlock = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'quick-add-title';
  title.textContent = `Add to ${cat.name}`;
  const subtitle = document.createElement('div');
  subtitle.className = 'quick-add-subtitle';
  subtitle.textContent = 'Goes straight to Today\'s Top 5 or Backlog';
  titleBlock.append(title, subtitle);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'cat-modal-close';
  closeBtn.style.marginLeft = 'auto';
  closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  closeBtn.addEventListener('click', closeQuickAdd);
  header.append(badge, titleBlock, closeBtn);

  // Task name input
  const inputRow = document.createElement('div');
  inputRow.className = 'quick-add-input-row';
  const taskInput = document.createElement('input');
  taskInput.type = 'text';
  taskInput.className = 'quick-add-input';
  taskInput.placeholder = 'What do you want to work on?';
  taskInput.maxLength = 100;
  inputRow.appendChild(taskInput);

  // Destination: Top 5 or Backlog
  const destRow = document.createElement('div');
  destRow.className = 'quick-add-dest-row';
  let dest = 'top5';

  const makeChip = (label, icon, value) => {
    const chip = document.createElement('button');
    chip.className = 'quick-add-dest-chip' + (value === dest ? ' active' : '');
    chip.innerHTML = `${icon} ${label}`;
    chip.addEventListener('click', () => {
      dest = value;
      destRow.querySelectorAll('.quick-add-dest-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
    return chip;
  };
  destRow.append(
    makeChip("Today's Top 5", '🎯', 'top5'),
    makeChip('Backlog', '🗂️', 'backlog')
  );

  // Repeatable toggle
  const repeatRow = document.createElement('div');
  repeatRow.className = 'quick-add-repeat-row';
  const repeatLabelBlock = document.createElement('label');
  repeatLabelBlock.className = 'quick-add-repeat-label';
  repeatLabelBlock.htmlFor = 'quick-repeat-toggle';
  repeatLabelBlock.innerHTML = 'Repeatable task <span class="quick-add-repeat-sub">Carries forward to tomorrow if not done</span>';

  const toggleSwitch = document.createElement('label');
  toggleSwitch.className = 'toggle-switch';
  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.id = 'quick-repeat-toggle';
  const toggleTrack = document.createElement('span');
  toggleTrack.className = 'toggle-track';
  toggleSwitch.append(toggleInput, toggleTrack);
  repeatRow.append(repeatLabelBlock, toggleSwitch);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'quick-add-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeQuickAdd);
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = 'Add Task';
  actions.append(cancelBtn, addBtn);

  function confirmAdd() {
    const name = taskInput.value.trim();
    if (!name) { taskInput.focus({ preventScroll: true }); return; }
    const repeatable = toggleInput.checked;

    if (dest === 'top5' && ctx.getActiveGoals().length < ctx.MAX_GOALS) {
      ctx.state.goals.push({ name, hours: 0, progress: 0, category: cat.id, repeatable });
      ctx.saveState(); ctx.render();
      if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(ctx.state.goals);
    } else {
      // Goes to backlog if Top 5 is full or backlog was chosen
      ctx.backlog.push({ name, category: cat.id, repeatable });
      ctx.saveBacklog(); ctx.renderBacklog();
      if (dest === 'top5') {
        // Let user know it went to backlog
        subtitle.textContent = 'Top 5 is full — added to Backlog instead';
        subtitle.style.color = '#c87d20';
        setTimeout(closeQuickAdd, 1200);
        return;
      }
    }
    closeQuickAdd();
  }

  addBtn.addEventListener('click', confirmAdd);
  taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmAdd(); } if (e.key === 'Escape') closeQuickAdd(); });

  modal.append(header, inputRow, destRow, repeatRow, actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeQuickAdd(); });
  setTimeout(() => taskInput.focus({ preventScroll: true }), 60);
}

// =========================================================
// CATEGORY PICKER (emoji-only pill popover)
// =========================================================
let activePicker = null;

export function closePicker() {
  if (activePicker) { activePicker.remove(); activePicker = null; }
  document.removeEventListener('pointerdown', onPickerOutsideClick, true);
}

function onPickerOutsideClick(e) {
  if (activePicker && !activePicker.contains(e.target)) closePicker();
  // Don't close if clicking inside the new-area modal
  if (e.target.closest && e.target.closest('.cat-modal-overlay')) return;
}


// =========================================================
// NEW AREA MODAL — full splash dialog
// =========================================================
let activeModal = null;

export function closeModal() {
  if (activeModal) { activeModal.remove(); activeModal = null; }
}

export function openNewCategoryModal(onSelect) {
  closeModal();

  const DEFAULT_EMOJI = '🌟';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay cat-modal-overlay';
  activeModal = overlay;

  const modal = document.createElement('div');
  modal.className = 'cat-modal';

  // Header
  const mHeader = document.createElement('div');
  mHeader.className = 'cat-modal-header';
  const mTitle = document.createElement('h2');
  mTitle.className = 'cat-modal-title';
  mTitle.textContent = 'New Life Area';
  const mClose = document.createElement('button');
  mClose.className = 'cat-modal-close';
  mClose.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  mClose.addEventListener('click', closeModal);
  mHeader.append(mTitle, mClose);

  // Emoji picker row
  const emojiSection = document.createElement('div');
  emojiSection.className = 'cat-modal-section';
  const emojiLabel = document.createElement('label');
  emojiLabel.className = 'cat-modal-label';
  emojiLabel.textContent = 'Choose an emoji';

  // Big emoji display button
  const emojiDisplay = document.createElement('button');
  emojiDisplay.className = 'cat-modal-emoji-display';
  emojiDisplay.textContent = DEFAULT_EMOJI;
  emojiDisplay.title = 'Click to pick an emoji';
  emojiDisplay.type = 'button';

  // Hidden text input with inputmode=emoji — triggers emoji keyboard on mobile,
  // and on macOS/Windows the user can use Ctrl+Cmd+Space / Win+. shortcuts
  const emojiInput = document.createElement('input');
  emojiInput.type = 'text';
  emojiInput.setAttribute('inputmode', 'emoji');
  emojiInput.style.cssText = 'position:fixed;top:-200px;left:-200px;opacity:0;width:1px;height:1px;pointer-events:none;font-size:16px;';
  emojiInput.maxLength = 8;
  document.body.appendChild(emojiInput);

  const emojiHint = document.createElement('p');
  emojiHint.className = 'cat-modal-emoji-hint';
  // Platform hint
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  const isWin = /Win/.test(navigator.userAgent);
  emojiHint.textContent = isMac
    ? 'Click the emoji, then press Ctrl+Cmd+Space to open the emoji picker'
    : isWin
      ? 'Click the emoji, then press Win+. (period) to open the emoji picker'
      : 'Click the emoji and type one, or paste from your emoji keyboard';

  emojiDisplay.addEventListener('click', () => {
    emojiInput.value = '';
    emojiInput.focus({ preventScroll: true });
    // On macOS, try triggering emoji picker via keyboard simulation hint
  });

  emojiInput.addEventListener('input', () => {
    const raw = emojiInput.value;
    const chars = [...raw];
    if (chars.length > 0) {
      const emoji = chars.slice(-2).join('');
      emojiDisplay.textContent = emoji;
      emojiInput.value = '';
      // Auto-update color to match new emoji
      selectedColor = emojiToColor(emoji);
      buildNewCatSwatches();
    }
  });

  emojiSection.append(emojiLabel, emojiDisplay, emojiHint);

  // Name field
  const nameSection = document.createElement('div');
  nameSection.className = 'cat-modal-section';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'cat-modal-label';
  nameLabel.textContent = 'Name this area';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'cat-modal-input';
  nameInput.placeholder = 'e.g. Mountain Biking, Music, Reading…';
  nameInput.maxLength = 30;
  nameSection.append(nameLabel, nameInput);

  // Color swatches
  const colorSection = document.createElement('div');
  colorSection.className = 'cat-modal-section';
  const colorLabel = document.createElement('label');
  colorLabel.className = 'cat-modal-label';
  colorLabel.textContent = 'Pick a color';
  const swatchRow = document.createElement('div');
  swatchRow.className = 'cat-modal-swatches';
  let selectedColor = emojiToColor(DEFAULT_EMOJI);

  const usedColors = new Set(ctx.categories.filter(c => !c.deleted).map(c => c.color).filter(Boolean));

  function buildNewCatSwatches() {
    swatchRow.innerHTML = '';
    COLOR_SWATCHES.forEach(color => {
      const taken = usedColors.has(color);
      const swatch = document.createElement('button');
      swatch.className = 'cat-modal-swatch' + (color === selectedColor ? ' selected' : '') + (taken ? ' swatch-taken' : '');
      swatch.style.background = color;
      swatch.title = taken ? 'Already used by another life area' : '';
      swatch.disabled = taken && color !== selectedColor;
      swatch.addEventListener('click', () => {
        if (taken) return;
        selectedColor = color;
        swatchRow.querySelectorAll('.cat-modal-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
      });
      swatchRow.appendChild(swatch);
    });
    // Custom color picker — on OK, inject/update a swatch and select it
    appendColorPickerSwatch(swatchRow, selectedColor, hex => {
      selectedColor = hex;
      swatchRow.querySelectorAll('.cat-modal-swatch:not(.swatch-rainbow):not(.swatch-custom)').forEach(s => s.classList.remove('selected'));
      let customSw = swatchRow.querySelector('.swatch-custom');
      if (!customSw) {
        customSw = document.createElement('button');
        customSw.className = 'cat-modal-swatch swatch-custom';
        customSw.title = 'Your custom color';
        customSw.addEventListener('click', () => {
          selectedColor = customSw.style.background; // always read current value
          swatchRow.querySelectorAll('.cat-modal-swatch').forEach(s => s.classList.remove('selected'));
          customSw.classList.add('selected');
        });
        swatchRow.querySelector('.swatch-rainbow').insertAdjacentElement('beforebegin', customSw);
      }
      customSw.style.background = hex;
      swatchRow.querySelectorAll('.cat-modal-swatch').forEach(s => s.classList.remove('selected'));
      customSw.classList.add('selected');
    });
  }
  buildNewCatSwatches();

  colorSection.append(colorLabel, swatchRow);

  // Vision note
  const visionSection = document.createElement('div');
  visionSection.className = 'cat-modal-section';
  const visionLabel = document.createElement('label');
  visionLabel.className = 'cat-modal-label';
  visionLabel.textContent = 'Your vision for this area';
  const visionHint = document.createElement('p');
  visionHint.className = 'cat-modal-hint';
  visionHint.textContent = 'Where do you see yourself when this area is thriving? What does success feel like?';
  const visionInput = document.createElement('textarea');
  visionInput.className = 'cat-modal-textarea';
  visionInput.placeholder = 'In 3 years I want to…';
  visionInput.rows = 3;
  visionSection.append(visionLabel, visionHint, visionInput);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'cat-modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);
  const createBtn = document.createElement('button');
  createBtn.className = 'btn btn-primary';
  createBtn.textContent = 'Create Life Area';
  actions.append(cancelBtn, createBtn);

  function confirmCreate() {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus({ preventScroll: true }); nameInput.style.borderColor = '#e63946'; return; }
    const id = 'custom_' + Date.now();
    const emoji = emojiDisplay.textContent.trim() || DEFAULT_EMOJI;
    const newCat = { id, name, emoji, color: selectedColor, totalHours: 0, vision: visionInput.value.trim() };
    ctx.categories.push(newCat);
    ctx.saveCategories();
    emojiInput.remove();
    closeModal();
    ctx.renderSidebar();
    if (onSelect) onSelect(id);
  }

  createBtn.addEventListener('click', confirmCreate);
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmCreate(); } });

  modal.append(mHeader, emojiSection, nameSection, colorSection, visionSection, actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('pointerdown', e => {
    if (e.target === overlay) { emojiInput.remove(); closeModal(); }
  });

  setTimeout(() => nameInput.focus({ preventScroll: true }), 80);
}

// Build the category pill — emoji only, opens context popover (category + repeatable)
// getRepeatable / setRepeatable are optional accessors for the repeatable state
export function createCategoryPill(catId, onCategorySelect, getRepeatable, setRepeatable) {
  let currentCatId = catId || 'general';
  const cat = ctx.getCategoryById(currentCatId);
  const pill = document.createElement('button');
  pill.className = 'cat-pill';
  pill.title = cat.name;
  pill.style.setProperty('--pill-color', cat.color);

  const emojiSpan = document.createElement('span');
  emojiSpan.className = 'cat-pill-emoji';
  emojiSpan.textContent = cat.emoji || '●';
  pill.appendChild(emojiSpan);

  pill.addEventListener('click', e => {
    e.stopPropagation();
    if (getRepeatable !== undefined) {
      // Full context popover: category + repeatable
      openTaskContextPicker(pill, currentCatId, getRepeatable(), (newCatId, newRepeatable) => {
        currentCatId = newCatId;
        onCategorySelect(newCatId);
        setRepeatable(newRepeatable);
        const newCat = ctx.getCategoryById(newCatId);
        pill.title = newCat.name;
        pill.style.setProperty('--pill-color', newCat.color);
        emojiSpan.textContent = newCat.emoji || '●';
        ctx.renderSidebar();
      });
    } else {
      // Category-only: same unified modal as Top 5, repeatable row hidden.
      openTaskContextPicker(pill, currentCatId, false, newCatId => {
        currentCatId = newCatId;
        onCategorySelect(newCatId);
        const newCat = ctx.getCategoryById(newCatId);
        pill.title = newCat.name;
        pill.style.setProperty('--pill-color', newCat.color);
        emojiSpan.textContent = newCat.emoji || '●';
        ctx.renderSidebar();
      }, { showRepeatable: false });
    }
  });

  return pill;
}

// Context popover shown when clicking the pill on an existing task row
// Shows category list + repeatable toggle in one floating panel
// Unified category/context modal. Used by every task-like row (Top 5 goals,
// backlog, distractions). Pass opts.showRepeatable === false to get a
// category-only picker (hides the repeatable toggle) — keeps the backlog and
// distraction pickers visually consistent with Top 5.
export function openTaskContextPicker(anchorEl, currentCatId, currentRepeatable, onConfirm, opts = {}) {
  const showRepeatable = opts.showRepeatable !== false;
  closePicker();
  closeModal();

  let selectedCatId = currentCatId || 'general';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay task-context-modal-overlay';
  activeModal = overlay;

  const modal = document.createElement('div');
  modal.className = 'task-context-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'task-context-modal-header';
  const title = document.createElement('h3');
  title.className = 'task-context-modal-title';
  title.textContent = showRepeatable ? 'Task Settings' : 'Life Area';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'cat-modal-close';
  closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  closeBtn.addEventListener('click', closeModal);
  header.append(title, closeBtn);
  modal.appendChild(header);

  // Life Area section label — only when the repeatable section follows it,
  // otherwise the modal title already says "Life Area".
  if (showRepeatable) {
    const catLabel = document.createElement('div');
    catLabel.className = 'task-context-section-label';
    catLabel.textContent = 'Life Area';
    modal.appendChild(catLabel);
  }

  // Category list
  const list = document.createElement('div');
  list.className = 'cat-picker-list task-context-cat-list';

  ctx.activeCategories().forEach(cat => {
    const opt = document.createElement('button');
    opt.className = 'cat-picker-option' + (cat.id === selectedCatId ? ' selected' : '');
    opt.dataset.catId = cat.id;
    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'cat-picker-emoji';
    emojiSpan.textContent = cat.emoji || '●';
    emojiSpan.style.color = cat.color;
    const nameSpan = document.createElement('span');
    nameSpan.textContent = cat.name;
    opt.append(emojiSpan, nameSpan);
    opt.addEventListener('click', () => {
      selectedCatId = cat.id;
      list.querySelectorAll('.cat-picker-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
    list.appendChild(opt);
  });

  const newCatBtn = document.createElement('button');
  newCatBtn.className = 'cat-picker-new';
  newCatBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z"/></svg> New area…';
  newCatBtn.addEventListener('click', () => { closeModal(); openNewCategoryModal(newId => { selectedCatId = newId; }); });
  list.appendChild(newCatBtn);
  modal.appendChild(list);

  // Repeatable toggle row — only in full "Task Settings" mode.
  let toggleInput = null;
  if (showRepeatable) {
    const divider = document.createElement('div');
    divider.className = 'task-context-divider';
    modal.appendChild(divider);

    const repeatRow = document.createElement('div');
    repeatRow.className = 'context-picker-repeat-row';
    const repeatLabel = document.createElement('label');
    repeatLabel.className = 'context-picker-repeat-label';
    repeatLabel.htmlFor = 'ctx-repeat-toggle';
    repeatLabel.innerHTML = '↻ Repeatable <span>carries forward if not done</span>';

    const toggleSwitch = document.createElement('label');
    toggleSwitch.className = 'toggle-switch';
    toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.id = 'ctx-repeat-toggle';
    toggleInput.checked = currentRepeatable;
    const toggleTrack = document.createElement('span');
    toggleTrack.className = 'toggle-track';
    toggleSwitch.append(toggleInput, toggleTrack);
    repeatRow.append(repeatLabel, toggleSwitch);
    modal.appendChild(repeatRow);
  }

  // Done button
  const footer = document.createElement('div');
  footer.className = 'task-context-modal-footer';
  const doneBtn = document.createElement('button');
  doneBtn.className = 'cat-picker-done-btn';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', () => {
    closeModal();
    onConfirm(selectedCatId, toggleInput ? toggleInput.checked : undefined);
  });
  footer.appendChild(doneBtn);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeModal(); });

  // Scroll selected into view
  setTimeout(() => {
    const sel = list.querySelector('.cat-picker-option.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }, 50);
}

// =========================================================
// TASK DETAIL MODAL — used by the + button (new task with category + repeatable)
// =========================================================
export function openTaskDetailModal(initial, onConfirm) {
  closeModal(); closeQuickAdd();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay quick-add-modal-overlay';
  activeModal = overlay;

  const modal = document.createElement('div');
  modal.className = 'quick-add-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'quick-add-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'quick-add-title';
  titleEl.textContent = 'Add to Today\'s Top 5';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'cat-modal-close';
  closeBtn.style.marginLeft = 'auto';
  closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  closeBtn.addEventListener('click', closeModal);
  header.append(titleEl, closeBtn);

  // Task input
  const inputRow = document.createElement('div');
  inputRow.className = 'quick-add-input-row';
  const taskInput = document.createElement('input');
  taskInput.type = 'text';
  taskInput.className = 'quick-add-input';
  taskInput.placeholder = 'What do you want to work on?';
  taskInput.maxLength = 100;
  taskInput.value = initial.name || '';
  inputRow.appendChild(taskInput);

  // Category selector — pill grid
  const catSection = document.createElement('div');
  catSection.className = 'task-modal-cat-section';
  const catLabel = document.createElement('div');
  catLabel.className = 'cat-modal-label';
  catLabel.textContent = 'Life Area';
  const catGrid = document.createElement('div');
  catGrid.className = 'task-modal-cat-grid';
  let selectedCatId = initial.category || 'general';

  function renderCatGrid() {
    catGrid.innerHTML = '';
    ctx.activeCategories().forEach(cat => {
      const chip = document.createElement('button');
      chip.className = 'task-modal-cat-chip' + (cat.id === selectedCatId ? ' selected' : '');
      chip.style.setProperty('--chip-color', cat.color);
      chip.innerHTML = `<span>${cat.emoji || '●'}</span><span>${cat.name}</span>`;
      chip.addEventListener('click', () => {
        selectedCatId = cat.id;
        catGrid.querySelectorAll('.task-modal-cat-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
      });
      catGrid.appendChild(chip);
    });
    // + New area chip
    const newChip = document.createElement('button');
    newChip.className = 'task-modal-cat-chip task-modal-cat-new';
    newChip.textContent = '+ New';
    newChip.addEventListener('click', () => {
      closeModal();
      openNewCategoryModal(newId => {
        // Re-open this modal with the new category selected
        openTaskDetailModal({ name: taskInput.value, category: newId, repeatable: toggleInput.checked }, onConfirm);
      });
    });
    catGrid.appendChild(newChip);
  }
  renderCatGrid();
  catSection.append(catLabel, catGrid);

  // Repeatable toggle
  const repeatRow = document.createElement('div');
  repeatRow.className = 'quick-add-repeat-row';
  const repeatLabelBlock = document.createElement('label');
  repeatLabelBlock.className = 'quick-add-repeat-label';
  repeatLabelBlock.htmlFor = 'detail-repeat-toggle';
  repeatLabelBlock.innerHTML = 'Repeatable task <span class="quick-add-repeat-sub">Carries forward to tomorrow if not done</span>';
  const toggleSwitch = document.createElement('label');
  toggleSwitch.className = 'toggle-switch';
  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.id = 'detail-repeat-toggle';
  toggleInput.checked = initial.repeatable || false;
  const toggleTrack = document.createElement('span');
  toggleTrack.className = 'toggle-track';
  toggleSwitch.append(toggleInput, toggleTrack);
  repeatRow.append(repeatLabelBlock, toggleSwitch);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'cat-modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = 'Add Task';
  addBtn.addEventListener('click', () => {
    const name = taskInput.value.trim();
    if (!name) { taskInput.focus({ preventScroll: true }); return; }
    closeModal();
    onConfirm({ name, category: selectedCatId, repeatable: toggleInput.checked });
  });
  actions.append(cancelBtn, addBtn);

  taskInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
    if (e.key === 'Escape') closeModal();
  });

  modal.append(header, inputRow, catSection, repeatRow, actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeModal(); });
  setTimeout(() => { taskInput.focus({ preventScroll: true }); taskInput.setSelectionRange(taskInput.value.length, taskInput.value.length); }, 60);
}

export function openLogDoneModal() {
  closeQuickAdd();
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay quick-add-modal-overlay';
  activeQuickAdd = overlay;

  const modal = document.createElement('div');
  modal.className = 'quick-add-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'quick-add-header';
  const badge = document.createElement('div');
  badge.className = 'quick-add-cat-badge';
  badge.textContent = '✅';
  badge.style.background = 'rgba(64,145,108,0.15)';
  badge.style.border = '1.5px solid rgba(64,145,108,0.35)';
  const titleBlock = document.createElement('div');
  titleBlock.innerHTML = '<div class="quick-add-title">Log completed task</div><div class="quick-add-subtitle">Something you already finished today</div>';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'cat-modal-close';
  closeBtn.style.marginLeft = 'auto';
  closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  closeBtn.addEventListener('click', closeQuickAdd);
  header.append(badge, titleBlock, closeBtn);

  // Task name input
  const inputRow = document.createElement('div');
  inputRow.className = 'quick-add-input-row';
  const taskInput = document.createElement('input');
  taskInput.type = 'text';
  taskInput.className = 'quick-add-input';
  taskInput.placeholder = 'What did you get done?';
  taskInput.maxLength = 100;
  // Pre-fill from the text input if something was typed there
  if (ctx.quickInputEl && ctx.quickInputEl.value.trim()) {
    taskInput.value = ctx.quickInputEl.value.trim();
    ctx.quickInputEl.value = '';
  }
  inputRow.appendChild(taskInput);

  // Category chips (same pill style as dest chips in quick-add modal)
  let selectedCatId = 'general';
  const catRow = document.createElement('div');
  catRow.className = 'quick-add-dest-row';

  ctx.activeCategories().forEach(cat => {
    const chip = document.createElement('button');
    chip.className = 'quick-add-dest-chip' + (cat.id === selectedCatId ? ' active' : '');
    chip.innerHTML = `${cat.emoji} ${cat.name}`;
    chip.addEventListener('click', () => {
      selectedCatId = cat.id;
      catRow.querySelectorAll('.quick-add-dest-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
    catRow.appendChild(chip);
  });

  // Hours row — label + number input side by side
  const hoursRow = document.createElement('div');
  hoursRow.className = 'quick-add-repeat-row';
  hoursRow.style.marginBottom = '18px';
  const hoursLabel = document.createElement('label');
  hoursLabel.className = 'quick-add-repeat-label';
  hoursLabel.textContent = 'Hours invested';
  const hoursInput = document.createElement('input');
  hoursInput.type = 'number';
  hoursInput.className = 'quick-add-hours-input';
  hoursInput.min = '0'; hoursInput.max = '24'; hoursInput.step = '0.5';
  hoursInput.placeholder = '0';
  hoursRow.append(hoursLabel, hoursInput);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'quick-add-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeQuickAdd);
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = 'Mark as done';

  function confirmLog() {
    const name = taskInput.value.trim();
    if (!name) { taskInput.focus({ preventScroll: true }); return; }
    const hours = Math.max(0, parseFloat(hoursInput.value) || 0);
    ctx.addQuickDone(name, hours, selectedCatId !== 'general' ? selectedCatId : null);
    ctx.accumulateCategoryHours(selectedCatId, hours);
    closeQuickAdd();
  }

  addBtn.addEventListener('click', confirmLog);
  taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmLog(); } if (e.key === 'Escape') closeQuickAdd(); });
  actions.append(cancelBtn, addBtn);

  modal.append(header, inputRow, catRow, hoursRow, actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeQuickAdd(); });
  setTimeout(() => taskInput.focus({ preventScroll: true }), 60);
}
