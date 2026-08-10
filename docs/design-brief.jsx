import { useState, useEffect } from "react";

/* ============================================================
   PORTUGAL — prototype v2 (post gap-audit)
   v1 + restored: decision-state (OPEN/DECIDED vs booked),
   per-day Edit mode (reorder ≡ · rename · delete × · add),
   Lists tab (Packing + Prep), Memories (ritual + Portugal Book),
   weather line (sample data).
   All trip data real as of Aug 10. Photos/weather = placeholders.
   ============================================================ */

const TRIP_START = new Date("2026-08-28T23:00:00-04:00");

const LEGS = [
  { id: "lisbon", label: "Lisbon", sub: "Aug 28 – Sep 1" },
  { id: "algarve", label: "Algarve", sub: "Sep 1 – 6" },
];

/* status: "booked" (real reservation) · "open" (undecided, has options) · "plain" */
const DAYS = [
  {
    id: "aug28", leg: "lisbon", dow: "Fri", num: "28", title: "Fly out",
    wx: "☀ 27° Cranford → 24° Lisbon",
    events: [
      { time: "8:00 PM", name: "Head to Newark (EWR)", place: "Newark Liberty Intl", status: "plain" },
      { time: "11:00 PM", name: "TAP Portugal → Lisbon", note: "Overnight · land Sat morning", status: "booked" },
    ],
  },
  {
    id: "aug29", leg: "lisbon", dow: "Sat", num: "29", title: "Arrive Lisbon",
    wx: "☀ 28° · clear evening",
    events: [
      { time: "~11:30 AM", name: "Land LIS · taxi to Chiado", status: "plain" },
      { time: "3:00 PM", name: "Check in — Martinhal Chiado", place: "Martinhal Chiado", status: "booked" },
      { name: "Easy Chiado stroll", note: "Praça Luís de Camões · pastéis stop", place: "Chiado, Lisbon", status: "plain" },
      { name: "Family dinner near the hotel", status: "open", options: ["Taberna da Rua das Flores", "By the Wine"] },
    ],
  },
  {
    id: "aug30", leg: "lisbon", dow: "Sun", num: "30", title: "Oceanário + date night",
    wx: "☀ 29° · light breeze",
    events: [
      { time: "10:00 AM", name: "Oceanário de Lisboa", note: "Kids' pick — budget the whole morning", place: "Oceanário de Lisboa", status: "plain" },
      { name: "Parque das Nações riverside", note: "Cable car if legs allow", place: "Parque das Nações", status: "plain" },
      { time: "6:00 PM", name: "Pyjama Club drop-off", note: "Kids at Martinhal · until 11 PM", status: "booked" },
      { time: "7:30 PM", name: "Gambrinus — adults", note: "Party of 2", place: "Gambrinus, Lisbon", status: "booked", adults: true },
    ],
  },
  {
    id: "aug31", leg: "lisbon", dow: "Mon", num: "31", title: "Sintra + fado night",
    wx: "⛅ 26° · cooler on the coast",
    events: [
      { time: "9:00 AM", name: "Sintra — Pena Palace grounds", note: "Grounds only, skip the palace queue", place: "Parque da Pena, Sintra", status: "plain" },
      { name: "Azenhas do Mar lookout", note: "Cliff village · late lunch", place: "Azenhas do Mar", status: "plain" },
      { time: "6:00 PM", name: "Pyjama Club drop-off", status: "booked" },
      { time: "7:00 PM", name: "Fado in Chiado — adults", note: "Doors 6:45 · 50-min show · #368468881", place: "Fado in Chiado", status: "booked", adults: true },
      { time: "8:05 PM", name: "JNcQUOI Avenida — adults", note: "Booked 7:45 · call re: arriving after fado", place: "JNcQUOI Avenida", status: "booked", adults: true },
    ],
  },
  {
    id: "sep1", leg: "algarve", dow: "Tue", num: "1", title: "Drive south via Óbidos",
    wx: "☀ 30° inland",
    events: [
      { time: "10:00 AM", name: "Pick up rental — LIS airport", note: "Qashqai or similar · boosters · #398444774", status: "booked" },
      { name: "Óbidos walled town", note: "Ginjinha in a chocolate cup", place: "Óbidos", status: "plain" },
      { time: "4:00 PM", name: "Check in — Pine Cliffs Ocean Suites", place: "Pine Cliffs Resort", status: "booked" },
      { name: "Resort dinner, keep it easy", status: "plain" },
    ],
  },
  {
    id: "sep2", leg: "algarve", dow: "Wed", num: "2", title: "Beach day one",
    wx: "☀ 29° · water 22°",
    events: [
      { name: "Praia da Falésia", note: "Resort beach access", place: "Praia da Falésia", status: "plain" },
      { name: "Pool + kids' club recon", status: "plain" },
      { name: "Dinner — decide tonight", status: "open", options: ["Veneza", "O Charneco", "Rei das Praias"] },
    ],
  },
  {
    id: "sep3", leg: "algarve", dow: "Thu", num: "3", title: "Benagil caves",
    wx: "🌊 calm seas AM — good for the caves · ☀ 28°",
    events: [
      { time: "9:30 AM", name: "Benagil boat tour", note: "The signature morning — cameras charged", place: "Benagil Cave", status: "booked" },
      { name: "Carvoeiro village + gelato", place: "Carvoeiro", status: "plain" },
      { name: "Sunset at the cliffs", note: "Tonight's ritual: the cliff selfie", status: "plain" },
    ],
  },
  {
    id: "sep4", leg: "algarve", dow: "Fri", num: "4", title: "Slow beach day",
    wx: "☀ 29° · light wind",
    events: [
      { name: "Beach, no agenda", status: "plain" },
      { name: "Long lunch on the sand", note: "Praia dos Caneiros", status: "open", options: ["Rei das Praias", "resort lunch"] },
      { name: "Mini-golf or movie night", status: "plain" },
    ],
  },
  {
    id: "sep5", leg: "algarve", dow: "Sat", num: "5", title: "Last full day",
    wx: "☀ 30°",
    events: [
      { name: "Final beach morning", status: "plain" },
      { name: "Pack + pool", note: "Boarding passes · car fuel", status: "plain" },
      { name: "Farewell dinner", status: "open", options: ["Veneza", "O Charneco"] },
    ],
  },
  {
    id: "sep6", leg: "algarve", dow: "Sun", num: "6", title: "Fly home",
    wx: "☀ 27° · long travel day",
    events: [
      { time: "10:00 AM", name: "Drop rental — Faro airport", status: "booked" },
      { name: "FAO → LHR → JFK", note: "BA + AA legs · load the iPads", status: "booked" },
    ],
  },
];

