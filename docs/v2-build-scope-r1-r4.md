# v2 Build Scope — R1–R4
**Locked Aug 11, 2026 · supersedes numbering, not content, of the master doc**

Scope decision: of the master requirements (v2-final-requirements-2026-08-11.md), build **choose-this, delete-with-undo, context-at-the-decision, and ritual→Memories**. Renumbered for this build:

| Build # | Master # | Requirement |
|---|---|---|
| **R1** | R1 | Choose-this — decision resolution |
| **R2** | R3 | Delete with undo |
| **R3** | R5 | Context at the decision (maps + weather) |
| **R4** | R6 | Ritual fixture → Memories v1 |

**Deferred, not cancelled** (remain in the master doc): time-awareness bundle, "Next up" attention layer, quiet-surface pass, R0 purge chore, all P2. Reference walkthrough: `before-after-walkthrough.jsx` (now scoped to these four).

**Constraints carry over unchanged:** binary status only (open ⇄ confirmed); additive nullable columns / new tables only — v1 keeps rendering; shipped verbs restyled never removed; one shared state; keyless Open-Meteo is the only external call; every destructive path gets a recovery path.

---

## R1 — Choose-this (decision resolution)

Tapping an option on an open event opens a sheet: option name, its context line, **Choose this** (primary), **Open in Maps**, Cancel.

- Choose → event becomes confirmed with the winner in its title line ("Dinner — Veneza"); remaining options collapse to a muted "Also considered · …" line; undo toast fires.
- Reopen (tap ✓) restores the full option set, chosen included. The universal toggle keeps working both directions on every event; toggle-to-confirmed without choosing stays legal.
- Persistence: chosen state round-trips through Supabase. Implementation choice delegated: a `chosen` flag inside the existing options jsonb (zero schema change) or a nullable `chosen_option` column (additive). v1 continuing to list options on a decided event is acceptable — v1 is fallback.

**Acceptance:** decide a dinner in 2 taps; reopen restores all options; kill the app mid-flow and the chosen state survives on both devices; undo within 5s restores the pre-choice state exactly.

## R2 — Delete with undo

`window.confirm` is removed from the codebase. Every destructive action (event, option, list item) executes immediately and shows an in-app toast with **Undo** (~5 seconds).

- Undo restores exact content, position (sort_order), and any options / checked state.
- Implementation choice delegated: client-side grace period (DB delete deferred until the toast expires) or delete-then-reinsert. Either way the dialog's blur/refocus refetch bug class dies with it.

**Acceptance:** delete → undo → row byte-identical in its original position, repeatable; delete → wait 5s → gone on both devices; zero system dialogs anywhere in the app.

## R3 — Context at the decision

- **Maps link-out:** every option and place-bearing event gets a tap-to-Google-Maps link (URL scheme — `maps.google.com/?q=` or the search API URL — no key, no SDK). Context lines ("Tonight 18:30–22:00 · 12 min drive") are **static text entered once**; live distance/travel-time computation is explicitly out of scope.
- **Weather line:** one line per day card from Open-Meteo (keyless), rendered only inside the forecast window, wind-first on the Benagil day (Sep 3). Fetch failure renders nothing — never an error state, never a spinner.
- Data: option entries in the jsonb gain optional `meta` and `maps_q` fields (jsonb — no schema change); events optionally the same.

**Acceptance:** from the Sep 2 dinner card, hours/distance readable without leaving the app and Maps opens in one tap per option; Sep 3 card leads with wind; airplane-mode load shows the itinerary with no weather and no error.

## R4 — Ritual fixture → Memories v1

**Hard deadline: live by the evening of Aug 29** (day 1 capture) — this is the schedule-critical item of the four.

- The repeated sunset-ritual sentence collapses to one compact fixture row per day (the de-dup ships inside this requirement).
- In trip mode, today's and past days' rows open a capture sheet: two quote fields (one per kid), save; saved quotes render on the day card in the display face. Future days and pre-trip: row expands to the ritual description.
- Schema: one new `memories` table (`day_date date primary key, quote_older text, quote_younger text, created_at timestamptz`) — additive; v1 unaffected. Photos deferred (Supabase Storage / native camera); the sheet shows a disabled placeholder and builds nothing.

**Acceptance:** capture on the phone, quotes visible on the other device; editing a saved day overwrites cleanly; pre-trip the row is compact and quiet; the full ritual sentence appears at most once anywhere.

---

**Build order:** R2 first (it's the safety net every later test benefits from), then R1 (largest verb, now testable with safe deletes), then R3 (smallest), then R4 (deadline-bound but independent). Definition of done unchanged from the master: Sep 2, 6 p.m. — one amber decision, resolved in two taps, map one tap away, quotes captured by sunset, nothing permanently deletable by accident.

---

## Amendment — Aug 12, 2026

**R3 is cut to weather only.** Maps link-out and the static meta lines are out: the seed (`docs/sql/seed-options-meta.sql`) is never run, no fallback-pin work, no meta-editing UI in this scope.

The `options_meta` and `maps_q` columns and their render paths remain in place, **dormant** — removing them would churn the frozen data layer and violate additive-only; dead-but-harmless is the intended end state.

**Weather (Open-Meteo, silent-fail) remains shipped and in scope.**

Door explicitly open: September serverless work may populate these columns live with zero render changes.
