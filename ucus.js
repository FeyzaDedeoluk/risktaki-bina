/* Uçuş yükle: bir uçuşun fotoğraflarını alır, konuma göre binalara ayırır, hepsini otomatik analiz eder,
   binaları haritaya ekler. Konum kaynağı sırası: fotoğraftaki GPS > GPX uçuş kaydı > elle seçilen konum. */

const UCUS_CONF = 0.5;               // otomatik akışta sabit güven eşiği
const U = { items: [], gpx: null, csv: null, loc: null, groups: [], busy: false };

/* ---------- EXIF (JPEG) ---------- */
async function exifOku(file) {
  try {
    const v = new DataView(await file.slice(0, 262144).arrayBuffer());
    if (v.getUint16(0) !== 0xFFD8) return {};
    let o = 2;
    while (o + 4 < v.byteLength) {
      const m = v.getUint16(o), len = v.getUint16(o + 2);
      if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) return tiffOku(v, o + 10);
      if ((m & 0xFF00) !== 0xFF00) break;
      o += 2 + len;
    }
  } catch (e) { }
  return {};
}
function tiffOku(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = p => v.getUint16(p, le), u32 = p => v.getUint32(p, le);
  const ifd = off => {
    const tags = {}, n = u16(t + off);
    for (let i = 0; i < n; i++) { const e = t + off + 2 + i * 12; tags[u16(e)] = { type: u16(e + 2), cnt: u32(e + 4), e }; }
    return tags;
  };
  const dataPos = g => (g.type === 3 ? 2 : g.type === 4 ? 4 : g.type === 5 ? 8 : 1) * g.cnt > 4 ? t + u32(g.e + 8) : g.e + 8;
  const ascii = g => { let s = '', p = dataPos(g); for (let i = 0; i < g.cnt - 1; i++) s += String.fromCharCode(v.getUint8(p + i)); return s; };
  const rats = g => { const p = dataPos(g), a = []; for (let i = 0; i < g.cnt; i++) a.push(u32(p + i * 8) / (u32(p + i * 8 + 4) || 1)); return a; };
  const out = {};
  const i0 = ifd(u32(t + 4));
  let dt = null;
  if (i0[0x8769]) { const ex = ifd(u32(i0[0x8769].e + 8)); if (ex[0x9003]) dt = ascii(ex[0x9003]); }
  if (!dt && i0[0x0132]) dt = ascii(i0[0x0132]);
  if (dt) { const m = dt.match(/(\d+):(\d+):(\d+) (\d+):(\d+):(\d+)/); if (m) out.t = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(); }
  if (i0[0x8825]) {
    const g = ifd(u32(i0[0x8825].e + 8));
    if (g[2] && g[4] && g[1] && g[3]) {
      const la = rats(g[2]), lo = rats(g[4]);
      let lat = la[0] + la[1] / 60 + la[2] / 3600, lon = lo[0] + lo[1] / 60 + lo[2] / 3600;
      if (ascii(g[1]) === 'S') lat = -lat; if (ascii(g[3]) === 'W') lon = -lon;
      if (isFinite(lat) && isFinite(lon) && (lat || lon)) { out.lat = lat; out.lon = lon; }
    }
  }
  return out;
}

/* ---------- GPX ve CSV ---------- */
function gpxOku(text) {
  const d = new DOMParser().parseFromString(text, 'application/xml'), pts = [];
  d.querySelectorAll('trkpt,rtept').forEach(p => {
    const tm = p.querySelector('time'); if (!tm) return;
    const t = Date.parse(tm.textContent), lat = +p.getAttribute('lat'), lon = +p.getAttribute('lon');
    if (isFinite(t) && isFinite(lat) && isFinite(lon)) pts.push({ t, lat, lon });
  });
  return pts.sort((a, b) => a.t - b.t);
}
function gpxKonum(pts, t) {
  if (!pts || !pts.length || t == null || t < pts[0].t - 5000 || t > pts[pts.length - 1].t + 5000) return null;
  let i = pts.findIndex(p => p.t >= t); if (i <= 0) return pts[0];
  const a = pts[i - 1], b = pts[i], k = (t - a.t) / ((b.t - a.t) || 1);
  return { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k };
}
function csvOku(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const head = lines[0].split(sep).map(s => norm(s.trim()));
  const col = (...n) => head.findIndex(h => n.includes(h));
  const ci = { lat: col('enlem', 'lat'), lon: col('boylam', 'lon', 'lng'), yil: col('yil', 'yapim_yili', 'yapim yili'), ad: col('ad'), adr: col('adres', 'adr'), kat: col('kat') };
  const num = v => { const x = parseFloat(String(v || '').replace(',', '.')); return isFinite(x) ? x : null; };
  return lines.slice(1).map(l => {
    const c = l.split(sep).map(s => s.trim());
    return { lat: num(c[ci.lat]), lon: num(c[ci.lon]), yil: num(c[ci.yil]), ad: ci.ad >= 0 ? c[ci.ad] : '', adr: ci.adr >= 0 ? c[ci.adr] : '', kat: ci.kat >= 0 ? num(c[ci.kat]) : null };
  }).filter(r => r.lat != null && r.lon != null && r.yil != null);
}

