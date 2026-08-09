# "Trust and glance" — complete task record

Implementation slice 5, 2026-08-09. Implements the scope proposed at the end of
[`docs/ux-audit-2026-08-09.md`](./ux-audit-2026-08-09.md). Finding numbers (F1,
F16…) refer to that audit.

Sections 1–3 are verbatim. Sections 4–7 are the record of what was built,
measured, and deviated from.

---

## 1. The original prompt, verbatim

> Context — facts about this app:
>
> Vite + React, deployed on Vercel, data in Supabase. src/lib/supabase.js = shared client; src/lib/tripData.js = fetchTripData() plus six write functions (setEventStatus, deleteEvent, addEvent, set/delete/addPackingItem, set/delete/addPrepItem equivalents), all sharing the requireOneRow zero-row guard. Components never touch the client directly.
> A full UX audit exists at docs/ux-audit-2026-08-09.md — read it first; this task implements its "Trust and glance" scope. Finding numbers below (F1, F16…) refer to it.
> Two users on two phones, sometimes concurrent. Trip runs Aug 28–Sep 6.
> itinerary_events.options is a jsonb array of strings, nullable. RLS is off. No schema changes are authorized.
>
> Task — implement exactly these twelve items:
>
> Write timeout (F16): ~8s AbortController timeout on every write in tripData.js, so a stalled request becomes a rejection that the existing revert-and-report path handles.
> Today anchor (F1/F3): compute today's date; mark that day card with aria-current="date", a TODAY label, and an accent consistent with the existing city-accent pattern; scrollIntoView once data lands. Before Aug 28 → day 1; after Sep 6 → last day.
> Revalidate on focus (F18): refetch on visibilitychange/window focus and replace state. Rewrite the zero-row error text to "This item was removed on another device."
> Retry on load failure (F5): keep the error message, add a Try again button that re-runs the fetch.
> One save-failure toast (F17): fixed-position, aria-live="polite", replacing the three section-top error lines.
> Touch targets as one coherent change (F6+F7): right-align every × at the row's right edge with ≥12px separation from other controls (this also fixes the −6px overlap in packing rows from .packing-item's negative margin); then expand badge, ×, and + Add hit areas to ≥44px via padding with compensating margins; min-height: 44px on checklist rows. Visual sizes unchanged.
> iOS input hygiene (F8/F21/F23): .add-input font-size to 16px; add an aria-label; blur with non-empty text saves (Enter and Escape behavior unchanged).
> CSS hygiene (F9/F19/F20): all hover rules behind @media (hover: hover); explicit -webkit-tap-highlight-color; one shared :focus-visible outline rule (2px, --azulejo, offset 2px) replacing the piecemeal ones; darken --ink-soft and --gold just enough to clear 4.5:1 in light and dark modes, and bring × to ≥3:1 — token tweaks, not a palette change.
> Bookings below the Itinerary (F2): reorder the sections; no other layout change.
> #trip-prep consistency (F22): add it to the shared section rule; remove its inline styles.
> Interactive badges get a persistent glyph (F12): OPEN/CONFIRMED badges (tappable) gain a small trailing chevron or equivalent that BOOKED badges (static) lack.
> Option deletion (new — not in the audit): each option row under an event gets its own small ×, same visual language and ≥44px hit area as item 6, gated by the same named confirm ("Remove option 'Casa Falésia'?"). On confirm: update that event's options jsonb array with the option removed; if the array empties, write null. Status is untouched — removing options never flips open/confirmed. Pessimistic (await, then update state), zero-row guard applies.
>
> Scope fence:
>
> Touch only: src/lib/tripData.js, src/App.jsx, src/components/PackingList.jsx, src/components/TripPrep.jsx, src/App.css, src/index.css (tokens and shared rules only, for items 8 and 10).
> No new features beyond the twelve. Explicitly out (deferred, in the audit's own words): collapse-options-to-count, sunset de-duplication, edit-mode, undo, realtime, offline caching, per-user anything, reordering, routing, libraries, schema changes, visual rebranding.
> CSS changes are no longer append-only — existing rules may be modified where an item requires it — but every modified existing rule must be listed in the plan.
>
> Process:
>
> Before writing any code: list every file you'll modify, what you'll do to each, every existing CSS rule you'll change, and the exact new function signature for the option-deletion write. Wait for my approval, then hold to the list.

---

## 2. The plan as posted for approval, verbatim

> Plan below. Three verified facts shaped it: `.abortSignal()` exists in postgrest-js 2.112.2; **dark mode already clears 4.5:1** (ink-soft 5.17, gold 5.08), so only the light palette needs tokens touched; and one correction to my own audit — the confirmed badge measures **2.78:1**, not the 3.21 I reported, because I measured it against the card background instead of its own translucent `--gold-bg` fill. It needs more darkening than the audit implied.
>
> ## `src/lib/tripData.js`
>
> **Item 1 — timeout.** New `WRITE_TIMEOUT_MS = 8000` and one shared wrapper all seven write paths route through:
>
> ```js
> async function runWrite(table, label, buildQuery) {
>   if (!supabase) throw new Error(missingEnvMessage)
>   const controller = new AbortController()
>   const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS)
>   let result
>   try {
>     result = await buildQuery().abortSignal(controller.signal)
>   } finally {
>     clearTimeout(timer)
>   }
>   if (controller.signal.aborted) throw new Error('Timed out after 8s — check your connection.')
>   if (result.error) throw new Error(`${table} — ${result.error.message}`)
>   requireOneRow(table, result.data, label)
>   return result.data
> }
> ```
>
> Covers `setEventStatus`, `deleteEvent`, `addEvent`, `removeEventOption`, `setItemChecked`, `deleteItem`, `addItem`. Reads stay untimed — see the flag at the end.
>
> **Item 3 — message.** `requireOneRow` throws `'This item was removed on another device.'` (no table prefix; it's user-facing).
>
> **Item 12 — the new write.** Exact signature:
>
> ```js
> /**
>  * Removes one option from an event's options array. Status is never touched.
>  * @param {number}   id       itinerary_events.id
>  * @param {string[]} options  the event's current options, from UI state
>  * @param {string}   option   the option to remove
>  * @returns {Promise<string[]|null>} the value actually persisted
>  */
> export async function removeEventOption(id, options, option)
> ```
>
> Filters `option` out, writes `next.length ? next : null`, returns that value so the caller stores exactly what the database holds. Read-modify-write on a jsonb array, so it inherits the app's existing last-write-wins behavior; two phones removing different options in the same second will lose one. Consistent with every other write here, and item 3's revalidation narrows the window.
>
> ## `src/App.jsx`
>
> - **Item 1/5:** extract fetch into a `load()` callback; add `toast` state; delete the `editError` line; all six write handlers call `setToast(err.message)`.
> - **Item 2:** `localDateKey()` using local date parts (**not** `toISOString`, which shifts the day in western timezones); pick today's date, else first day before Aug 28, else last day after Sep 6; `aria-current="date"`, `day-today` class, `id="day-today"`, TODAY flag rendered *inside* the existing `.day-date` span so `.day-card-header`'s two-child `space-between` layout is untouched; `scrollIntoView({block:'start'})` in an effect guarded by a `useRef` so it fires once on first load only, never on revalidation.
> - **Item 3:** `visibilitychange` + `focus` listeners calling a `refresh()` that never nulls `data` (so no "Loading trip…" flash on tab return), with an in-flight ref plus 2s throttle since both events fire together.
> - **Item 4:** `Try again` button in the load-error branch calling `load()`.
> - **Item 5:** one `<div className="toast" role="status" aria-live="polite">`, tap to dismiss, cleared at the start of every write attempt.
> - **Item 6:** event `<li>` gets `className="event-row"`; text wrapped in `<span className="event-text">`; `×` moves into a 44px right gutter.
> - **Item 9:** Bookings section moved below the Itinerary section. No other markup change.
> - **Item 11:** chevron via CSS on `.badge-toggle` only.
> - **Item 12:** options `<ul>` gets `className="event-options"`, each `<li>` `className="option-row"` with `.option-text` + a `×` (`aria-label={\`Remove option ${option}\`}`), confirm `Remove option 'Casa Falésia'?`, then `removeEventOption` awaited before state update.
>
> ## `src/components/PackingList.jsx` and `TripPrep.jsx`
>
> - **Item 3:** `useEffect(() => setGroupList(groups), [groups])` so revalidated data actually reaches the checklists — without this, item 3 silently does nothing for two of the three lists.
> - **Item 5:** drop local `error` state and the section-top `<p>`; accept an `onError` prop.
> - **Item 6:** `<li className="packing-row">` gains a 44px `×` sibling with a 12px gap.
> - **Item 7:** `aria-label` on the input; `onBlur` saves when `draft.trim()` is non-empty, cancels when empty. Enter/Escape unchanged; the existing `saving` guard prevents an Enter-then-blur double insert.
> - **Item 10:** remove TripPrep's inline `style` attribute.
>
> ## Existing CSS rules I will modify
>
> **`src/index.css`**
>
> | Rule | Change |
> |---|---|
> | `:root` | `--ink-soft: #6b7a70` → **`#647065`** (5.10 on cards, 4.64 on page — the minimum that clears 4.5 on *both* surfaces); add `--gold-ink: #8a6420` (4.56 on the blended badge fill); add `-webkit-tap-highlight-color: var(--azulejo-bg)` |
> | `@media (prefers-color-scheme: dark) :root` | add `--gold-ink: #dcb15a`. `--ink-soft` and `--gold` unchanged — both already pass |
>
> `--gold` itself stays untouched, so the tile strip and the transit-day border keep their exact colour. That's what keeps this a token tweak rather than a palette change.
>
> **`src/App.css`**
>
> | Rule | Change |
> |---|---|
> | `#bookings, #itinerary-section, #packing-list` | add `#trip-prep` (item 10) |
> | `.badge-confirmed` | `color: var(--gold-ink)`; border-color stays `var(--gold)` |
> | `.badge-toggle` | add `position: relative` (hit-area + chevron anchors) |
> | `.badge-toggle:hover, .badge-toggle:focus-visible` | split — hover into `@media (hover: hover)`, focus half deleted |
> | `.row-delete` | `color: var(--line)` → `var(--ink-soft)` (1.51 → 5.10, clears the ≥3:1 bar and answers F13); drop `vertical-align`/`padding` now that geometry is set per context |
> | `.row-delete:hover, .row-delete:focus-visible` | same split |
> | `.add-toggle` | add `position: relative` |
> | `.add-toggle:hover, .add-toggle:focus-visible` | same split |
> | `.packing-item:hover` | wrapped in `@media (hover: hover)` |
> | `.packing-row` | add `gap: 12px`, `min-height: 44px` |
> | `.packing-row > .packing-item` | add `margin-right: 0` (kills the −6px overlap) and `min-height: 44px` |
> | `.add-input` | `font-size: 14px` → **`16px`** |
> | `.add-input:focus` | **deleted** — the shared `:focus-visible` replaces it |
>
> **New rules:** `:focus-visible` (shared, in index.css), `.day-today`, `.day-today-flag`, `.event-row`, `.event-text`, `.event-options`, `.option-row`, `.option-text`, `.badge-toggle::before` (hit area) / `::after` (chevron), `.add-toggle::before`, context geometry for `.event-row > .row-delete` and `.option-row > .row-delete`, `.toast`, `.retry`.
>
> ## How I'm reaching 44px without wrecking density — and one thing I'm doing differently
>
> The obvious reading of items 6 and 12 is `min-height: 44px` on every row. I measured what that costs: **+1058px on event rows and +648px on option rows**, about 22% more scrolling — directly against the density finding in the same audit. So instead:
>
> Event and option rows get a **44px-wide right gutter** (`padding-right: 44px`) with the `×` absolutely positioned and vertically centred, 44×44, glyph unchanged at 15px. Row height stays as-is. The gutter's left edge is exactly where text and badge content stops, so **the `×` hit area cannot overlap the badge** — which is the hazard that actually matters, since the badge is the unguarded control. Adjacent `×` hit areas *do* overlap each other, and I'm accepting that deliberately: both are destructive, both are gated by a confirm that names the item, so a mis-tap is declinable. Only checklist rows take `min-height: 44px` (20 rows, ~72px total, since they're already 40.4px).
>
> The badge's hit area expands **vertically only** (`inset: -13px 0` → 76.5×44.4). It's already 76.5px wide, so no horizontal growth is needed and none happens — that's what keeps it out of the gutter. This also means the badge stays an inline element rather than becoming a flex item, which matters: blockifying it would inherit the 26.35px root line-height and visibly grow it from 18.4px to ~30px.
>
> ## Three things to flag before I start
>
> **Reads still have no timeout.** Item 1 says writes, and I'll hold to that. But item 4's Try again button only appears when the initial fetch *rejects* — a fetch that stalls leaves "Loading trip…" on screen forever, which is the same class of bug as F16 and the exact failure I hit twice during slice 4. Say the word and I'll add the same 8s wrapper to `fetchTripData`; otherwise it stays a known gap.
>
> **Revalidation overwrites in-flight optimistic state.** The prop-sync effect means a focus refetch replaces checklist state wholesale, so an optimistic flip still awaiting its write gets reverted to the server value mid-flight. Rare and self-correcting, and the alternative (merging pending writes) is real complexity. Flagging rather than building it.
>
> **A ghost row survives its own error.** When a write hits the zero-row guard, she'll read "This item was removed on another device" while the row is still on screen; it disappears only on the next focus revalidation. Auto-refetching on that specific error would close it in ~2 lines, but it's beyond the twelve, so I'm leaving it.
>
> **One addition beyond the literal text, easy to strike:** item 8 puts all hover rules behind `@media (hover: hover)`, which leaves touch with *no* press feedback at all. I plan to add `:active` states for the badge, `×`, and `+ Add` to replace it. Tell me to drop it if you'd rather keep the change strictly subtractive.

---

## 3. Approval and the two follow-up decisions, verbatim

**Approval:**

> approved

None of the four flagged judgment calls was struck, so `:active` states were built and the three known gaps (untimed reads, revalidation overwriting optimistic state, the ghost row) were left as flagged.

**After the implementation summary, two follow-up decisions:**

> 1. Yes — add the timeout to fetchTripData, but at 12s rather than 8: the initial load is eight parallel queries on potentially poor wifi and deserves a longer leash than a single-row write. On timeout it should land on the existing error + Try again path.
> 2. No to the 1058px — keep the invisible expansion as large as possible without adjacent rows' hit areas overlapping, and accept sub-44 on the badge for the web version. The dangerous mis-tap (toggle-while-reaching-for-delete) is already fixed by the × separation, and the native layout will have room for true 44px targets.

**And on the data anomaly surfaced during verification:**

> my edits leave them

---

## 4. Implementation — every file, every change

Six files modified. No files created, none deleted, no dependencies added, no schema
changes. `git status` throughout showed exactly:

```
 M src/App.css
 M src/App.jsx
 M src/components/PackingList.jsx
 M src/components/TripPrep.jsx
 M src/index.css
 M src/lib/tripData.js
```

### `src/lib/tripData.js`

- **Header comment** rewritten: it previously asserted options lists were read-only, which item 12 falsified. Now names all six actions and points at `runWrite` for the timeout.
- **`requireOneRow(data)`** — message replaced with `'This item was removed on another device.'`, plus a comment explaining that the cause is almost always the other phone. The `table` and `label` parameters were **dropped** (dead once the message went generic; see deviations).
- **`WRITE_TIMEOUT_MS = 8000`**, **`READ_TIMEOUT_MS = 12000`**, and a shared **`timeoutError(ms)`** helper so reads and writes phrase failures identically. Comment records that both timers are throttled to ~1s resolution in backgrounded tabs, so the bounds are a foreground guarantee.
- **`runWrite(table, buildQuery)`** — the shared write wrapper: `AbortController`, `setTimeout` → `abort()`, `buildQuery().abortSignal(signal)`, `clearTimeout` in `finally`, a `catch` that converts an abort into `timeoutError`, a post-await `signal.aborted` check for the case where supabase-js returns an error object instead of throwing, then the postgres error check and `requireOneRow`.
- **`fetchTripData()`** — one `AbortController` at `READ_TIMEOUT_MS` shared by all eight queries, `.abortSignal(signal)` appended to each, `Promise.all` moved inside `try`/`catch`/`finally`, aborted-checks in both the catch and after, then destructuring from `responses`. The pre-existing per-table error loop is unchanged.
- **All seven write paths rewritten to route through `runWrite`:** `setEventStatus`, `deleteEvent`, `addEvent`, `removeEventOption` (new), `setItemChecked`, `deleteItem`, `addItem`. `setEventStatus`/`deleteEvent`/`setItemChecked`/`deleteItem` became non-`async` (they return the promise directly).
- **`removeEventOption(id, options, option)`** — new export, exactly the signature posted for approval. Filters the option out, writes `next.length > 0 ? next : null`, returns the persisted value. Comment records that `status` is deliberately untouched and that this is a read-modify-write carrying the same last-write-wins behaviour as every other write.

### `src/App.jsx`

Rewritten wholesale (the changes interlock). Net:

- Imports `removeEventOption` alongside the existing writes; `useCallback`, `useRef` added.
- **`localDateKey(now)`** — local date parts, with a comment on why not `toISOString`.
- **`pickAnchorDate(itinerary, todayKey)`** — today when in range, else the nearest end; ISO strings compare correctly.
- **State:** `data`, `loadError`, `toast`, `addingDate`, `draft`, `saving`. **Refs:** `didScrollRef`, `inFlightRef`, `lastFetchRef`. The old `editError` state is gone.
- **`runFetch(isInitial)`** in a `useCallback` — on failure routes to `loadError` when initial and to `toast` when revalidating, so a failed revalidation never blanks the page.
- **Three effects:** initial load; `focus` + `visibilitychange` revalidation with an in-flight guard and 2s throttle; one-shot `scrollIntoView` on `#day-anchor` guarded by `didScrollRef`.
- **Load-error branch** keeps the message and adds the `Try again` button.
- **`toggleStatus`** unchanged in shape, now reporting to `setToast`. **`removeEvent`** unchanged, now `setToast`. **`removeOption(date, event, option)`** new — named confirm, awaits, then patches state with the returned value. **`saveNewEvent(date, events, closeAfter)`** gained the third parameter so a blur-save also closes the input.
- **Day card:** `day-today` class and `aria-current="date"` only when the date genuinely is today; `id="day-anchor"` on the scroll target; TODAY flag rendered inside the existing `.day-date` span.
- **Event row:** `<li className="event-row">`, text wrapped in `<span className="event-text">`, badge keeps `role="button"`/`tabIndex`/Enter-Space, `×` unchanged in markup but now positioned into the gutter by CSS.
- **Options:** `<ul className="event-options">` with `<li className="option-row">`, `.option-text`, and a per-option `×` carrying `aria-label={\`Remove option ${option}\`}`.
- **Add row:** `aria-label={\`New event on ${day.date}\`}`; `onBlur` saves when non-empty (closing after), cancels when empty.
- **Toast** rendered at the top of the fragment with `role="status"`, `aria-live="polite"`, `.toast-text`, and a `.toast-dismiss` button.
- **Section order:** header → tile strip → **itinerary → packing → prep → bookings**.
- Both children receive `onError={setToast}`.

### `src/components/PackingList.jsx` and `src/components/TripPrep.jsx`

Identical treatment; they differ only in which writer they import, their `id`, and their badge label.

- Signature `({ groups, onError })`; local `error` state and the section-top `<p>` deleted.
- `useEffect(() => setGroupList(groups), [groups])` so focus-revalidation reaches the checklists, with a comment noting it overwrites an in-flight optimistic flip.
- `toggleItem`, `removeItem`, `saveNewItem` now report via `onError`; `saveNewItem(group, closeAfter)` gained the parameter.
- `<li className="packing-row">` with the `×` sibling.
- Input gained `aria-label` (`New packing item for …` / `New prep item for …`) and the blur-saves behaviour.
- `TripPrep`'s `<section>` inline `style` removed — now just `<section id="trip-prep">`.

### `src/index.css` — every existing rule modified

| Rule | Change |
|---|---|
| `:root` | `--ink-soft: #6b7a70` → **`#647065`** (comment records 5.10 on `--paper-raised`, 4.64 on `--paper` — the lightest value clearing 4.5:1 on both); **added** `--gold-ink: #8a6420` with a comment explaining why `--gold` itself is left alone; **added** `-webkit-tap-highlight-color: var(--azulejo-bg)` |
| `@media (prefers-color-scheme: dark) :root` | **added** `--gold-ink: #dcb15a`, with a comment recording that dark `--gold` (5.08) and dark `--ink-soft` (5.17) already pass and are unchanged |

**New rule added to index.css:** the shared `:focus-visible { outline: 2px solid var(--azulejo); outline-offset: 2px }`.

`--gold`, `--gold-bg`, and every other token are untouched, so the tile strip and
the transit-day border keep their exact colour.

### `src/App.css` — every existing rule modified

| Rule | Change |
|---|---|
| `#bookings, #itinerary-section, #packing-list` | `#trip-prep` added to the selector (item 10) |
| `.badge-confirmed` | `color: var(--gold)` → `var(--gold-ink)`, with a comment recording the 2.78:1 measurement; `background` and `border-color` unchanged |
| `.packing-item:hover` | wrapped in `@media (hover: hover)`; a sibling `.packing-item:active` added |
| `.badge-toggle` | `position: relative` added; **also** `display: inline-block`, `line-height: 1.4`, `vertical-align: baseline` (see deviations) |
| `.badge-toggle:hover, .badge-toggle:focus-visible` | split — hover into `@media (hover: hover)`, the `:focus-visible` half deleted in favour of the shared rule, `:active` added |
| `.row-delete` | `color: var(--line)` → `var(--ink-soft)`; `vertical-align: baseline` and `padding: 0 4px` dropped; `display: flex`, `align-items: center`, `justify-content: center`, `width: 44px`, `min-height: 44px`, `padding: 0` added so the button box reaches 44px while the glyph stays 15px |
| `.row-delete:hover, .row-delete:focus-visible` | same split, `:active` added |
| `.packing-row` | `gap: 12px` and `min-height: 44px` added |
| `.packing-row > .packing-item` | `min-height: 44px` and `margin-right: 0` added — the latter cancels `.packing-item`'s −6px bleed on that side, which was sliding the delete button under the row button |
| `.add-toggle` | `position: relative` added |
| `.add-toggle:hover, .add-toggle:focus-visible` | same split, `:active` added |
| `.add-input` | `font-size: 14px` → **`16px`**, with a comment recording that below 16px iOS Safari zooms on focus and does not zoom back |
| `.add-input:focus` | **deleted** — superseded by the shared `:focus-visible` |

**New rules added to App.css:** `.badge-toggle::before` (hit area) and `::after`
(chevron `›`); `.add-toggle::before` (hit area); `.day-card.day-today`;
`.day-today-flag`; `.event-row, .option-row`; `.event-row > .row-delete,
.option-row > .row-delete`; `.event-text, .option-text`; `.event-options`;
`.toast`; `.toast-text`; `.toast-dismiss`; `.retry`.

`.packing-item` itself was **not** modified — its `width: 100%` and `margin: 0 -6px`
are overridden only by the more specific `.packing-row > .packing-item` rule.

---

## 5. Verification report — what was tested, how, and the results

**Method.** Lint (`oxlint`) and production build after every stage. The mobile
layout was rendered in a **same-origin iframe sized exactly 390×844**, because
Chrome clamps window width above 390 and the real `@media (max-width: 640px)`
branch was needed. Touch targets were verified by **`document.elementFromPoint`
probing**, not by reading CSS — that is what caught the two geometry problems
below. Contrast was computed from `getComputedStyle` colours through a WCAG
relative-luminance function in-page.

### Structure and behaviour

| Check | Result |
|---|---|
| Section order | `itinerary-section` → `packing-list` → `trip-prep` → `bookings` ✓ |
| Scroll anchor | `#day-anchor` resolved to `Friday, 2026-08-28`; page auto-scrolled to `scrollY = 227` on load, once only ✓ |
| TODAY flag | 0 flags and 0 `aria-current` elements — correct, since 2026-08-09 is outside the trip ✓ |
| Chevron | `getComputedStyle(badge, '::after').content` = `"›"`; absent on BOOKED badges ✓ |
| Option deletes | 36 present, one per option row ✓ |
| `#trip-prep` | `getAttribute('style')` = `null`; inherits `padding-top: 24px` and a border-top from the shared rule ✓ |
| Hover gating | Zero `:hover` rules outside `@media (hover: hover)` ✓ |
| Focus | Exactly one `:focus-visible` rule in the stylesheet ✓ |
| Tap highlight | `rgba(47, 111, 143, 0.1)` — i.e. `--azulejo-bg`, not the grey default ✓ |
| Input | Computed `font-size: 16px`; `aria-label` present ✓ |

### Touch targets, by hit-test

| Control | Visible | Effective target | Verdict |
|---|---|---|---|
| Event `×` | 15px glyph | **44 × 44** | centre and left edge both hit `row-delete` ✓ |
| Option `×` | 15px glyph | **44 × 44** | centre hits `row-delete` ✓ |
| Checklist `×` | 15px glyph | **44 × 44** | ✓ |
| Checklist row | — | **44** tall, item button **44** tall | gap to `×` exactly **12px**; the −6px overlap is gone ✓ |
| `+ Add` | 35 × 18.4 | **45 × 44** | probes 13px above *and* below both hit `add-toggle` ✓ |
| Option row height | — | **24.8px, unchanged** | the gutter approach cost no vertical space ✓ |
| Status badge | 87 × 21 | **87 × 29** | below 44 by design — see deviations |

### Contrast, before → after

| Element | Before | After |
|---|---|---|
| Event text | 4.45 | **5.10** |
| OPEN badge | 4.45 | **5.10** |
| CONFIRMED badge | 2.78 (against its own fill) | **4.56** against the fill / 5.26 against the card |
| `×` delete | **1.51** | **5.10** |
| `+ Add` | 4.45 | **5.10** |
| Option text | 4.45 | **5.10** |

Dark mode was left unchanged and re-confirmed as already passing (ink-soft 5.17,
gold 5.08), computed from the tokens — `prefers-color-scheme` cannot be emulated
through the available tooling.

### The write timeout (item 1) — how it was actually proven

The first attempt set `WRITE_TIMEOUT_MS = 1` and toggled a badge. The write
**succeeded** with no toast. That was not a code defect: **Chrome throttles timers
to ~1s in unfocused tabs**, so the abort fired after the request had already
completed. Confirmed the served module was correct by `curl`ing it from the dev
server (`WRITE_TIMEOUT_MS = 1` and `.abortSignal(controller.signal)` both present),
and read the postgrest-js source to confirm the signal reaches `fetch` and that
`AbortError` is rethrown rather than retried.

A **deterministic pre-abort probe** (`controller.abort()` immediately after
construction) then produced the intended behaviour exactly:

- badge reverted to its prior status;
- toast rendered `Timed out after 0.001s — check your connection.`

That establishes the whole chain: abort → rejection → revert → toast. The probe
was removed and `8000` restored, verified by grep.

### The read timeout (follow-up 1) — proven the same way

Same pre-abort technique on `fetchTripData`. The page rendered:

> Could not load trip data: Timed out after 12s — check your connection. **Try again**

`.retry` present at **81 × 42px**, labelled `Try again`, and clicking it re-ran the
fetch (correctly failing again while the probe was active — which is what proves
the button is wired). Probe removed; a normal reload then rendered the full page
with `.retry` absent.

This also closed the one gap left from the first round: the **Try again button is
now runtime-tested**, not merely inspected.

### Toast, confirms, and destructive gates

- Toast: `role="status"`, `aria-live="polite"`, `position: fixed`, dismiss button **44px**.
- Option confirm text: `Remove option 'Tuk-tuk tour'?` ✓
- Event confirm text: `Delete 'TAP TP204, EWR → LIS, departs 23:00 (overnight)'?` ✓
- **Decline paths:** declining both left 36 options and 63 events intact ✓

### Post-change data state

63 events at **13 OPEN / 50 CONFIRMED**, 36 options, 20 items, anchor Aug 28,
auto-scroll to 227, no toast, no leftover probes (`WRITE_TIMEOUT_MS = 8000`,
`READ_TIMEOUT_MS = 12000`). Lint and build clean; only the six authorized files
modified.

### Density cost

Document height at 390px went **7903 → 8766px (+11%)**, from the 44px gutter
narrowing the text column (more wrapping) plus the chevron widening badges. The
gutter approach avoided the +648px that `min-height: 44px` on option rows would
have added, and the +1058px on event rows.

### Data touched during verification, and its restoration

The 1ms-timeout test flipped the **Ramiro dinner event** from `open` to
`confirmed`, and that write landed. It was clicked back and **verified persisted as
`open`** after a reload; the 13/50 split confirms it. That was the only database
change made by this work.

Separately, verification surfaced changes that could not be attributed to any
action taken here — Ilya's `Shorts` replaced by a lowercase `shorts` at the end of
the list, and four items checked. These were reported rather than "restored", and
confirmed as the user's own edits ("my edits leave them"). **They were left
untouched.**

---

## 6. Not verified — assigned to the manual pass

**Typing into an add input and pressing Enter to insert.** Never executed. Three
harness limits, each measured: `computer.type` delivers keystrokes to the page but
the automation's script injection steals focus from the input first, at which point
`onBlur` correctly closes it and the keystrokes land on whatever button holds
focus; synthetic `input` events do not update React's controlled state (the
native-setter trick left the DOM value set while `draft` stayed empty, so Enter
bailed at the empty-text guard); and `await` inside page evaluations times out in
this tab. Needs one add on a real device, in both the itinerary and a checklist.

**Accepting a delete confirm.** Only the decline path was exercised, on all three
lists. Accepting was avoided deliberately: no disposable row existed, and deleting
real trip data that could not be restored was not a worthwhile trade.

**Option removal, accept path.** Deliberately never run, and this one deserves
emphasis: **there is no add-option write**, so a wrongly removed candidate cannot
be restored through the UI at all. It is the only irreversible action in the app —
deleting an event or item is recoverable by retyping it. Worth a deliberate first
use on an option you actually mean to drop.

**iOS-specific behaviour on a real device.** The 16px no-zoom fix, the
azulejo-tinted tap highlight, and the absence of sticky hover were verified as CSS
in desktop Chrome, not observed in Safari on a phone.

**Dark mode rendering.** Contrast computed from tokens, not rendered —
`prefers-color-scheme` cannot be emulated through the available tooling.

**Two-phone concurrency.** The focus-revalidation listeners were implemented and
the code path reviewed, but no genuine two-device test was run. Worth doing
deliberately: edit the same row from both phones, then background and foreground
one of them.

**A stalled write in the wild.** The timeout was proven by pre-abort, not by an
actual network stall. Worth reproducing once by toggling wifi off mid-tap.

---

## 7. Deviations from the approved plan, with reasons

**1. The badge is `display: inline-block` with `line-height: 1.4`, not inline.**
The plan explicitly said it would stay inline. Measurement forced the change: with
the badge inline, its absolutely positioned hit-area overlay **only expanded
upward** — `elementFromPoint` 10px above hit the badge, 10px below hit the
neighbouring row's text, because an inline box is an unreliable containing block
for a positioned pseudo-element. `inline-block` gives a well-defined containing
block. `line-height: 1.4` is the compensation the plan itself predicted would be
needed: without it the badge inherits the 26.35px root line-height and grows to
~30px. Cost: visible height **18.4 → 21px (+2.6px)**.

**2. The badge's hit area is 87 × 29, not ≥44.** Item 6 asked for ≥44px. Probing
showed a 44px target on a 24.8px row reaches 13px into the rows above and below,
and *wins* the hit test upward — meaning a tap on one event's text would silently
flip the neighbouring event's status. Since the toggle is the one control that
rewrites data with no confirm and no undo, that makes accidental changes more
likely, which inverts the intent of the change. First clamped to 25px, then — per
follow-up decision 2 — maximised precisely: on a single-line row the badge sits
**flush with the row's bottom edge** (4.4px slack above, 0 below) with a 4px
inter-row gap, so the two expansions must sum to **under 8.4px** or adjacent
badges collide. `top: -6px; bottom: -2px` yields **29px** with 0.4px of margin.
Hit-tested: 5px above and 1px below hit the badge; 8px above and 4px below miss it.

**3. The TODAY flag appears only when it genuinely is today.** The prompt's
"before Aug 28 → day 1" clause was read as governing the **scroll anchor**, not
the label. Labelling Aug 28 as "TODAY" on Aug 9 would be false to precisely the
user this slice serves. So `aria-current="date"`, the `day-today` class, and the
flag are conditional on the real date, while the anchor still falls back to the
nearest end of the trip.

**4. `id="day-anchor"`, not `id="day-today"`.** Follows from deviation 3 — the
scroll target and "today" are now different concepts, and the id names the one it
actually is.

**5. `requireOneRow(data)` and `runWrite(table, buildQuery)` lost their `label`
parameters.** The plan's signatures carried a `label` used to build
`no row matched ${label}`. Item 3 replaced that message with a generic sentence,
which made `label` dead in every call site. Removed rather than left as unused
arguments. One consequence worth noting: an insert returning zero rows would now
report "This item was removed on another device", which is misleading — but that
state is unreachable in practice, since an insert failure surfaces as a postgres
error instead.

**6. Add-input blur-save also closes the input.** The plan said blur with
non-empty text saves; it did not say what happens to the input afterwards.
Leaving an empty input open after the user has already tapped away is untidy, so
`saveNewEvent`/`saveNewItem` took a `closeAfter` flag: Enter keeps the input open
and focused for the next entry (as decided in slice 4), blur closes it.

**7. `catch` blocks added alongside the `finally` in both timeout wrappers.** The
plan's `runWrite` had only `try`/`finally` plus a post-await `aborted` check. That
handles the case where supabase-js *returns* an error object, but not the case
where it *throws* `AbortError` — where the raw error would have surfaced instead of
the friendly message. Both paths now catch and convert.

**8. `READ_TIMEOUT_MS` and the read-path abort were added.** Beyond the original
twelve, and explicitly authorized afterwards by follow-up decision 1. Set to 12s
per that decision, and a shared `timeoutError(ms)` helper was factored out so reads
and writes phrase failures identically.

**Not deviations, though they might read as such:** the 44px right-gutter approach
in place of `min-height` on event and option rows, and the `:active` states, were
both described in the plan above and approved with it.