const BOOKINGS = [
  { cat: "flight", icon: "✈", name: "TAP Portugal · EWR → LIS", when: "Fri Aug 28 · 11:00 PM", detail: "Overnight · arrive Sat morning", status: "Confirmed" },
  { cat: "stay", icon: "⌂", name: "Martinhal Chiado", when: "Aug 29 – Sep 1 · 3 nights", detail: "Family suites · Chiado, Lisbon", status: "Confirmed" },
  { cat: "kids", icon: "☾", name: "Pyjama Club × 2", when: "Sun 8/30 + Mon 8/31 · 6–11 PM", detail: "Kids' evenings at Martinhal", status: "Confirmed" },
  { cat: "food", icon: "❖", name: "Gambrinus", when: "Sun Aug 30 · 7:30 PM", detail: "Party of 2 · adults night", status: "Confirmed" },
  { cat: "show", icon: "♪", name: "Fado in Chiado", when: "Mon Aug 31 · 7:00 PM", detail: "#368468881 · doors 6:45", status: "Confirmed" },
  { cat: "food", icon: "❖", name: "JNcQUOI Avenida", when: "Mon Aug 31 · 7:45 PM", detail: "Party of 2 · call re: 8:05 arrival", status: "Call ahead" },
  { cat: "car", icon: "⌖", name: "Rental — Nissan Qashqai or similar", when: "Sep 1 LIS 10 AM → Sep 6 FAO 10 AM", detail: "#398444774 · $459.70 · 2 boosters · CDW incl.", status: "Confirmed" },
  { cat: "stay", icon: "⌂", name: "Pine Cliffs Ocean Suites", when: "Sep 1 – 6 · 5 nights", detail: "Praia da Falésia, Algarve", status: "Confirmed" },
  { cat: "flight", icon: "✈", name: "FAO → JFK via LHR", when: "Sun Sep 6", detail: "British Airways + American legs", status: "Confirmed" },
];

const PACKING = [
  { group: "Ilya", items: ["Passport", "Chargers + EU adapters", "Running shoes", "Swim gear"] },
  { group: "Elina", items: ["Passport", "Beach cover-ups", "Evening outfit (fado night)", "Sunscreen 50+"] },
  { group: "Kids", items: ["Passports", "iPads loaded", "Floaties", "Rash guards ×2 each"] },
];