/* ---------- gruplama ---------- */
function ucusKonumlari() {
  const off = (+$('ucOff').value || 0) * 60000;
  U.items.forEach(it => {
    it.pos = null; it.kaynak = '';
    if (it.lat != null) { it.pos = { lat: it.lat, lon: it.lon }; it.kaynak = 'gps'; }
    else if (U.gpx) { const p = gpxKonum(U.gpx, it.t != null ? it.t + off : null); if (p) { it.pos = p; it.kaynak = 'gpx'; } }
  });
}
function ucusGrupla() {
  ucusKonumlari();
  const R = +$('ucR').value, gs = [];
  U.items.filter(i => i.pos).forEach(it => {
    let g = gs.find(x => haversine(x.c, it.pos) <= R);
    if (!g) { g = { items: [], c: { lat: it.pos.lat, lon: it.pos.lon } }; gs.push(g); }
    g.items.push(it);
    g.c.lat = g.items.reduce((s, x) => s + x.pos.lat, 0) / g.items.length;
    g.c.lon = g.items.reduce((s, x) => s + x.pos.lon, 0) / g.items.length;
  });
  const rest = U.items.filter(i => !i.pos);
  if (rest.length && U.loc) gs.push({ items: rest, c: { lat: U.loc.lat, lon: U.loc.lon }, manuel: true });
  U.groups = gs;
  return { rest: rest.length };
}
function ucusOzet() {
  const n = U.items.length;
  if (!n) { $('ucInfo').textContent = ''; $('ucLoc').hidden = true; $('ucRun').disabled = true; return; }
  const r = ucusGrupla(), loc = U.items.filter(i => i.pos).length;
  const lines = [`${n} fotoğraf seçildi. ${loc} tanesinde konum var` + (U.gpx ? ' (GPX kaydı dahil)' : '') + '.'];
  if (U.groups.length) lines.push(`${U.groups.length} bina grubu bulundu (${U.groups.map(g => g.items.length).join(', ')} fotoğraf).`);
  $('ucLoc').hidden = r.rest === 0;
  if (r.rest) lines.push(`${r.rest} fotoğrafın konumu yok. ${U.loc ? 'Seçtiğin konuma tek bina olarak eklenecek.' : 'Konumu haritadan seç ya da GPX kaydı yükle.'}`);
  $('ucInfo').innerHTML = lines.map(esc).join('<br>');
  $('ucRun').disabled = !U.groups.length;
}

