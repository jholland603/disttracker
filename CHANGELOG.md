# DIST TRKR — Changelog

All notable changes to this project are documented here.

---

## [v1.8] — 2026-05-06
### Changed
- Moved "View on Map" button to appear between date/time and the Distance cards in the detail view

---

## [v1.7]
### Added
- Meters (M) and Kilometers (KM) unit options
- Feet (FT) unit button
- Whole numbers for FT unit during live tracking
- Clear log button (separate from Reset)
- Elevation change display (▲/▼)
- OG title updated to "GPS Distance Tracker"

### Fixed
- Log sort order — newest first on load and after new measurements

---

## [v1.6]
### Added
- Map view: OpenStreetMap + Esri satellite tile toggle
- Cyan pin for Point A, green pin for Point B
- Dashed line between points on map
- Distance label bar on map screen
- "View on Map" button in measurement detail view

---

## [v1.5]
### Added
- GPS warmup buffer — begins collecting samples on page load
- Set Point A button shows live warmup count: "Set Point A (3/5)"
- Shows "Set Point A ✓" in green when buffer is ready
- Speed profiles: Fast, Medium, Accurate — persisted to localStorage
- LIVE pill — tap to pause/resume live tracking
- 3-second hold at zero after Point A locks
- First-visit welcome screen with GO button (triggers GPS permission)

---

## [v1.4]
### Added
- Measurement log with swipe-to-delete
- Tap log entry to view detail screen
- Detail view: coordinates, elevation, accuracy, samples, all unit conversions
- Rename measurements (tap name in detail view)
- Export measurements as JSON
- Reset only clears points — log is preserved

---

## [v1.3]
### Added
- localStorage persistence for measurements, unit preference, speed setting
- Google Analytics (G-T4DWCLGW1X)
- AdSense ad slots: top banner, bottom banner, in-log every 3rd entry
- SEO meta tags and OG tags
- Canonical URL

---

## [v1.2]
### Added
- Units: YD (default), FT, MI — user selectable, persisted
- Whole numbers for YD/FT/M during live tracking, decimals after Point B locks

---

## [v1.1]
### Added
- Leaflet.js map integration
- OpenStreetMap tile layer

---

## [v1.0] — Initial Release
### Added
- GPS point A to point B distance measurement
- Live distance tracking
- Single HTML file, no framework
- Netlify deployment with `_redirects` for disttrkr.com alias