const PREP = [
  { group: "This week", items: ["Confirm Benagil boat time", "Start kids' iPad downloads"] },
  { group: "2–3 weeks out", items: ["Travel insurance docs", "Order EUR cash", "Offline maps: Lisbon + Algarve", "Intl plan on both phones"] },
  { group: "1 week out", items: ["Check in TAP", "Print Pyjama Club confirmations", "Call JNcQUOI re: 8:05 arrival", "Stage chargers + adapters"] },
];

const IDEAS = [
  "Morning is Sintra — leave by 9 to beat the Pena crowds; the grounds open at 9:30.",
  "You're back in Chiado by 5. Pastéis at Manteigaria is 4 minutes from the hotel, before the 6 PM drop-off.",
  "Fado ends 7:50 — JNcQUOI is an 11-minute walk down Avenida. No taxi needed.",
];

const MEMORY_TILES = [
  { d: "Aug 29", g: "linear-gradient(135deg,#7FA6D4,#17497E)", q: null },
  { d: "Aug 30", g: "linear-gradient(135deg,#4E8FBF,#0E2F52)", q: "“The sharks were SLEEPING.” — 5yo" },
  { d: "Aug 31", g: "linear-gradient(135deg,#8F4A3C,#5D4B7C)", q: "“The singing made Mom cry.” — 7yo" },
  { d: "Sep 1", g: "linear-gradient(135deg,#B8862E,#8F4A3C)", q: null },
  { d: "Sep 2", g: "linear-gradient(135deg,#F0B23E,#4E8FBF)", q: "“I dug to the water!” — 5yo" },
  { d: "Sep 3", g: "linear-gradient(135deg,#17497E,#2E6B5E)", q: "“The cave had a SKYLIGHT.” — 7yo" },
];

/* ---------- azulejo tile (signature SVG) ---------- */

const Tile = ({ s = 44, o = 1 }) => (
  <svg width={s} height={s} viewBox="0 0 44 44" style={{ opacity: o, display: "block" }}>
    <path d="M22 4 C26 12, 34 14, 40 14 C34 20, 32 26, 32 34 C26 30, 18 30, 12 34 C14 26, 10 20, 4 14 C12 14, 18 10, 22 4 Z"
      fill="none" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="22" cy="22" r="3.2" fill="currentColor" />
    <path d="M2 2 h6 M2 2 v6 M42 2 h-6 M42 2 v6 M2 42 h6 M2 42 v-6 M42 42 h-6 M42 42 v-6"
      stroke="currentColor" strokeWidth="1.1" fill="none" />
  </svg>
);

const TileRow = ({ n = 9, o = 0.16 }) => (
  <div style={{ display: "flex", overflow: "hidden" }}>
    {Array.from({ length: n }).map((_, i) => <Tile key={i} o={o} />)}
  </div>
);

/* ---------- pieces ---------- */

function Countdown() {
  const days = Math.max(0, Math.ceil((TRIP_START - new Date()) / 86400000));
  return (
    <div className="countdown">
      <span className="count-num">{days}</span>
      <span className="count-label">days to wheels-up</span>
    </div>
  );
}

function MapLink({ place }) {
  if (!place) return null;
  return (
    <a className="maplink" href={`https://maps.google.com/?q=${encodeURIComponent(place)}`}
      target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>◈ Map</a>
  );
}

function StatusChip({ ev, onToggle }) {
  if (!ev.options) return null; /* no decision → no badge; reservations read from their own details */
  if (ev.status === "confirmed" || ev.picked)
    return <button className="chip chip-btn chip-quiet" onClick={onToggle} title="tap to reopen">✓</button>;
  return <button className="chip chip-btn chip-open" onClick={onToggle}>open</button>;
}