/* ---------- analiz ---------- */
async function ucusCalistir() {
  if (U.busy) return; U.busy = true;
  const pga = cl(+$('ucPga').value || 0.45, 0.05, 0.9), yilT = cl(Math.round(+$('ucYil').value) || 1990, 1900, 2026);
  const total = U.groups.reduce((s, g) => s + g.items.length, 0); let done = 0;
  $('ucRun').disabled = true; $('ucAdd').hidden = true; $('ucOut').innerHTML = ''; $('ucProg').hidden = false;
  try {
    await aiYukle();
    for (const g of U.groups) {
      const covs = [], ns = [];
      for (const it of g.items) {
        $('ucProgT').textContent = `Analiz ediliyor: ${done + 1} / ${total}`; $('ucBar').value = done / total * 100;
        try {
          const bm = await createImageBitmap(it.f, { resizeWidth: 1280, resizeQuality: 'medium' });
          const res = await aiTespit(bm, UCUS_CONF); if (bm.close) bm.close();
          const o = tespitOzeti(res); covs.push(o.cov); ns.push(o.n);
        } catch (e) { /* bozuk fotoğraf atlanır */ }
        done++; await new Promise(r => setTimeout(r));
      }
      g.cov = covs.length ? covs.reduce((a, b) => a + b, 0) / covs.length : 0;
      g.n = ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;
      g.foto = covs.length;
      const m = (U.csv || []).map(r => ({ r, d: haversine(r, g.c) })).filter(x => x.d <= 40).sort((a, b) => a.d - b.d)[0];
      g.yil = m ? m.r.yil : yilT; g.yilT = !m; g.ad = m && m.r.ad || ''; g.adr = m && m.r.adr || ''; g.kat = m ? m.r.kat : null;
      g.pga = pga; g.r = hesapla({ cov: g.cov, n: g.n, pga, yil: g.yil });
    }
    $('ucBar').value = 100; $('ucProg').hidden = true;
    ucusSonuc();
  } catch (e) {
    $('ucProg').hidden = true;
    $('ucOut').innerHTML = `<div class="ph-err">${e.message === 'MODEL_YOK' ? 'Model dosyası (model.onnx) bulunamadı.' : 'Analiz yapılamadı: ' + esc(e.message)}</div>`;
  }
  U.busy = false; $('ucRun').disabled = false;
}
function ucusSonuc() {
  const L = U.groups.filter(g => g.r).sort((a, b) => b.r.top - a.r.top);
  $('ucOut').innerHTML = `<ul class="rows">${L.map(g => `<li><div class="ucrow" style="--k:var(--${g.r.k})"><span class="sc">${Math.round(g.r.top)}</span><span><div class="nm">${esc(g.ad || 'Yeni bina')}</div><div class="ad">${g.foto} fotoğraf · çatlak ${f1(g.cov)}% · ${g.yil}${g.yilT ? ' (tahmini)' : ''}${g.foto < 3 ? ' · az fotoğraf' : ''}</div></span><b>${KAT[g.r.k]}</b></div></li>`).join('')}</ul>`;
  $('ucAdd').hidden = !L.length; $('ucAdd').textContent = `${L.length} binayı haritaya ekle`;
}
function ucusEkle() {
  const L = U.groups.filter(g => g.r); if (!L.length) return;
  let arr = [];
  try { const t = localStorage.getItem(DATA_KEY); if (t) { const j = JSON.parse(t); arr = Array.isArray(j) ? j : (j.binalar || []); } } catch (e) { }
  const gun = new Date().toLocaleDateString('tr-TR'), mevcut = arr.filter(r => /^Bina \d+/.test(r.ad || '')).length;
  L.forEach((g, i) => arr.push({
    ad: g.ad || ('Bina ' + (mevcut + i + 1)), adres: g.adr, mahalle: 'Uçuş ' + gun, enlem: +g.c.lat.toFixed(6), boylam: +g.c.lon.toFixed(6),
    yil: g.yil, yil_tahmin: g.yilT, kat: g.kat, pga: g.pga, kapsama_yuzde: +g.cov.toFixed(2), catlak_ort: +g.n.toFixed(2), foto: g.foto, tarih: gun, kaynak: 'ucus'
  }));
  try { localStorage.setItem(DATA_KEY, JSON.stringify({ binalar: arr })); } catch (e) { toast('Cihaz belleği dolu, veriyi kaydedemedim.'); return; }
  const r = listeyiHazirla(arr);
  closeModal(); setData(r.list, 'dosya'); toast(`${L.length} bina haritaya eklendi`);
  U.items = []; U.groups = []; $('ucOut').innerHTML = ''; $('ucAdd').hidden = true;
}

/* ---------- arayüz ---------- */
function ucusAc() { openModal('mUcus'); }
$('ucFiles').addEventListener('change', async e => {
  const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return;
  $('ucInfo').textContent = 'Fotoğraflar okunuyor...'; $('ucOut').innerHTML = ''; $('ucAdd').hidden = true;
  U.items = [];
  for (const f of fs) { const x = await exifOku(f); U.items.push({ f, t: x.t, lat: x.lat, lon: x.lon }); }
  ucusOzet();
});
$('ucGpx').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  U.gpx = gpxOku(await f.text()); toast(U.gpx.length ? `GPX: ${U.gpx.length} nokta okundu` : 'GPX dosyasında zamanlı nokta yok'); if (!U.gpx.length) U.gpx = null; ucusOzet();
});
$('ucCsv').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  U.csv = csvOku(await f.text()); toast(U.csv.length ? `${U.csv.length} bina kaydı okundu` : 'CSV okunamadı. Sütunlar: enlem, boylam, yil'); if (!U.csv.length) U.csv = null;
});
$('ucR').addEventListener('input', () => { $('ucRo').textContent = $('ucR').value + ' m'; ucusOzet(); });
$('ucOff').addEventListener('change', ucusOzet);
$('ucPick').addEventListener('click', () => {
  closeModal(); toast('Haritada binanın üzerine dokun');
  MAP.m.once('click', ev => { U.loc = { lat: ev.latlng.lat, lon: ev.latlng.lng }; $('ucLocT').textContent = `Seçilen konum: ${U.loc.lat.toFixed(5)}, ${U.loc.lon.toFixed(5)}`; openModal('mUcus'); ucusOzet(); });
});
$('ucRun').addEventListener('click', ucusCalistir);
$('ucAdd').addEventListener('click', ucusEkle);
$('ucRo').textContent = $('ucR').value + ' m';

/* Veriyi indir: haritadaki yüklenen/eklenen binalar JSON olarak */
function veriIndir() {
  let t = null; try { t = localStorage.getItem(DATA_KEY); } catch (e) { }
  if (!t) { closeModal(); toast('İndirilecek yüklenmiş veri yok. Örnek veri indirilmez.'); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'application/json' }));
  a.download = 'binalar.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
