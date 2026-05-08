// ── STATE ──────────────────────────────────────────────────
let pointA      = null;
let unit        = 'yd';
let measurements = [];
let measureCount = 0;
let liveWatchId  = null;
let gpsReady     = false; // set true after welcome dismissed or returning user
let currentDetailId = null;
let prevTab     = 'measure';
let touchStartX = 0;
let touchStartY = 0;
let acquiringPoint = false; // suppress live display while locking a point

const unitLabels   = { yd: 'Yards', ft: 'Feet', mi: 'Miles', m: 'Meters', km: 'Kilometers' };
const unitDecimals = { yd: 1, ft: 0, mi: 3, m: 0, km: 3 };
const unitDecimalsLive = { yd: 0, ft: 0, mi: 3, m: 0, km: 3 };

function fmt(m, live = false) {
  const dec = live ? unitDecimalsLive[unit] : unitDecimals[unit];
  return metersTo(m, unit).toFixed(dec);
}

// ── SPEED PROFILES ─────────────────────────────────────────
const SPEED_PROFILES = {
  fast:   { minSamples: 3,  maxAccuracy: 25, window: 4000  },
  medium: { minSamples: 5,  maxAccuracy: 15, window: 8000  },
  slow:   { minSamples: 10, maxAccuracy: 8,  window: 15000 },
};

const SPEED_ORDER = ['fast', 'medium', 'slow'];
const SPEED_LABELS = {
  fast:   '⚡ Fast Lock',
  medium: '⏱ Medium Lock',
  slow:   '🎯 Accurate Lock',
};
const SPEED_MSGS = {
  fast:   'Locks in quickly. Best when you already have a strong outdoor signal. Less accurate on weak signals.',
  medium: 'Balanced. Takes a bit longer but filters out poor readings for a more reliable result.',
  slow:   'Most accurate. Takes longer — worth it for golf yardages, property lines, or any precision measurement.',
};
let currentSpeed = 'fast';
let msgTimer = null;

function cycleSpeed() {
  const idx = SPEED_ORDER.indexOf(currentSpeed);
  currentSpeed = SPEED_ORDER[(idx + 1) % SPEED_ORDER.length];

  const btn = document.getElementById('speedToggleBtn');
  const msg = document.getElementById('speedToggleMsg');

  btn.textContent = SPEED_LABELS[currentSpeed];
  btn.className = 'speed-toggle-btn speed-' + currentSpeed;

  // show message briefly then hide
  msg.textContent = SPEED_MSGS[currentSpeed];
  msg.classList.add('visible');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => msg.classList.remove('visible'), 3500);
  localStorage.setItem('disttrkr_speed', currentSpeed);
  // Clear P2P buffer — refill at new accuracy threshold
  p2pWarmupBuffer = [];
}

function initSpeed() {
  const btn = document.getElementById('speedToggleBtn');
  btn.textContent = SPEED_LABELS[currentSpeed];
  btn.className = 'speed-toggle-btn speed-' + currentSpeed;
  // Apply saved unit chip to all three chip sets
  ['yd','ft','mi','m','km'].forEach(x => {
    const cap = x.charAt(0).toUpperCase() + x.slice(1);
    const p2p   = document.getElementById('chip'  + cap);
    const route = document.getElementById('rChip' + cap);
    const log   = document.getElementById('lChip' + cap);
    if (p2p)   p2p.classList.toggle('active',   x === unit);
    if (route) route.classList.toggle('active',  x === unit);
    if (log)   log.classList.toggle('active',    x === unit);
  });
}

// ── UTILS ──────────────────────────────────────────────────
function metersTo(m, u) {
  if (u === 'mi') return m / 1609.344;
  if (u === 'yd') return m / 0.9144;
  if (u === 'ft') return m * 3.28084;
  if (u === 'km') return m / 1000;
  return m; // meters
}
function setDistDisplay(meters, isLive) {
  if (acquiringPoint) return;
  const el = document.getElementById('distNum');
  el.textContent = fmt(meters, isLive);
  el.classList.remove('zero','live');
  if (isLive) el.classList.add('live');
}

