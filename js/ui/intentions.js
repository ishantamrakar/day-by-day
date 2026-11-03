// UI: the "how much time?" rows shown under a focus picker — one optional
// hours field per selected area. Used by both focus pickers (the
// day-transition modal and the sidebar's focus editor).
//
// DOM. Not portable. What a typed value means, and which intentions survive
// a change of selection, are rules in js/core/intentions.js.

import {
  MAX_INTENTION_HOURS, parseIntentionInput, keepSelectedIntentions,
} from '../core/intentions.js';

let _ctx = null;
export function configure(c) { _ctx = c; }
const ctx = new Proxy({}, { get: (_, k) => _ctx[k] });

// Rows appear only for currently-selected areas and carry whatever was
// already set.
//   getSelected() -> array of category ids, in pick order
//   returns { el, refresh, collect }
export function makeIntentionFields(getSelected, initial) {
  const draft = Object.assign({}, initial || {});

  const wrap = document.createElement('div');
  wrap.className = 'intention-fields';

  const label = document.createElement('div');
  label.className = 'day-modal-section-label';
  label.textContent = 'Time you\'d like to give (optional)';

  const rows = document.createElement('div');
  rows.className = 'intention-rows';
  wrap.append(label, rows);

  function refresh() {
    const ids = getSelected();
    rows.innerHTML = '';
    if (ids.length === 0) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');

    ids.forEach(id => {
      const cat = ctx.getCategoryById(id);
      if (!cat) return;
      const row = document.createElement('label');
      row.className = 'intention-row';

      const name = document.createElement('span');
      name.className = 'intention-row-name';
      name.innerHTML = `<span class="intention-row-emoji">${cat.emoji}</span>`;
      name.appendChild(document.createTextNode(cat.name));

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'intention-input';
      input.min = '0';
      input.max = String(MAX_INTENTION_HOURS);
      // Whole hours only. `step` governs the spinner arrows; the rounding
      // in parseIntentionInput covers typed input, which ignores step.
      input.step = '1';
      input.placeholder = '—';
      input.value = draft[id] != null ? String(draft[id]) : '';
      input.setAttribute('aria-label', `Hours for ${cat.name}`);
      input.addEventListener('input', () => {
        const v = parseIntentionInput(input.value);
        if (v == null) delete draft[id];
        else draft[id] = v;
      });
      // Snap the visible field to the stored whole number, but only once
      // the user is done typing — rewriting the value mid-input would fight
      // the caret on every keystroke.
      input.addEventListener('blur', () => {
        input.value = draft[id] != null ? String(draft[id]) : '';
      });

      const unit = document.createElement('span');
      unit.className = 'intention-unit';
      unit.textContent = 'h';

      row.append(name, input, unit);
      rows.appendChild(row);
    });
  }

  function collect() {
    return keepSelectedIntentions(draft, getSelected());
  }

  refresh();
  return { el: wrap, refresh, collect };
}
