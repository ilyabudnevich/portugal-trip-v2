import { useState, useEffect, useRef } from "react";

/* ============================================================
   Before / After Walkthrough — Build Scope R1–R4
   (master-doc R1, R3, R5, R6 renumbered; time awareness,
   next-up, and quiet-surface stay in the master doc, unbuilt.)
   One section per requirement. BEFORE reproduces current v2
   behavior (friction included); AFTER adds only that
   requirement. Shared demo clock: Aug 11 (pre-trip) vs
   Sep 2 (in trip). All state in memory. No network calls;
   Maps links are plain hrefs; weather is labeled sample data.
   ============================================================ */

const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Karla:wght@400;500;600;700&display=swap";

const TRIP_START = "2026-08-28";
const TRIP_END = "2026-09-06";
const DAY_MS = 86400000;
const toDate = (s) => new Date(s + "T12:00:00");
const between = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY_MS);
const human = (s) =>
  toDate(s).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const maps = (q) =>
  "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);

const DINNER_OPTS = [
  { name: "Veneza", meta: "Tonight 18:30–22:00 · closed Mon · 12 min drive", q: "Restaurante Veneza Albufeira" },
  { name: "O Charneco", meta: "Tonight 19:00–22:30 · 18 min drive", q: "O Charneco Estombar" },
  { name: "Restaurante Olhos d'Água", meta: "Tonight 18:00–23:00 · 9 min drive", q: "Restaurante Olhos d'Água Albufeira" },
];
const AFTERNOON_OPTS = [
  { name: "Praça do Comércio + Rua Augusta wander", q: "Praça do Comércio Lisbon" },
  { name: "Cais do Sodré–Cacilhas ferry", q: "Cais do Sodré ferry terminal Lisbon" },
  { name: "Tuk-tuk tour — Alfama & miradouros", q: "Praça da Figueira Lisbon" },
];
const RITUAL_TEXT =
  "Sunset ritual — gelato or a pastel de nata, each child names one thing she loved, one family selfie";

/* ---------------- small shared pieces ---------------- */

function Frame({ label, tone, children }) {
  return (
    <div className={"pane-wrap " + (tone || "")}>
      <div className={"pane-badge " + (tone || "")}>{label}</div>
      <div className="frame">{children}</div>
    </div>
  );
}

function Chip({ open, chevron, onTap, plainButton }) {
  return (
    <button
      className={
        "chip " +
        (open ? "chip-open" : "chip-done") +
        (plainButton ? " chip-btn" : "")
      }
      onClick={onTap}
    >
      {open ? (chevron ? "OPEN ›" : "OPEN") : "✓"}
    </button>
  );
}

function SysDialog({ text, onCancel, onOk }) {
  return (
    <div className="sys-scrim">
      <div className="sys-box">
        <div className="sys-text">{text}</div>
        <div className="sys-btns">
          <button className="sys-btn" onClick={onCancel}>Cancel</button>
          <button className="sys-btn bold" onClick={onOk}>OK</button>
        </div>
      </div>
    </div>
  );
}

function InToast({ msg, onUndo }) {
  return (
    <div className="in-toast" role="status">
      <span>{msg}</span>
      {onUndo && <button className="in-undo" onClick={onUndo}>Undo</button>}
    </div>
  );
}

function useUndoToast() {
  const [toast, setToast] = useState(null);
  const t = useRef(null);
  const show = (msg, undoFn) => {
    if (t.current) clearTimeout(t.current);
    setToast({ msg, undoFn });
    t.current = setTimeout(() => setToast(null), 5000);
  };
  const undo = () => {
    toast?.undoFn?.();
    if (t.current) clearTimeout(t.current);
    setToast(null);
  };
  return [toast, show, undo];
}