function EventRow({ ev, editing, onDelete, onRename, onToggle, onPick }) {
  return (
    <div className={`ev ${ev.status === "open" ? "ev-open" : ""}`}>
      {editing && <span className="handle">≡</span>}
      <div className="ev-body">
        <div className="ev-top">
          {ev.time && <span className="ev-time">{ev.time}</span>}
          {editing
            ? <input className="ev-edit" defaultValue={ev.name} onBlur={(e) => onRename(e.target.value)} />
            : <span className="ev-name">{ev.name}</span>}
          {ev.adults && !editing && <span className="chip chip-adults">adults</span>}
          {!editing && <StatusChip ev={ev} onToggle={onToggle} />}
        </div>
        {ev.note && !editing && <div className="ev-note">{ev.note}</div>}
        {ev.options && (
          <div className="opts">
            {ev.options.map((o) => (
              <button key={o} className={`opt ${ev.picked === o ? "opt-on" : ""}`}
                onClick={() => !editing && onPick(o)}>
                {o}{ev.picked === o ? " ✓" : ""}{editing && <span className="opt-x">×</span>}
              </button>
            ))}
            {!editing && <button className="opt opt-add">+ option</button>}
          </div>
        )}
      </div>
      {editing
        ? <button className="ev-x" onClick={onDelete} aria-label="delete">×</button>
        : <MapLink place={ev.place} />}
    </div>
  );
}

function DayView({ day, editing, setEditing, onDelete, onRename, onRenameDay, onToggle, onPick }) {
  return (
    <>
      <div className="day-head">
        <div style={{ flex: 1 }}>
          {editing
            ? <input className="day-edit" defaultValue={day.title} onBlur={(e) => onRenameDay(e.target.value)} />
            : <h2 className="day-title">{day.title}</h2>}
          <div className="day-wx">{day.wx} <span className="wx-tag">sample</span></div>
        </div>
        <button className={`edit-btn ${editing ? "on" : ""}`} onClick={() => setEditing(!editing)}>
          {editing ? "Done" : "✎ Edit"}
        </button>
      </div>
      {!editing && <IdeasCard />}
      <div className="evlist">
        {day.events.map((e, i) => (
          <EventRow key={day.id + i + e.name} ev={e} editing={editing}
            onDelete={() => onDelete(day.id, i)} onRename={(v) => onRename(day.id, i, v)}
            onToggle={() => onToggle(day.id, i)} onPick={(o) => onPick(day.id, i, o)} />
        ))}
        <button className="addrow">+ Add activity</button>
      </div>
    </>
  );
}

function IdeasCard() {
  const [open, setOpen] = useState(false);
  return (
    <div className="ideas">
      <button className="ideas-head" onClick={() => setOpen(!open)}>
        <span className="ideas-spark">✦</span>
        <span className="ideas-title">Ideas for today</span>
        <span className="ideas-tag">September preview</span>
        <span className="ideas-caret">{open ? "–" : "+"}</span>
      </button>
      {open && (
        <div className="ideas-body">
          {IDEAS.map((t, i) => <p key={i} className="idea-line">{t}</p>)}
          <p className="ideas-foot">Generated from today's itinerary · the app's first true service</p>
        </div>
      )}
    </div>
  );
}

function Bookings() {
  return (
    <div className="bookings">
      {BOOKINGS.map((b, i) => (
        <div key={i} className="bk">
          <div className={`bk-icon bk-${b.cat}`}>{b.icon}</div>
          <div className="bk-body">
            <div className="bk-name">{b.name}</div>
            <div className="bk-when">{b.when}</div>
            <div className="bk-detail">{b.detail}</div>
          </div>
          <span className={`bk-status ${b.status !== "Confirmed" ? "bk-warn" : ""}`}>{b.status}</span>
        </div>
      ))}
    </div>
  );
}

function ChecklistGroups({ data }) {
  const [checked, setChecked] = useState({});
  const [edit, setEdit] = useState(null);
  return (
    <div className="packing">
      {data.map((g) => (
        <div key={g.group} className="pk-group">
          <div className="pk-head">
            <span className="pk-title">{g.group}</span>
            <button className={`pk-edit ${edit === g.group ? "on" : ""}`}
              onClick={() => setEdit(edit === g.group ? null : g.group)}>
              {edit === g.group ? "Done" : "✎ Edit"}
            </button>
          </div>
          {g.items.map((it) => {
            const k = g.group + it;
            return (
              <div key={it} className="pk-item">
                {edit === g.group && <span className="handle sm">≡</span>}
                <button className={`ev-check sm ${checked[k] ? "on" : ""}`}
                  onClick={() => setChecked({ ...checked, [k]: !checked[k] })}>
                  {checked[k] ? "✓" : ""}
                </button>
                <span className={checked[k] ? "pk-done" : ""}>{it}</span>
                {edit === g.group && <button className="ev-x sm">×</button>}
              </div>
            );
          })}
          <button className="addrow sm">+ Add item</button>
        </div>
      ))}
    </div>
  );
}