function haversine(la1, lo1, la2, lo2) {
  const R = 6371000, r = x => x * Math.PI / 180;
  const dLa = r(la2-la1), dLo = r(lo2-lo1);
  const a = Math.sin(dLa/2)**2 + Math.cos(r(la1))*Math.cos(r(la2))*Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── UNIT TOGGLE ────────────────────────────────────────────
function setUnit(u) {
  unit = u;
  // Sync all three sets of unit chips: P2P, Route, Log
  ['yd','ft','mi','m','km'].forEach(x => {
    const cap = x.charAt(0).toUpperCase() + x.slice(1);
    const p2p   = document.getElementById('chip'  + cap);
    const route = document.getElementById('rChip' + cap);
    const log   = document.getElementById('lChip' + cap);
    if (p2p)   p2p.classList.toggle('active',   x === u);
    if (route) route.classList.toggle('active',  x === u);
    if (log)   log.classList.toggle('active',    x === u);
  });
  localStorage.setItem('disttrkr_unit', u);
  // Update Measure hero display
  if (measurements.length > 0) {
    const last = measurements[measurements.length-1].meters;
    setDistDisplay(last, liveWatchId !== null);
  }
  // Rebuild log list so all distances re-render in new unit
  rebuildLog();
  // If detail screen is open, refresh its hero distance + unit label
  if (document.getElementById('screenDetail').classList.contains('active') && currentDetailId !== null) {
    const m = measurements.find(x => x.id === currentDetailId);
    if (m) {
      document.getElementById('detailDist').textContent = fmt(m.meters);
      document.getElementById('detailUnit').textContent = unitLabels[unit];
    }
  }
}

// ── STATUS ─────────────────────────────────────────────────
function setStatus(msg, state) {
  const el = document.getElementById('heroStatus');
  el.textContent = msg;
  el.className = 'hero-status';
  if (state) el.classList.add(state + '-state');
}

// ── GPS WARM-UP — P2P ──────────────────────────────────────
let p2pWarmupWatchId = null;
let p2pWarmupBuffer  = [];
const WARMUP_MAX = 20;

function startP2PWarmup() {
  if (!gpsReady) return;
  if (!navigator.geolocation) return;
  if (p2pWarmupWatchId !== null) return;
  setStatus('GPS warming up…', null);
  p2pWarmupWatchId = navigator.geolocation.watchPosition(
    pos => {
      const maxAcc = SPEED_PROFILES[currentSpeed].maxAccuracy;
      if (pos.coords.accuracy <= maxAcc) {
        p2pWarmupBuffer.push({
          lat: pos.coords.latitude, lon: pos.coords.longitude,
          alt: pos.coords.altitude, acc: pos.coords.accuracy, ts: Date.now()
        });
        if (p2pWarmupBuffer.length > WARMUP_MAX) p2pWarmupBuffer.shift();
      }
      if (!pointA && !acquiringPoint) {
        const profile = SPEED_PROFILES[currentSpeed];
        const good = p2pWarmupBuffer.filter(p => p.acc <= profile.maxAccuracy).length;
        const btn = document.getElementById('btnA');
        if (good >= profile.minSamples) {
          if (measureMode === 'p2p') setStatus('GPS ready — tap Set Point A', 'ok');
          if (btn && btn.textContent !== 'Point A ✓') {
            btn.textContent = 'Set Point A';
            btn.className = 'point-btn btn-a';
            btn.style.borderColor = '';
            btn.disabled = false;
          }
        } else {
          if (measureMode === 'p2p') setStatus('GPS warming up… ' + good + '/' + profile.minSamples + ' samples', null);
          if (btn && btn.textContent !== 'Point A ✓') {
            btn.textContent = 'Set Point A (' + good + '/' + profile.minSamples + ')';
            btn.className = 'point-btn btn-a-warmup';
            btn.disabled = true;
          }
        }
      }
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 0 }
  );
}

function stopP2PWarmup() {
  if (p2pWarmupWatchId !== null) {
    navigator.geolocation.clearWatch(p2pWarmupWatchId);
    p2pWarmupWatchId = null;
  }
}

function getP2PWarmupPosition(minSamples, maxAccuracy) {
  const good = p2pWarmupBuffer.filter(p => p.acc <= maxAccuracy);
  if (good.length < minSamples) return null;
  const recent = good.slice(-minSamples);
  const lat = recent.reduce((s,p)=>s+p.lat,0)/recent.length;
  const lon = recent.reduce((s,p)=>s+p.lon,0)/recent.length;
  const alts = recent.filter(p=>p.alt!==null).map(p=>p.alt);
  const alt = alts.length ? alts.reduce((s,a)=>s+a,0)/alts.length : null;
  const acc = recent.reduce((s,p)=>s+p.acc,0)/recent.length;
  return { lat, lon, alt, acc, n: recent.length };
}

// ── GPS WARM-UP — ROUTE ────────────────────────────────────
let routeWarmupWatchId = null;
let routeWarmupBuffer  = [];

function startRouteWarmup() {
  if (!gpsReady) return;
  if (!navigator.geolocation) return;
  if (routeWarmupWatchId !== null) return;
  routeWarmupWatchId = navigator.geolocation.watchPosition(
    pos => {
      // Route warmup uses fast profile — just needs a quick ready lock
      const maxAcc = SPEED_PROFILES['fast'].maxAccuracy;
      if (pos.coords.accuracy <= maxAcc) {
        routeWarmupBuffer.push({
          lat: pos.coords.latitude, lon: pos.coords.longitude,
          alt: pos.coords.altitude, acc: pos.coords.accuracy, ts: Date.now()
        });
        if (routeWarmupBuffer.length > WARMUP_MAX) routeWarmupBuffer.shift();
      }
      if (!traceActive) syncRouteStartButton();
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 0 }
  );
}

function stopRouteWarmup() {
  if (routeWarmupWatchId !== null) {
    navigator.geolocation.clearWatch(routeWarmupWatchId);
    routeWarmupWatchId = null;
  }
}

function syncRouteStartButton() {
  if (traceActive) return;
  const btn = document.getElementById('routeBtnStart');
  if (!btn) return;
  if (btn.className.includes('btn-a-done')) return;
  const good = routeWarmupBuffer.filter(p => p.acc <= SPEED_PROFILES['fast'].maxAccuracy).length;
  const needed = SPEED_PROFILES['fast'].minSamples;
  if (good >= needed) {
    btn.textContent = 'Start';
    btn.className   = 'point-btn btn-a';
    btn.disabled    = false;
  } else {
    btn.textContent = 'Start (' + good + '/' + needed + ')';
    btn.className   = 'point-btn btn-a-warmup';
    btn.disabled    = true;
  }
}

// Legacy aliases so existing call sites keep working
function startWarmup()  { startP2PWarmup(); startRouteWarmup(); }
function stopWarmup()   { stopP2PWarmup();  stopRouteWarmup();  }
const warmupBuffer = { _unused: true }; // prevent accidental use

// ── GPS AVERAGING ──────────────────────────────────────────
function acquirePosition(onSuccess, onError) {
  const profile = SPEED_PROFILES[currentSpeed];
  const { minSamples, maxAccuracy, window: windowMs } = profile;

  // Check P2P warmup buffer first — if we have enough good samples, use them instantly
  const warmupPos = getP2PWarmupPosition(minSamples, maxAccuracy);
  if (warmupPos) {
    setStatus('GPS ready (' + warmupPos.n + ' samples buffered)', 'live');
    setTimeout(() => onSuccess(warmupPos), 100); // tiny delay for UX feedback
    return { cancel: () => {} };
  }

  // Otherwise fall back to live collection
  const samples = [];
  let watchId = null, timer = null, done = false;

  function finish() {
    if (done) return;
    done = true;
    navigator.geolocation.clearWatch(watchId);
    clearTimeout(timer);
    if (!samples.length) { onError({code:2}); return; }
    const lat = samples.reduce((s,p)=>s+p.lat,0)/samples.length;
    const lon = samples.reduce((s,p)=>s+p.lon,0)/samples.length;
    const alts = samples.filter(p=>p.alt!==null).map(p=>p.alt);
    const alt = alts.length ? alts.reduce((s,a)=>s+a,0)/alts.length : null;
    const acc = samples.reduce((s,p)=>s+p.acc,0)/samples.length;
    onSuccess({lat,lon,alt,acc,n:samples.length});
  }

  watchId = navigator.geolocation.watchPosition(
    pos => {
      const acc = pos.coords.accuracy;
      if (acc <= maxAccuracy) {
        samples.push({lat:pos.coords.latitude,lon:pos.coords.longitude,alt:pos.coords.altitude,acc});
        setStatus('Collecting… ' + samples.length + '/' + minSamples + ' (±' + Math.round(acc*3.28084) + ' ft)', 'live');
      } else {
        setStatus('Waiting for signal… ±' + Math.round(acc*3.28084) + ' ft — try outdoors', null);
      }
      if (samples.length >= minSamples) finish();
    },
    err => { if (!done) { done=true; clearTimeout(timer); onError(err); } },
    {enableHighAccuracy:true, timeout:30000, maximumAge:0}
  );
  timer = setTimeout(() => { if (!done) finish(); }, windowMs);
}

// ── LIVE TRACKING ──────────────────────────────────────────
function startLive() {
  if (!navigator.geolocation) return;
  stopLive();
  document.getElementById('livePill').classList.add('visible');

  // Light up green immediately at 0
  const el = document.getElementById('distNum');
  el.textContent = '0';
  el.classList.remove('zero');
  el.classList.add('live');

  const liveStart = Date.now();
  liveWatchId = navigator.geolocation.watchPosition(
    pos => {
      if (!pointA) return;
      if (Date.now() - liveStart < 3000) return; // hold at 0 for 3 seconds
      const d = haversine(pointA.lat, pointA.lon, pos.coords.latitude, pos.coords.longitude);
      setDistDisplay(d, true);
      setStatus('Updating live — tap Set Point B to lock', 'live');
    },
    ()=>{},
    {enableHighAccuracy:true, maximumAge:2000}
  );
}

let livePaused = false;

function toggleLive() {
  if (!pointA) return; // nothing to toggle without Point A
  if (livePaused) {
    livePaused = false;
    document.getElementById('livePill').classList.remove('paused');
    startLive();
    setStatus('Live tracking resumed', 'live');
  } else {
    livePaused = true;
    stopLive();
    document.getElementById('livePill').classList.add('visible');
    document.getElementById('livePill').classList.add('paused');
    setStatus('Live paused — tap LIVE to resume', 'ok');
  }
}

function stopLive() {
  if (liveWatchId !== null) { navigator.geolocation.clearWatch(liveWatchId); liveWatchId = null; }
  document.getElementById('livePill').classList.remove('visible');
  document.getElementById('distNum').classList.remove('live');
}

// ── SET POINT A ────────────────────────────────────────────
function setPointA() {
  if (!navigator.geolocation) { setStatus('GPS not supported in this browser', 'error'); return; }
  stopLive();
  acquiringPoint = true;

  const isRetap = !!pointA; // true if re-tapping after a previous measurement
  if (pointA) pointA = null;

  // Reset display to zero immediately on tap
  const el = document.getElementById('distNum');
  el.textContent = '0';
  el.className = 'distance-number zero';

  const btn = document.getElementById('btnA');
  btn.style.borderColor = '';

  // Try warmup buffer first — use relaxed threshold on re-tap since GPS is already running
  const profile = SPEED_PROFILES[currentSpeed];
  const fastProfile = SPEED_PROFILES['fast'];
  const checkSamples  = isRetap ? fastProfile.minSamples  : profile.minSamples;
  const checkAccuracy = isRetap ? fastProfile.maxAccuracy : profile.maxAccuracy;
  const warmupPos = getP2PWarmupPosition(checkSamples, checkAccuracy);

  if (warmupPos) {
    btn.textContent = 'Locating…';
    btn.className = 'point-btn btn-a-loading';
    btn.disabled = true;
    document.getElementById('btnB').disabled = true;
    setStatus('GPS ready (' + warmupPos.n + ' samples buffered)', 'live');
    setTimeout(() => {
      pointA = warmupPos;
      document.getElementById('aCoords').textContent = warmupPos.lat.toFixed(5) + ', ' + warmupPos.lon.toFixed(5);
      document.getElementById('aCoords').className = 'point-coords set-a';
      const accEl = document.getElementById('aAcc');
      accEl.textContent = '±' + Math.round(warmupPos.acc*3.28084) + ' ft · ' + warmupPos.n + ' samples';
      accEl.className = 'point-acc visible';
      document.getElementById('cardA').className = 'point-card set-a';
      btn.textContent = 'Point A ✓';
      btn.className = 'point-btn btn-a-done';
      btn.disabled = false;
      document.getElementById('btnB').disabled = false;
      acquiringPoint = false;
      setStatus('Point A set — move to Point B', 'ok');
      p2pWarmupBuffer = [];
      startP2PWarmup();
      startLive();
      saveP2PState();
    }, 100);
    return;
  }

  // Fall back to full acquire if buffer insufficient
  btn.textContent = 'Locating…';
  btn.className = 'point-btn btn-a-loading';
  btn.disabled = true;
  document.getElementById('btnB').disabled = true;
  setStatus('Waiting for GPS signal…', null);

  acquirePosition(
    pos => {
      pointA = pos;
      document.getElementById('aCoords').textContent = pos.lat.toFixed(5) + ', ' + pos.lon.toFixed(5);
      document.getElementById('aCoords').className = 'point-coords set-a';
      const accEl = document.getElementById('aAcc');
      accEl.textContent = '±' + Math.round(pos.acc*3.28084) + ' ft · ' + pos.n + ' samples';
      accEl.className = 'point-acc visible';
      document.getElementById('cardA').className = 'point-card set-a';
      btn.textContent = 'Point A ✓';
      btn.className = 'point-btn btn-a-done';
      btn.disabled = false;
      document.getElementById('btnB').disabled = false;
      acquiringPoint = false;
      setStatus('Point A set — move to Point B', 'ok');
      p2pWarmupBuffer = []; // clear — start fresh for Point B
      startP2PWarmup();     // collect for Point B immediately
      startLive();
      saveP2PState();
    },
    err => {
      acquiringPoint = false;
      btn.textContent = 'Set Point A';
      btn.className = 'point-btn btn-a';
      btn.disabled = false;
      const msgs = {1:'Location permission denied',2:'Position unavailable — try outdoors',3:'GPS timed out — tap to retry'};
      setStatus(msgs[err.code]||'GPS error — try again', 'error');
    }
  );
}

// ── SET POINT B ────────────────────────────────────────────
function setPointB() {
  if (!pointA || !navigator.geolocation) return;
  stopLive();
  acquiringPoint = true;

  const btn = document.getElementById('btnB');
  btn.textContent = 'Locating…';
  btn.className = 'point-btn btn-b-loading';
  btn.disabled = true;
  setStatus('Locking Point B…', null);

  acquirePosition(
    pos => {
      document.getElementById('bCoords').textContent = pos.lat.toFixed(5) + ', ' + pos.lon.toFixed(5);
      document.getElementById('bCoords').className = 'point-coords set-b';
      const accEl = document.getElementById('bAcc');
      accEl.textContent = '±' + Math.round(pos.acc*3.28084) + ' ft · ' + pos.n + ' samples';
      accEl.className = 'point-acc visible';
      document.getElementById('cardB').className = 'point-card set-b';

      const meters = haversine(pointA.lat, pointA.lon, pos.lat, pos.lon);
      setDistDisplay(meters, false);

      // Elevation change
      let elevNote = '';
      if (pointA.alt !== null && pos.alt !== null) {
        const df = ((pos.alt - pointA.alt) * 3.28084).toFixed(0);
        elevNote = (df > 0 ? ' ▲ +' : df < 0 ? ' ▼ ' : ' — ') + df + ' ft elev';
      }

      measureCount++;
      const now  = new Date();
      const time = now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const date = now.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});
      const name = 'Measurement ' + measureCount;
      const entry = {id:measureCount, name, meters, pointA:{...pointA}, pointB:{...pos}, time, date};
      measurements.push(entry);
      saveToStorage();
      addLogRow(entry);

      btn.textContent = 'Set Point B';
      btn.className = 'point-btn btn-b';
      btn.disabled = false;
      acquiringPoint = false;
      setStatus('✓ Saved to Log — ' + fmt(meters) + ' ' + unitLabels[unit].toLowerCase() + elevNote, 'ok');
      pulseLogTab();

      // restart live from same Point A
      startLive();
      saveP2PState(); // Point A still set, live restarted
    },
    err => {
      btn.textContent = 'Set Point B';
      btn.className = 'point-btn btn-b';
      btn.disabled = false;
      acquiringPoint = false;
      const msgs = {1:'Permission denied',2:'Position unavailable',3:'Timed out — tap retry'};
      setStatus(msgs[err.code]||'GPS error', 'error');
      startLive();
    }
  );
}

// ── RESET POINTS ONLY ──────────────────────────────────────
function resetAll() {
  stopLive();
  livePaused = false;
  liveAutoPaused = false;
  acquiringPoint = false;
  pointA = null;
  clearP2PState();

  const el = document.getElementById('distNum');
  el.textContent = '0'; el.className = 'distance-number zero';

  document.getElementById('btnA').textContent = 'Set Point A';
  document.getElementById('btnA').className = 'point-btn btn-a-warmup';
  document.getElementById('btnA').disabled = true;
  stopP2PWarmup();
  p2pWarmupBuffer = [];
  startP2PWarmup();
  document.getElementById('btnB').textContent = 'Set Point B';
  document.getElementById('btnB').className = 'point-btn btn-b';
  document.getElementById('btnB').disabled = true;

  document.getElementById('aCoords').textContent = '—';
  document.getElementById('aCoords').className = 'point-coords';
  document.getElementById('aAcc').textContent = '';
  document.getElementById('aAcc').className = 'point-acc';
  document.getElementById('bCoords').textContent = 'Move and tap to lock';
  document.getElementById('bCoords').className = 'point-coords';
  document.getElementById('bAcc').textContent = '';
  document.getElementById('bAcc').className = 'point-acc';
  document.getElementById('cardA').className = 'point-card';
  document.getElementById('cardB').className = 'point-card';

  setStatus('Tap Set Point A to begin', null);
}

// ── CLEAR LOG ──────────────────────────────────────────────
function clearLog() {
  if (!measurements.length) return;
  if (!confirm('Clear all saved measurements? This cannot be undone.')) return;
  measurements = []; measureCount = 0;
  saveToStorage();
  rebuildLog();
}

