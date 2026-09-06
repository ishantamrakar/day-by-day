// UI: the life-areas sidebar — rail, panel, category cards, growth toasts.
//
// DOM. Not portable.
//
// TOAST STATE LIVES HERE, and it is subtle. Logging hours triggers several
// renderSidebar() passes in one tick (accumulateCategoryHours renders, then
// the render() that follows). A toast acknowledged in the pass that built it
// is therefore destroyed before it ever paints — that was a real bug. So a
// live toast is held in _liveGrowthToast / _liveIntentionsToast and replayed
// across re-renders until its timer retires it.
//
// The matching hazard is the opposite one: growth banked BETWEEN sessions must
// be consumed silently, or the app congratulates you at boot for hours you
// didn't just earn. That's what _sidebarBooted gates. Both behaviours are
// covered by scripts/test-growth.mjs; read it before touching this.

import { formatHours, hexToRgb } from '../core/format.js';
import { getGrowthStage, GROWTH_STAGES } from '../core/growth.js';
import { SIDEBAR_KEY } from '../core/keys.js';

let _ctx = null;
export function configure(c) {
  _ctx = c;
  // Restore the collapsed preference HERE, not at module load and not in
  // initSidebar(). Module load is too early (ctx.storageGet doesn't exist
  // yet); initSidebar() is too late (it runs after the boot render, which
  // would then see the sidebar as open and consume a pending growth
  // milestone without showing it — scripts/test-growth.mjs covers exactly
  // that). configure() is called before the first render, which is right.
  sidebarCollapsed = loadCollapsedPreference();
}
const ctx = new Proxy({}, { get: (_, k) => _ctx[k] });

// --- Sidebar state ---
// Read in initSidebar(), NOT at module load: this file is imported before
// app.js calls configure(), so ctx.storageGet doesn't exist yet. Reading it
// here would throw into the catch and silently default to "open", quietly
// discarding the user's saved preference.
let sidebarCollapsed = false;

function loadCollapsedPreference() {
  try { return ctx.storageGet(SIDEBAR_KEY) === 'collapsed'; } catch (e) { return false; }
}
let expandedCatId = null; // which sidebar card is currently expanded
let archivedSectionOpen = false; // Archived areas list — collapsed by default

// Growth toast, held across re-renders. Hours logged in one action trigger
// several renderSidebar() passes; without this the toast would be built and
// then immediately dropped by the next one. { items, until } while live.
const GROWTH_TOAST_MS = 8000;
let _liveGrowthToast = null;
let _growthToastTimer = null;
let _growthToastPainted = false; // entrance animation plays once per toast
let _liveIntentionsToast = null; // { met, until } while the day's toast is up
let _intentionsToastTimer = null;
// Flipped once the sidebar's first render is done, so growth detected at
// boot can't spring the panel open before the user has even looked.
let _sidebarBooted = false;

// Below this width the sidebar is a drawer over the content, not a column
// beside it. Must match the max-width in style.css's mobile block.
const MOBILE_BREAKPOINT = 800;
export function isMobileLayout() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

// Single path for every way the sidebar opens or closes, so the drawer's
// scrim, the FAB's state, and the growth toast can never drift apart.
// `persist: false` for mobile drawer toggles — a drawer opened on a phone
// shouldn't decide how the sidebar sits next time on a desktop.
export function setSidebarOpen(open, { persist = true } = {}) {
  sidebarCollapsed = !open;
  ctx.lifeSidebar.classList.toggle('collapsed', sidebarCollapsed);
  document.getElementById('main-content').classList.toggle('sidebar-open', open);
  if (ctx.sidebarScrim) ctx.sidebarScrim.hidden = !(open && isMobileLayout());
  if (ctx.sidebarFab) ctx.sidebarFab.setAttribute('aria-expanded', String(open));
  if (persist) ctx.storageSet(SIDEBAR_KEY, open ? 'open' : 'collapsed');
  // Opening is what surfaces a pending growth toast; closing must clear it.
  renderSidebar();
}