function Sheet({ children, onClose }) {
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

/* ============================================================
   R1 — Choose-this
   ============================================================ */

function R1Before() {
  const [taps, setTaps] = useState(0);
  const [modes, setModes] = useState(0);
  const [typed, setTyped] = useState(false);
  const [status, setStatus] = useState("open");
  const [opts, setOpts] = useState(DINNER_OPTS);
  const [title, setTitle] = useState("Dinner");
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const inc = () => setTaps((n) => n + 1);

  const reset = () => {
    setTaps(0); setModes(0); setTyped(false); setStatus("open");
    setOpts(DINNER_OPTS); setTitle("Dinner"); setEditing(false);
    setDialog(null); setRenaming(false);
  };

  return (
    <Frame label="BEFORE" tone="before">
      <div className="day-mini">
        <div className="mini-row">
          <span className="mini-kicker">Wednesday, September 2 · Algarve</span>
          <button className="edit-link" onClick={() => { inc(); if (!editing) setModes((m) => m + 1); setEditing(!editing); setRenaming(false); }}>
            {editing ? "Done" : "Edit"}
          </button>
        </div>
        <div className="event">
          <div className="event-head">
            {editing && renaming ? (
              <input
                className="rename"
                autoFocus
                defaultValue={title}
                onChange={() => setTyped(true)}
                onKeyDown={(e) => { if (e.key === "Enter") { inc(); setTitle(e.target.value || title); setRenaming(false); } }}
                onBlur={(e) => { setTitle(e.target.value || title); setRenaming(false); }}
              />
            ) : (
              <button
                className="event-text as-btn"
                onClick={() => { if (editing) { inc(); setRenaming(true); } }}
              >
                {title}
              </button>
            )}
            <Chip open={status === "open"} chevron onTap={() => { inc(); setStatus(status === "open" ? "confirmed" : "open"); }} />
          </div>
          <div className="options">
            {opts.map((o) => (
              <div key={o.name} className="opt-row">
                <div className="opt-chip">{o.name}</div>
                {editing && (
                  <button className="x" onClick={() => { inc(); setDialog(o); }}>×</button>
                )}
              </div>
            ))}
          </div>
        </div>
        {status === "confirmed" && opts.length > 1 && (
          <div className="callout warn">
            “Confirmed” — but which one? All {opts.length} options still listed.
          </div>
        )}
      </div>
      {dialog && (
        <SysDialog
          text={`Remove option '${dialog.name}'?`}
          onCancel={() => { setTaps((n) => n + 1); setDialog(null); }}
          onOk={() => {
            setTaps((n) => n + 1);
            setOpts((os) => os.filter((o) => o.name !== dialog.name));
            setDialog(null);
          }}
        />
      )}
      <div className="counter">
        <span><b>{taps}</b> taps · <b>{modes}</b> mode{modes === 1 ? "" : "s"} entered{typed ? " · typing required" : ""}</span>
        <button className="reset" onClick={reset}>reset</button>
      </div>
      <div className="pane-note">
        To record the winner: toggle, Edit, delete each loser (dialog every time), rename the parent, Done.
      </div>
    </Frame>
  );
}

function R1After() {
  const [taps, setTaps] = useState(0);
  const [ev, setEv] = useState({ title: "Dinner", status: "open", opts: DINNER_OPTS, chosen: null, also: [] });
  const [sheet, setSheet] = useState(null);
  const [toast, show, undo] = useUndoToast();

  const reset = () => { setTaps(0); setEv({ title: "Dinner", status: "open", opts: DINNER_OPTS, chosen: null, also: [] }); setSheet(null); };

  const choose = (o) => {
    setTaps((n) => n + 1);
    const before = ev;
    setEv({ ...ev, status: "confirmed", chosen: o.name, also: ev.opts.filter((x) => x.name !== o.name), opts: [] });
    setSheet(null);
    show(`Dinner → ${o.name}`, () => setEv(before));
  };
  const toggle = () => {
    setTaps((n) => n + 1);
    if (ev.status === "confirmed" && ev.chosen) {
      const chosenOpt = DINNER_OPTS.find((x) => x.name === ev.chosen);
      setEv({ title: "Dinner", status: "open", opts: [chosenOpt, ...ev.also], chosen: null, also: [] });
    } else {
      setEv({ ...ev, status: ev.status === "open" ? "confirmed" : "open" });
    }
  };

  return (
    <Frame label="AFTER" tone="after">
      <div className="day-mini">
        <div className="mini-row"><span className="mini-kicker">Wednesday, September 2 · Algarve</span></div>
        <div className="event">
          <div className="event-head">
            <div className="event-text">
              {ev.title}{ev.chosen && <b> — {ev.chosen}</b>}
            </div>
            <Chip open={ev.status === "open"} plainButton onTap={toggle} />
          </div>
          {ev.opts.length > 0 && (
            <div className="options">
              {ev.opts.map((o) => (
                <button key={o.name} className="opt-chip tappable" onClick={() => { setTaps((n) => n + 1); setSheet(o); }}>
                  <span>{o.name}</span>
                  <span className="opt-meta">{o.meta}</span>
                </button>
              ))}
            </div>
          )}
          {ev.also.length > 0 && (
            <div className="also">Also considered · {ev.also.map((o) => o.name).join(" · ")}</div>
          )}
        </div>
      </div>
      {sheet && (
        <Sheet onClose={() => setSheet(null)}>
          <div className="sheet-kicker">Dinner · Wednesday, September 2</div>
          <div className="sheet-title">{sheet.name}</div>
          <div className="sheet-meta">{sheet.meta}</div>
          <button className="btn primary" onClick={() => choose(sheet)}>Choose this</button>
          <a className="btn ghost" href={maps(sheet.q)} target="_blank" rel="noreferrer">Open in Maps</a>
          <button className="btn plain" onClick={() => setSheet(null)}>Cancel</button>
        </Sheet>
      )}
      {toast && <InToast msg={toast.msg} onUndo={undo} />}
      <div className="counter">
        <span><b>{taps}</b> taps</span>
        <button className="reset" onClick={reset}>reset</button>
      </div>
      <div className="pane-note">Tap an option → Choose this. Reopen (✓) restores all three.</div>
    </Frame>
  );
}

/* ============================================================
   R2 — Delete with undo
   ============================================================ */

function R2Before() {
  const [opts, setOpts] = useState(AFTERNOON_OPTS);
  const [dialog, setDialog] = useState(null);
  return (
    <Frame label="BEFORE" tone="before">
      <div className="day-mini">
        <div className="mini-row"><span className="mini-kicker">Saturday, Aug 29 · Edit mode</span></div>
        <div className="event">
          <div className="event-head">
            <div className="event-text">Late afternoon</div>
            <Chip open chevron onTap={() => {}} />
          </div>
          <div className="options">
            {opts.map((o) => (
              <div key={o.name} className="opt-row">
                <div className="opt-chip">{o.name}</div>
                <button className="x" onClick={() => setDialog(o)}>×</button>
              </div>
            ))}
            {opts.length === 0 && <div className="callout warn">All options gone. Permanently. On the live shared DB.</div>}
          </div>
        </div>
      </div>
      {dialog && (
        <SysDialog
          text={`Remove option '${dialog.name}'?`}
          onCancel={() => setDialog(null)}
          onOk={() => { setOpts((os) => os.filter((o) => o.name !== dialog.name)); setDialog(null); }}
        />
      )}
      <div className="counter">
        <span>No recovery path exists</span>
        <button className="reset" onClick={() => setOpts(AFTERNOON_OPTS)}>reset pane</button>
      </div>
      <div className="pane-note">A system dialog guards every delete — and it's the same dialog whose blur/refocus caused the resurrection bug.</div>
    </Frame>
  );
}

function R2After() {
  const [opts, setOpts] = useState(AFTERNOON_OPTS);
  const [toast, show, undo] = useUndoToast();
  const remove = (o) => {
    const idx = opts.findIndex((x) => x.name === o.name);
    const before = opts;
    setOpts(opts.filter((x) => x.name !== o.name));
    show(`Removed “${o.name}”`, () => setOpts(before), idx);
  };
  return (
    <Frame label="AFTER" tone="after">
      <div className="day-mini">
        <div className="mini-row"><span className="mini-kicker">Saturday, Aug 29 · Edit mode</span></div>
        <div className="event">
          <div className="event-head">
            <div className="event-text">Late afternoon</div>
            <Chip open plainButton onTap={() => {}} />
          </div>
          <div className="options">
            {opts.map((o) => (
              <div key={o.name} className="opt-row">
                <div className="opt-chip">{o.name}</div>
                <button className="x" onClick={() => remove(o)}>×</button>
              </div>
            ))}
            {opts.length === 0 && <div className="callout ok">Everything removable — nothing unrecoverable.</div>}
          </div>
        </div>
      </div>
      {toast && <InToast msg={toast.msg} onUndo={undo} />}
      <div className="counter">
        <span>Delete → Undo, repeatedly. Position preserved.</span>
        <button className="reset" onClick={() => setOpts(AFTERNOON_OPTS)}>reset pane</button>
      </div>
      <div className="pane-note">No dialog, no bug class, safe for user 2 on the shared DB.</div>
    </Frame>
  );
}

/* ============================================================
   R3 — Context at the decision (weather clock-sensitive)
   ============================================================ */

function R3Before() {
  return (
    <Frame label="BEFORE" tone="before">
      <div className="day-mini">
        <div className="mini-title">Wednesday, September 2</div>
        <div className="event">
          <div className="event-head">
            <div className="event-text">Dinner</div>
            <Chip open chevron onTap={() => {}} />
          </div>
          <div className="options">
            {DINNER_OPTS.map((o) => <div key={o.name} className="opt-chip">{o.name}</div>)}
          </div>
        </div>
      </div>
      <div className="journey">
        <div className="j-h">To decide, per option:</div>
        <div className="j-s">1&thinsp;· copy the name → 2&thinsp;· Safari → 3&thinsp;· Google the hours → 4&thinsp;· open Maps for distance → 5&thinsp;· back to the app</div>
        <div className="j-t">≈ 4 app switches × 3 options, at 6 p.m., hungry.</div>
      </div>
    </Frame>
  );
}

function R3After({ clock }) {
  const inTrip = clock >= TRIP_START;
  return (
    <Frame label="AFTER" tone="after">
      <div className="day-mini">
        <div className="mini-title">Wednesday, September 2</div>
        {inTrip && <div className="weather">31° sunny · light onshore breeze <span className="sample">(sample)</span></div>}
        <div className="event">
          <div className="event-head">
            <div className="event-text">Dinner</div>
            <Chip open plainButton onTap={() => {}} />
          </div>
          <div className="options">
            {DINNER_OPTS.map((o) => (
              <div key={o.name} className="opt-row">
                <div className="opt-chip rich">
                  <span>{o.name}</span>
                  <span className="opt-meta">{o.meta}</span>
                </div>
                <a className="pin" href={maps(o.q)} target="_blank" rel="noreferrer" aria-label={"Open " + o.name + " in Maps"}>◎</a>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="day-mini">
        <div className="mini-title">Thursday, September 3</div>
        {inTrip
          ? <div className="weather">SW wind 8 kn · sea slight · 30° — <b className="boat">good boat morning</b> <span className="sample">(sample)</span></div>
          : <div className="pane-sub">Weather appears once the forecast window opens (flip the clock to Sep 2).</div>}
        <div className="event">
          <div className="event-head">
            <div className="event-text">Benagil boat (morning)</div>
            <Chip open plainButton onTap={() => {}} />
          </div>
        </div>
      </div>
      <div className="pane-note">Static context typed once + a plain Maps link. No distance API, no key, no round trip.</div>
    </Frame>
  );
}

/* ============================================================
   R4 — Ritual → Memories (clock-sensitive)
   ============================================================ */

function R4Before() {
  return (
    <Frame label="BEFORE" tone="before">
      {["Saturday, August 29", "Sunday, August 30", "Monday, August 31"].map((d) => (
        <div key={d} className="day-mini tight">
          <div className="mini-title sm">{d}</div>
          <div className="event dim"><div className="event-text sm">…day's events…</div></div>
          <div className="event"><div className="event-text sm">{RITUAL_TEXT}</div></div>
        </div>
      ))}
      <div className="pane-note">The longest text block in the app, verbatim, every single day — the eye learns to skip the bottom of every card.</div>
    </Frame>
  );
}

function R4After({ clock }) {
  const inTrip = clock >= TRIP_START;
  const [mem, setMem] = useState(inTrip ? { "2026-09-01": { a: "Walking on the castle walls", b: "The tiny chocolate cups" } } : {});
  const [sheet, setSheet] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [toast, show] = useUndoToast();
  useEffect(() => {
    setMem(inTrip ? { "2026-09-01": { a: "Walking on the castle walls", b: "The tiny chocolate cups" } } : {});
    setSheet(null); setExpanded(null);
  }, [inTrip]);

  const days = inTrip
    ? [{ d: "2026-09-01", label: "Tuesday, September 1" }, { d: "2026-09-02", label: "Wednesday, September 2 · TODAY" }]
    : [{ d: "2026-08-29", label: "Saturday, August 29" }, { d: "2026-08-30", label: "Sunday, August 30" }, { d: "2026-08-31", label: "Monday, August 31" }];

  function RitualSheetBody({ d }) {
    const cur = mem[d] || { a: "", b: "" };
    const [a, setA] = useState(cur.a);
    const [b, setB] = useState(cur.b);
    return (
      <>
        <div className="sheet-kicker">Sunset ritual · Day {between(TRIP_START, d) + 1}</div>
        <div className="sheet-title">One thing she loved today</div>
        <label className="field"><span>Age 7</span><input value={a} onChange={(e) => setA(e.target.value)} placeholder="“…”" /></label>
        <label className="field"><span>Age 5</span><input value={b} onChange={(e) => setB(e.target.value)} placeholder="“…”" /></label>
        <div className="photo-slot">Family selfie — arrives with the native camera</div>
        <button className="btn primary" disabled={!a.trim() && !b.trim()} onClick={() => {
          setMem((m) => ({ ...m, [d]: { a: a.trim(), b: b.trim() } }));
          setSheet(null);
          show(`Day ${between(TRIP_START, d) + 1} saved to Memories`);
        }}>Save to Memories</button>
        <button className="btn plain" onClick={() => setSheet(null)}>Cancel</button>
      </>
    );
  }

  return (
    <Frame label="AFTER" tone="after">
      {days.map(({ d, label }) => {
        const m = mem[d];
        const capturable = inTrip && d <= clock;
        return (
          <div key={d} className="day-mini tight">
            <div className="mini-title sm">{label}</div>
            <div className="event dim"><div className="event-text sm">…day's events…</div></div>
            <div className="ritual">
              <button className="ritual-head" onClick={() =>
                capturable && !m ? setSheet(d) : setExpanded(expanded === d ? null : d)
              }>
                <span className="ritual-sun" aria-hidden="true">☀</span>
                <span className="ritual-title">Sunset ritual</span>
                {m ? <span className="rs done">✓ captured</span>
                  : capturable ? <span className="rs cap">Capture tonight</span>
                  : <span className="rs">{expanded === d ? "–" : "+"}</span>}
              </button>
              {expanded === d && !m && <div className="ritual-desc">{RITUAL_TEXT.replace("Sunset ritual — ", "")}</div>}
              {m && (
                <div className="ritual-mem">
                  {m.a && <div className="quote">“{m.a}”<span className="who"> — age 7</span></div>}
                  {m.b && <div className="quote">“{m.b}”<span className="who"> — age 5</span></div>}
                  <button className="mem-edit" onClick={() => setSheet(d)}>edit</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {sheet && <Sheet onClose={() => setSheet(null)}><RitualSheetBody d={sheet} /></Sheet>}
      {toast && <InToast msg={toast.msg} />}
      <div className="pane-note">
        {inTrip
          ? "Sep 1 is already a memory; today's row asks for tonight's. The itinerary becomes the memory book in place."
          : "One compact row per day. Flip the clock to Sep 2 to see capture mode and a saved day."}
      </div>
    </Frame>
  );
}

/* ============================================================
   Shell
   ============================================================ */

const SECTIONS = [
  { id: "r1", num: "R1", title: "Choose-this", problem: "The app tracks that a decision is open but gives no way to record which option won.", clock: false, B: R1Before, A: R1After },
  { id: "r2", num: "R2", title: "Delete with undo", problem: "Every delete is permanent on the live shared database, guarded only by an alien system dialog.", clock: false, B: R2Before, A: R2After },
  { id: "r3", num: "R3", title: "Context at the decision", problem: "Deciding between options means leaving the app to research each one.", clock: true, B: R3Before, A: R3After },
  { id: "r4", num: "R4", title: "Ritual → Memories", problem: "The daily ritual is the app's noisiest repeated text and produces nothing lasting.", clock: true, B: R4Before, A: R4After },
];

function Section({ s, clock }) {
  const [view, setView] = useState("before");
  const B = s.B, A = s.A;
  return (
    <section className="sec" id={s.id}>
      <div className="sec-head">
        <span className="sec-num">{s.num}</span>
        <h2 className="sec-title">{s.title}</h2>
        {s.clock && <span className="sec-clock" title="Responds to the demo clock">⏱</span>}
      </div>
      <p className="sec-problem">{s.problem}</p>
      <div className="pane-toggle" role="tablist">
        <button className={view === "before" ? "sel" : ""} onClick={() => setView("before")}>Before</button>
        <button className={view === "after" ? "sel" : ""} onClick={() => setView("after")}>After</button>
      </div>
      <div className="panes">
        <div className={"pane " + (view !== "before" ? "hide-sm" : "")}>
          <B clock={clock} />
        </div>
        <div className={"pane " + (view !== "after" ? "hide-sm" : "")}>
          <A clock={clock} />
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [clock, setClock] = useState("2026-08-11");
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = FONT_URL;
    document.head.appendChild(l);
    return () => document.head.removeChild(l);
  }, []);
  return (
    <div className="page">
      <style>{CSS}</style>
      <header className="top">
        <div className="top-inner">
          <div className="top-title">
            <span className="tt-k">PORTUGAL APP · BUILD SCOPE R1–R4</span>
            <span className="tt-t">Before / After Walkthrough</span>
          </div>
          <div className="clockbar" role="group" aria-label="Demo clock">
            <span className="cb-label">Demo clock</span>
            <button className={clock === "2026-08-11" ? "sel" : ""} onClick={() => setClock("2026-08-11")}>Aug 11 · pre-trip</button>
            <button className={clock === "2026-09-02" ? "sel" : ""} onClick={() => setClock("2026-09-02")}>Sep 2 · in trip</button>
          </div>
          <nav className="rail">
            {SECTIONS.map((s) => (
              <a key={s.id} href={"#" + s.id} className="rail-a">{s.num}</a>
            ))}
          </nav>
        </div>
      </header>

      <main className="main">
        {SECTIONS.map((s) => <Section key={s.id} s={s} clock={clock} />)}

        <section className="notes">
          <h3>Builder's notes — judgment calls</h3>
          <p>
            (1) This walkthrough carries the build scope only: the master requirements R1, R3, R5, R6
            renumbered here to R1–R4. Time awareness, the "Next up" strip, and the quiet-surface
            pass remain in the master doc, deliberately unbuilt in this scope. (2) The R1 tap counter
            counts discrete taps and flags "typing required" separately rather than counting
            keystrokes, which would inflate the before number unfairly. (3) Flipping the demo clock
            resets clock-derived state (weather visibility, saved memories) but preserves your
            interactions elsewhere, so exploring one section doesn't wipe another. (4) Weather is
            sample data shaped for Open-Meteo and labeled "(sample)" once per line.
          </p>
        </section>
      </main>
    </div>
  );
}

/* ============================================================ */

const CSS = `
:root{
  --porcelain:#F5F1E8; --card:#FFFFFF; --ink:#212936; --muted:#8B8579;
  --hairline:#E5DFD1; --navy:#152A52; --cobalt:#1D4FA8;
  --amber:#B45309; --amber-bg:#FBEED2; --amber-line:#EAD3A2;
  --serif:'Fraunces', Georgia, serif; --sans:'Karla', -apple-system, sans-serif;
  --before:#8B5A3C; --after:#1E6B3C;
}
*{box-sizing:border-box; -webkit-tap-highlight-color:transparent;}
.page{min-height:100vh; background:#ECE7DB; font-family:var(--sans); color:var(--ink);}
button{font-family:var(--sans); cursor:pointer; border:none; background:none; color:inherit;}
button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid var(--cobalt); outline-offset:2px;}

/* top bar */
.top{position:sticky; top:0; z-index:60; background:var(--navy); color:#F3EFE5; box-shadow:0 2px 12px rgba(21,42,82,.25);}
.top-inner{max-width:980px; margin:0 auto; padding:12px 16px 10px; display:flex; flex-wrap:wrap; gap:10px; align-items:center;}
.top-title{display:flex; flex-direction:column; margin-right:auto;}
.tt-k{font-size:9px; letter-spacing:.2em; color:#9FB0D4; font-weight:700;}
.tt-t{font-family:var(--serif); font-size:19px; font-weight:600;}
.clockbar{display:flex; align-items:center; gap:6px; background:#0F1F3E; border-radius:10px; padding:5px 8px;}
.cb-label{font-size:9px; letter-spacing:.12em; font-weight:700; color:#8FA0C6; text-transform:uppercase; margin-right:2px;}
.clockbar button{font-size:12px; font-weight:600; color:#C7CFE2; border:1px solid #33497C; border-radius:7px; padding:5px 9px;}
.clockbar button.sel{background:#E8C67A; color:#152A52; border-color:#E8C67A;}
.rail{display:flex; gap:4px; width:100%;}
.rail-a{color:#C7CFE2; text-decoration:none; font-size:12px; font-weight:700; border:1px solid #33497C; border-radius:7px; padding:4px 10px;}
.rail-a:hover{background:#1E3A6E;}
@media(min-width:760px){.rail{width:auto;}}

/* sections */
.main{max-width:980px; margin:0 auto; padding:22px 16px 80px;}
.sec{margin-top:34px; scroll-margin-top:120px;}
.sec-head{display:flex; align-items:baseline; gap:10px;}
.sec-num{font-size:12px; font-weight:800; letter-spacing:.1em; color:var(--cobalt); border:1.5px solid var(--cobalt); border-radius:7px; padding:2px 7px;}
.sec-title{font-family:var(--serif); font-size:24px; font-weight:600; margin:0;}
.sec-clock{font-size:13px; color:var(--muted);}
.sec-problem{margin:6px 0 12px; font-size:14px; color:#57616F; max-width:640px;}
.pane-toggle{display:inline-flex; border:1px solid var(--hairline); border-radius:999px; background:var(--card); padding:3px; margin-bottom:12px;}
.pane-toggle button{font-size:12.5px; font-weight:700; padding:6px 16px; border-radius:999px; color:var(--muted);}
.pane-toggle .sel{background:var(--navy); color:#F3EFE5;}
.panes{display:grid; gap:16px;}
@media(min-width:920px){
  .panes{grid-template-columns:1fr 1fr;}
  .pane-toggle{display:none;}
  .pane.hide-sm{display:block;}
}
@media(max-width:919px){ .pane.hide-sm{display:none;} }

/* frames */
.pane-wrap{position:relative;}
.pane-badge{position:absolute; top:-9px; left:14px; z-index:2; font-size:10px; font-weight:800; letter-spacing:.14em; padding:3px 10px; border-radius:999px; color:#fff;}
.pane-badge.before{background:var(--before);}
.pane-badge.after{background:var(--after);}
.frame{background:var(--porcelain); border:1px solid var(--hairline); border-radius:18px; padding:18px 14px 14px; position:relative; overflow:hidden; min-height:200px;}
.pane-wrap.before .frame{border-color:#DCC9BB;}
.pane-wrap.after .frame{border-color:#C7DCC9;}

/* hero mini */
.hero-mini{background:var(--navy); color:#F3EFE5; border-radius:12px; padding:14px 14px 12px; position:relative; overflow:hidden; margin-bottom:12px;}
.hero-pat{position:absolute; inset:0; opacity:.16;
  background-image:radial-gradient(circle at 8px 8px, #6E86BC 1.5px, transparent 1.7px);
  background-size:26px 26px;}
.hm-kicker{position:relative; font-size:8.5px; letter-spacing:.22em; color:#9FB0D4; font-weight:700;}
.hm-title{position:relative; font-family:var(--serif); font-size:26px; font-weight:600;}
.hm-count{position:relative; display:inline-block; margin-top:8px; border:1px solid #40598F; border-radius:999px; padding:4px 11px; font-size:10px; letter-spacing:.12em; font-weight:700; color:#E8C67A;}

/* day fragments */
.day-mini{margin-bottom:12px;}
.day-mini.tight{margin-bottom:10px;}
.day-mini.flash{animation:flash 1s ease-out;}
@keyframes flash{from{background:#FBEED2;} to{background:transparent;}}
@media (prefers-reduced-motion: reduce){.day-mini.flash{animation:none;}}
.mini-row{display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;}
.mini-kicker{font-size:11px; letter-spacing:.06em; color:var(--muted); font-weight:700;}
.mini-num{font-size:10px; letter-spacing:.2em; color:var(--muted); font-weight:700; margin-bottom:2px;}
.today-tag{color:var(--amber);}
.mini-title{font-family:var(--serif); font-size:19px; font-weight:600; margin-bottom:8px;}
.mini-title.sm{font-size:15px; margin-bottom:6px;}
.edit-link{font-size:12.5px; font-weight:700; color:var(--cobalt); padding:4px 6px;}
.tiles-mini{display:flex; gap:5px; margin-bottom:10px; flex-wrap:wrap;}
.tile-mini{font-size:10.5px; font-weight:700; border:1px solid var(--hairline); background:var(--card); border-radius:8px; padding:5px 8px; color:var(--muted); position:relative;}
.tile-mini.sel{background:var(--navy); border-color:var(--navy); color:#F3EFE5;}
.tile-mini.today:not(.sel){border-color:var(--amber);}
.tile-mini.today.sel::after{content:''; position:absolute; left:50%; transform:translateX(-50%); bottom:2px; width:4px; height:4px; border-radius:50%; background:#E8C67A;}

/* events */
.event{background:var(--card); border:1px solid var(--hairline); border-radius:12px; padding:10px 12px; margin-bottom:7px;}
.event.dim{opacity:.5;}
.event-head{display:flex; align-items:flex-start; gap:9px;}
.event-text{flex:1; font-size:14px; line-height:1.4;}
.event-text.sm{font-size:13px;}
.event-text.as-btn{text-align:left; padding:0;}
.event-text .time,.time{color:var(--cobalt); font-weight:700;}
.rename{flex:1; border:1.5px dashed var(--cobalt); border-radius:8px; padding:5px 8px; font-size:14px; font-family:var(--sans); background:var(--card); color:var(--ink);}
.chip{border-radius:999px; font-weight:800; letter-spacing:.06em; flex-shrink:0;}
.chip-open{background:var(--amber-bg); color:var(--amber); border:1px solid var(--amber-line); font-size:10.5px; padding:4px 10px;}
.chip-btn{box-shadow:0 1px 0 rgba(0,0,0,.07);}
.chip-btn:active{transform:translateY(1px);}
.chip-done{color:#7A8494; border:1px solid var(--hairline); background:#FAF8F2; font-size:11px; padding:3px 9px;}
.x{color:#B0533B; font-size:18px; line-height:1; padding:2px 7px; border-radius:7px; flex-shrink:0;}
.x:active{background:#F6E3DC;}
.options{margin-top:8px; display:flex; flex-direction:column; gap:5px;}
.opt-row{display:flex; align-items:center; gap:5px;}
.opt-chip{flex:1; background:#FBF9F3; border:1px solid var(--hairline); border-radius:9px; padding:7px 10px; font-size:12.5px; font-weight:600;}
.opt-chip.tappable{text-align:left; cursor:pointer;}
.opt-chip.tappable:active,.opt-chip.rich:active{background:#F3EFE3;}
.opt-chip span{display:block;}
.opt-meta{font-size:11px; font-weight:400; color:var(--muted); margin-top:1px;}
.also{margin-top:8px; font-size:11px; color:var(--muted); border-top:1px dotted var(--hairline); padding-top:6px;}
.pin{text-decoration:none; color:var(--cobalt); font-size:16px; padding:6px; flex-shrink:0;}
.add-row{width:100%; text-align:left; border:1.5px dashed var(--hairline); border-radius:12px; padding:9px 12px; font-size:13px; font-weight:600; color:var(--muted);}
.add-input{width:100%; border:1.5px dashed var(--cobalt); border-radius:12px; padding:9px 12px; font-size:13px; font-family:var(--sans); background:var(--card); color:var(--ink);}

/* weather + nextup + lists */
.weather{font-size:12px; color:#4E5A70; background:#EDF1F8; border:1px solid #D9E1EF; border-radius:9px; padding:6px 10px; margin-bottom:8px;}
.boat{color:#1E6B3C;}
.sample{font-size:9.5px; color:#9AA4B5;}
.nextup{background:var(--card); border:1px solid var(--amber-line); border-radius:12px; padding:10px 12px; margin-bottom:10px;}
.nu-h{font-size:9px; letter-spacing:.2em; font-weight:800; color:var(--amber); margin-bottom:6px;}
.nu-line{width:100%; display:flex; justify-content:space-between; align-items:center; gap:8px; text-align:left; padding:7px 4px; border-top:1px dotted var(--hairline); font-size:12.5px; font-weight:600;}
.nu-line:first-of-type{border-top:none;}
.nu-line:active{background:#FBF7EC;}
.nu-tag{font-size:10px; font-weight:800; color:var(--amber); white-space:nowrap;}
.back{font-size:12.5px; font-weight:700; color:var(--cobalt); padding:4px 0; margin-bottom:8px;}
.list-mini{background:var(--card); border:1px solid var(--hairline); border-radius:12px; padding:10px 12px; margin-bottom:10px;}
.lm-h{font-size:10px; letter-spacing:.12em; font-weight:800; color:var(--muted); margin:6px 0 4px; text-transform:uppercase;}
.lm-h:first-child{margin-top:0;}
.lm-i{font-size:12.5px; padding:4px 0;}

/* ritual */
.ritual{background:linear-gradient(#FFF9EE,#FFF6E6); border:1px solid #F0E2C4; border-radius:12px; padding:2px 4px; margin-bottom:7px;}
.ritual.slim{display:flex; align-items:center; gap:8px; padding:8px 10px;}
.ritual-head{width:100%; display:flex; align-items:center; gap:8px; padding:7px 8px;}
.ritual-sun{color:#D08700;}
.ritual-title{font-weight:700; font-size:12.5px; flex:1; text-align:left;}
.rs{font-size:11px; color:var(--muted);}
.rs.cap{color:var(--amber); font-weight:800;}
.rs.done{color:#1E6B3C; font-weight:800;}
.ritual-desc{padding:0 9px 9px; font-size:11.5px; color:#7A7160;}
.ritual-mem{padding:0 9px 9px;}
.quote{font-family:var(--serif); font-style:italic; font-size:13px; margin-top:2px;}
.quote .who{font-family:var(--sans); font-style:normal; font-size:10px; color:var(--muted);}
.mem-edit{font-size:10.5px; color:var(--cobalt); font-weight:700; margin-top:4px; padding:2px 0;}

/* bookings mini */
.bk-mini{background:var(--card); border:1px solid var(--hairline); border-radius:12px; padding:10px 12px; margin-bottom:8px;}
.bk-t{font-size:13px; font-weight:700; display:flex; justify-content:space-between; align-items:center; gap:8px;}
.bk-pill{font-size:8.5px; font-weight:800; letter-spacing:.1em; color:#2C6E49; border:1.5px solid #2C6E49; border-radius:999px; padding:2px 7px;}
.bk-s{font-size:12px; color:var(--muted); margin-top:3px;}
.deadline.past{color:#A9A294; text-decoration:line-through;}
.deadline.soon{color:var(--amber); font-weight:700;}

/* dialogs, sheets, toasts */
.sys-scrim{position:absolute; inset:0; background:rgba(0,0,0,.35); display:flex; align-items:center; justify-content:center; z-index:10; border-radius:18px;}
.sys-box{width:74%; max-width:270px; background:rgba(248,248,248,.98); border-radius:14px; font-family:-apple-system,'Segoe UI',sans-serif; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,.3); text-align:center;}
.sys-text{padding:18px 16px 14px; font-size:13px; font-weight:600; color:#111;}
.sys-btns{display:flex; border-top:.5px solid #C9C9C9;}
.sys-btn{flex:1; padding:11px 0; font-size:15px; color:#007AFF; font-family:inherit;}
.sys-btn + .sys-btn{border-left:.5px solid #C9C9C9;}
.sys-btn.bold{font-weight:700;}
.sheet-scrim{position:absolute; inset:0; background:rgba(21,42,82,.42); display:flex; align-items:flex-end; z-index:10; border-radius:18px;}
.sheet{width:100%; background:var(--porcelain); border-radius:16px 16px 0 0; padding:16px 16px 18px; animation:up .18s ease-out;}
@keyframes up{from{transform:translateY(20px); opacity:.6;} to{transform:none; opacity:1;}}
@media (prefers-reduced-motion: reduce){.sheet{animation:none;} }
.sheet-kicker{font-size:10px; letter-spacing:.1em; color:var(--muted); font-weight:800; text-transform:uppercase;}
.sheet-title{font-family:var(--serif); font-size:19px; font-weight:600; margin-top:3px;}
.sheet-meta{font-size:12.5px; color:#57616F; margin-top:4px;}
.btn{display:block; width:100%; text-align:center; border-radius:11px; padding:11px; font-size:14px; font-weight:800; margin-top:9px; text-decoration:none;}
.btn.primary{background:var(--navy); color:#F3EFE5;}
.btn.primary:disabled{opacity:.4; cursor:default;}
.btn.ghost{border:1.5px solid var(--navy); color:var(--navy);}
.btn.plain{color:var(--muted); font-weight:700; padding:7px;}
.field{display:block; margin-top:10px;}
.field span{display:block; font-size:10px; font-weight:800; letter-spacing:.08em; color:var(--muted); text-transform:uppercase; margin-bottom:4px;}
.field input{width:100%; border:1px solid var(--hairline); border-radius:9px; padding:9px 11px; font-size:14px; font-family:var(--sans); background:var(--card); color:var(--ink);}
.photo-slot{margin-top:10px; border:1.5px dashed var(--hairline); border-radius:11px; padding:13px; text-align:center; font-size:11px; color:var(--muted);}
.in-toast{position:absolute; left:12px; right:12px; bottom:12px; background:var(--navy); color:#F3EFE5; border-radius:11px; padding:10px 13px; display:flex; align-items:center; gap:10px; z-index:12; box-shadow:0 6px 18px rgba(21,42,82,.3);}
.in-toast span{flex:1; font-size:12.5px;}
.in-undo{color:#E8C67A; font-weight:800; font-size:12.5px; padding:3px 5px;}

/* annotations */
.counter{display:flex; justify-content:space-between; align-items:center; gap:10px; background:var(--card); border:1px solid var(--hairline); border-radius:10px; padding:8px 12px; font-size:12.5px; margin-top:4px;}
.counter b{font-size:15px;}
.reset{font-size:11px; font-weight:700; color:var(--cobalt); text-decoration:underline; padding:3px;}
.pane-note{font-size:11.5px; color:#7A7160; margin-top:9px; line-height:1.5;}
.pane-sub{font-size:12px; color:#7A7160; margin-bottom:9px;}
.callout{border-radius:10px; padding:8px 11px; font-size:12px; font-weight:600; margin-top:6px;}
.callout.warn{background:#FBEAE3; color:#8B3A24; border:1px solid #EFCDBF;}
.callout.ok{background:#E7F2E9; color:#1E6B3C; border:1px solid #CDE4D2;}
.journey{background:var(--card); border:1px dashed #DCC9BB; border-radius:12px; padding:11px 13px;}
.j-h{font-size:10px; letter-spacing:.12em; font-weight:800; color:var(--before); text-transform:uppercase;}
.j-s{font-size:12.5px; margin-top:6px; line-height:1.6;}
.j-t{font-size:11.5px; color:#8B5A3C; font-weight:700; margin-top:6px;}
.hint{display:flex; align-items:center; justify-content:space-between; gap:8px; background:#EDF1F8; border:1px solid #D9E1EF; color:#2A4380; border-radius:10px; padding:7px 11px; font-size:12px; font-weight:600; margin-bottom:10px;}
.hint-x{font-size:12px; color:#7A8494; padding:2px 5px;}

/* notes */
.notes{margin-top:46px; background:var(--card); border:1px solid var(--hairline); border-radius:16px; padding:18px 20px;}
.notes h3{font-family:var(--serif); font-size:18px; font-weight:600; margin:0 0 8px;}
.notes p{font-size:13px; line-height:1.65; color:#57616F; margin:0;}
`;