// ── LOG ────────────────────────────────────────────────────
function addLogRow(entry) {
  const empty = document.getElementById('logEmpty');
  if (empty) empty.remove();

  const wrap = document.createElement('div');
  wrap.className = 'log-item-wrap';
  wrap.dataset.id = entry.id;

  const del = document.createElement('div');
  del.className = 'log-item-delete-bg';
  del.innerHTML = '<span>Delete</span>';
  del.onclick = () => deleteEntry(entry.id);

  const item = document.createElement('div');
  item.className = 'log-item';
  item.innerHTML = `
    <div class="log-num">#${String(entry.id).padStart(2,'0')}</div>
    <div class="log-info">
      <div class="log-name">${entry.name}</div>
      <div class="log-meta">
        <span style="font-family:var(--mono);font-size:9px;letter-spacing:1px;padding:1px 5px;border-radius:4px;margin-right:5px;${entry.type==='route' ? 'background:rgba(255,190,0,0.15);color:#ffbe00;border:1px solid rgba(255,190,0,0.3);' : 'background:rgba(0,229,255,0.1);color:var(--accent);border:1px solid rgba(0,229,255,0.2);'}">${entry.type==='route' ? 'ROUTE' : 'POINT TO POINT'}</span>${entry.date} · ${entry.time}
      </div>
    </div>
    <div class="log-dist-wrap">
      <div class="log-dist">${fmt(entry.meters)}</div>
      <div class="log-dist-unit">${unitLabels[unit].toLowerCase()}</div>
    </div>
    <div class="log-chevron">›</div>`;
  item.onclick = () => openDetail(entry.id);

  // swipe to reveal delete
  let tx = 0, startX = 0, startY = 0, swiping = false;
  item.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    swiping = false;
  }, {passive:true});
  item.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!swiping && Math.abs(dy) > Math.abs(dx)) return;
    swiping = true;
    tx = Math.max(-80, Math.min(0, dx));
    item.style.transform = `translateX(${tx}px)`;
    item.style.transition = 'none';
  }, {passive:true});
  item.addEventListener('touchend', () => {
    item.style.transition = 'transform 0.2s ease';
    if (tx < -40) { item.style.transform = 'translateX(-80px)'; item.classList.add('swiped'); }
    else { item.style.transform = 'translateX(0)'; item.classList.remove('swiped'); }
    tx = 0;
  });

  wrap.appendChild(del);
  wrap.appendChild(item);
  const list = document.getElementById('logList');
  list.insertBefore(wrap, list.firstChild);

  // ── IN-LOG AD after every 3rd measurement ──────────────
  // Replace ca-pub-7581999835206831 and 3536297233 with your AdSense values
  if (entry.id % 3 === 0) {
    const adWrap = document.createElement('div');
    adWrap.className = 'ad-in-log';
    adWrap.dataset.adFor = entry.id;
    adWrap.innerHTML = `
      <span class="ad-in-log-label">advertisement</span>
      <ins class="adsbygoogle"
           style="display:block;width:300px;height:100px;"
           data-ad-client="ca-pub-7581999835206831"
           data-ad-slot="3536297233"
           data-ad-format="rectangle"></ins>`;
    list.insertBefore(adWrap, list.firstChild);
    try { (adsbygoogle = window.adsbygoogle || []).push({}); } catch(e) {}
  }
}

function rebuildLog() {
  const list = document.getElementById('logList');
  list.innerHTML = '';
  if (!measurements.length) {
    const e = document.createElement('div');
    e.className = 'log-empty'; e.id = 'logEmpty'; e.textContent = 'No measurements yet';
    list.appendChild(e);
    return;
  }
  // Newest first — reverse and append directly (don't use addLogRow which inserts at top)
  [...measurements].reverse().forEach(entry => {
    const wrap = document.createElement('div');
    wrap.className = 'log-item-wrap';
    wrap.dataset.id = entry.id;

    const del = document.createElement('div');
    del.className = 'log-item-delete-bg';
    del.innerHTML = '<span>Delete</span>';
    del.onclick = () => deleteEntry(entry.id);

    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = `
      <div class="log-num">#${String(entry.id).padStart(2,'0')}</div>
      <div class="log-info">
        <div class="log-name">${entry.name}</div>
        <div class="log-meta">
          <span style="font-family:var(--mono);font-size:9px;letter-spacing:1px;padding:1px 5px;border-radius:4px;margin-right:5px;${entry.type==='route' ? 'background:rgba(255,190,0,0.15);color:#ffbe00;border:1px solid rgba(255,190,0,0.3);' : 'background:rgba(0,229,255,0.1);color:var(--accent);border:1px solid rgba(0,229,255,0.2);'}">${entry.type==='route' ? 'ROUTE' : 'POINT TO POINT'}</span>${entry.date} · ${entry.time}
        </div>
      </div>
      <div class="log-dist-wrap">
        <div class="log-dist">${fmt(entry.meters)}</div>
        <div class="log-dist-unit">${unitLabels[unit].toLowerCase()}</div>
      </div>
      <div class="log-chevron">›</div>`;
    item.onclick = () => openDetail(entry.id);

    let tx = 0, startX = 0, startY = 0, swiping = false;
    item.addEventListener('touchstart', e => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; swiping = false; }, {passive:true});
    item.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!swiping && Math.abs(dy) > Math.abs(dx)) return;
      swiping = true;
      tx = Math.max(-80, Math.min(0, dx));
      item.style.transform = `translateX(${tx}px)`;
      item.style.transition = 'none';
    }, {passive:true});
    item.addEventListener('touchend', () => {
      item.style.transition = 'transform 0.2s ease';
      if (tx < -40) { item.style.transform = 'translateX(-80px)'; item.classList.add('swiped'); }
      else { item.style.transform = 'translateX(0)'; item.classList.remove('swiped'); }
      tx = 0;
    });

    wrap.appendChild(del);
    wrap.appendChild(item);
    list.appendChild(wrap);
  });
}

function deleteEntry(id) {
  if (!confirm('Delete this measurement?')) {
    // snap back
    const wrap = document.querySelector(`.log-item-wrap[data-id="${id}"]`);
    if (wrap) { const item = wrap.querySelector('.log-item'); item.style.transform='translateX(0)'; item.classList.remove('swiped'); }
    return;
  }
  measurements = measurements.filter(m => m.id !== id);
  saveToStorage();
  const wrap = document.querySelector(`.log-item-wrap[data-id="${id}"]`);
  if (wrap) wrap.remove();
  if (!measurements.length) {
    const e = document.createElement('div');
    e.className = 'log-empty'; e.id = 'logEmpty'; e.textContent = 'No measurements yet';
    document.getElementById('logList').appendChild(e);
  }
}

// ── DETAIL ────────────────────────────────────────────────
function openDetail(id) {
  const m = measurements.find(x=>x.id===id);
  if (!m) return;
  currentDetailId = id;
  prevTab = document.getElementById('screenLog').classList.contains('active') ? 'log' : 'measure';

  document.getElementById('detailName').textContent = m.name;
  document.getElementById('detailDist').textContent = fmt(m.meters);
  document.getElementById('detailUnit').textContent = unitLabels[unit];
  document.getElementById('detailDate').textContent = m.date + ' · ' + m.time;

  const cards = document.getElementById('detailCards');

  if (m.type === 'route') {
    // Route detail view
    cards.innerHTML = `
      <div class="detail-card">
        <div class="detail-card-label">Route</div>
        <div class="detail-row"><span class="detail-key">Total Distance</span><span class="detail-val">${metersTo(m.meters,'yd').toFixed(1)} yd</span></div>
        <div class="detail-row"><span class="detail-key">Meters</span><span class="detail-val">${m.meters.toFixed(1)}</span></div>
        <div class="detail-row"><span class="detail-key">Miles</span><span class="detail-val">${metersTo(m.meters,'mi').toFixed(4)}</span></div>
        <div class="detail-row"><span class="detail-key">GPS Points</span><span class="detail-val">${m.points.length}</span></div>
      </div>
      <div class="detail-card">
        <div class="detail-card-label">Start Point</div>
        <div class="detail-row"><span class="detail-key">Latitude</span><span class="detail-val">${m.points[0].lat.toFixed(6)}</span></div>
        <div class="detail-row"><span class="detail-key">Longitude</span><span class="detail-val">${m.points[0].lon.toFixed(6)}</span></div>
      </div>
      <div class="detail-card">
        <div class="detail-card-label">End Point</div>
        <div class="detail-row"><span class="detail-key">Latitude</span><span class="detail-val">${m.points[m.points.length-1].lat.toFixed(6)}</span></div>
        <div class="detail-row"><span class="detail-key">Longitude</span><span class="detail-val">${m.points[m.points.length-1].lon.toFixed(6)}</span></div>
      </div>`;
  } else {
    // Point to point detail view
    const altA = m.pointA.alt !== null ? (m.pointA.alt*3.28084).toFixed(0)+' ft' : 'N/A';
    const altB = m.pointB.alt !== null ? (m.pointB.alt*3.28084).toFixed(0)+' ft' : 'N/A';

    let elevHtml = '';
    if (m.pointA.alt !== null && m.pointB.alt !== null) {
      const df = ((m.pointB.alt - m.pointA.alt)*3.28084).toFixed(0);
      const cls = df > 0 ? 'elev-up' : df < 0 ? 'elev-down' : 'elev-flat';
      const arrow = df > 0 ? '▲' : df < 0 ? '▼' : '—';
      const sign  = df > 0 ? '+' : '';
      elevHtml = `<div class="elev-row ${cls}"><span class="elev-arrow">${arrow}</span><span class="elev-val">${sign}${df} ft</span><span class="elev-label">elevation change</span></div>`;
    }

    cards.innerHTML = `
      <div class="detail-card">
        <div class="detail-card-label">Distance</div>
        <div class="detail-row"><span class="detail-key">Yards</span><span class="detail-val">${metersTo(m.meters,'yd').toFixed(1)}</span></div>
        <div class="detail-row"><span class="detail-key">Feet</span><span class="detail-val">${metersTo(m.meters,'ft').toFixed(0)}</span></div>
        <div class="detail-row"><span class="detail-key">Miles</span><span class="detail-val">${metersTo(m.meters,'mi').toFixed(4)}</span></div>
        <div class="detail-row"><span class="detail-key">Meters</span><span class="detail-val">${m.meters.toFixed(1)}</span></div>
      </div>
      <div class="detail-card">
        <div class="detail-card-label">Point A</div>
        <div class="detail-row"><span class="detail-key">Latitude</span><span class="detail-val">${m.pointA.lat.toFixed(6)}</span></div>
        <div class="detail-row"><span class="detail-key">Longitude</span><span class="detail-val">${m.pointA.lon.toFixed(6)}</span></div>
        <div class="detail-row"><span class="detail-key">Elevation</span><span class="detail-val">${altA}</span></div>
      </div>
      <div class="detail-card">
        <div class="detail-card-label">Point B</div>
        <div class="detail-row"><span class="detail-key">Latitude</span><span class="detail-val">${m.pointB.lat.toFixed(6)}</span></div>
        <div class="detail-row"><span class="detail-key">Longitude</span><span class="detail-val">${m.pointB.lon.toFixed(6)}</span></div>
        <div class="detail-row"><span class="detail-key">Elevation</span><span class="detail-val">${altB}</span></div>
        ${elevHtml}
      </div>
      <div class="detail-card">
        <div class="detail-card-label">Accuracy</div>
        <div class="detail-row"><span class="detail-key">GPS Accuracy</span><span class="detail-val">±${Math.round(m.pointB.acc*3.28084)} ft</span></div>
        <div class="detail-row"><span class="detail-key">Samples averaged</span><span class="detail-val">${m.pointB.n}</span></div>
      </div>`;
  }

  showScreen('detail');
}

function goBack() {
  showScreen(prevTab === 'log' ? 'log' : 'measure');
  if (prevTab === 'log') switchTab('log', true);
  else switchTab('measure', true);
}

function renameCurrent() {
  const m = measurements.find(x=>x.id===currentDetailId);
  if (!m) return;
  const n = prompt('Rename measurement:', m.name);
  if (n && n.trim()) {
    m.name = n.trim();
    document.getElementById('detailName').textContent = m.name;
    saveToStorage();
    rebuildLog();
  }
}

// ── TABS ───────────────────────────────────────────────────

// Tracks whether live P2P was auto-paused by a tab switch (vs manually by the user)
let liveAutoPaused = false;