export function initSidebar() {
  // On a phone the sidebar always starts closed: it covers the content, so
  // restoring a saved "open" would bury the app behind a drawer on load.
  if (isMobileLayout()) sidebarCollapsed = true;
  setSidebarOpen(!sidebarCollapsed, { persist: false });
  _sidebarBooted = true;

  if (ctx.sidebarExpandBtn) {
    ctx.sidebarExpandBtn.addEventListener('click', () => {
      setSidebarOpen(sidebarCollapsed, { persist: !isMobileLayout() });
    });
  }

  // ── Mobile drawer ──
  if (ctx.sidebarFab) {
    ctx.sidebarFab.addEventListener('click', () => setSidebarOpen(true, { persist: false }));
  }
  if (ctx.sidebarScrim) {
    ctx.sidebarScrim.addEventListener('click', () => setSidebarOpen(false, { persist: false }));
  }
  if (ctx.sidebarCloseBtn) {
    ctx.sidebarCloseBtn.addEventListener('click', () => setSidebarOpen(false, { persist: false }));
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Modals own Escape while they're up.
    if (ctx.isModalOpen() || ctx.isFocusFullscreenOpen()) return;
    if (isMobileLayout() && !sidebarCollapsed) setSidebarOpen(false, { persist: false });
  });

  // Crossing the breakpoint (rotation, resize) leaves the drawer's scrim
  // stranded over a desktop layout — close it and start clean.
  window.addEventListener('resize', () => {
    const mobile = isMobileLayout();
    if (mobile && !sidebarCollapsed) setSidebarOpen(false, { persist: false });
    if (!mobile && ctx.sidebarScrim) ctx.sidebarScrim.hidden = true;
  });

  ctx.addCategoryBtn.addEventListener('click', () => ctx.openNewCategoryModal(null));
}

