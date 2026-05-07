# DIST TRKR — Changelog

---

## [v1.9.17] — 2026-05-07
### Changed
- Auto-advance now limited to next hole only — can never skip more than one hole at a time

## [v1.9.16]
### Added
- Auto-advance to next hole when standing within 20m of a tee box for 30 seconds
- Green notification bar shows countdown and confirmation
- Manual hole change cancels any pending auto-advance
- Forward only — never advances backwards

## [v1.9.15]
### Changed
- Tee labels: color name if OSM colour tag available, else Back/Forward/yardage
- Forward tee now shows yardage (e.g. "Forward — 312 YD")
- Middle tees labeled as "XXX YD to hole"
- Color styling restored when colour data is present

## [v1.9.14]
### Fixed
- Course list buttons not clickable — variable name collision (`holes` string shadowing `holes` array)

## [v1.9.13]
### Fixed
- Tee deduplication threshold tightened (11m → 3m) so distinct tee boxes no longer merge
### Changed
- Tees sorted longest to shortest by distance to green
- Back tee labeled "Back — XXX YD", Forward tee labeled "Forward", middle shows yardage

## [v1.9.12]
### Changed
- Removed color-based tee sorting — now sorts by actual distance to green (longest first)
- Universal approach works for any course regardless of color naming

## [v1.9.11]
### Added
- Tee matching now parses OSM name tags like "T10" → hole 10 as fallback when ref tag missing
- Par and handicap pulled from golf=hole ways and displayed under hole number
- golf=hole ways added to Overpass query
### Fixed
- Tee boxes now appear on all holes at Rochester CC (was only showing hole 1)

## [v1.9.10]
### Changed
- Log hint updated: "Tap to view · 👈 Swipe LEFT to delete"

## [v1.9.9]
### Added
- Measure tab pulses with cyan glow after any save (P2P or Route) to guide user back

## [v1.9.8]
### Changed
- Point to Point save now switches to Log tab (same as Route)
- Log hint updated

## [v1.9.7]
### Added
- Tab persistence — refresh returns to same tab
- Golf state persistence — selected course and hole survive refresh
- Route trace threshold bumped from 5m to 10m to filter GPS drift

## [v1.9.6]
### Changed
- Help tab fully rewritten to cover all current features: Route, Golf GPS, Keep Awake, Log badges, map view

## [v1.9.5]
### Fixed
- Logo now actually 25% smaller (was being overridden by CSS container width)

## [v1.9.4]
### Fixed
- Logo CSS container max-height corrected to 165px

## [v1.9.3]
### Changed
- Keep Awake moved to same row as speed toggle (P2P) and pause button (Route)
- All three Keep Awake buttons stay in sync

## [v1.9.2]
### Changed
- Logo reduced 25% in both header and welcome screen
- Keep Awake buttons more prominent — frosted background, larger padding

## [v1.9.1]
### Added
- Mode selector at top of Measure tab: Point to Point / Route
- Route mode layout with Start, Stop & Save, Pause buttons
- Active route state persists across page refresh (disttrkr_trace)
- Mode preference persisted (disttrkr_mode)
### Removed
- Old "Trace Route" section at bottom of measure screen

## [v1.9.0]
### Added
- Route tracing — records GPS points every 5m, totals distance as you walk
- Pause/resume route tracing
- Routes saved to Log with ROUTE badge
- Routes viewable on map as yellow polyline with Start/End markers
- POINT TO POINT badge on existing measurements
- Detail view adapts for route entries (point count, start/end coords)

## [v1.8.1]
### Added
- Golf tab between Measure and Log
- Find nearby courses via Overpass API (5km radius)
- Live distance to center of green
- Hole navigation with wrap-around (‹ ›)
- Tee distances with Back/Forward labels
- Par and handicap display
- YD/M unit toggle
- Keep Awake button on Golf tab
- Golf state and tab persist across refresh
- Auto-dim overlay after 10 seconds when Keep Awake active
- Wake Lock API integration

## [v1.8]
### Changed
- Moved "View on Map" button to between date/time and distance cards in detail view
- GitHub → Netlify auto-deploy configured (no more manual upload credits)
### Added
- ads.txt for AdSense verification

## [v1.7]
### Added
- Meters (M) and Kilometers (KM) unit options
- Feet (FT) unit button
- Clear log button (separate from Reset)
- Elevation change display (▲/▼)
### Fixed
- Log sort order — newest first on load and after new measurements

## [v1.6]
### Added
- Map view: OpenStreetMap + Esri satellite tile toggle
- Cyan/green pins, dashed line between points
- "View on Map" button in detail view

## [v1.5]
### Added
- GPS warmup buffer with sample counter on Set Point A button
- Set Point A disabled and pulsing during warmup, enables when ready
- Speed profiles: Fast, Medium, Accurate
- LIVE pill — tap to pause/resume live tracking
- First-visit welcome screen with GO button

## [v1.4]
### Added
- Measurement log with swipe-to-delete
- Detail view with coordinates, elevation, accuracy
- Rename measurements
- Export JSON
- Reset preserves log

## [v1.3]
### Added
- localStorage persistence
- Google Analytics
- AdSense ad slots
- SEO/OG meta tags

## [v1.2]
### Added
- Units: YD (default), FT, MI

## [v1.1]
### Added
- Leaflet.js map integration

## [v1.0] — Initial Release
### Added
- GPS point A to point B measurement
- Live distance tracking
- Single HTML file, Netlify deployment