function switchTab(tab, silent) {
  const leavingMeasure = document.getElementById('screenMeasure').classList.contains('active');
  const enteringMeasure = (tab === 'measure');

  // ── Leaving Measure: pause live P2P if it's running ──
  if (leavingMeasure && !enteringMeasure) {
    if (liveWatchId !== null && !livePaused) {
      // Live is actively running — auto-pause it
      liveAutoPaused = true;
      livePaused = true;
      stopLive();
      document.getElementById('livePill').classList.add('visible');
      document.getElementById('livePill').classList.add('paused');
      setStatus('Live paused — tap LIVE to resume', 'ok');
      saveP2PState();
    } else if (livePaused) {
      // Already manually paused — just save state
      saveP2PState();
    }
  }

  // ── Entering Measure: resume live P2P if we auto-paused it ──
  if (enteringMeasure && liveAutoPaused) {
    liveAutoPaused = false;
    livePaused = false;
    document.getElementById('livePill').classList.remove('paused');
    if (pointA) {
      startLive();
      setStatus('Updating live — tap Set Point B to lock', 'live');
    }
  }

  showScreen(tab === 'measure' ? 'measure' : tab === 'log' ? 'log' : tab === 'golf' ? 'golf' : 'help');
  ['measure','log','golf','help'].forEach(t => {
    const active = t === tab;
    document.getElementById('icon'+capitalize(t)).classList.toggle('active', active);
    document.getElementById('label'+capitalize(t)).classList.toggle('active', active);
  });
  if (tab === 'golf') {
    startGolfGpsWatch();
    // If a course is loaded in memory, make sure hole view is showing
    if (golfHoles.length > 0) {
      document.getElementById('golfSearch').style.display = 'none';
      document.getElementById('golfCourseList').style.display = 'none';
      const hv = document.getElementById('golfHoleView');
      hv.style.display = 'flex';
      hv.style.flexDirection = 'column';
      renderHole();
    }
  } else stopGolfGpsWatch();
  if (!silent) localStorage.setItem('disttrkr_tab', tab);
}

// ── P2P STATE PERSISTENCE ──────────────────────────────────
function saveP2PState() {
  if (!pointA) { localStorage.removeItem('disttrkr_p2p'); return; }
  const state = {
    pointA,
    livePaused,
    liveAutoPaused
  };
  localStorage.setItem('disttrkr_p2p', JSON.stringify(state));
}

function clearP2PState() {
  localStorage.removeItem('disttrkr_p2p');
}

function restoreP2PState() {
  if (!gpsReady) return;
  const raw = localStorage.getItem('disttrkr_p2p');
  if (!raw) return;
  try {
    const state = JSON.parse(raw);
    if (!state.pointA) return;

    pointA = state.pointA;
    livePaused    = state.livePaused    || false;
    liveAutoPaused = state.liveAutoPaused || false;

    // Restore Point A UI
    const btnA = document.getElementById('btnA');
    btnA.textContent = 'Point A ✓';
    btnA.className   = 'point-btn btn-a-done';
    btnA.disabled    = false;
    document.getElementById('aCoords').textContent = pointA.lat.toFixed(5) + ', ' + pointA.lon.toFixed(5);
    document.getElementById('aCoords').className   = 'point-coords set-a';
    document.getElementById('aAcc').textContent    = '±' + Math.round(pointA.acc * 3.28084) + ' ft';
    document.getElementById('cardA').className     = 'point-card set-a';

    document.getElementById('btnB').disabled = false;

    // Resume live if it was running when we last left
    if (!livePaused) {
      startLive();
      setStatus('Updating live — tap Set Point B to lock', 'live');
    } else {
      document.getElementById('livePill').classList.add('visible');
      document.getElementById('livePill').classList.add('paused');
      setStatus('Live paused — tap LIVE to resume', 'ok');
    }
  } catch(e) {
    clearP2PState();
  }
}

function pulseLogTab() {
  document.getElementById('iconLog').classList.add('tab-pulse');
  document.getElementById('labelLog').classList.add('tab-pulse');
  setTimeout(clearLogTabPulse, 3000);
}

function clearLogTabPulse() {
  document.getElementById('iconLog').classList.remove('tab-pulse');
  document.getElementById('labelLog').classList.remove('tab-pulse');
}

function showScreen(name) {
  const map = {measure:'screenMeasure', log:'screenLog', detail:'screenDetail', help:'screenHelp', map:'screenMap', golf:'screenGolf'};
  Object.values(map).forEach(id => document.getElementById(id).classList.remove('active'));
  document.getElementById(map[name]).classList.add('active');
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── EXPORT ─────────────────────────────────────────────────
function exportJSON() {
  if (!measurements.length) { alert('No measurements to export.'); return; }
  const data = measurements.map(m => ({
    id: m.id, name: m.name, date: m.date, time: m.time,
    distance_yards:  +metersTo(m.meters,'yd').toFixed(1),
    distance_feet:   +metersTo(m.meters,'ft').toFixed(0),
    distance_miles:  +metersTo(m.meters,'mi').toFixed(4),
    distance_feet:   +(m.meters*3.28084).toFixed(0),
    distance_meters: +m.meters.toFixed(4),
    point_a: {lat:m.pointA.lat, lon:m.pointA.lon, elevation_ft: m.pointA.alt!==null?(m.pointA.alt*3.28084).toFixed(0):null},
    point_b: {lat:m.pointB.lat, lon:m.pointB.lon, elevation_ft: m.pointB.alt!==null?(m.pointB.alt*3.28084).toFixed(0):null},
    accuracy_ft: Math.round(m.pointB.acc*3.28084),
    samples: m.pointB.n
  }));
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'disttrkr-measurements.json';
  a.click();
}

// ── STORAGE ────────────────────────────────────────────────
function saveToStorage() {
  try {
    localStorage.setItem('disttrkr_v2', JSON.stringify({measurements, measureCount}));
    localStorage.setItem('disttrkr_speed', currentSpeed);
  } catch(e) {}
}

function loadFromStorage() {
  try {
    // Load speed setting first
    const savedSpeed = localStorage.getItem('disttrkr_speed');
    if (savedSpeed && SPEED_PROFILES[savedSpeed]) {
      currentSpeed = savedSpeed;
    }
    // Load unit preference (default to yd for new users)
    const savedUnit = localStorage.getItem('disttrkr_unit');
    if (savedUnit && unitLabels[savedUnit]) {
      unit = savedUnit;
    }
    const raw = localStorage.getItem('disttrkr_v2');
    if (!raw) return;
    const {measurements:m, measureCount:c} = JSON.parse(raw);
    if (!Array.isArray(m) || !m.length) return;
    measurements = m;
    measureCount = c || m.length;
    rebuildLog();
    setStatus('Loaded ' + m.length + ' saved measurement' + (m.length!==1?'s':''), 'ok');
  } catch(e) {}
}

// ── INIT ───────────────────────────────────────────────────
if (!navigator.geolocation) {
  setStatus('GPS not supported in this browser', 'error');
  document.getElementById('btnA').disabled = true;
}

// ── WELCOME SCREEN ─────────────────────────────────────────
function dismissWelcome() {
  localStorage.setItem('disttrkr_welcomed', '1');
  document.getElementById('welcomeScreen').classList.add('hidden');
  gpsReady = true;
  // Start both warmup watches
  const btn = document.getElementById('btnA');
  btn.className = 'point-btn btn-a-warmup';
  btn.disabled = true;
  startP2PWarmup();
  startRouteWarmup();
  // Also trigger permission prompt
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: true });
  }
}

function checkWelcome() {
  if (localStorage.getItem('disttrkr_welcomed')) {
    document.getElementById('welcomeScreen').classList.add('hidden');
    gpsReady = true;
    // Returning user — run GPS restores that were blocked during init
    restoreP2PState();
    restoreTraceState();
    // Start warmups if not already running
    if (!p2pWarmupWatchId && !liveWatchId) {
      const btn = document.getElementById('btnA');
      btn.className = 'point-btn btn-a-warmup';
      btn.disabled = true;
      startP2PWarmup();
    }
    if (!routeWarmupWatchId && !traceWatchId) {
      startRouteWarmup();
    }
  }
}

// ── MAP ────────────────────────────────────────────────────
let leafletMap = null;
let currentTileLayer = null;
let currentMapLayer = 'street';

const tileLayers = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19, attribution: '© <a href="https://www.esri.com">Esri</a> World Imagery' }
  }
};

function setMapLayer(type) {
  if (!leafletMap) return;
  currentMapLayer = type;

  // Update tile layer
  if (currentTileLayer) leafletMap.removeLayer(currentTileLayer);
  const layer = tileLayers[type];
  currentTileLayer = L.tileLayer(layer.url, layer.options).addTo(leafletMap);
  currentTileLayer.bringToBack();

  // Update button styles
  const streetBtn = document.getElementById('btnLayerStreet');
  const satBtn = document.getElementById('btnLayerSat');
  if (type === 'street') {
    streetBtn.style.borderColor = 'var(--accent)';
    streetBtn.style.background = 'rgba(0,229,255,0.15)';
    streetBtn.style.color = 'var(--accent)';
    satBtn.style.borderColor = 'var(--border)';
    satBtn.style.background = 'transparent';
    satBtn.style.color = 'var(--mid)';
  } else {
    satBtn.style.borderColor = 'var(--accent)';
    satBtn.style.background = 'rgba(0,229,255,0.15)';
    satBtn.style.color = 'var(--accent)';
    streetBtn.style.borderColor = 'var(--border)';
    streetBtn.style.background = 'transparent';
    streetBtn.style.color = 'var(--mid)';
  }
}

function openMap() {
  const m = measurements.find(x => x.id === currentDetailId);
  if (!m) return;

  document.getElementById('mapTitle').textContent = m.name;
  document.getElementById('mapDistLabel').textContent =
    fmt(m.meters) + ' ' + unitLabels[unit].toLowerCase();

  showScreen('map');

  setTimeout(() => {
    const container = document.getElementById('mapContainer');
    if (leafletMap) { leafletMap.remove(); leafletMap = null; currentTileLayer = null; }

    leafletMap = L.map(container, { zoomControl: true, attributionControl: true });

    const layer = tileLayers[currentMapLayer];
    currentTileLayer = L.tileLayer(layer.url, layer.options).addTo(leafletMap);
    setMapLayer(currentMapLayer);

    const iconA = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#00e5ff;border:3px solid #fff;box-shadow:0 0 8px rgba(0,229,255,0.8);"></div>`,
      iconSize: [14,14], iconAnchor: [7,7],
    });
    const iconB = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#39ff14;border:3px solid #fff;box-shadow:0 0 8px rgba(57,255,20,0.8);"></div>`,
      iconSize: [14,14], iconAnchor: [7,7],
    });

    if (m.type === 'route') {
      // Draw route as connected polyline
      const latlngs = m.points.map(p => [p.lat, p.lon]);

      L.polyline(latlngs, {
        color:'#ffbe00', weight:3, opacity:0.85
      }).addTo(leafletMap);

      // Start marker (cyan)
      L.marker(latlngs[0], {icon: iconA}).addTo(leafletMap)
        .bindTooltip('Start', {permanent:true, direction:'top', offset:[0,-10]});

      // End marker (green)
      L.marker(latlngs[latlngs.length-1], {icon: iconB}).addTo(leafletMap)
        .bindTooltip('End', {permanent:true, direction:'top', offset:[0,-10]});

      const bounds = L.latLngBounds(latlngs);
      leafletMap.fitBounds(bounds, {padding:[60,60]});

    } else {
      // Point to point
      const latA = m.pointA.lat, lonA = m.pointA.lon;
      const latB = m.pointB.lat, lonB = m.pointB.lon;

      L.marker([latA, lonA], {icon: iconA}).addTo(leafletMap)
        .bindTooltip('Point A', {permanent:true, direction:'top', offset:[0,-10]});
      L.marker([latB, lonB], {icon: iconB}).addTo(leafletMap)
        .bindTooltip('Point B', {permanent:true, direction:'top', offset:[0,-10]});

      L.polyline([[latA,lonA],[latB,lonB]], {
        color:'#00e5ff', weight:2.5, opacity:0.7, dashArray:'6,6'
      }).addTo(leafletMap);

      const bounds = L.latLngBounds([[latA,lonA],[latB,lonB]]);
      leafletMap.fitBounds(bounds, {padding:[60,60]});
    }

  }, 150);
}

function closeMap() {
  showScreen('detail');
}


// ── GOLF GPS ───────────────────────────────────────────────

