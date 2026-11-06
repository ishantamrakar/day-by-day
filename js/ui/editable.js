// UI: small shared helpers used by several cards. Click-to-edit text and the
// filled track behind a progress slider.
//
// DOM. Not portable.
//
// No configure(): neither helper reads app state. The caller passes the
// element and owns what happens to the new value.

// Turns a text span into a click-to-edit field. Enter or blur commits, Escape
// restores the old text; an empty edit keeps the old text too. onSave always
// runs on finish, even when nothing changed.
export function makeEditable(spanEl, onSave) {
  spanEl.style.cursor = 'pointer';
  spanEl.title = 'Click to edit';
  spanEl.addEventListener('click', () => {
    if (spanEl.querySelector('input')) return;
    const current = spanEl.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = current;
    input.maxLength = 200;
    spanEl.textContent = '';
    spanEl.appendChild(input);
    input.focus();
    input.select();

    function finish() {
      const newVal = input.value.trim() || current;
      spanEl.textContent = newVal;
      onSave(newVal);
    }
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = current; input.blur(); }
    });
  });
}

// Paints the part of a range input left of the thumb. Call after every value
// change; the gradient is inline style, so CSS alone can't follow the thumb.
export function updateSliderFill(slider) {
  const val = slider.value;
  const pct = ((val - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.background = `linear-gradient(to right, #2D6A4F 0%, #40916C ${pct}%, rgba(45,106,79,0.1) ${pct}%)`;
}
