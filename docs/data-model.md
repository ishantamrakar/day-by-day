# Data Model

→ [CLAUDE.md](../CLAUDE.md) | [architecture.md](architecture.md)

The app stores all data **client-side in localStorage** — there is no database yet. Phase 3 reorganized that data into one normalized **store** whose shape maps cleanly to a relational database, so a future backend port (product roadmap Phase 4: sync + accounts) is a translation, not a redesign.

## The unified store (`daybyday_store`)

```js
store = {
  version: 2,
  entities:   { [id]: Entity },        // every task-like thing, keyed by id
  days:       { [YYYY-MM-DD]: [id] },  // ordered membership per day
  backlogIds: [id],                    // the day-less backlog queue (ordered)
  categories: [ Category ],            // shared with the module categories array
  sessions:   [ Session ],             // focus sessions (append-style log)
  journal:    { [date]: { successes:[], failures:[] } },
  history:    [ archived day snapshot ],   // legacy backup, kept verbatim
  layout?:    [...]                    // card column order
}
```

### Entity
One shape for all task-like things, discriminated by `type`:

```js
{
  id, type: 'goal' | 'distraction' | 'quickDone' | 'backlog',
  name, category /* category id, resolved live */, hours,
  progress?, repeatable?, prevHours?, fromBacklog?,
  createdAt, updatedAt, completedAt?
}
```
- `goal`: uses `progress`, `repeatable`, optional `prevHours`/`fromBacklog`/`completedAt`.
- `distraction` / `quickDone`: `name`, `category`, `hours`.
- `backlog`: `name`, `category`, `repeatable` (no day membership — tracked by `backlogIds`).

### Session
```js
{
  timestamp, goalName /* snapshot */, goalIndex, category /* id, resolved live */,
  totalMins, focusPct, focusMins, distractMins, isWin,
  intention?, entryTag?, entryNote?, midNotes[], exitTag?, exitNote?
}
```
- `category` is stored as an **id only**; the emoji/color/name are resolved live at render via `getCategoryById`, so renaming or recoloring a category reflects in past journal entries.
- `goalName` is a deliberate **snapshot** — a session is an audit-log row, and the goal may later be renamed or deleted.

### Category
```js
{ id, name, emoji, color, totalHours, vision? }
```
`totalHours` is a running accumulator (`+= delta`, never recomputed) — preserve this when porting.

## Store ⇄ view adapter (app.js)

The store is the **source of truth**; `state.goals` / `state.distractions` / `state.quickDone` / `backlog` / `state.focusSessions` are **live views** over it so the existing rendering/undo/drag code is untouched. Each view object carries its entity id as `_eid`.

- `migrateToStore()` — builds the store from legacy keys at boot; idempotent; keeps legacy keys as a one-version backup.
- `hydrateDayType(day, type)` / `hydrateBacklogFromStore()` / `hydrateSessionsFromStore()` — build views from the store.
- `syncDayToStore(day)` / `syncBacklogToStore()` / `syncSessionsToStore()` — reconcile views back into the store (update by `_eid`, mint new, drop removed). Called from `saveState()` / `saveBacklog()`.

## Legacy keys (still written as backup)

`daybyday_data`, `daybyday_backlog`, `daybyday_categories`, `daybyday_history` are still written on every save, so the migration is reversible for one version. They can be retired once the store has proven stable.

## Future database schema (not built — design target)

When a backend arrives, the store maps to these tables, all scoped by `user_id`:

| Table | Columns (sketch) |
|-------|------------------|
| `users` | `id`, … |
| `categories` | `id`, `user_id`, `name`, `emoji`, `color`, `total_hours`, `vision` |
| `entities` | `id`, `user_id`, `type`, `name`, `category_id` → categories, `hours`, `progress`, `repeatable`, `prev_hours`, `from_backlog`, `created_at`, `updated_at`, `completed_at` |
| `day_entities` | `user_id`, `date`, `entity_id` → entities, `position` (ordered membership; backlog rows use a null/`'backlog'` date or a separate `backlog_items` table) |
| `sessions` | `id`, `user_id`, `entity_id?`, `goal_name`, `category_id` → categories, `total_mins`, `focus_pct`, `focus_mins`, `distract_mins`, `is_win`, `intention`, `entry_tag`, `entry_note`, `mid_notes` (json), `exit_tag`, `exit_note`, `created_at` |
| `journal_entries` | `id`, `user_id`, `date`, `kind` (`success`/`failure`), `text` |

Notes for the intelligence system: `entities` + `day_entities` give per-day effort by category over time; `sessions` give focus quality and the user's own reflections (`intention`, tags, notes) — the richest signal for nudges. Resolve category metadata via `category_id` (never snapshot it), exactly as the client does now.