let golfUnit        = 'yd';   // 'yd' or 'm'
let golfWatchId     = null;
let golfCurrentPos  = null;
let golfHoles       = [];     // array of hole objects for selected course
let golfCurrentHole = 0;      // index into golfHoles
let golfCourseName  = '';
let golfScores      = [];     // stroke counts per hole, index matches golfHoles

// Conversion helpers
function toGolfUnit(meters) {
  if (golfUnit === 'yd') return Math.round(meters * 1.09361);
  return Math.round(meters);
}

// ── SCORE TRACKING ─────────────────────────────────────────
function adjustScore(delta) {
  const hole = golfHoles[golfCurrentHole];
  if (!hole) return;
  if (golfScores[golfCurrentHole] === undefined) {
    // Start from par as a number, or 0 if no par
    golfScores[golfCurrentHole] = hole.par ? parseInt(hole.par) : 0;
  }
  golfScores[golfCurrentHole] = Math.max(1, golfScores[golfCurrentHole] + delta);
  renderScore();
  renderScorecardStrip();
  saveGolfState();
}

function renderScore() {
  const hole = golfHoles[golfCurrentHole];
  const scoreEl  = document.getElementById('golfScoreNum');
  const diffEl   = document.getElementById('golfScoreDiff');
  const totalEl  = document.getElementById('golfRoundTotal');
  if (!hole) return;

  const score = golfScores[golfCurrentHole];
  if (score === undefined) {
    scoreEl.textContent  = hole.par ? parseInt(hole.par) : '—';
    scoreEl.style.color  = 'var(--text)';
    diffEl.textContent   = hole.par ? 'TAP +/− TO SCORE' : 'NO PAR DATA';
    diffEl.style.color   = 'var(--dim)';
  } else {
    scoreEl.textContent = score;
    const par = hole.par ? parseInt(hole.par) : null;
    if (par) {
      const diff = score - par;
      if (diff === 0) {
        diffEl.textContent = 'PAR';
        diffEl.style.color = 'var(--dim)';
        scoreEl.style.color = 'var(--text)';
      } else if (diff < 0) {
        diffEl.textContent = diff + ' UNDER';
        diffEl.style.color = 'var(--green)';
        scoreEl.style.color = 'var(--green)';
      } else {
        diffEl.textContent = '+' + diff + ' OVER';
        diffEl.style.color = 'var(--red)';
        scoreEl.style.color = 'var(--red)';
      }
    } else {
      diffEl.textContent = score + ' STROKES';
      diffEl.style.color = 'var(--dim)';
      scoreEl.style.color = 'var(--text)';
    }
  }

  // Running total — iterate all holes, only count those with a score entered
  let totalStrokes = 0;
  let totalPar     = 0;
  let holesPlayed  = 0;
  let parKnown     = true;
  golfHoles.forEach((h, i) => {
    if (golfScores[i] === undefined) return;
    totalStrokes += golfScores[i];
    holesPlayed++;
    if (h.par) {
      totalPar += parseInt(h.par);
    } else {
      parKnown = false;
    }
  });

  if (holesPlayed === 0) {
    totalEl.textContent = '';
    return;
  }

  const roundDiff = totalStrokes - totalPar;
  const diffStr = parKnown && totalPar > 0
    ? (roundDiff === 0 ? 'EVEN' : (roundDiff > 0 ? '+' + roundDiff : '' + roundDiff))
    : '';
  const diffColor = parKnown && totalPar > 0
    ? (roundDiff === 0 ? 'var(--dim)' : roundDiff > 0 ? 'var(--red)' : 'var(--green)')
    : 'var(--dim)';
  totalEl.innerHTML = diffStr
    ? `<span style="font-size:14px; font-weight:700; color:${diffColor};">${diffStr}</span><span style="color:var(--dim);">  ·  ${holesPlayed} HOLES  ·  ${totalStrokes}</span>`
    : `<span style="color:var(--dim);">${holesPlayed} HOLES  ·  ${totalStrokes}</span>`;
}

function golfUnitLabel() {
  return golfUnit === 'yd' ? 'YD' : 'M';
}

function toggleGolfUnit() {
  golfUnit = golfUnit === 'yd' ? 'm' : 'yd';
  document.getElementById('golfUnitToggle').textContent = golfUnitLabel();
  updateGolfDistances();
  updateHolesList();
}

// Haversine (reuse app's existing one)
function golfHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
            Math.sin(dLon/2)*Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Start/stop GPS watch for golf tab
let teeProximityHole  = null;  // hole index we're near
let teeProximityTimer = null;  // setTimeout handle
const TEE_PROXIMITY_METERS = 20;
const TEE_ADVANCE_SECS = 30;

function startGolfGpsWatch() {
  if (!navigator.geolocation) return;
  if (golfWatchId !== null) return;
  golfWatchId = navigator.geolocation.watchPosition(
    pos => {
      golfCurrentPos = {lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy};
      if (golfHoles.length > 0) {
        updateGolfDistances();
        checkTeeProximity(golfCurrentPos.lat, golfCurrentPos.lon);
      }
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 5000 }
  );
}

function checkTeeProximity(lat, lon) {
  if (!golfHoles.length) return;

  // Only look at the very next hole — never skip more than one
  let closestHoleIdx = null;
  let closestDist = Infinity;

  for (let i = golfCurrentHole + 1; i <= golfCurrentHole + 1 && i < golfHoles.length; i++) {
    const hole = golfHoles[i];
    if (!hole.tees || !hole.tees.length) continue;
    for (const tee of hole.tees) {
      const d = golfHaversine(lat, lon, tee.lat, tee.lon);
      if (d < TEE_PROXIMITY_METERS && d < closestDist) {
        closestDist = d;
        closestHoleIdx = i;
      }
    }
  }

  if (closestHoleIdx !== null && closestHoleIdx !== teeProximityHole) {
    // Entered a new tee box — start timer
    teeProximityHole = closestHoleIdx;
    clearTimeout(teeProximityTimer);
    const holeNum = golfHoles[closestHoleIdx].num;
    showAdvanceNotice(`Moving to hole ${holeNum} in ${TEE_ADVANCE_SECS}s…`);
    teeProximityTimer = setTimeout(() => {
      if (teeProximityHole === closestHoleIdx) {
        const prevHole = golfCurrentHole;
        // Auto-record par for the hole we're leaving if no score entered
        if (golfScores[prevHole] === undefined && golfHoles[prevHole] && golfHoles[prevHole].par) {
          golfScores[prevHole] = parseInt(golfHoles[prevHole].par);
        }
        golfCurrentHole = closestHoleIdx;
        saveGolfState();
        renderHole();
        showAdvanceNotice(`Now on hole ${golfHoles[golfCurrentHole].num}`, 3000);
        teeProximityHole = null;
      }
    }, TEE_ADVANCE_SECS * 1000);
  } else if (closestHoleIdx === null && teeProximityHole !== null) {
    // Left the tee box before timer fired — cancel
    clearTimeout(teeProximityTimer);
    teeProximityTimer = null;
    teeProximityHole = null;
    hideAdvanceNotice();
  }
}

function showAdvanceNotice(msg, autoDismissMs) {
  const el = document.getElementById('golfAdvanceNotice');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  if (autoDismissMs) setTimeout(() => hideAdvanceNotice(), autoDismissMs);
}

function hideAdvanceNotice() {
  const el = document.getElementById('golfAdvanceNotice');
  if (el) el.style.display = 'none';
}

function stopGolfGpsWatch() {
  if (golfWatchId !== null) {
    navigator.geolocation.clearWatch(golfWatchId);
    golfWatchId = null;
  }
}

// Find nearby courses via Overpass API
function findNearbyCourses() {
  const statusEl = document.getElementById('golfSearchStatus');
  statusEl.textContent = 'Getting your location…';

  if (!navigator.geolocation) {
    statusEl.textContent = 'GPS not supported in this browser.';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      golfCurrentPos = {lat, lon, acc: pos.coords.accuracy};
      statusEl.textContent = 'Searching for courses…';
      fetchCoursesNear(lat, lon);
    },
    () => { statusEl.textContent = 'Could not get your location. Try again outdoors.'; },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

function fetchCoursesNear(lat, lon) {
  const statusEl = document.getElementById('golfSearchStatus');
  const radius = 20000; // 20km

  // Query for golf courses with hole (green) data
  const query = `[out:json][timeout:30];
(
  way[leisure=golf_course](around:${radius},${lat},${lon});
  relation[leisure=golf_course](around:${radius},${lat},${lon});
);
out center tags;`;

  fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query
  })
  .then(r => r.json())
  .then(data => {
    const courses = data.elements.filter(e => e.tags && e.tags.name);
    if (courses.length === 0) {
      statusEl.textContent = 'No mapped courses found within 20km.';
      return;
    }
    // Show course list immediately — hole data fetched when a course is selected
    showCourseList(courses, [], [], [], lat, lon);
  })
  .catch(() => {
    statusEl.textContent = 'Network error — check connection and try again.';
  });
}

function showCourseList(courses, greens, tees, holes, userLat, userLon) {
  const itemsEl = document.getElementById('golfCourseItems');
  itemsEl.innerHTML = '';

  // Sort courses by distance from user
  const coursesWithDist = courses.map(c => {
    // Estimate course center from its greens — find greens closest to this course
    // by using the course's OSM bounds center if available, else user location
    const cLat = c.center ? c.center.lat : userLat;
    const cLon = c.center ? c.center.lon : userLon;
    return { ...c, dist: golfHaversine(userLat, userLon, cLat, cLon) };
  }).sort((a,b) => a.dist - b.dist);

  coursesWithDist.forEach(course => {
    const tags = course.tags;
    const name = tags.name;
    const holeCount = tags['golf:course'] ? tags['golf:course'].replace('_hole','') + ' holes' : '';
    const par = tags['golf:par'] ? 'Par ' + tags['golf:par'] : '';
    const distKm = (course.dist / 1000).toFixed(1);

    const div = document.createElement('div');
    div.style.cssText = `background:var(--panel); border:1px solid var(--border); border-radius:14px;
      padding:16px; margin-bottom:8px; cursor:pointer; -webkit-tap-highlight-color:transparent;`;
    div.innerHTML = `
      <div style="font-family:var(--sans); font-size:15px; font-weight:600; color:var(--text); margin-bottom:4px;">${name}</div>
      <div style="font-family:var(--mono); font-size:11px; color:var(--dim);">${[holeCount, par, distKm + ' km'].filter(Boolean).join(' · ')}</div>
    `;
    // Pass all greens — selectCourse will filter to this course's greens by proximity
    div.onclick = () => selectCourse(name, greens, tees, holes, course);
    itemsEl.appendChild(div);
  });

  document.getElementById('golfSearch').style.display = 'none';
  document.getElementById('golfCourseList').style.display = 'flex';
  document.getElementById('golfCourseList').style.flexDirection = 'column';
}

function selectCourse(name, allGreens, tees, holes, courseEl) {
  golfCourseName = name;
  document.getElementById('golfCourseName').textContent = name;
  document.getElementById('golfCourseList').style.display = 'none';
  document.getElementById('golfSearch').style.display = 'none';

  // Show loading state immediately so user knows something is happening
  const prompt = document.getElementById('golfStartPrompt');
  prompt.style.display = 'flex';
  prompt.style.flexDirection = 'column';
  document.getElementById('golfStartCourseName').textContent = name.toUpperCase();
  document.getElementById('golfStartCol1').innerHTML = '';
  document.getElementById('golfStartCol2').innerHTML = '';
  document.getElementById('golfStartLoadingMsg').style.display = 'block';
  document.getElementById('golfStartGrid').style.display = 'none';

  // Fetch hole data scoped specifically to this course using its OSM ID
  const areaSetup = courseEl.type === 'relation'
    ? `relation(${courseEl.id});map_to_area->.course;`
    : `way(${courseEl.id});map_to_area->.course;`;

  const query = `[out:json][timeout:30];
${areaSetup}
(
  way[golf=green](area.course);
  way[golf=tee](area.course);
  node[golf=tee](area.course);
  way[golf=hole](area.course);
);
out center tags;`;

  fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query
  })
  .then(r => r.json())
  .then(data => {
    const greens = (data.elements || []).filter(e => e.tags && e.tags.golf === 'green' && e.center);
    const courseTees  = (data.elements || []).filter(e => e.tags && e.tags.golf === 'tee' && (e.center || (e.lat && e.lon)));
    const courseHoles = (data.elements || []).filter(e => e.tags && e.tags.golf === 'hole' && e.tags.ref);

    if (greens.length === 0) {
      buildCourseHoles(name, allGreens, tees, holes, courseEl);
      return;
    }

    buildCourseHoles(name, greens, courseTees, courseHoles, courseEl);
  })
  .catch(() => {
    buildCourseHoles(name, allGreens, tees, holes, courseEl);
  });
}