function Lists() {
  const [seg, setSeg] = useState("packing");
  return (
    <>
      <div className="segwrap">
        <div className="seg">
          <button className={seg === "packing" ? "seg-on" : ""} onClick={() => setSeg("packing")}>Packing</button>
          <button className={seg === "prep" ? "seg-on" : ""} onClick={() => setSeg("prep")}>Trip prep</button>
        </div>
      </div>
      <ChecklistGroups data={seg === "packing" ? PACKING : PREP} />
    </>
  );
}

function Memories() {
  const [q7, setQ7] = useState("");
  const [q5, setQ5] = useState("");
  return (
    <div className="mem">
      <div className="ritual">
        <div className="ritual-head">
          <span className="ritual-title">Tonight's ritual</span>
          <span className="ritual-day">Thu Sep 3 · Benagil</span>
        </div>
        <button className="ritual-photo">📸<span>Add today's family selfie</span></button>
        <label className="ritual-q">
          <span>One thing she loved today — 7yo</span>
          <input value={q7} onChange={(e) => setQ7(e.target.value)} placeholder="her words, verbatim" />
        </label>
        <label className="ritual-q">
          <span>One thing she loved today — 5yo</span>
          <input value={q5} onChange={(e) => setQ5(e.target.value)} placeholder="her words, verbatim" />
        </label>
        <div className="ritual-foot">One selfie + two quotes a day. Two minutes at sunset.</div>
      </div>

      <div className="book-head">
        <span className="book-title">The Portugal Book</span>
        <span className="book-sub">after Sep 6, this is where the trip lives</span>
      </div>
      <div className="collage">
        {MEMORY_TILES.map((m) => (
          <div key={m.d} className="mtile" style={{ background: m.g }}>
            <span className="mtile-day">{m.d}</span>
            {m.q && <span className="mtile-q">{m.q}</span>}
          </div>
        ))}
      </div>
      <div className="mem-note">Photos are placeholders — real ones come from the ritual, one per day.</div>
    </div>
  );
}

/* ---------- app ---------- */

