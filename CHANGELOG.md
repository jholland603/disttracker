# DIST TRKR — Changelog

---

## [v2.0.40] — 2026-05-11
### Changed
- Help tab Golf GPS section fully rewritten to cover all new features
- Log help section updated to mention GOLF badge and scorecard detail view

## [v2.0.39] — 2026-05-11
### Added
- Tap the dimmed par number to instantly record par with one tap
- Hint text updated to "TAP TO RECORD PAR" when hole is unscored
### Fixed
- Auto-par now fires correctly when tapping a scorecard cell to jump forward
- Front-9 auto-par fixed when starting on back 9 and looping

## [v2.0.38] — 2026-05-11
### Fixed
- Back button and View Hole button showing raw unicode escape sequences (Python encoding bug)

## [v2.0.37] — 2026-05-11
### Changed
- Removed background map from detail card overlay (was unreliable, not worth complexity)
- Detail card restored to clean dark overlay with full height
- View Hole button opens satellite map as before

## [v2.0.34] — 2026-05-11
### Added
- Custom Yes/No confirm modal replaces browser confirm() dialogs throughout finish round flow
- Finish Round, Save Round, and par review now use styled modal with Yes/No buttons

## [v2.0.33] — 2026-05-11
### Fixed
- golfStartHole and golfHasLooped now saved and restored from localStorage — fixes -36 bug on page refresh
- Sparse array null pollution fixed: null entries in restored golfScores no longer treated as score 0

## [v2.0.32] — 2026-05-10
### Changed
- Detail card background semi-transparent with backdrop blur (frosted glass effect)
- Map visible behind card when background map is active

## [v2.0.29] — 2026-05-10
### Changed
- Distance number wrapped in subtle tappable card with faint border and TAP FOR DETAILS hint
- Background map removed from main hole screen (was decorative, now only in detail/map views)

## [v2.0.28] — 2026-05-10
### Added
- Satellite map visible as background behind hole detail card
- View Hole button opens full interactive map
- Two distances shown on pin drop: FROM YOU and TO GREEN
- Back arrow (‹ Back) replaces ✕ close button on both detail card and map — upper-left iOS standard placement

## [v2.0.27] — 2026-05-10
### Changed
- Tee box icons in detail card changed from ⛳ emoji to colored circles matching tee color

## [v2.0.26] — 2026-05-10
### Fixed
- Pin anchor set to tip (bottom point) of triangle so measurement is from exact pin position

## [v2.0.25] — 2026-05-10
### Changed
- Measure pin enlarged 2.5x (8×20px → 20×50px) with stronger glow

## [v2.0.24] — 2026-05-10
### Added
- Tap-to-measure on satellite hole map: drop a pin, see distance in bottom bar
- Drag pin for live distance updates
- Distance bar shows FROM YOU and TO GREEN simultaneously

## [v2.0.23] — 2026-05-10
### Fixed
- Satellite hole map now fits to hole features only (green, tees, hazards) — no longer zooms to show player's home location

## [v2.0.22] — 2026-05-10
### Added
- 🛰️ View Hole button at bottom of detail card
- Full-screen satellite hole map (Esri World Imagery) showing green polygon, hazard polygons, color-coded tee markers, player position

## [v2.0.21] — 2026-05-10
### Changed
- Detail card green distances reordered: Back of green on top, Center (large), Front below

## [v2.0.20] — 2026-05-10
### Fixed
- Detail card header (‹ Back + title) now sticky — stays visible when scrolling long detail lists
- Only the items list scrolls, not the whole card

## [v2.0.19] — 2026-05-10
### Changed
- Tee box label and hole yardage font changed to match other card labels (var(--sans), 13px, mid color)

## [v2.0.18] — 2026-05-10
### Changed
- Center of green card shows bare number only (no YD label)
- Tee label and hole yardage shrunk to 13px

## [v2.0.17] — 2026-05-10
### Changed
- Hazard distance format: "TO — 142 YD" / "CARRY — 158 YD" with small gray prefix and large bold number
- Center of green card enlarged (48px font, cyan tint background)
- Tee boxes moved to bottom of detail card
- Hazards now appear before tee boxes
- Tee rows show hole yardage on left and distance from player on right

## [v2.0.16] — 2026-05-10
### Changed
- Detail card order: green distances → hazards → tee boxes
- Tee boxes sorted shortest to longest
- Distance from player shown on each tee row

## [v2.0.15] — 2026-05-10
### Changed
- Tee detail rows simplified: color name + yardage only, sorted shortest to longest
- Removed "from you" label and DRIVE prefix

## [v2.0.14] — 2026-05-10
### Fixed
- Tee coordinates now correctly extracted from polygon geometry (out geom tags)
- Auto-advance working again (tee lat/lon was undefined after Overpass query change)
- Auto-par guard fixed for post-loop holes: (golfHasLooped || prevHole >= golfStartHole)

## [v2.0.13] — 2026-05-10
### Fixed
- Scorecard row cells use flex:1 1 0 to prevent collapse into vertical stack
- Detail card close: pointer-events inheritance issue fully resolved