function buildCourseHoles(name, greens, tees, holes, courseEl) {
  // Sort greens by hole ref number
  const sorted = [...greens].sort((a, b) => {
    const ra = parseInt(a.tags && a.tags.ref) || 999;
    const rb = parseInt(b.tags && b.tags.ref) || 999;
    return ra - rb;
  });

  // Build a lookup of hole metadata from golf=hole ways (par, handicap)
  const holeMeta = {};
  if (holes) holes.forEach(h => {
    const r = parseInt(h.tags.ref);
    if (r) holeMeta[r] = { par: h.tags.par || null, handicap: h.tags.handicap || null };
  });

  // Build hole objects from greens, matching tees by ref or name (e.g. T10 -> hole 10)
  golfHoles = sorted.map((g, i) => {
    const ref = (g.tags && g.tags.ref) ? parseInt(g.tags.ref) : i + 1;
    const centerLat = g.center.lat;
    const centerLon = g.center.lon;

    const holeTees = tees.filter(t => {
      if (!t.tags) return false;
      if (t.tags.ref && parseInt(t.tags.ref) === ref) return true;
      if (t.tags.name) {
        const match = t.tags.name.match(/^T(\d+)$/i);
        if (match && parseInt(match[1]) === ref) return true;
      }
      return false;
    });

    const teeCenters = holeTees.map(t => ({
      lat: t.center ? t.center.lat : t.lat,
      lon: t.center ? t.center.lon : t.lon,
      label: t.tags.colour || t.tags.color || t.tags['golf:tee'] || t.tags.tee || null
    }));

    const uniqueTees = teeCenters.filter((t, idx, arr) =>
      arr.findIndex(u => Math.abs(u.lat - t.lat) < 0.00003 && Math.abs(u.lon - t.lon) < 0.00003) === idx
    );

    const meta = holeMeta[ref] || {};

    return {
      num: ref,
      par: meta.par || (g.tags && g.tags['golf:par']) || null,
      handicap: meta.handicap || null,
      center: {lat: centerLat, lon: centerLon},
      tees: uniqueTees
    };
  });

  // Clamp to 18 holes — filter out any ghost entries from bad OSM data
  golfHoles = golfHoles.slice(0, 18);

  if (golfHoles.length === 0) {
    document.getElementById('golfSearchStatus').textContent = 'No hole data found for this course.';
    document.getElementById('golfCourseList').style.display = 'flex';
    return;
  }

  golfScores = [];
  saveGolfState();
  showStartHolePrompt();
}

let golfSelectedStartIdx = 0;

function showStartHolePrompt() {
  document.getElementById('golfCourseList').style.display = 'none';
  document.getElementById('golfHoleView').style.display = 'none';

  const prompt = document.getElementById('golfStartPrompt');
  prompt.style.display = 'flex';
  prompt.style.flexDirection = 'column';

  document.getElementById('golfStartCourseName').textContent = golfCourseName || '';
  document.getElementById('golfStartLoadingMsg').style.display = 'none';
  document.getElementById('golfStartGrid').style.display = 'grid';

  const col1 = document.getElementById('golfStartCol1');
  const col2 = document.getElementById('golfStartCol2');
  col1.innerHTML = '';
  col2.innerHTML = '';

  golfHoles.forEach((hole, idx) => {
    const par = hole.par ? `Par ${hole.par}` : '';
    const btn = document.createElement('button');
    btn.id = `startHoleBtn_${idx}`;
    btn.style.cssText = `
      padding:12px 10px; border-radius:12px; text-align:left;
      background:rgba(255,255,255,0.04);
      border:1px solid rgba(255,255,255,0.08);
      color:var(--text);
      font-family:var(--sans); cursor:pointer;
      -webkit-tap-highlight-color:transparent; transition:all 0.12s;
      display:flex; align-items:center; justify-content:space-between;
    `;
    btn.innerHTML = `
      <span style="font-size:17px; font-weight:700;">Hole ${hole.num || (idx + 1)}</span>
      <span style="font-family:var(--mono); font-size:11px; color:var(--dim); opacity:0.8;">${par}</span>
    `;
    btn.onclick = () => confirmStartHole(idx);

    if (idx < 9) col1.appendChild(btn);
    else         col2.appendChild(btn);
  });
}

function confirmStartHole(idx) {
  golfCurrentHole = idx;
  golfScores      = [];
  saveGolfState();

  document.getElementById('golfStartPrompt').style.display = 'none';
  const hv = document.getElementById('golfHoleView');
  hv.style.display = 'flex';
  hv.style.flexDirection = 'column';

  renderHole();
  startGolfGpsWatch();
}

function renderScorecardStrip() {
  const strip = document.getElementById('golfScorecardStrip');
  if (!strip || !golfHoles.length) return;
  strip.innerHTML = '';

  const displayHoles = golfHoles.slice(0, 18);
  displayHoles.forEach((hole, i) => {
    const score = golfScores[i];
    const par   = hole.par ? parseInt(hole.par) : null;
    const isCurrent = i === golfCurrentHole;
    const isScored  = score !== undefined;
    const diff = (isScored && par) ? score - par : null;

    // Outer cell
    const cell = document.createElement('div');
    cell.style.cssText = `
      flex-shrink:0; width:32px; height:40px;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      cursor:pointer; border-radius:8px;
      background:${isCurrent ? 'rgba(255,255,255,0.08)' : 'transparent'};
      border:${isCurrent ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent'};
    `;
    cell.onclick = () => { golfCurrentHole = i; saveGolfState(); renderHole(); };

    // Hole number (tiny, above)
    const num = document.createElement('div');
    num.style.cssText = `font-family:var(--mono); font-size:9px; letter-spacing:0px;
      color:${isScored ? 'var(--dim)' : isCurrent ? 'var(--mid)' : '#444'}; margin-bottom:2px;`;
    num.textContent = hole.num || (i + 1);
    cell.appendChild(num);

    // Score marking (SVG with circle/square)
    if (isScored) {
      const svg = buildScoreMarkingSVG(score, diff);
      cell.appendChild(svg);
    } else {
      // Unplayed — grey dash
      const dash = document.createElement('div');
      dash.style.cssText = `font-family:var(--mono); font-size:13px; color:#333; line-height:1;`;
      dash.textContent = '·';
      cell.appendChild(dash);
    }

    strip.appendChild(cell);
  });

  // Scroll current hole into view
  const cells = strip.children;
  if (cells[golfCurrentHole]) {
    cells[golfCurrentHole].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
}

function buildScoreMarkingSVG(score, diff) {
  const size = 24;
  const cx = size / 2, cy = size / 2, r = 10;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

  // Color
  const color = diff === null ? '#e0e0e0'
    : diff < 0  ? '#39ff14'
    : diff === 0 ? '#c0c0c0'
    : '#ff3d71';

  // Score text
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', cx);
  text.setAttribute('y', cy + 4);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', '11');
  text.setAttribute('font-family', 'var(--mono)');
  text.setAttribute('fill', color);
  text.textContent = score;
  svg.appendChild(text);

  if (diff === null || diff === 0) {
    // Par — no marking
  } else if (diff === -1) {
    // Birdie — one circle
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
    c.setAttribute('fill', 'none'); c.setAttribute('stroke', color); c.setAttribute('stroke-width', '1.2');
    svg.insertBefore(c, text);
  } else if (diff <= -2) {
    // Eagle or better — two circles
    const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c1.setAttribute('cx', cx); c1.setAttribute('cy', cy); c1.setAttribute('r', r);
    c1.setAttribute('fill', 'none'); c1.setAttribute('stroke', color); c1.setAttribute('stroke-width', '1.2');
    const c2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c2.setAttribute('cx', cx); c2.setAttribute('cy', cy); c2.setAttribute('r', r - 2.5);
    c2.setAttribute('fill', 'none'); c2.setAttribute('stroke', color); c2.setAttribute('stroke-width', '1.2');
    svg.insertBefore(c1, text);
    svg.insertBefore(c2, text);
  } else if (diff === 1) {
    // Bogey — one square
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', cx - r); rect.setAttribute('y', cy - r);
    rect.setAttribute('width', r * 2); rect.setAttribute('height', r * 2);
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', 'none'); rect.setAttribute('stroke', color); rect.setAttribute('stroke-width', '1.2');
    svg.insertBefore(rect, text);
  } else {
    // Double bogey or worse — two squares
    const r2 = r + 2.5;
    const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect1.setAttribute('x', cx - r2); rect1.setAttribute('y', cy - r2);
    rect1.setAttribute('width', r2 * 2); rect1.setAttribute('height', r2 * 2);
    rect1.setAttribute('rx', '2');
    rect1.setAttribute('fill', 'none'); rect1.setAttribute('stroke', color); rect1.setAttribute('stroke-width', '1.2');
    const rect2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect2.setAttribute('x', cx - r); rect2.setAttribute('y', cy - r);
    rect2.setAttribute('width', r * 2); rect2.setAttribute('height', r * 2);
    rect2.setAttribute('rx', '2');
    rect2.setAttribute('fill', 'none'); rect2.setAttribute('stroke', color); rect2.setAttribute('stroke-width', '1.2');
    svg.insertBefore(rect1, text);
    svg.insertBefore(rect2, text);
  }

  return svg;
}

function renderHole() {
  if (!golfHoles || golfHoles.length === 0) return;
  // Clamp index just in case
  if (golfCurrentHole < 0) golfCurrentHole = 0;
  if (golfCurrentHole >= golfHoles.length) golfCurrentHole = golfHoles.length - 1;

  const hole = golfHoles[golfCurrentHole];
  if (!hole) return;

  document.getElementById('golfHoleNum').textContent = hole.num || (golfCurrentHole + 1);
  document.getElementById('golfPrevHole').style.opacity = golfCurrentHole === 0 ? '0.3' : '1';
  document.getElementById('golfNextHole').style.opacity = golfCurrentHole === golfHoles.length - 1 ? '0.3' : '1';
  let meta = [];
  if (hole.par) meta.push('PAR ' + hole.par);
  if (hole.handicap) meta.push('HCP ' + hole.handicap);
  document.getElementById('golfParLabel').textContent = meta.join('  ·  ');

  renderScore();
  renderScorecardStrip();
  updateGolfDistances();
}

function updateGolfDistances() {
  if (!golfCurrentPos || golfHoles.length === 0) {
    document.getElementById('golfDistCenter').textContent = '—';
    document.getElementById('golfUnitCenter').textContent = golfUnitLabel();
    return;
  }

  const hole = golfHoles[golfCurrentHole];
  const {lat, lon, acc} = golfCurrentPos;

  const dCenter = golfHaversine(lat, lon, hole.center.lat, hole.center.lon);

  document.getElementById('golfDistCenter').textContent = toGolfUnit(dCenter);
  document.getElementById('golfUnitCenter').textContent = golfUnitLabel();

  // Tee distances
  const teeContainer = document.getElementById('golfTeeDistances');
  const teeItems = document.getElementById('golfTeeItems');
  if (hole.tees && hole.tees.length > 0) {
    teeContainer.style.display = 'block';

    // Calculate distance from current position to each tee, then sort longest to shortest
    const teesWithDist = hole.tees.map(t => ({
      ...t,
      d: golfHaversine(lat, lon, t.lat, t.lon),
      distToGreen: golfHaversine(t.lat, t.lon, hole.center.lat, hole.center.lon)
    }));
    teesWithDist.sort((a, b) => b.distToGreen - a.distToGreen);

    const TEE_COLORS = {
      black:  { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.25)', text: '#e0e0e0' },
      blue:   { bg: 'rgba(30,100,255,0.15)',  border: 'rgba(30,100,255,0.5)',   text: '#6aa3ff' },
      white:  { bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.4)',  text: '#ffffff' },
      red:    { bg: 'rgba(255,60,60,0.12)',   border: 'rgba(255,60,60,0.4)',    text: '#ff6b6b' },
      yellow: { bg: 'rgba(255,210,0,0.12)',   border: 'rgba(255,210,0,0.4)',    text: '#ffd600' },
      green:  { bg: 'rgba(57,255,20,0.1)',    border: 'rgba(57,255,20,0.4)',    text: '#39ff14' },
      gold:   { bg: 'rgba(255,180,0,0.12)',   border: 'rgba(255,180,0,0.4)',    text: '#ffb800' },
    };

    teeItems.innerHTML = teesWithDist.map((t, idx) => {
      const isBack    = idx === 0;
      const isForward = idx === teesWithDist.length - 1 && teesWithDist.length > 1;
      const holeYds   = toGolfUnit(t.distToGreen);
      const colorKey  = t.label ? t.label.toLowerCase() : null;
      const hasColor  = colorKey && TEE_COLORS[colorKey];

      // Label: color name if available, else Back/Forward/yds
      let label;
      if (hasColor) {
        const colorName = t.label.charAt(0).toUpperCase() + t.label.slice(1);
        label = `${colorName} — ${holeYds} ${golfUnitLabel()}`;
      } else if (isBack) {
        label = `Back — ${holeYds} ${golfUnitLabel()}`;
      } else if (isForward) {
        label = `Forward — ${holeYds} ${golfUnitLabel()}`;
      } else {
        label = `${holeYds} ${golfUnitLabel()} to hole`;
      }

      const c = hasColor ? TEE_COLORS[colorKey] : {
        bg: 'var(--panel)',
        border: isBack ? 'rgba(255,255,255,0.2)' : isForward ? 'rgba(0,229,255,0.25)' : 'var(--border)',
        text: isBack ? 'var(--text)' : isForward ? 'var(--accent)' : 'var(--dim)'
      };

      return `<div style="display:flex; justify-content:space-between; align-items:center;
                padding:8px 12px; background:${c.bg}; border:1px solid ${c.border};
                border-radius:10px;">
        <span style="font-family:var(--mono); font-size:11px; color:${c.text}; letter-spacing:1px;">${label}</span>
        <span style="font-family:var(--display); font-size:18px; font-weight:800; color:${c.text};">
          ${toGolfUnit(t.d)} <span style="font-family:var(--mono); font-size:10px;">${golfUnitLabel()}</span>
        </span>
      </div>`;
    }).join('');

  } else {
    teeContainer.style.display = 'none';
  }
}


function changeHole(dir) {
  if (!golfHoles || golfHoles.length === 0) return;
  const next = golfCurrentHole + dir;
  if (next < 0 || next >= golfHoles.length) return;
  // Auto-record par for hole being left if moving forward and no score entered
  if (dir > 0 && golfScores[golfCurrentHole] === undefined && golfHoles[golfCurrentHole] && golfHoles[golfCurrentHole].par) {
    golfScores[golfCurrentHole] = parseInt(golfHoles[golfCurrentHole].par);
  }
  golfCurrentHole = next;
  clearTimeout(teeProximityTimer);
  teeProximityTimer = null;
  teeProximityHole = null;
  hideAdvanceNotice();
  saveGolfState();
  renderHole();
  // Dim arrows at boundaries
  document.getElementById('golfPrevHole').style.opacity = golfCurrentHole === 0 ? '0.3' : '1';
  document.getElementById('golfNextHole').style.opacity = golfCurrentHole === golfHoles.length - 1 ? '0.3' : '1';
}

function confirmFinishRound() {
  // Build round summary for the confirmation message
  let holesPlayed = golfScores.filter(s => s !== undefined).length;
  let msg = 'Finish round and return to course list?';
  if (holesPlayed > 0) {
    let totalStrokes = 0;
    let totalPar = 0;
    let parKnown = true;
    golfHoles.forEach((h, i) => {
      if (golfScores[i] === undefined) return;
      totalStrokes += golfScores[i];
      if (h.par) totalPar += parseInt(h.par);
      else parKnown = false;
    });
    const diff = parKnown && totalPar > 0 ? totalStrokes - totalPar : null;
    const diffStr = diff === null ? '' : diff === 0 ? ' · EVEN' : diff > 0 ? ' · +' + diff : ' · ' + diff;
    msg = `Finish round?\n${holesPlayed} holes · ${totalStrokes} strokes${diffStr}`;
  }
  if (confirm(msg)) resetGolfSearch();
}

function resetGolfSearch() {
  golfHoles = [];
  golfCurrentHole = 0;
  golfScores = [];
  golfCourseName = '';
  clearGolfState();
  document.getElementById('golfSearch').style.display = 'flex';
  document.getElementById('golfCourseList').style.display = 'none';
  document.getElementById('golfHoleView').style.display = 'none';
  document.getElementById('golfStartPrompt').style.display = 'none';
  document.getElementById('golfSearchStatus').textContent = '';
}


// ── WAKE LOCK ──────────────────────────────────────────

let wakeLock = null;
let wakeLockEnabled = false;

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      // Re-acquire if user hasn't manually turned it off
      if (wakeLockEnabled) requestWakeLock();
    });
  } catch(e) {}
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
}

