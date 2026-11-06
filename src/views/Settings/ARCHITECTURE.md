# View Architecture: Settings (Hybrid Control)

## Purpose
Manages user preferences and system configuration. Unified aesthetics with environment-specific power.

## Features
- **Theme System**: Full access to 36+ AlphaOS themes (Nordic, Dracula, Honey, etc.), now fully modularized.
- **Mobile Navigation**: Toggle between "Tabs" (classic bottom bar) and "Home Menü" (Hub & Sheet architecture).
- **Training Logic**: Toggle for `Volume Mode` (Sets/Reps tracking) vs `HIT Mode`.
- **Coach Intelligence (Local Only)**: 
    - Port checks for `fitness-dev` and `wger`.
    - Manual Firestore Sync trigger.
    - System path information (~/.aos/fitness/).

## Logic
- Consumes and updates settings via `db.js` (`getSettings`, `saveSettings`).
- Local version maps these to `localStorage` (via `user.js` lib).
