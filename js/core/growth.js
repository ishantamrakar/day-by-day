// Core: growth stages — the plant that marks long-term investment in a life area.
//
// PORTABLE — no DOM, no browser APIs.
//
// Every 24h invested in a life area (one full day of your life) advances its
// plant one stage. Absolute, not relative: a category never regresses because
// another one grew, which is the point. Comparison between areas still reads
// at a glance from the stage art itself.

export const HOURS_PER_STAGE = 24;

export const GROWTH_STAGES = [
  { art: '·',  label: 'Bare soil' },
  { art: '🌱', label: 'Seedling' },
  { art: '🌿', label: 'Sprout' },
  { art: '☘️', label: 'Growing' },
  { art: '🪴', label: 'Potted' },
  { art: '🌳', label: 'Tree' },
  { art: '🌲', label: 'Evergreen' },
];

// Where a category's plant stands, plus the climb to the next stage.
// Past the last art stage the plant stops changing but `daysDone` keeps
// climbing, so long-running areas still show progress without new artwork.
export function getGrowthStage(totalHours) {
  const h = Math.max(0, totalHours || 0);
  const daysDone = Math.floor(h / HOURS_PER_STAGE);
  const idx = Math.min(daysDone, GROWTH_STAGES.length - 1);
  const stage = GROWTH_STAGES[idx];
  const intoStage = h - daysDone * HOURS_PER_STAGE;
  return {
    daysDone,
    art: stage.art,
    label: stage.label,
    isMaxArt: daysDone >= GROWTH_STAGES.length - 1,
    intoStage,
    pctToNext: Math.min(100, (intoStage / HOURS_PER_STAGE) * 100),
    hoursToNext: Math.max(0, HOURS_PER_STAGE - intoStage),
  };
}

// A category records the stage it was last *shown* at (`seenStage`). When the
// plant has grown past it, the sidebar owes the user a quiet toast the next
// time it's open. Persisted with the category, so crossing 24h while the
// sidebar is collapsed still gets acknowledged later.
//
// Takes the category list rather than reading module state, so this stays
// portable and testable.
export function pendingGrowthMilestones(activeCats) {
  return (activeCats || [])
    .map(cat => {
      const st = getGrowthStage(cat.totalHours);
      const seen = cat.seenStage || 0;
      return st.daysDone > seen ? { cat, stage: st } : null;
    })
    .filter(Boolean);
}

// Mark milestones as shown. Mutates the category objects; the caller persists.
export function acknowledgeGrowthMilestones(items) {
  if (!items || !items.length) return false;
  items.forEach(({ cat, stage }) => { cat.seenStage = stage.daysDone; });
  return true;
}

// Existing hours are not a milestone the user just earned. On the first run
// after this feature shipped (and for any category predating it), baseline
// seenStage to where the plant already stands, so a toast only ever fires for
// growth from here on. Returns true if anything changed (caller saves).
export function baselineGrowthStages(cats) {
  let touched = false;
  (cats || []).forEach(cat => {
    if (cat.seenStage == null) {
      cat.seenStage = Math.floor(Math.max(0, cat.totalHours || 0) / HOURS_PER_STAGE);
      touched = true;
    }
  });
  return touched;
}