async function toggleWakeLock() {
  wakeLockEnabled = !wakeLockEnabled;
  if (wakeLockEnabled) {
    await requestWakeLock();
    resetDimTimer();
  } else {
    releaseWakeLock();
    stopDimTimer();
  }
  updateWakeLockButtons();
}

function updateWakeLockButtons() {
  ['wakeLockToggle', 'wakeLockToggleMeasure', 'wakeLockToggleRoute'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (wakeLockEnabled) {
      btn.style.border = '1.5px solid rgba(0,229,255,0.5)';
      btn.style.background = 'rgba(0,229,255,0.12)';
      btn.style.color = 'var(--accent)';
    } else {
      btn.style.border = '1.5px solid rgba(255,255,255,0.15)';
      btn.style.background = 'rgba(255,255,255,0.05)';
      btn.style.color = '#bbb';
    }
  });
}

// ── KEEP AWAKE ROUTE PROMPT ─────────────────────────────────
function maybeShowKeepAwakePrompt() {
  const pref = localStorage.getItem('disttrkr_keepawake_pref');
  if (pref === 'yes') {
    // Previously said yes — enable silently
    if (!wakeLockEnabled) toggleWakeLock();
    return;
  }
  if (pref === 'no') {
    // Previously said no — respect that, don't ask again
    return;
  }
  // First time — show the prompt after a short delay so Start animation settles
  setTimeout(() => {
    document.getElementById('keepAwakePrompt').classList.add('visible');
  }, 400);
}

function keepAwakePromptAnswer(yes) {
  document.getElementById('keepAwakePrompt').classList.remove('visible');
  localStorage.setItem('disttrkr_keepawake_pref', yes ? 'yes' : 'no');
  if (yes && !wakeLockEnabled) toggleWakeLock();
}

// Re-acquire wake lock when page becomes visible again
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLockEnabled) {
    requestWakeLock();
  }
});


// ── DIM OVERLAY ────────────────────────────────────────────

let dimTimer = null;
const DIM_DELAY = 10000; // 10 seconds

function resetDimTimer() {
  if (!wakeLockEnabled) return;
  clearTimeout(dimTimer);
  dimTimer = setTimeout(() => {
    document.getElementById('dimOverlay').classList.add('active');
  }, DIM_DELAY);
}

function wakeFromDim() {
  document.getElementById('dimOverlay').classList.remove('active');
  resetDimTimer();
}

function stopDimTimer() {
  clearTimeout(dimTimer);
  document.getElementById('dimOverlay').classList.remove('active');
}

// Hook into wake lock toggle to start/stop dim timer
const _origToggleWakeLock = toggleWakeLock;
// Patch: resetDimTimer is called after wakeLockEnabled is set in toggleWakeLock
// We listen via document interaction instead
document.addEventListener('touchstart', () => { if (wakeLockEnabled) resetDimTimer(); }, {passive:true});
document.addEventListener('click', () => { if (wakeLockEnabled) resetDimTimer(); }, {passive:true});



// ── MEASURE MODE ────────────────────────────────────

let measureMode = 'p2p'; // 'p2p' or 'route'

function setMeasureMode(mode) {
  measureMode = mode;
  localStorage.setItem('disttrkr_mode', mode);

  const p2p   = document.getElementById('layoutP2P');
  const route = document.getElementById('layoutRoute');
  const btnP2P   = document.getElementById('modeBtnP2P');
  const btnRoute = document.getElementById('modeBtnRoute');

  if (mode === 'p2p') {
    p2p.style.display   = 'flex';
    route.style.display = 'none';
    btnP2P.style.background   = 'rgba(0,229,255,0.12)';
    btnP2P.style.border       = '1.5px solid rgba(0,229,255,0.4)';
    btnP2P.style.color        = 'var(--accent)';
    btnRoute.style.background = 'transparent';
    btnRoute.style.border     = '1px solid var(--border)';
    btnRoute.style.color      = 'var(--dim)';
  } else {
    p2p.style.display   = 'none';
    route.style.display = 'flex';
    btnRoute.style.background = 'rgba(255,190,0,0.12)';
    btnRoute.style.border     = '1.5px solid rgba(255,190,0,0.4)';
    btnRoute.style.color      = '#ffbe00';
    btnP2P.style.background   = 'transparent';
    btnP2P.style.border       = '1px solid var(--border)';
    btnP2P.style.color        = 'var(--dim)';
    // Restore active trace if one was in progress
    restoreTraceState();
    syncRouteUnitChips();
  }
}

function initMeasureMode() {
  const saved = localStorage.getItem('disttrkr_mode') || 'p2p';
  setMeasureMode(saved);
}

// Keep route unit chips in sync with main unit
function syncRouteUnitChips() {
  ['Yd','Ft','Mi','M','Km'].forEach(u => {
    const rChip = document.getElementById('rChip' + u);
    if (rChip) rChip.className = 'unit-chip' + (unit === u.toLowerCase() ? ' active' : '');
    const lChip = document.getElementById('lChip' + u);
    if (lChip) lChip.className = 'unit-chip' + (unit === u.toLowerCase() ? ' active' : '');
  });
}

// ── ROUTE TRACING ──────────────────────────────────

let traceActive   = false;
let tracePaused   = false;
let tracePoints   = [];
let traceMeters   = 0;
let traceWatchId  = null;
let traceLastPos  = null;
const TRACE_MIN_DIST = 5; // meters

