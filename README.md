# DIST TRKR — GPS Distance Tracker

A GPS measurement web app with point-to-point distance, route tracing, and golf GPS. Single HTML file deployed to disttracker.com via Netlify + GitHub.

**Live at:** [disttracker.com](https://disttracker.com)

---

## Features

### Measure Tab
- **Point to Point mode** — Set Point A, walk, Set Point B. Live distance updates as you move.
- **Route mode** — Tap Start, walk any path, tap Stop & Save. Records GPS points every 10 meters and totals the distance. Pause/resume supported. Active route survives page refresh.
- GPS warmup — Set Point A button pulses and is disabled until GPS is ready
- GPS averaging with speed profiles: Fast, Medium, Accurate
- Units: YD (default), FT, MI, M, KM — persisted
- Keep Awake button — prevents screen sleep, dims after 10 seconds of inactivity
- Mode preference persisted across sessions

### Golf Tab
- Finds nearby golf courses using OpenStreetMap / Overpass API (within 5km)
- Only shows courses with hole (green) data mapped
- Live distance to center of green, updates as you walk
- Par and handicap displayed per hole (when mapped in OSM)
- Tee distances sorted longest to shortest by actual hole yardage
  - Longest labeled "Back — XXX YD", shortest "Forward — XXX YD", middle shows yardage
  - Color-coded if colour tags available in OSM
- ‹ › hole navigation with wrap-around
- Auto-advance to next hole when standing near a tee box for 30 seconds (forward only, max one hole)
- YD/M unit toggle
- Keep Awake button
- Course and hole state survive page refresh

### Log Tab
- All measurements and routes saved to localStorage
- POINT TO POINT and ROUTE badges on each entry
- Tap to view detail — coordinates, elevation, accuracy, unit conversions
- Rename measurements
- View on Map — routes draw as yellow polyline, P2P as dashed cyan line
- Swipe left to delete, Clear all button
- Export JSON
- Measure tab pulses after a save to guide user back

### Help Tab
- Full documentation of all features including Route, Golf GPS, Keep Awake
- GPS accuracy explanation
- Troubleshooting

---

## Tech Stack

- Pure HTML/CSS/JS — single file, no framework
- [Leaflet.js](https://leafletjs.com/) v1.9.4 — map rendering
- OpenStreetMap + Esri satellite tiles
- Overpass API — golf course data
- Google Fonts: Syne, DM Sans, DM Mono
- Google Analytics: G-T4DWCLGW1X
- Google AdSense: ca-pub-7581999835206831
- Hosted on Netlify, deployed via GitHub

## Deploy Files

| File | Purpose |
|------|---------|
| `index.html` | The app |
| `privacy.html` | Privacy policy |
| `_redirects` | Netlify redirect: disttrkr.com → disttracker.com |
| `ads.txt` | AdSense authorization |

## Color Palette

| Token | Value |
|-------|-------|
| Background | `#141416` |
| Panel | `#1e2024` |
| Accent (cyan) | `#00e5ff` |
| Green | `#39ff14` |
| Red | `#ff3d71` |
| Gold (route/golf) | `#ffbe00` |

## localStorage Keys

| Key | Value |
|-----|-------|
| `disttrkr_v2` | Measurements + routes array + count |
| `disttrkr_speed` | fast / medium / slow |
| `disttrkr_unit` | yd / ft / mi / m / km |
| `disttrkr_welcomed` | First visit flag |
| `disttrkr_mode` | p2p / route |
| `disttrkr_trace` | Active route state (survives refresh) |
| `disttrkr_tab` | Last active tab |
| `disttrkr_golf` | Selected course + hole state |

## AdSense Slots

| Slot | ID |
|------|----|
| Top banner | 2829720222 |
| Bottom banner | 9231477043 |
| In-log rectangle | 3536297233 |

## Privacy

GPS data never leaves your device. Full privacy policy at [disttracker.com/privacy](https://disttracker.com/privacy).

---

© 2026 DIST TRKR
