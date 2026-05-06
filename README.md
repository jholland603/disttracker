# DIST TRKR — GPS Distance Tracker

A GPS point-to-point distance measurement web app. Measure yards, feet, miles, meters, or kilometers by walking from Point A to Point B.

**Live at:** [disttracker.com](https://disttracker.com)

---

## Features

- GPS point A to point B distance measurement
- Live distance tracking — updates as you walk
- GPS averaging with speed profiles (Fast / Medium / Accurate)
- Units: YD (default), FT, MI, M, KM — persisted across sessions
- Measurement log with swipe-to-delete and tap to view detail
- Rename measurements, view coordinates, elevation, and accuracy
- Map view with OpenStreetMap + Esri satellite toggle
- Export measurements as JSON
- First-visit welcome screen with GPS permission prompt
- Google Analytics + AdSense integration
- Full localStorage persistence

## Tech Stack

- Pure HTML/CSS/JS — single file, no framework
- [Leaflet.js](https://leafletjs.com/) v1.9.4 — map rendering
- OpenStreetMap + Esri satellite tiles
- Google Fonts: Syne, DM Sans, DM Mono
- Hosted on Netlify, deployed via GitHub

## Deploy Files

Always deploy these files together:

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

## Local Storage Keys

| Key | Value |
|-----|-------|
| `disttrkr_v2` | Measurements array + count |
| `disttrkr_speed` | fast / medium / slow |
| `disttrkr_unit` | yd / ft / mi / m / km |
| `disttrkr_welcomed` | First visit flag |

## Privacy

GPS data never leaves your device. Full privacy policy at [disttracker.com/privacy](https://disttracker.com/privacy).

---

© 2026 DIST TRKR