## [v2.0.12] — 2026-05-10
### Fixed
- Scorecard two-row layout: row divs given width:100% so cells fill correctly
- Detail card ✕ button: event.stopPropagation added directly to button

## [v2.0.11] — 2026-05-10
### Fixed
- golfHoleDetail overlay no longer blocks taps when hidden (pointer-events:none)

## [v2.0.10] — 2026-05-10
### Changed
- "TAP FOR HOLE DETAILS" hint added below distance unit label

## [v2.0.9] — 2026-05-10
### Fixed
- Over/under -36 bug: added golfHasLooped flag; running total excludes pre-start holes until player loops
- golfHasLooped set when 18→1 wraparound fires
### Changed
- Hole number enlarged to 72px, colored cyan with glow — visually distinct from score counter

## [v2.0.8] — 2026-05-10
### Changed
- Scorecard split into two rows: holes 1–9 on top, 10–18 on bottom
- Holes before golfStartHole that are unplayed render at 30% opacity

## [v2.0.7] — 2026-05-10
### Added
- 18→1 wraparound auto-advance for split-start rounds (starting hole other than 1)
- Assumed par review modal when finishing with 8 or 17 holes recorded — shows par-scored holes with +/− adjusters before saving

## [v2.0.6] — 2026-05-10
### Changed
- Tee distances moved from main hole screen into Hole Details card
- Scorecard strip larger cells, more padding

## [v2.0.5] — 2026-05-10
### Changed
- greenGeometry stored on hole objects for front/back distance calculation
- Hole detail card: front, center (large), back of green; hazards with TO/CARRY; tee boxes at bottom
- Hazard distances use TO/CARRY format

## [v2.0.4] — 2026-05-10
### Added
- Hole detail card: tap distance number to open
- Front / center / back of green distances
- Hazard distances (TO and CARRY) from current position
- Tap backdrop or ✕ to close; back button support
- Overpass query expanded to fetch bunker, water_hazard, lateral_water_hazard, fairway polygons
- Hazards spatially assigned to nearest hole green

## [v2.0.3] — 2026-05-10
### Added
- Weather widget in Golf top bar (between Keep Awake and YD toggle)
- Shows current conditions (icon + temp) using Open-Meteo API (free, no key)
- Tap for 12-hour hourly forecast modal
- Fetches once per session using existing GPS position — no extra battery use

## [v2.0.2] — 2026-05-10
### Added
- Finish round saves to Log with full scorecard
- Golf log entries show green GOLF badge, score vs par, holes played
- Detail view shows round summary + per-hole scorecard with relative scores

## [v2.0.1] — 2026-05-10
### Fixed
- golfStartHole tracked — running total excludes pre-start holes (fixes -36 on back-9 start)
- Auto-fill par guarded by golfStartHole index

## [v2.0.0] — 2026-05-10
### Changed
- CSS extracted to styles.css, JavaScript extracted to app.js (later re-inlined for cache reliability)
- Logo hidden on mobile screens (max-width: 480px)

---

## [v1.9.59] — 2026-05-08
### Added
- Starting hole selector shown after course loads
- 2-column grid (1–9 left, 10–18 right)
- Tapping a hole starts round on that hole; golfScores reset
### Changed
- Version bump to v1.9.59

## [v1.9.58] — 2026-05-07
### Changed
- golfHoles clamped to 18 in buildCourseHoles

## [v1.9.57] — 2026-05-07
### Fixed
- Golf inner content div made scrollable

## [v1.9.56] — 2026-05-07
### Changed
- Scorecard strip capped at 18 holes
- Golf tab restores hole view correctly on return

## [v1.9.55] — 2026-05-07
### Changed
- Score colors in scorecard strip brightened

## [v1.9.54] — 2026-05-07
### Changed
- Course search is a single instant query
- Scorecard strip repositioned

## [v1.9.53] — 2026-05-07
### Added
- Scrollable scorecard strip with SVG score markings (circles/squares)

## [v1.9.52] — 2026-05-07
### Changed
- "Courses" renamed to "Finish Round"
- Confirmation shows round summary
- Par auto-recorded on hole advance

## [v1.9.51] — 2026-05-07
### Changed
- Per-course Overpass query by OSM element ID
- buildCourseHoles extracted as separate function

## [v1.9.50] — 2026-05-07
### Changed
- All courses shown, sorted by distance
- Greens filtered by proximity at selection

## [v1.9.49] — 2026-05-07
### Changed
- Round total reformatted: diff first, then holes, then strokes

## [v1.9.48] — 2026-05-07
### Fixed
- Running total handles sparse score array correctly

## [v1.9.47–v1.9.43] — 2026-05-07
### Various
- Fallback radius tweaks, par string/number fix, score counter added, tee sorting/labeling

## [v1.9.42] — 2026-05-07
### Changed
- Hole navigation no longer wraps; arrows dim at boundaries

## [v1.9.41–v1.9.16] — 2026-05-07
### Various
- Auto-advance, tee color coding, warmup independence, tab persistence, route improvements

## [v1.8.1] — Golf tab initial release
## [v1.0–v1.8] — Core measurement features
