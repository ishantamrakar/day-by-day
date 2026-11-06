// Core: the category colour palette and emoji→colour derivation.
//
// PORTABLE — no DOM, no browser APIs. A native build reuses the palette and
// the derivation unchanged; only the picker widget (js/ui/modals.js) is
// rebuilt.

export const EMOJI_COLORS = {
  // Default category emojis
  '💪': '#3a86ff', '💼': '#2D6A4F', '❤️': '#e63946', '🧹': '#f4a261', '⚡': '#8d99ae',
  // Picker emojis
  '🎯': '#e63946', '📚': '#3a86ff', '🎨': '#f72585', '💡': '#f9c74f', '🏃': '#43aa8b',
  '🧘': '#9b5de5', '💰': '#f4a261', '🌱': '#40916c', '🔧': '#6c757d', '🎵': '#7b2d8b',
  '✈️': '#00bbf9', '🍎': '#e63946', '🧠': '#9b5de5', '🤝': '#f4a261', '🏠': '#457b9d',
  // Common extras
  '🏋️': '#3a86ff', '🚴': '#43aa8b', '🧗': '#f4a261', '⚽': '#2D6A4F', '🎾': '#f9c74f',
  '🎸': '#7b2d8b', '🎹': '#9b5de5', '🎤': '#f72585', '🎬': '#e63946', '📷': '#6c757d',
  '💻': '#457b9d', '📝': '#3a86ff', '🔬': '#00bbf9', '🌍': '#40916c', '🌊': '#00bbf9',
  '🔥': '#fb5607', '⭐': '#f9c74f', '🌟': '#f9c74f', '🏆': '#f4a261', '🎓': '#3a86ff',
  '👨‍👩‍👧': '#f72585', '👫': '#f72585', '🐾': '#f4a261', '🌺': '#f72585', '🍃': '#40916c',
};

export const COLOR_SWATCHES = [
  '#e63946','#f72585','#7b2d8b','#9b5de5','#3a86ff','#00bbf9','#00f5d4',
  '#40916c','#2D6A4F','#43aa8b','#f9c74f','#f4a261','#fb5607','#457b9d','#6c757d',
];

export function emojiToColor(emoji) {
  if (!emoji) return COLOR_SWATCHES[0];
  const direct = EMOJI_COLORS[emoji.trim()];
  if (direct) return direct;
  // Hash fallback — derive hue from codepoints, use fixed s/l for pleasing output
  let hash = 0;
  for (const cp of emoji) hash = (hash * 31 + (cp.codePointAt(0) || 0)) & 0xfffffff;
  const hue = hash % 360;
  // Convert HSL → hex
  const h = hue / 360, s = 0.6, l = 0.48;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toHex = t => {
    const c = Math.round(255 * (t < 1/6 ? p + (q-p)*6*t : t < 1/2 ? q : t < 2/3 ? p + (q-p)*(2/3-t)*6 : p));
    return c.toString(16).padStart(2, '0');
  };
  return `#${toHex(h+1/3)}${toHex(h)}${toHex(h-1/3 < 0 ? h-1/3+1 : h-1/3)}`;
}
