/* Gerçek harita: Leaflet + OpenStreetMap karoları.
   Pinler, kümeler ve konum noktası burada çizilir. Panel mantığı ui.js'te. */

const MAP = { m: null, pins: null, me: null };

function initMap() {
  const m = L.map('map', { zoomControl: false, minZoom: 5, maxZoom: 19, worldCopyJump: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> katkıda bulunanlar'
  }).addTo(m);
  m.setView([ORNEK_MERKEZ.lat, ORNEK_MERKEZ.lon], 14);
  MAP.m = m;
  MAP.pins = L.layerGroup().addTo(m);
  MAP.me = L.layerGroup().addTo(m);
  m.on('moveend zoomend', () => { renderPins(); listeyiGuncelleSoon(); });
  m.on('click', () => haritaTikla());
}

/* ---- ikonlar ---- */
function pinIcon(b, sel) {
  const html = `<div class="pinwrap${sel ? ' sel' : ''}" style="--c:var(--${b.k});--ink:var(--${b.k}-ink)">
    <svg width="44" height="54" viewBox="-22 -50 44 54" aria-hidden="true"><g class="pin${sel ? ' sel' : ''}">
    <polygon class="pb" points="-7,-13 7,-13 0,0"/><circle class="halo" cy="-27" r="19"/><circle class="pb" cy="-27" r="15"/>
    <text class="pt" y="-27">${Math.round(b.top)}</text></g></svg></div>`;
  return L.divIcon({ html, className: 'pinicon', iconSize: [44, 54], iconAnchor: [22, 50] });
}
function clusterIcon(n, k) {
  const html = `<div class="clu" style="--c:var(--${k});--ink:var(--${k}-ink)"><span>${n}</span></div>`;
  return L.divIcon({ html, className: 'cluicon', iconSize: [52, 52], iconAnchor: [26, 26] });
}

/* ---- pinler ve kümeler (ekran pikseli ızgarasıyla) ---- */
function renderPins() {
  if (!MAP.m) return;
  const m = MAP.m, z = m.getZoom(), size = m.getSize();
  MAP.pins.clearLayers();
  const pts = B.filter(passFilter)
    .map(b => ({ b, p: m.latLngToContainerPoint([b.lat, b.lon]) }))
    .filter(o => o.p.x > -80 && o.p.x < size.x + 80 && o.p.y > -100 && o.p.y < size.y + 100);
  const singles = [], clusters = [];
  if (z <= 16) {
    const cell = 58, g = new Map();
    pts.forEach(o => {
      if (o.b.id === state.sel) { singles.push(o); return; }
      const k = Math.floor(o.p.x / cell) + ',' + Math.floor(o.p.y / cell);
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(o);
    });
    g.forEach(a => {
      if (a.length === 1) singles.push(a[0]);
      else {
        const worst = a.reduce((w, o) => o.b.top > w.b.top ? o : w, a[0]);
        clusters.push({
          n: a.length, k: worst.b.k, items: a.map(o => o.b),
          lat: a.reduce((s, o) => s + o.b.lat, 0) / a.length, lon: a.reduce((s, o) => s + o.b.lon, 0) / a.length
        });
      }
    });
  } else singles.push(...pts);

  clusters.forEach(c => {
    L.marker([c.lat, c.lon], { icon: clusterIcon(c.n, c.k), title: c.n + ' bina', keyboard: true })
      .on('click', () => {
        const bounds = L.latLngBounds(c.items.map(b => [b.lat, b.lon]));
        const p = pads();
        m.fitBounds(bounds, { paddingTopLeft: [p.l + 40, 140], paddingBottomRight: [40, p.b + 40], maxZoom: 18 });
      }).addTo(MAP.pins);
  });
  singles.forEach(o => {
    const b = o.b, sel = b.id === state.sel;
    L.marker([b.lat, b.lon], { icon: pinIcon(b, sel), title: `${b.ad}, risk ${Math.round(b.top)} ${KAT[b.k]}`, keyboard: true, zIndexOffset: sel ? 2000 : Math.round(b.top * 4) })
      .on('click', () => select(b.id, true)).addTo(MAP.pins);
  });
}

/* ---- konum ---- */
function drawMe() {
  MAP.me.clearLayers();
  if (!state.me) return;
  L.circle([state.me.lat, state.me.lon], { radius: Math.min(state.me.acc || 30, 400), color: '#2b7de9', weight: 1, fillColor: '#2b7de9', fillOpacity: 0.15, interactive: false }).addTo(MAP.me);
  L.circleMarker([state.me.lat, state.me.lon], { radius: 8, color: '#ffffff', weight: 3, fillColor: '#2b7de9', fillOpacity: 1, interactive: false }).addTo(MAP.me);
}

/* ---- görünüm yardımcıları: panelin altında kalan alanı hesaba katar ---- */
function centerOn(lat, lon, zoom, sheetState, animate) {
  const m = MAP.m, size = m.getSize(), c = visCenter(sheetState);
  const z = zoom == null ? m.getZoom() : zoom;
  const target = m.project([lat, lon], z);
  const shifted = target.add([size.x / 2 - c.cx, size.y / 2 - c.cy]);
  const ll = m.unproject(shifted, z);
  if (animate === false) m.setView(ll, z, { animate: false });
  else m.flyTo(ll, z, { duration: 0.6 });
}
function fitBuildings(list, sheetState, animate) {
  if (!MAP.m || !list.length) return;
  const p = pads(sheetState);
  const bounds = L.latLngBounds(list.map(b => [b.lat, b.lon]));
  MAP.m.fitBounds(bounds, { paddingTopLeft: [p.l + 30, 140], paddingBottomRight: [30, p.b + 30], maxZoom: 17, animate: animate !== false });
}
function buildingsInView() {
  const m = MAP.m, size = m.getSize(), p = pads();
  return B.filter(passFilter).filter(b => {
    const q = m.latLngToContainerPoint([b.lat, b.lon]);
    return q.x >= p.l && q.x <= size.x && q.y >= 0 && q.y <= size.y - p.b + 40;
  });
}
