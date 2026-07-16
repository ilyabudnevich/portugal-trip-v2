# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (Vite HMR)
npm run build    # Production build
npm run lint     # Oxlint
npm run preview  # Preview production build locally
```

No test suite is configured.

## Working with the user

I'm a beginner. Before running a command, explain in plain English what it does. When changing files, tell me which files you're changing and why.

## Status

This is a freshly scaffolded React + Vite app (`npm create vite@latest -- --template react`), currently unmodified from the template aside from the page title ("Portugal 2026" in `index.html`). There is no app-specific code yet — `src/App.jsx` is still the default Vite/React starter.

The intended purpose is a personal trip-planning dashboard for a Portugal trip (working title "Portugal Trip Command Center"): itinerary by day, a restaurant list with booking status, booking/refund deadlines, and a packing list. None of this has been built yet — real trip dates and details are still needed from the user before implementing features. Update this file's Architecture section once that work begins.

## Linting

Lint rules live in `.oxlintrc.json` (plugins: `react`, `oxc`). Notably `react/rules-of-hooks` is an error, not just a warning.