export function renderSidebar() {
  if (!ctx.sidebarCategoriesEl) return;
  ctx.sidebarCategoriesEl.innerHTML = '';
  if (ctx.sidebarCatDots) ctx.sidebarCatDots.innerHTML = '';

  // ── Growth milestone toast ──
  // Only while the panel is actually open: collapsing the sidebar takes the
  // toast with it, and the milestone waits (unacknowledged) for the next
  // time the user looks.
  //
  // The toast is held in _liveGrowthToast rather than acknowledged on the
  // spot. Logging hours calls renderSidebar() twice — once from
  // accumulateCategoryHours, once from the render() that follows — so
  // acknowledging in the same pass that built the toast meant the second
  // pass found nothing pending and dropped it in the same tick. The
  // milestone stays live across re-renders until a timer retires it, which
  // is also what lets a plant that matured on a NON-focused area still be
  // announced: the toast never depended on the focus split, only on
  // surviving long enough to be seen.
  // A milestone reached while the panel is closed used to be entirely
  // silent: the rail stays visible when collapsed, so its emoji buttons are
  // the normal way to log time to an area that ISN'T in today's focus — and
  // that path could mature a plant with no acknowledgement anywhere on
  // screen. The milestone was preserved (it fires whenever the panel next
  // opens), but nothing marked the moment it happened.
  //
  // So: when growth lands while collapsed, open the panel and let the toast
  // render normally. Deliberately not persisted (`persist: false`) — this is
  // the app reacting to an event, and it shouldn't rewrite the user's
  // remembered preference for how the sidebar sits.
  // Gated on _sidebarBooted so this only reacts to growth that happens
  // during the session. A milestone left unacknowledged from a previous
  // visit would otherwise force the panel open at boot, overriding a user
  // who deliberately keeps it closed — that one still waits quietly for the
  // next manual open, which is the existing (correct) behaviour.
  if (_sidebarBooted && sidebarCollapsed && !isMobileLayout() && ctx.pendingGrowthMilestones().length > 0) {
    setSidebarOpen(true, { persist: false });
    return; // setSidebarOpen re-enters renderSidebar with the panel open
  }
  let milestones = sidebarCollapsed ? [] : ctx.pendingGrowthMilestones();
  // Growth already banked before this session is not news. The boot render
  // still has to CONSUME such a milestone (so it can't surface later as if
  // it just happened), but it must not celebrate it: hours that were simply
  // sitting in storage were never earned in front of the user. Only growth
  // that happens after the sidebar has booted gets a toast.
  //
  // This is what the "pre-existing hours are baselined, not celebrated"
  // regression covers: baselineGrowthStages() only seeds seenStage when it
  // is absent, so a category whose totalHours grew between sessions arrives
  // here with a real pending milestone that must be swallowed quietly.
  if (milestones.length > 0 && !_sidebarBooted) {
    ctx.acknowledgeGrowthMilestones(milestones);
    milestones = [];
  }
  if (milestones.length > 0) {
    // Newly detected — take ownership and start the retire timer.
    _liveGrowthToast = { items: milestones, until: Date.now() + GROWTH_TOAST_MS };
    _growthToastPainted = false;
    ctx.acknowledgeGrowthMilestones(milestones);
    clearTimeout(_growthToastTimer);
    _growthToastTimer = setTimeout(() => {
      _liveGrowthToast = null;
      renderSidebar();
    }, GROWTH_TOAST_MS);
  } else if (_liveGrowthToast && !sidebarCollapsed && Date.now() < _liveGrowthToast.until) {
    // Already acknowledged, still within its window — keep showing it.
    milestones = _liveGrowthToast.items;
  } else if (sidebarCollapsed) {
    // Collapsing takes either toast with it, as before.
    _liveGrowthToast = null;
    _liveIntentionsToast = null;
    clearTimeout(_growthToastTimer);
    clearTimeout(_intentionsToastTimer);
  }
  if (milestones.length > 0) {
    const toast = document.createElement('div');
    // The toast is rebuilt on every re-render while it's live, so the
    // entrance animation is applied only on the first paint — otherwise it
    // would replay each time hours are logged or a card is clicked.
    toast.className = 'sidebar-growth-toast'
      + (_growthToastPainted ? '' : ' sidebar-growth-toast-enter');
    _growthToastPainted = true;
    const first = milestones[0];
    const art = document.createElement('span');
    art.className = 'sidebar-growth-toast-art';
    art.textContent = first.stage.art;
    const text = document.createElement('div');
    text.className = 'sidebar-growth-toast-text';
    if (milestones.length === 1) {
      const days = first.stage.daysDone;
      text.innerHTML =
        `<strong></strong> reached ${days} full ${days === 1 ? 'day' : 'days'} invested.`;
      text.querySelector('strong').textContent = first.cat.name;
    } else {
      text.textContent = `${milestones.length} life areas grew a stage.`;
    }
    toast.append(art, text);
    ctx.sidebarCategoriesEl.appendChild(toast);
  } else if (!sidebarCollapsed) {
    // ── Intentions-met toast ──
    // Second in line behind a growth milestone: crossing a stage is the
    // rarer event, and two toasts stacked would be a pile-up. This one is
    // still there on the next render if growth took the slot this time.
    //
    // Marked seen on state (not on a category) so it rides the day's state
    // and resets itself tomorrow — no cleanup, and a Tuesday's toast can
    // never fire again on Wednesday.
    //
    // Same live-hold as the growth toast, and for the same reason: logging
    // hours re-renders the sidebar more than once, so marking it seen in the
    // pass that builds it would drop it in the same tick. Detect once, mark
    // seen once, then replay from _liveIntentionsToast until the timer ends.
    // Its own timer handle, so a growth milestone arriving mid-window can't
    // clear this one's and strand it on screen.
    let met = null;
    if (!ctx.state._intentionsMetSeen) {
      met = ctx.intentionsAllMetToday();
      if (met) {
        ctx.state._intentionsMetSeen = true;
        ctx.saveState();
        _liveIntentionsToast = { met, until: Date.now() + GROWTH_TOAST_MS };
        _growthToastPainted = false;
        clearTimeout(_intentionsToastTimer);
        _intentionsToastTimer = setTimeout(() => {
          _liveIntentionsToast = null;
          renderSidebar();
        }, GROWTH_TOAST_MS);
      }
    } else if (_liveIntentionsToast && Date.now() < _liveIntentionsToast.until) {
      met = _liveIntentionsToast.met;
    }
    if (met) {
      const toast = document.createElement('div');
      toast.className = 'sidebar-growth-toast sidebar-intentions-toast'
        + (_growthToastPainted ? '' : ' sidebar-growth-toast-enter');
      _growthToastPainted = true;
      const art = document.createElement('span');
      art.className = 'sidebar-growth-toast-art';
      art.textContent = '✓';
      const text = document.createElement('div');
      text.className = 'sidebar-growth-toast-text';
      // Says what happened, and stops. No "keep it up", no streak to
      // protect — the day's intentions were a gesture, not a quota, and
      // the tone rule says meeting one earns a quiet acknowledgement.
      text.textContent = met.count === 1
        ? `You gave today's life area the time you meant to.`
        : `All ${met.count} life areas got the time you meant to give them.`;
      toast.append(art, text);
      ctx.sidebarCategoriesEl.appendChild(toast);
    }
  }
  // Plants that advanced get the pop for as long as the toast is up.
  // Acknowledgement already happened when the milestone was first detected,
  // so seenStage is persisted even if the tab closes before the toast fades.
  const justGrew = new Set(milestones.map(m => m.cat.id));

  // Count active, completed, and backlogged goals per category today
  const todayActive = {};
  const todayCompleted = {};
  const todayBacklog = {};
  const todayHours = {};
  ctx.state.goals.forEach(g => {
    const id = g.category || 'general';
    if ((g.progress || 0) >= 100) todayCompleted[id] = (todayCompleted[id] || 0) + 1;
    else todayActive[id] = (todayActive[id] || 0) + 1;
    if ((g.hours || 0) > 0) todayHours[id] = (todayHours[id] || 0) + (g.hours || 0);
  });
  (ctx.state.quickDone || []).forEach(q => {
    const id = q.category || 'general';
    if ((q.hours || 0) > 0) todayHours[id] = (todayHours[id] || 0) + (q.hours || 0);
  });
  ctx.backlog.forEach(b => {
    const id = b.category || 'general';
    todayBacklog[id] = (todayBacklog[id] || 0) + 1;
  });

  const liveCats = ctx.activeCategories();
  const archivedCats = ctx.categories.filter(c => c.archived && !c.deleted);

  // Split into today's focus vs the rest (rest sorted by totalHours asc)
  const focusIds = new Set(ctx.state.focusCategoryIds || []);
  const focusCats = liveCats.filter(c => focusIds.has(c.id));
  const restCats = liveCats
    .filter(c => !focusIds.has(c.id))
    .sort((a, b) => (a.totalHours || 0) - (b.totalHours || 0));

  // Rail emoji buttons — keep original order
  liveCats.forEach(cat => {
    if (ctx.sidebarCatDots) {
      const emojiBtn = document.createElement('button');
      emojiBtn.className = 'sidebar-emoji-btn';
      emojiBtn.textContent = cat.emoji || '●';
      emojiBtn.title = cat.name;
      emojiBtn.style.setProperty('--cat-color', cat.color);
      emojiBtn.addEventListener('click', () => ctx.openQuickAddModal(cat));
      ctx.sidebarCatDots.appendChild(emojiBtn);
    }
  });

  // Small caption sitting under a progress pipe. `muted` dims it for the
  // secondary (long-term stage) bar so the two captions don't compete.
  function barContainerLabel(text, muted) {
    const el = document.createElement('div');
    el.className = 'sidebar-bar-label' + (muted ? ' sidebar-bar-label--muted' : '');
    el.textContent = text;
    return el;
  }

  function buildCard(cat, isFocused) {
    const card = document.createElement('div');
    card.className = 'sidebar-cat-card' + (isFocused ? ' sidebar-cat-focused' : '');
    // Focused cards carry their own area's colour so the card can wash
    // itself in it. Only on focused cards: tinting all of them would turn
    // the rail into a colour chart and cost the focused ones their
    // distinction, which is the whole point of the split.
    if (isFocused && cat.color) {
      card.style.setProperty('--cat-color', cat.color);
      // Only set the rgb triple when it actually parsed. hexToRgb assumes
      // #rrggbb and yields "NaN,NaN,NaN" for anything else — and since the
      // variable would still be *set*, the CSS var() fallback wouldn't fire
      // and the tint would silently vanish. Leaving it unset lets the
      // fallback do its job.
      const rgb = hexToRgb(cat.color);
      if (!rgb.includes('NaN')) card.style.setProperty('--cat-color-rgb', rgb);
    }

    const top = document.createElement('div');
    top.className = 'sidebar-cat-top';

    const emojiEl = document.createElement('span');
    emojiEl.className = 'sidebar-cat-emoji';
    emojiEl.textContent = cat.emoji || '●';

    const nameEl = document.createElement('span');
    nameEl.className = 'sidebar-cat-name';
    nameEl.textContent = cat.name;

    // Growth marker: the plant, plus a ×N count once past the last art stage
    // so long-running areas keep visibly climbing.
    const stage = getGrowthStage(cat.totalHours);
    const growthEl = document.createElement('div');
    growthEl.className = 'sidebar-cat-growth'
      + (stage.daysDone === 0 ? ' sidebar-cat-growth-empty' : '');
    growthEl.textContent = stage.art;
    if (justGrew.has(cat.id)) growthEl.classList.add('sidebar-cat-growth-new');
    growthEl.title = stage.daysDone === 0
      ? `${formatHours(cat.totalHours || 0, '0m')} invested — 24h grows a seedling`
      : `${stage.label} · ${stage.daysDone} full ${stage.daysDone === 1 ? 'day' : 'days'} invested`;
    // Once the art tops out, the ×N count is the only thing still moving —
    // show it from the final stage on, not just past it.
    if (stage.isMaxArt) {
      const mult = document.createElement('span');
      mult.className = 'sidebar-cat-growth-mult';
      mult.textContent = `×${stage.daysDone}`;
      growthEl.appendChild(mult);
    }

    const hoursEl = document.createElement('span');
    hoursEl.className = 'sidebar-cat-hours';
    const todayH = todayHours[cat.id] || 0;
    const totalH = cat.totalHours || 0;
    // Focused cards previously blanked this row on the grounds that each bar
    // carries its own caption — but those captions are today's figure and the
    // climb to the next stage, so the all-time total appeared nowhere on the
    // cards you look at most. The title row carries it here in exactly the
    // format the other cards use, so the number reads the same everywhere.
    // On a focused card today's hours are already under the intention pipe,
    // so the row shows the total alone rather than repeating it.
    if (isFocused) {
      // Wrapped in the same span the two-figure form uses, so the total
      // renders at an identical weight and colour on every card.
      if (totalH > 0) hoursEl.innerHTML = `<span class="sidebar-hours-total">${totalH.toFixed(1)}h</span>`;
      else hoursEl.textContent = '—';
    } else if (todayH > 0) {
      hoursEl.innerHTML = `<span class="sidebar-hours-today">${todayH.toFixed(1)}h</span><span class="sidebar-hours-sep"> | </span><span class="sidebar-hours-total">${totalH.toFixed(1)}h</span>`;
    } else {
      hoursEl.textContent = totalH > 0 ? `${totalH.toFixed(1)}h` : '—';
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'sidebar-cat-edit-btn';
    editBtn.title = 'Edit';
    editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/></svg>';
    editBtn.addEventListener('click', e => {
      e.stopPropagation();
      ctx.openCatInlineEdit(cat, card, top, editBtn);
    });

    top.append(emojiEl, nameEl, hoursEl);

    const completed = todayCompleted[cat.id] || 0;
    if (completed > 0) {
      const compBadge = document.createElement('span');
      compBadge.className = 'sidebar-cat-completed';
      compBadge.textContent = `✓${completed}`;
      top.appendChild(compBadge);
    }
    top.appendChild(editBtn);

    // The bar now tracks the climb to the next growth stage (0→24h) rather
    // than this category's size against the others — absolute progress that
    // can't shrink when a different area pulls ahead. Relative standing is
    // carried by the stage art instead.
    const growth = getGrowthStage(cat.totalHours);
    const barContainer = document.createElement('div');
    barContainer.className = 'sidebar-cat-bar-container';
    barContainer.title = growth.isMaxArt
      ? `${growth.daysDone} full days invested`
      : `${formatHours(growth.intoStage, '0m')} into this stage — ${formatHours(growth.hoursToNext, '0m')} to ${GROWTH_STAGES[growth.daysDone + 1].label}`;
    const bar = document.createElement('div');
    bar.className = 'sidebar-cat-bar';
    bar.style.background = `linear-gradient(90deg, ${cat.color}cc, ${cat.color}88)`;
    bar.style.width = growth.pctToNext + '%';
    barContainer.appendChild(bar);

    const active = todayActive[cat.id] || 0;
    const backlogged = todayBacklog[cat.id] || 0;
    const parts = [];
    if (active > 0) parts.push(`${active} active`);
    if (completed > 0) parts.push(`${completed} done`);
    if (backlogged > 0) parts.push(`${backlogged} backlog`);
    const countEl = document.createElement('div');
    countEl.className = 'sidebar-cat-task-count';
    countEl.textContent = parts.join(' · ');

    // ── Today's intention pipe ──
    // Sits directly above the growth bar so the card reads as two pipes in
    // one body: today's time on top, the long climb beneath. Only on focused
    // cards, and only when an intention was actually set.
    //
    // It fills toward the intention and stops where it stops. No red state,
    // no "behind", no percent-of-target — a day that fell short looks exactly
    // like a day still in progress. That restraint is the point.
    let intentionBar = null;
    const intention = isFocused ? ctx.getIntentionFor(cat.id) : null;
    if (intention) {
      const met = todayH >= intention;
      intentionBar = document.createElement('div');
      intentionBar.className = 'sidebar-cat-bar-container sidebar-intention-container'
        + (met ? ' sidebar-intention--met' : '');
      const fill = document.createElement('div');
      fill.className = 'sidebar-cat-bar sidebar-intention-fill';
      fill.style.width = Math.min(100, (todayH / intention) * 100) + '%';
      fill.style.background = `linear-gradient(90deg, ${cat.color}, ${cat.color}aa)`;
      intentionBar.appendChild(fill);
      intentionBar.title = met
        ? `Intention met — ${formatHours(todayH, '0m')} of ${formatHours(intention, '0m')} on ${cat.name} today`
        : `${formatHours(todayH, '0m')} of ${formatHours(intention, '0m')} on ${cat.name} today`;
    }

    // The card is a two-column body: everything stacks in the content
    // column, and the growth plant gets its own narrow chamber on the right.
    const body = document.createElement('div');
    body.className = 'sidebar-cat-body';

    const content = document.createElement('div');
    content.className = 'sidebar-cat-content';
    content.appendChild(top);

    // Each pipe gets its caption directly beneath it: today's time under the
    // intention bar, the stage climb under the growth bar.
    if (intentionBar) {
      content.appendChild(intentionBar);
      const todayLabel = document.createElement('div');
      todayLabel.className = 'sidebar-bar-label';
      todayLabel.innerHTML =
        `<span class="sidebar-hours-today">${formatHours(todayH, '0m')}</span>`
        + `<span class="sidebar-hours-of"> of ${formatHours(intention, '0m')} today</span>`;
      if (todayH >= intention) {
        const tick = document.createElement('span');
        tick.className = 'sidebar-bar-tick';
        tick.textContent = '✓';
        todayLabel.appendChild(tick);
      }
      content.appendChild(todayLabel);
    } else if (isFocused) {
      // No intention set — just the plain today figure, no empty track. An
      // unset intention shouldn't leave a hollow slot demanding to be filled.
      content.appendChild(barContainerLabel(formatHours(todayH, '0h') + ' today'));
    }

    content.appendChild(barContainer);
    if (isFocused) {
      content.appendChild(barContainerLabel(
        growth.isMaxArt
          ? `${growth.daysDone} days invested`
          : `${formatHours(growth.hoursToNext, '0m')} to ${GROWTH_STAGES[growth.daysDone + 1].label.toLowerCase()}`,
        true,
      ));
    }
    content.appendChild(countEl);

    // The growth chamber is a focused-card affordance only: on the other
    // areas it would be five more things to scan for no decision it informs.
    body.appendChild(content);
    if (isFocused) {
      const chamber = document.createElement('div');
      chamber.className = 'sidebar-cat-chamber';
      chamber.appendChild(growthEl);
      body.appendChild(chamber);
    }
    card.appendChild(body);

    const isExpanded = expandedCatId === cat.id;
    if (isExpanded) {
      card.classList.add('sidebar-cat-expanded');
      const detail = document.createElement('div');
      detail.className = 'sidebar-cat-detail';

      const activeGoals = ctx.state.goals.filter(g => (g.category || 'general') === cat.id && (g.progress || 0) < 100);
      const doneGoals   = ctx.state.goals.filter(g => (g.category || 'general') === cat.id && (g.progress || 0) >= 100);
      const backlogItems = ctx.backlog.filter(b => (b.category || 'general') === cat.id);

      function addSection(label, items, itemClass, draggable) {
        if (!items.length) return;
        const sec = document.createElement('div');
        sec.className = 'sidebar-detail-section';
        const secLabel = document.createElement('div');
        secLabel.className = 'sidebar-detail-label';
        secLabel.textContent = label;
        sec.appendChild(secLabel);
        items.forEach(item => {
          const row = document.createElement('div');
          row.className = 'sidebar-detail-item ' + itemClass;
          if (draggable) {
            const handle = document.createElement('span');
            handle.className = 'sidebar-backlog-drag-handle';
            handle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 256 256" fill="currentColor"><path d="M104,60A12,12,0,1,1,92,48,12,12,0,0,1,104,60Zm60,0a12,12,0,1,1-12-12A12,12,0,0,1,164,60ZM104,128a12,12,0,1,1-12-12A12,12,0,0,1,104,128Zm60,0a12,12,0,1,1-12-12A12,12,0,0,1,164,128ZM104,196a12,12,0,1,1-12-12A12,12,0,0,1,104,196Zm60,0a12,12,0,1,1-12-12A12,12,0,0,1,164,196Z"/></svg>';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'sidebar-backlog-item-name';
            nameSpan.textContent = item.name;

            // Explicit buttons beside the drag handle — dragging to Top 5 is
            // invisible unless you already know it's there.
            const rowActions = document.createElement('span');
            rowActions.className = 'sidebar-detail-actions';

            const topFull = ctx.getActiveGoals().length >= ctx.MAX_GOALS;
            const upBtn = document.createElement('button');
            upBtn.className = 'sidebar-detail-promote';
            upBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,106.34l-96-96a8,8,0,0,0-11.32,0l-96,96a8,8,0,0,0,11.32,11.32L120,29.31V216a8,8,0,0,0,16,0V29.31l82.34,88.35a8,8,0,0,0,11.32-11.32Z"/></svg>';
            upBtn.disabled = topFull;
            upBtn.title = topFull
              ? `Top 5 is full (${ctx.MAX_GOALS} tasks) — finish or demote one first`
              : 'Move to Top 5';
            upBtn.addEventListener('click', e => {
              e.stopPropagation();
              if (ctx.getActiveGoals().length >= ctx.MAX_GOALS) return;
              const i = ctx.backlog.indexOf(item);
              if (i === -1) return;
              ctx.state.goals.push({
                name: item.name, hours: item.hours || 0, progress: item.progress || 0,
                category: item.category || null, repeatable: item.repeatable || false,
                fromBacklog: true,
              });
              ctx.backlog.splice(i, 1);
              ctx.saveState(); ctx.saveBacklog(); ctx.render(); renderSidebar();
              if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(ctx.state.goals);
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'sidebar-detail-delete';
            delBtn.textContent = '×';
            delBtn.title = 'Delete';
            delBtn.addEventListener('click', e => {
              e.stopPropagation();
              const i = ctx.backlog.indexOf(item);
              if (i === -1) return;
              ctx.undoStack.push({ type: 'backlog', item: ctx.backlog[i], index: i });
              ctx.backlog.splice(i, 1);
              ctx.saveBacklog(); ctx.renderBacklog(); renderSidebar();
            });

            rowActions.append(upBtn, delBtn);
            row.append(handle, nameSpan, rowActions);
            ctx.setupSidebarBacklogDrag(row, item);
          } else {
            row.textContent = item.name;
          }
          sec.appendChild(row);
        });
        detail.appendChild(sec);
      }

      addSection('Active', activeGoals, 'sidebar-detail-active', false);
      addSection('Done Today', doneGoals, 'sidebar-detail-done', false);
      addSection('Backlog', backlogItems, 'sidebar-detail-backlog', true);

      if (!activeGoals.length && !doneGoals.length && !backlogItems.length) {
        const empty = document.createElement('div');
        empty.className = 'sidebar-detail-empty';
        empty.textContent = 'No tasks here yet';
        detail.appendChild(empty);
      }

      // Quiet archive action — hides the area from daily UI, keeps its
      // hours and history. Restorable from the Archived section below.
      if (cat.id !== 'general') {
        const archiveBtn = document.createElement('button');
        archiveBtn.className = 'sidebar-archive-btn';
        archiveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M224,48H32A16,16,0,0,0,16,64V88a16,16,0,0,0,16,16v96a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V104a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48Zm-16,152H48V104H208ZM224,88H32V64H224V88ZM96,136a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,136Z"/></svg> Archive this area';
        archiveBtn.title = 'Hide from daily view — hours and history are kept';
        archiveBtn.addEventListener('click', e => {
          e.stopPropagation();
          ctx.archiveCategory(cat.id);
        });
        detail.appendChild(archiveBtn);
      }

      card.appendChild(detail);
    }

    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      expandedCatId = expandedCatId === cat.id ? null : cat.id;
      renderSidebar();
    });

    return card;
  }

  // ── Today's focus section ──
  // Header always renders, with an edit pencil on the right — set focus
  // if the day-start modal was skipped, or change it mid-day.
  const focusHeader = document.createElement('div');
  focusHeader.className = 'sidebar-section-header sidebar-focus-header';
  const focusHeaderText = document.createElement('span');
  focusHeaderText.textContent = "Today's focus";
  const editFocusBtn = document.createElement('button');
  editFocusBtn.className = 'sidebar-focus-edit-btn';
  editFocusBtn.title = "Change today's focus areas";
  editFocusBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/></svg>';
  editFocusBtn.addEventListener('click', ctx.openEditFocusModal);
  focusHeader.append(focusHeaderText, editFocusBtn);
  ctx.sidebarCategoriesEl.appendChild(focusHeader);

  if (focusCats.length > 0) {
    focusCats.forEach(cat => ctx.sidebarCategoriesEl.appendChild(buildCard(cat, true)));

    const divider = document.createElement('div');
    divider.className = 'sidebar-section-divider';
    const dividerText = document.createElement('p');
    dividerText.className = 'sidebar-section-divider-text';
    dividerText.textContent = 'You chose to go deep on these areas today. The rest are standing by — progress compounds when you focus.';
    divider.appendChild(dividerText);
    ctx.sidebarCategoriesEl.appendChild(divider);

    const restHeader = document.createElement('div');
    restHeader.className = 'sidebar-section-header sidebar-section-header--muted';
    restHeader.textContent = 'Other areas';
    ctx.sidebarCategoriesEl.appendChild(restHeader);

    restCats.forEach(cat => ctx.sidebarCategoriesEl.appendChild(buildCard(cat, false)));
  } else {
    // No focus set — gentle hint under the header, then all cards
    const noneHint = document.createElement('p');
    noneHint.className = 'sidebar-focus-none';
    noneHint.textContent = 'None set — tap the pencil to pick up to 3 areas.';
    ctx.sidebarCategoriesEl.appendChild(noneHint);
    [...liveCats].sort((a, b) => (a.totalHours || 0) - (b.totalHours || 0))
      .forEach(cat => ctx.sidebarCategoriesEl.appendChild(buildCard(cat, false)));
  }

  // ── Archived areas — collapsed by default; hours kept, one click to restore ──
  if (archivedCats.length > 0) {
    const archHeader = document.createElement('button');
    archHeader.className = 'sidebar-section-header sidebar-section-header--muted sidebar-archived-toggle';
    archHeader.innerHTML = `<span>Archived (${archivedCats.length})</span><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 256 256" fill="currentColor" style="transform: rotate(${archivedSectionOpen ? 180 : 0}deg)"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>`;
    archHeader.addEventListener('click', () => {
      archivedSectionOpen = !archivedSectionOpen;
      renderSidebar();
    });
    ctx.sidebarCategoriesEl.appendChild(archHeader);

    if (archivedSectionOpen) archivedCats.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'sidebar-archived-row';

      function renderNormal() {
        row.innerHTML = '';
        row.classList.remove('sidebar-archived-row--confirm');
        const label = document.createElement('span');
        label.className = 'sidebar-archived-label';
        label.textContent = `${cat.emoji || '●'} ${cat.name}`;
        const hours = document.createElement('span');
        hours.className = 'sidebar-archived-hours';
        hours.textContent = (cat.totalHours || 0) > 0 ? `${(cat.totalHours).toFixed(0)}h` : '';
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'sidebar-restore-btn';
        restoreBtn.textContent = 'Restore';
        restoreBtn.title = 'Bring this area back into daily view';
        restoreBtn.addEventListener('click', () => ctx.restoreCategory(cat.id));
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'sidebar-archived-delete-btn';
        deleteBtn.title = 'Delete forever';
        deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/></svg>';
        deleteBtn.addEventListener('click', renderConfirm);
        row.append(label, hours, restoreBtn, deleteBtn);
      }

      // Inline confirm — delete is the one destructive action here.
      function renderConfirm() {
        row.innerHTML = '';
        row.classList.add('sidebar-archived-row--confirm');
        const q = document.createElement('span');
        q.className = 'sidebar-archived-label';
        q.textContent = `Delete ${cat.name} forever? Past entries keep its name.`;
        const yesBtn = document.createElement('button');
        yesBtn.className = 'sidebar-restore-btn sidebar-delete-confirm-btn';
        yesBtn.textContent = 'Delete';
        yesBtn.addEventListener('click', () => ctx.deleteCategory(cat.id));
        const noBtn = document.createElement('button');
        noBtn.className = 'sidebar-restore-btn';
        noBtn.textContent = 'Keep';
        noBtn.addEventListener('click', renderNormal);
        const btnRow = document.createElement('div');
        btnRow.className = 'sidebar-archived-confirm-actions';
        btnRow.append(yesBtn, noBtn);
        row.append(q, btnRow);
      }

      renderNormal();
      ctx.sidebarCategoriesEl.appendChild(row);
    });
  }
}