export default function App() {
  const [leg, setLeg] = useState("lisbon");
  const [dayId, setDayId] = useState("aug29");
  const [tab, setTab] = useState("trip");
  const [days, setDays] = useState(DAYS);
  const [editing, setEditing] = useState(false);

  const legDays = days.filter((d) => d.leg === leg);
  const day = days.find((d) => d.id === dayId) || legDays[0];

  useEffect(() => {
    if (day.leg !== leg) { setDayId(legDays[0].id); setEditing(false); }
  }, [leg]); // eslint-disable-line

  const del = (id, idx) =>
    setDays(days.map((d) => d.id !== id ? d : { ...d, events: d.events.filter((_, i) => i !== idx) }));
  const ren = (id, idx, v) =>
    setDays(days.map((d) => d.id !== id ? d : { ...d, events: d.events.map((e, i) => i === idx ? { ...e, name: v || e.name } : e) }));
  const renDay = (id, v) =>
    setDays(days.map((d) => d.id !== id ? d : { ...d, title: v || d.title }));
  const flip = (id, idx) =>
    setDays(days.map((d) => d.id !== id ? d : { ...d, events: d.events.map((e, i) =>
      i === idx && e.status !== "booked"
        ? { ...e, status: e.status === "open" ? "confirmed" : "open", picked: e.status === "open" ? e.picked : null }
        : e) }));
  const pick = (id, idx, o) =>
    setDays(days.map((d) => d.id !== id ? d : { ...d, events: d.events.map((e, i) =>
      i === idx
        ? (e.picked === o ? { ...e, picked: null, status: "open" } : { ...e, picked: o, status: "confirmed" })
        : e) }));

  return (
    <div className="stage">
      <style>{CSS}</style>
      <div className="phone">

        <div className="hero">
          <TileRow />
          <div className="hero-inner">
            <div className="hero-eyebrow">The family trip</div>
            <h1 className="hero-title">Portugal</h1>
            <div className="hero-dates">Aug 28 — Sep 6 · four of us</div>
            <Countdown />
          </div>
          <TileRow />
        </div>

        {tab === "trip" && (
          <>
            <div className="legs">
              {LEGS.map((l) => (
                <button key={l.id} className={`leg ${leg === l.id ? "leg-on" : ""}`} onClick={() => setLeg(l.id)}>
                  <span className="leg-name">{l.label}</span>
                  <span className="leg-sub">{l.sub}</span>
                </button>
              ))}
            </div>
            <div className="strip">
              {legDays.map((d) => (
                <button key={d.id} className={`daytile ${day.id === d.id ? "daytile-on" : ""}`}
                  onClick={() => { setDayId(d.id); setEditing(false); }}>
                  <span className="dt-dow">{d.dow}</span>
                  <span className="dt-num">{d.num}</span>
                </button>
              ))}
            </div>
            <DayView day={day} editing={editing} setEditing={setEditing} onDelete={del} onRename={ren}
              onRenameDay={renDay} onToggle={flip} onPick={pick} />
          </>
        )}

        {tab === "bookings" && <Bookings />}
        {tab === "lists" && <Lists />}
        {tab === "mem" && <Memories />}

        <div className="nav">
          {[["trip", "Itinerary"], ["bookings", "Bookings"], ["lists", "Lists"], ["mem", "Memories"]].map(([id, label]) => (
            <button key={id} className={`nav-btn ${tab === id ? "nav-on" : ""}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- styles ---------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Karla:wght@400;500;700&display=swap');

:root{
  --porcelain:#F5F7F6; --cobalt:#17497E; --cobalt-deep:#0E2F52; --tile:#7FA6D4;
  --tram:#F0B23E; --ink:#1B2733; --mist:#DEE6EC; --white:#FFFFFF;
  --amber:#B7791F; --amber-bg:#FBEED3; --green:#2E6B5E; --green-bg:#E7F1EC;
}
*{box-sizing:border-box;margin:0}
.stage{min-height:100vh;background:linear-gradient(180deg,#E9EEF1,#DDE5EA);display:flex;justify-content:center;padding:28px 12px;font-family:'Karla',system-ui,sans-serif;color:var(--ink)}
.phone{width:100%;max-width:396px;background:var(--porcelain);border-radius:26px;box-shadow:0 24px 60px rgba(14,47,82,.28);overflow:hidden;display:flex;flex-direction:column;min-height:780px;position:relative;padding-bottom:64px}

/* hero */
.hero{background:var(--cobalt-deep);color:var(--white)}
.hero .hero-inner{padding:20px 22px 18px}
.hero svg{color:var(--tile)}
.hero-eyebrow{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--tile);margin-bottom:4px;font-weight:700}
.hero-title{font-family:'Fraunces',Georgia,serif;font-weight:650;font-size:42px;line-height:1;letter-spacing:-0.01em}
.hero-dates{margin-top:6px;font-size:13px;color:#C8D6E6}
.countdown{margin-top:12px;display:inline-flex;align-items:baseline;gap:8px;background:rgba(255,255,255,.07);border:1px solid rgba(127,166,212,.35);border-radius:12px;padding:7px 13px}
.count-num{font-family:'Fraunces',Georgia,serif;font-size:28px;font-weight:650;color:var(--tram)}
.count-label{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:#C8D6E6;font-weight:700}

/* legs + strip */
.legs{display:flex;gap:10px;padding:14px 16px 6px}
.leg{flex:1;background:var(--white);border:1.5px solid var(--mist);border-radius:14px;padding:9px 12px;text-align:left;cursor:pointer;transition:all .15s}
.leg-on{border-color:var(--cobalt);background:var(--cobalt);color:var(--white)}
.leg-name{display:block;font-family:'Fraunces',Georgia,serif;font-size:17px;font-weight:650}
.leg-sub{display:block;font-size:11px;opacity:.75;margin-top:2px}
.strip{display:flex;gap:8px;overflow-x:auto;padding:12px 16px 4px;scrollbar-width:none}
.strip::-webkit-scrollbar{display:none}
.daytile{min-width:50px;height:58px;border-radius:10px;border:1.5px solid var(--mist);background:var(--white);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:all .15s}
.daytile-on{border-color:var(--cobalt);background:var(--cobalt);color:var(--white);box-shadow:inset 0 0 0 3px var(--porcelain),inset 0 0 0 4px var(--cobalt)}
.dt-dow{font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;opacity:.75}
.dt-num{font-family:'Fraunces',Georgia,serif;font-size:19px;font-weight:650}

/* day head + weather */
.day-head{padding:14px 20px 2px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.day-title{font-family:'Fraunces',Georgia,serif;font-size:23px;font-weight:650}
.day-wx{font-size:12px;color:#5D6E7E;margin-top:3px}
.wx-tag{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9AA9B6;border:1px solid var(--mist);border-radius:999px;padding:1px 5px;margin-left:4px}
.edit-btn{font-size:12px;font-weight:700;border:1.5px solid var(--mist);background:var(--white);border-radius:999px;padding:6px 13px;cursor:pointer;font-family:inherit;white-space:nowrap;min-height:34px}
.edit-btn.on{background:var(--cobalt);border-color:var(--cobalt);color:var(--white)}

/* events */
.evlist{padding:8px 16px 20px}
.ev{display:flex;gap:10px;background:var(--white);border:1px solid var(--mist);border-radius:12px;padding:11px 12px;margin-bottom:8px;align-items:flex-start}
.ev-open{border-left:3px solid var(--tram)}
.ev-done{opacity:.55}
.ev-check{width:26px;height:26px;min-width:26px;border-radius:8px;border:1.5px solid #B9C6D1;background:var(--white);cursor:pointer;font-size:13px;color:var(--white)}
.ev-check.on{background:var(--cobalt);border-color:var(--cobalt)}
.ev-check.sm{width:22px;height:22px;min-width:22px}
.handle{color:#9AA9B6;font-size:17px;cursor:grab;padding:2px 4px}
.handle.sm{font-size:14px}
.ev-body{flex:1}
.ev-top{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px}
.ev-time{font-size:11.5px;font-weight:700;color:var(--cobalt)}
.ev-name{font-size:14.5px;font-weight:500}
.ev-edit{font-size:14.5px;font-family:inherit;border:1.5px dashed var(--tile);border-radius:6px;padding:3px 6px;width:100%;background:#F8FAFC}
.ev-note{font-size:12.5px;color:#5D6E7E;margin-top:3px;line-height:1.45}
.ev-x{border:none;background:none;color:#8F4A3C;font-size:19px;cursor:pointer;padding:0 2px;line-height:1;margin-left:auto}
.ev-x.sm{font-size:16px}
.chip{font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:2px 7px}
.chip-btn{border:none;cursor:pointer;font-family:inherit;min-height:22px}
.day-edit{font-family:'Fraunces',Georgia,serif;font-size:21px;font-weight:650;border:1.5px dashed var(--tile);border-radius:8px;padding:4px 8px;width:100%;background:#F8FAFC}
.chip-booked{background:#E4EDF7;color:var(--cobalt)}
.chip-open{background:var(--amber-bg);color:var(--amber)}
.chip-decided{background:var(--green-bg);color:var(--green)}
.chip-quiet{background:none;border:1.5px solid var(--mist) !important;color:#8B98A5}
.chip-adults{background:#F6E8D2;color:#8A5A12}
.opts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.opt{font-size:12px;border:1.5px solid var(--mist);background:var(--porcelain);border-radius:999px;padding:4px 10px;cursor:pointer;font-family:inherit;font-weight:500}
.opt-on{border-color:var(--green);background:var(--green);color:var(--white)}
.opt-add{border-style:dashed;color:#5D6E7E}
.opt-x{color:#8F4A3C;margin-left:5px;font-weight:700}
.maplink{font-size:11.5px;font-weight:700;color:var(--cobalt);text-decoration:none;white-space:nowrap;padding-top:3px}
.maplink:hover{text-decoration:underline}
.addrow{width:100%;border:1.5px dashed var(--mist);background:none;border-radius:12px;padding:10px;font-family:inherit;font-size:13px;font-weight:700;color:#5D6E7E;cursor:pointer;min-height:42px}
.addrow.sm{padding:7px;font-size:12px;margin-top:4px;min-height:36px}

/* ideas */
.ideas{margin:10px 16px 2px;border:1.5px solid var(--tram);background:#FFF9EC;border-radius:14px;overflow:hidden}
.ideas-head{width:100%;display:flex;align-items:center;gap:8px;background:none;border:none;padding:10px 14px;cursor:pointer;font-family:inherit}
.ideas-spark{color:var(--tram);font-size:15px}
.ideas-title{font-weight:700;font-size:14px}
.ideas-tag{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:var(--tram);color:#4A3305;border-radius:999px;padding:2px 8px}
.ideas-caret{margin-left:auto;font-size:16px;color:#8A7442}
.ideas-body{padding:0 16px 12px}
.idea-line{font-size:13.5px;line-height:1.5;color:#3C4654;padding:6px 0;border-top:1px dashed #EAD9AC}
.ideas-foot{font-size:10.5px;color:#9A8452;margin-top:8px}

/* bookings */
.bookings{padding:14px 16px 20px;display:flex;flex-direction:column;gap:9px}
.bk{display:flex;gap:12px;align-items:center;background:var(--white);border:1px solid var(--mist);border-radius:14px;padding:12px 14px}
.bk-icon{width:40px;height:40px;min-width:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:17px;color:var(--white);background:var(--cobalt)}
.bk-flight{background:var(--cobalt-deep)}
.bk-stay{background:#2E6B5E}
.bk-car{background:#71614C}
.bk-food{background:#8F4A3C}
.bk-show{background:#5D4B7C}
.bk-kids{background:#B8862E}
.bk-name{font-weight:700;font-size:14px}
.bk-when{font-size:12px;color:var(--cobalt);font-weight:700;margin-top:1px}
.bk-detail{font-size:12px;color:#5D6E7E;margin-top:1px}
.bk-status{margin-left:auto;font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--green);background:var(--green-bg);border-radius:999px;padding:3px 8px;white-space:nowrap}
.bk-warn{color:#8A5A12;background:#F6E8D2}

/* lists */
.segwrap{padding:14px 16px 0}
.seg{display:flex;background:#E7EDF1;border-radius:12px;padding:3px}
.seg button{flex:1;border:none;background:none;font-family:inherit;font-size:13px;font-weight:700;padding:8px;border-radius:10px;color:#5D6E7E;cursor:pointer}
.seg .seg-on{background:var(--white);color:var(--cobalt);box-shadow:0 1px 4px rgba(14,47,82,.12)}
.packing{padding:12px 16px 20px}
.pk-group{background:var(--white);border:1px solid var(--mist);border-radius:14px;padding:12px 14px;margin-bottom:10px}
.pk-head{display:flex;align-items:center;margin-bottom:6px}
.pk-title{font-family:'Fraunces',Georgia,serif;font-size:17px;font-weight:650}
.pk-edit{margin-left:auto;font-size:11.5px;font-weight:700;border:1.5px solid var(--mist);background:var(--porcelain);border-radius:999px;padding:4px 12px;cursor:pointer;font-family:inherit;min-height:30px}
.pk-edit.on{background:var(--cobalt);border-color:var(--cobalt);color:var(--white)}
.pk-item{display:flex;align-items:center;gap:9px;padding:6px 0;font-size:14px}
.pk-done{text-decoration:line-through;color:#8B98A5}

/* memories */
.mem{padding:14px 16px 20px}
.ritual{background:var(--white);border:1.5px solid var(--tile);border-radius:16px;padding:14px;margin-bottom:18px}
.ritual-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}
.ritual-title{font-family:'Fraunces',Georgia,serif;font-size:19px;font-weight:650}
.ritual-day{font-size:11px;font-weight:700;color:var(--cobalt);text-transform:uppercase;letter-spacing:.06em}
.ritual-photo{width:100%;border:1.5px dashed var(--tile);background:#F3F7FB;border-radius:14px;padding:22px;font-size:26px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;font-family:inherit;margin-bottom:12px}
.ritual-photo span{font-size:13px;font-weight:700;color:var(--cobalt)}
.ritual-q{display:block;margin-bottom:10px}
.ritual-q span{display:block;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#5D6E7E;margin-bottom:4px}
.ritual-q input{width:100%;border:1.5px solid var(--mist);border-radius:10px;padding:9px 11px;font-family:inherit;font-size:14px;background:var(--porcelain)}
.ritual-foot{font-size:11.5px;color:#8B98A5;margin-top:4px}
.book-head{display:flex;flex-direction:column;margin-bottom:10px}
.book-title{font-family:'Fraunces',Georgia,serif;font-size:21px;font-weight:650}
.book-sub{font-size:12px;color:#5D6E7E;margin-top:2px}
.collage{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mtile{border-radius:12px;min-height:110px;padding:10px;display:flex;flex-direction:column;justify-content:space-between;color:var(--white)}
.mtile-day{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.9}
.mtile-q{font-family:'Fraunces',Georgia,serif;font-size:12.5px;line-height:1.35;text-shadow:0 1px 6px rgba(0,0,0,.35)}
.mem-note{font-size:11px;color:#8B98A5;margin-top:10px}

/* nav */
.nav{position:absolute;bottom:0;left:0;right:0;display:flex;background:var(--white);border-top:1px solid var(--mist);padding:8px 8px calc(10px + env(safe-area-inset-bottom))}
.nav-btn{flex:1;background:none;border:none;font-family:inherit;font-size:11.5px;font-weight:700;letter-spacing:.02em;color:#778794;padding:8px 0;cursor:pointer;border-radius:10px}
.nav-on{color:var(--cobalt);background:#E9F0F7}
`;