function routeStart() {
  if (!navigator.geolocation) {
    setRouteStatus('GPS not supported.', null);
    return;
  }

  if (traceActive) {
    // Re-tapping Start while active — ignore
    return;
  }

  traceActive  = true;
  tracePaused  = false;
  tracePoints  = [];
  traceMeters  = 0;
  traceLastPos = null;

  saveTraceState();

  const btnStart = document.getElementById('routeBtnStart');
  const btnStop  = document.getElementById('routeBtnStop');
  const btnPause = document.getElementById('routePauseBtn');

  btnStart.textContent = 'Started ✓';
  btnStart.className   = 'point-btn btn-a-done';
  btnStart.disabled    = true;
  btnStop.disabled     = false;
  btnStop.className    = 'point-btn btn-b';
  btnPause.disabled    = false;

  // Light up green at 0 immediately, like P2P does
  const distEl = document.getElementById('routeDistNum');
  distEl.textContent = '0';
  distEl.className = 'distance-number live';

  setRouteStatus('Tracing… waiting for GPS', null);

  traceWatchId = navigator.geolocation.watchPosition(
    pos => {
      if (tracePaused) return;
      // Skip poor accuracy readings (>40m) to avoid GPS drift logging false distance
      if (pos.coords.accuracy > 40) return;
      const p = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude, acc: pos.coords.accuracy};

      if (traceLastPos) {
        const d = haversine(traceLastPos.lat, traceLastPos.lon, p.lat, p.lon);
        if (d < TRACE_MIN_DIST) return;
        traceMeters += d;
      } else {
        // First point — show start coords and switch to live status
        document.getElementById('routeStartCoords').textContent =
          p.lat.toFixed(5) + ', ' + p.lon.toFixed(5);
        document.getElementById('routeStartAcc').textContent = '±' + Math.round(p.acc * 3.28084) + ' ft';
        setRouteStatus('Tracing — tap Stop & Save when done', 'live');
      }

      tracePoints.push(p);
      traceLastPos = p;
      saveTraceState();
      updateRouteDisplay();

      // Update end coords with latest position
      document.getElementById('routeStopCoords').textContent =
        p.lat.toFixed(5) + ', ' + p.lon.toFixed(5);
    },
    () => {},
    {enableHighAccuracy: true, maximumAge: 0}
  );

  maybeShowKeepAwakePrompt();
}

function routeStop() {
  const btnStop = document.getElementById('routeBtnStop');

  if (traceWatchId !== null) {
    navigator.geolocation.clearWatch(traceWatchId);
    traceWatchId = null;
  }

  traceActive  = false;
  tracePaused  = false;

  document.getElementById('keepAwakePrompt').classList.remove('visible');
  clearTraceState();

  if (tracePoints.length < 2) {
    // Not enough points — restore buttons and let them try again
    btnStop.className   = 'point-btn btn-b';
    btnStop.textContent = 'Stop & Save';
    btnStop.disabled    = false;
    setRouteStatus('Need at least 2 points to save.', null);
    return;
  }

  // Flash saving state
  btnStop.className   = 'point-btn btn-b-loading';
  btnStop.textContent = 'Saving…';
  btnStop.disabled    = true;

  // Save entry
  measureCount++;
  const now  = new Date();
  const time = now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const date = now.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});
  const name = 'Route ' + measureCount;
  const entry = {id: measureCount, type: 'route', name, meters: traceMeters, points: tracePoints, time, date};

  measurements.push(entry);
  saveToStorage();
  addLogRow(entry);

  // Show saved state briefly
  btnStop.className   = 'point-btn btn-b-done';
  btnStop.textContent = 'Stop & Save ✓';
  document.getElementById('routeCardB').className = 'point-card set-b';
  setRouteStatus('✓ Saved to Log — ' + fmt(traceMeters) + ' ' + unitLabels[unit].toLowerCase(), 'ok');
  pulseLogTab();

  // Reset everything after 1.5 seconds
  setTimeout(() => {
    tracePoints  = [];
    traceMeters  = 0;
    traceLastPos = null;
    document.getElementById('routeCardB').className = 'point-card';
    document.getElementById('routeDistNum').textContent = '0';
    document.getElementById('routeDistNum').className = 'distance-number zero';
    document.getElementById('routeStartCoords').textContent = '—';
    document.getElementById('routeStopCoords').textContent = 'Walk, then tap to save';
    document.getElementById('routePointCount').textContent = '';
    setRouteStatus('Tap Start to begin tracing', null);
    stopRouteWarmup();
    routeWarmupBuffer = [];
    startRouteWarmup();
    // Directly enable Start — GPS already running outdoors, no need to gate on warmup
    const btnStart = document.getElementById('routeBtnStart');
    btnStart.textContent = 'Start';
    btnStart.className   = 'point-btn btn-a';
    btnStart.disabled    = false;
    const btnStop = document.getElementById('routeBtnStop');
    btnStop.textContent  = 'Stop & Save';
    btnStop.className    = 'point-btn btn-b';
    btnStop.disabled     = true;
    const btnPause = document.getElementById('routePauseBtn');
    btnPause.disabled    = true;
    btnPause.textContent = '⏸ Pause';
    btnPause.style.color = 'var(--dim)';
  }, 1500);
}

function routePause() {
  tracePaused = !tracePaused;
  const btn = document.getElementById('routePauseBtn');
  btn.textContent = tracePaused ? '▶ Resume' : '⏸ Pause';
  btn.style.color = tracePaused ? 'var(--accent)' : 'var(--dim)';
  setRouteStatus(tracePaused ? 'Paused — tap Resume to continue' : 'Tracing — tap Stop & Save when done', tracePaused ? null : 'live');
  saveTraceState();
}

function resetRoute() {
  if (traceActive) {
    if (!confirm('Discard current route?')) return;
    if (traceWatchId !== null) { navigator.geolocation.clearWatch(traceWatchId); traceWatchId = null; }
    traceActive = false;
    tracePaused = false;
  }
  document.getElementById('keepAwakePrompt').classList.remove('visible');
  tracePoints  = [];
  traceMeters  = 0;
  traceLastPos = null;
  clearTraceState();
  document.getElementById('routeCardB').className = 'point-card';
  document.getElementById('routeDistNum').textContent = '0';
  document.getElementById('routeDistNum').className = 'distance-number zero';
  document.getElementById('routeStartCoords').textContent = '—';
  document.getElementById('routeStopCoords').textContent = 'Walk, then tap to save';
  document.getElementById('routePointCount').textContent = '';
  setRouteStatus('Tap Start to begin tracing', null);
  stopRouteWarmup();
  routeWarmupBuffer = [];
  startRouteWarmup();
  // Directly enable Start
  const btnStart = document.getElementById('routeBtnStart');
  btnStart.textContent = 'Start';
  btnStart.className   = 'point-btn btn-a';
  btnStart.disabled    = false;
  const btnStop = document.getElementById('routeBtnStop');
  btnStop.textContent  = 'Stop & Save';
  btnStop.className    = 'point-btn btn-b';
  btnStop.disabled     = true;
  const btnPauseR = document.getElementById('routePauseBtn');
  btnPauseR.disabled    = true;
  btnPauseR.textContent = '⏸ Pause';
  btnPauseR.style.color = 'var(--dim)';
}

function resetRouteButtons() {
  const btnStop  = document.getElementById('routeBtnStop');
  const btnPause = document.getElementById('routePauseBtn');
  btnStop.textContent  = 'Stop & Save';
  btnStop.className    = 'point-btn btn-b';
  btnStop.disabled     = true;
  btnPause.disabled    = true;
  btnPause.textContent = '⏸ Pause';
  btnPause.style.color = 'var(--dim)';
  // Reset Start button based on current warmup state
  syncRouteStartButton();
}

function setRouteStatus(msg, type) {
  const el = document.getElementById('routeStatus');
  el.textContent = msg;
  el.className = 'hero-status' + (type === 'live' ? ' live-state' : type === 'ok' ? ' ok-state' : type === 'error' ? ' error-state' : '');
}

function updateRouteDisplay() {
  const el = document.getElementById('routeDistNum');
  const val = fmt(traceMeters, true);
  el.textContent = val;
  if (traceMeters === 0) {
    el.className = traceActive ? 'distance-number live' : 'distance-number zero';
  } else {
    el.className = 'distance-number live';
  }
  document.getElementById('routePointCount').textContent =
    tracePoints.length + ' GPS pts';
  syncRouteUnitChips();
}

// ── TRACE STATE PERSISTENCE ────────────────────────

function saveTraceState() {
  const state = {active: traceActive, paused: tracePaused, points: tracePoints, meters: traceMeters};
  localStorage.setItem('disttrkr_trace', JSON.stringify(state));
}

function clearTraceState() {
  localStorage.removeItem('disttrkr_trace');
}

function restoreTraceState() {
  if (!gpsReady) return;
  const raw = localStorage.getItem('disttrkr_trace');
  if (!raw) return;
  try {
    const state = JSON.parse(raw);
    if (!state.active || !state.points || state.points.length < 1) return;

    tracePoints  = state.points;
    traceMeters  = state.meters;
    tracePaused  = state.paused || false;
    traceLastPos = tracePoints[tracePoints.length - 1];

    // Restore UI
    const btnStart = document.getElementById('routeBtnStart');
    const btnStop  = document.getElementById('routeBtnStop');
    const btnPause = document.getElementById('routePauseBtn');

    btnStart.textContent = 'Started ✓';
    btnStart.className   = 'point-btn btn-a-done';
    btnStart.disabled    = true;
    btnStop.disabled     = false;
    btnPause.disabled    = false;
    btnPause.textContent = tracePaused ? '▶ Resume' : '⏸ Pause';
    btnPause.style.color = tracePaused ? 'var(--accent)' : 'var(--dim)';

    document.getElementById('routeStartCoords').textContent =
      tracePoints[0].lat.toFixed(5) + ', ' + tracePoints[0].lon.toFixed(5);
    document.getElementById('routeStopCoords').textContent =
      traceLastPos.lat.toFixed(5) + ', ' + traceLastPos.lon.toFixed(5);

    updateRouteDisplay();
    setRouteStatus(tracePaused ? 'Paused — tap Resume to continue' : 'Tracing — tap Stop & Save when done', tracePaused ? null : 'live');

    // Resume watch if not paused
    if (!tracePaused) {
      traceActive = true;
      traceWatchId = navigator.geolocation.watchPosition(
        pos => {
          if (tracePaused) return;
          if (pos.coords.accuracy > 40) return;
          const p = {lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude, acc: pos.coords.accuracy};
          if (traceLastPos) {
            const d = haversine(traceLastPos.lat, traceLastPos.lon, p.lat, p.lon);
            if (d < TRACE_MIN_DIST) return;
            traceMeters += d;
          }
          tracePoints.push(p);
          traceLastPos = p;
          saveTraceState();
          updateRouteDisplay();
          document.getElementById('routeStopCoords').textContent =
            p.lat.toFixed(5) + ', ' + p.lon.toFixed(5);
        },
        () => {},
        {enableHighAccuracy: true, maximumAge: 0}
      );
    } else {
      traceActive = true;
    }
  } catch(e) {
    clearTraceState();
  }
}


// ── GOLF STATE PERSISTENCE ─────────────────────────────────

function saveGolfState() {
  if (!golfHoles.length) return;
  const state = { name: golfCourseName, hole: golfCurrentHole, holes: golfHoles, scores: golfScores };
  localStorage.setItem('disttrkr_golf', JSON.stringify(state));
}

function clearGolfState() {
  localStorage.removeItem('disttrkr_golf');
}

function restoreGolfState() {
  const raw = localStorage.getItem('disttrkr_golf');
  if (!raw) return false;
  try {
    const state = JSON.parse(raw);
    if (!state.holes || !state.holes.length) return false;

    golfCourseName  = state.name;
    golfHoles       = state.holes;
    golfCurrentHole = state.hole || 0;
    golfScores      = state.scores || [];

    document.getElementById('golfCourseName').textContent = golfCourseName;
    document.getElementById('golfSearch').style.display = 'none';
    document.getElementById('golfCourseList').style.display = 'none';
    const hv = document.getElementById('golfHoleView');
    hv.style.display = 'flex';
    hv.style.flexDirection = 'column';

    renderHole();
    startGolfGpsWatch();
    return true;
  } catch(e) {
    clearGolfState();
    return false;
  }
}

// ── INIT ───────────────────────────────────────────────────

function initTab() {
  const saved = localStorage.getItem('disttrkr_tab');
  if (saved && ['measure','golf','log','help'].includes(saved)) {
    switchTab(saved, true);
    if (saved === 'golf') restoreGolfState();
  }
}

loadFromStorage();
initSpeed();
initMeasureMode();
checkWelcome();
initTab();
