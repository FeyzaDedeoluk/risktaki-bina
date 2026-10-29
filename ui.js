/* Arayüz: panel, liste, bina kartı, roller, arama, araçlar, pencereler. */

let B = [];
const $ = id => document.getElementById(id);
const app = $('app'), sheet = $('sheet'), sbody = $('sbody');
const isDesk = () => window.matchMedia('(min-width:900px)').matches;

const state = { sel: null, filter: 'hepsi', q: '', role: 'vatandas', sheet: 'peek', sort: 'risk', me: null, src: 'ornek', status: {}, notes: {} };
const STORE = 'risktaki-bina-v3';
try {
  const s = JSON.parse(localStorage.getItem(STORE) || '{}');
  if (s.role) state.role = s.role;
  if (s.status) state.status = s.status;
  if (s.notes) state.notes = s.notes;
} catch (e) { }
function persist() { try { localStorage.setItem(STORE, JSON.stringify({ role: state.role, status: state.status, notes: state.notes })); } catch (e) { } }

function durumu(b) {
  const s = state.status[b.key]; if (s) return s;
  if (b.top <= 40) return 'yok';
  if (b._st != null) return b._st < 0.15 ? 'incelendi' : b._st < 0.38 ? 'planli' : 'bekliyor';
  return 'bekliyor';
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ================= PANEL (alttan çekilen / soldaki) ================= */
function sheetPx(st) { const H = app.clientHeight; st = st || state.sheet; return st === 'full' ? H - 112 : st === 'half' ? Math.round(H * 0.52) : 150; }
function pads(st) { return isDesk() ? { l: 400, b: 0 } : { l: 0, b: sheetPx(st) }; }
function visCenter(st) {
  const s = MAP.m.getSize();
  if (isDesk()) return { cx: 400 + (s.x - 400) / 2, cy: s.y / 2 };
  return { cx: s.x / 2, cy: (120 + (s.y - sheetPx(st))) / 2 };
}
function setSheet(st) { state.sheet = st; applySheet(); }
function applySheet() {
  sheet.dataset.state = state.sheet;
  if (isDesk()) { app.style.setProperty('--sheet-h', '0px'); return; }
  app.style.setProperty('--sheet-h', sheetPx() + 'px');
}
(function sheetDrag() {
  const grab = $('grab'); let st = null;
  grab.addEventListener('pointerdown', e => {
    if (isDesk() || e.target.closest('button')) return;
    st = { y: e.clientY, t: Date.now(), moved: false };
    grab.setPointerCapture(e.pointerId); sheet.classList.add('drag');
  });
  grab.addEventListener('pointermove', e => {
    if (!st) return;
    const dy = st.y - e.clientY; if (Math.abs(dy) > 4) st.moved = true;
    const H = app.clientHeight, h = Math.max(110, Math.min(H - 112, sheetPx() + dy));
    app.style.setProperty('--sheet-h', h + 'px');
  });
  function end(e) {
    if (!st) return;
    sheet.classList.remove('drag');
    const cur = parseFloat(getComputedStyle(app).getPropertyValue('--sheet-h')) || sheetPx();
    if (!st.moved) { setSheet(state.sheet === 'peek' ? 'half' : 'peek'); st = null; return; }
    const fast = (st.y - e.clientY) / Math.max(1, Date.now() - st.t);
    const opts = ['peek', 'half', 'full'].map(k => ({ k, d: Math.abs(sheetPx(k) - (cur + fast * 180)) })).sort((a, z) => a.d - z.d);
    setSheet(opts[0].k); st = null;
  }
  grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
})();

/* ================= ROL, FİLTRE, ARAMA ================= */
function setRole(r) {
  state.role = r; persist();
  document.querySelectorAll('[data-role]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.role === r)));
  renderChips(); renderAll();
}
document.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setRole(b.dataset.role); });

function passFilter(b) {
  const f = state.filter;
  if (f === 'hepsi') return true;
  if (f === 'eski') return b.yil < 1999;
  if (f === 'bekleyen') return b.top > 40 && durumu(b) === 'bekliyor';
  return b.k === f;
}
function renderChips() {
  const o = [['hepsi', 'Hepsi'], ['high', 'Yüksek', 'high'], ['mid', 'Orta', 'mid'], ['low', 'Düşük', 'low'], ['eski', '1999 öncesi']];
  if (state.role === 'belediye') o.push(['bekleyen', 'Denetim bekleyen']);
  if (state.filter === 'bekleyen' && state.role !== 'belediye') state.filter = 'hepsi';
  $('chips').innerHTML = o.map(([k, t, c]) => `<button class="chip" data-f="${k}" aria-pressed="${state.filter === k}">${c ? `<i style="--c:var(--${c})"></i>` : ''}${t}</button>`).join('');
}
$('chips').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.filter = b.dataset.f; renderChips(); renderPins(); renderSheetListOnly();
});

function norm(s) { return s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i'); }
function aramaSonuc(q) { const n = norm(q.trim()); if (!n) return []; return B.filter(b => norm(b.ad + ' ' + b.adr + ' ' + b.mh).includes(n)).sort((a, z) => z.top - a.top); }
const qi = $('q');
function closeSugg() { $('sugg').hidden = true; }
qi.addEventListener('input', () => {
  state.q = qi.value; $('qClear').hidden = !qi.value;
  if (!qi.value.trim()) { closeSugg(); renderSheetListOnly(); return; }
  const m = aramaSonuc(qi.value).slice(0, 5);
  $('sugg').hidden = false;
  $('sugg').innerHTML = m.length
    ? m.map(b => `<button data-id="${b.id}"><span class="sc" style="--c:var(--${b.k});--bgc:var(--${b.k}-bg);width:36px;height:36px;border-radius:10px;font-size:14px">${Math.round(b.top)}</span><span><div class="t">${esc(b.ad)}</div><div class="a">${esc(b.adr || b.mh)}</div></span></button>`).join('')
    : `<div class="none">“${esc(qi.value)}” için bina bulunamadı.</div>`;
  renderSheetListOnly();
});
qi.addEventListener('keydown', e => {
  if (e.key === 'Enter') { const m = aramaSonuc(qi.value); if (m[0]) { closeSugg(); select(m[0].id, true); qi.blur(); } }
  if (e.key === 'Escape') closeSugg();
});
$('sugg').addEventListener('pointerdown', e => e.preventDefault());
$('sugg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { closeSugg(); qi.blur(); select(+b.dataset.id, true); } });
$('qClear').onclick = () => { qi.value = ''; state.q = ''; $('qClear').hidden = true; closeSugg(); renderSheetListOnly(); qi.focus(); };

/* ================= SEÇİM ================= */
function select(id, fly) {
  state.sel = id; const b = B.find(x => x.id === id); if (!b) return;
  if (!isDesk()) setSheet('half');
  renderAll();
  if (fly) centerOn(b.lat, b.lon, Math.max(MAP.m.getZoom(), 16), 'half');
  sbody.scrollTop = 0;
}
function haritaTikla() {
  closeSugg();
  if (state.sel != null) { state.sel = null; setSheet('peek'); renderAll(); }
}

/* ================= LİSTE ================= */
function mesafe(b) { return state.me ? haversine(state.me, b) : null; }
function gorunenListe() {
  let L = state.q.trim() ? aramaSonuc(state.q).filter(passFilter) : buildingsInView();
  if (state.sort === 'yakin' && state.me) L.sort((a, z) => mesafe(a) - mesafe(z)); else L.sort((a, z) => z.top - a.top);
  return L;
}
function mahalleOzet() {
  const g = {}; B.forEach(b => { (g[b.mh] = g[b.mh] || []).push(b); });
  return Object.entries(g).map(([mh, a]) => {
    const ort = a.reduce((s, b) => s + b.top, 0) / a.length;
    return { mh, a, ort, hi: a.filter(b => b.k === 'high').length, pga: a.reduce((s, b) => s + b.pga, 0) / a.length, k: ort <= 40 ? 'low' : ort <= 70 ? 'mid' : 'high' };
  }).sort((x, y) => y.ort - x.ort);
}
function listHTML() {
  const L = gorunenListe(), hi = L.filter(b => b.k === 'high').length, role = state.role;
  let h = '';
  if (role === 'belediye') {
    const need = B.filter(b => b.top > 40), c = { bekliyor: 0, planli: 0, incelendi: 0 };
    need.forEach(b => { const s = durumu(b); if (c[s] != null) c[s]++; });
    h += `<div class="stats"><div><b>${c.bekliyor}</b><span>Denetim bekliyor</span></div><div><b>${c.planli}</b><span>Planlandı</span></div><div><b>${c.incelendi}</b><span>İncelendi</span></div></div>`;
  }
  if (role === 'afad') {
    const say = { high: 0, mid: 0, low: 0 }; B.forEach(b => say[b.k]++);
    const ort = B.reduce((s, b) => s + b.pga, 0) / (B.length || 1);
    h += `<div class="stats"><div><b>${B.length}</b><span>Taranan bina</span></div><div><b>${say.high}</b><span>Yüksek risk</span></div><div><b>${String(ort.toFixed(2)).replace('.', ',')}</b><span>Ort. PGA (g)</span></div></div>`;
    h += `<div class="lh"><h2>Mahalle risk özeti</h2><small>${mahalleOzet().length} mahalle</small></div><div class="mah">` +
      mahalleOzet().map((m, i) => `<button data-mah="${i}" style="--c:var(--${m.k})"><div class="mt"><span>${esc(m.mh)}</span><b>${Math.round(m.ort)}</b></div><div class="trk"><div class="fill" style="width:${m.ort}%"></div></div><div class="ms">${m.a.length} bina · ${m.hi} yüksek risk · ortalama PGA ${m.pga.toFixed(2).replace('.', ',')} g</div></button>`).join('') + `</div>`;
  }
  h += `<div class="lh"><h2>${state.q.trim() ? 'Arama sonuçları' : 'Haritada görünen binalar'}</h2><small>${L.length} bina${hi ? ` · ${hi} yüksek risk` : ''}</small></div>`;
  h += `<div class="sorts"><button data-sort="risk" aria-pressed="${state.sort === 'risk'}">En riskli önce</button><button data-sort="yakin" aria-pressed="${state.sort === 'yakin'}">Bana yakın önce</button></div>`;
  if (!L.length) h += `<div class="empty">Bu alanda bina yok.<br>Haritayı kaydır ya da uzaklaştır.</div>`;
  else h += `<ul class="rows">${L.map(b => {
    const st = durumu(b), d = mesafe(b);
    const right = role === 'belediye' && st !== 'yok' ? `<span class="tag ${st}">${STAT_TXT[st]}</span>` : (d != null ? distTxt(d) : b.yil);
    return `<li><button data-id="${b.id}" style="--k:var(--${b.k});--bgc:var(--${b.k}-bg)"><span class="sc">${Math.round(b.top)}</span><span><div class="nm">${esc(b.ad)}</div><div class="ad">${esc(b.adr || b.mh)}</div></span><span class="rt"><b>${KAT[b.k]}</b>${right}</span></button></li>`;
  }).join('')}</ul>`;
  h += `<div class="fnote">${state.src === 'ornek' ? 'Örnek veri: binalar, adlar ve değerler prototip için uydurulmuştur, haritadaki gerçek yapılarla ilgisi yoktur. ' : ''}Skorlar ön değerlendirmedir, resmi risk tespiti yerine geçmez.</div>`;
  return h;
}
function renderSheetListOnly() { if (state.sel != null) return; const t = sbody.scrollTop; sbody.innerHTML = listHTML(); sbody.scrollTop = t; }
let listTimer = 0;
function listeyiGuncelleSoon() { clearTimeout(listTimer); listTimer = setTimeout(renderSheetListOnly, 160); }

/* ================= BİNA KARTI ================= */
function ring(b) {
  const r = 44, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 108 108" role="img" aria-label="Risk skoru ${Math.round(b.top)} / 100"><circle class="rt" cx="54" cy="54" r="${r}"/><circle class="rg" cx="54" cy="54" r="${r}" stroke-dasharray="${(c * b.top / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 54 54)"/><text class="rn" x="54" y="50">${Math.round(b.top)}</text><text class="rs" x="54" y="72">/ 100</text></svg>`;
}
function facade(b) {
  const R = rng(b.id * 977), fl = Math.min(b.kat || 4, 10), fh = Math.min(112, fl * 16 + 14), fw = 148, x0 = 46, y0 = 134 - fh;
  let s = `<svg class="facade" viewBox="0 0 240 150" role="img" aria-label="Şematik bina çizimi"><line class="gnd" x1="10" y1="134" x2="230" y2="134"/><rect class="wall" x="${x0}" y="${y0}" width="${fw}" height="${fh}"/>`;
  const rh = (fh - 12) / fl;
  for (let i = 0; i < fl; i++) for (let j = 0; j < 4; j++) s += `<rect class="win" x="${x0 + 12 + j * 34}" y="${(y0 + 8 + i * rh).toFixed(1)}" width="20" height="${Math.min(9, rh - 5).toFixed(1)}" rx="1.5"/>`;
  const cov = b.cov != null ? b.cov : b.c / 40 * 9, n = b.n != null ? b.n : b.c / 40 * 4;
  const cn = Math.max(0, Math.round(cov / 3 + n / 2));
  for (let k = 0; k < cn; k++) {
    let x = x0 + 8 + R() * (fw - 16), y = y0 + 6 + R() * (fh - 24), d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
    for (let z = 0; z < 3 + Math.floor(R() * 2); z++) { x += R() * 10 - 5; y += 5 + R() * 8; d += `L${x.toFixed(1)} ${Math.min(y, 132).toFixed(1)}`; }
    s += `<path class="crk" d="${d}"/>`;
  }
  return s + `</svg>`;
}
function detailHTML(b) {
  const role = state.role, st = durumu(b);
  const bar = n => `<div><div class="lbl"><span>${n.ad}</span><b>${f1(n.val)} / ${n.max}</b></div><div class="trk"><div class="fill" style="width:${n.val / n.max * 100}%"></div></div><p>${esc(n.txt)}</p></div>`;
  let h = `<button class="back" data-back><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>Listeye dön</button>
  <div style="--c:var(--${b.k});--bgc:var(--${b.k}-bg)">
  <div class="dtop">${ring(b)}<div><span class="badge">${KAT[b.k]} risk</span><h2>${esc(b.ad)}</h2><div class="addr">${esc(b.adr || b.mh)}</div></div></div>
  <div class="lead"><b>${KATSAY(b)}.</b> Skoru en çok etkileyen: ${enEtkili(b)}.</div>
  ${facade(b)}<div class="cap">Şematik gösterim: çizgiler tespit edilen çatlak yoğunluğunu temsil eder.</div></div>
  <div class="sec"><h3>Bu skor neden çıktı?</h3><div class="why">${nedenler(b).map(bar).join('')}</div>
  <div class="actions"><button class="mini" data-calc>Hesaplayıcıda aç</button></div></div>
  <div class="sec"><h3>Bina bilgileri</h3><dl class="facts"><div><dt>Yapım yılı</dt><dd>${b.yil}</dd></div><div><dt>Kat sayısı</dt><dd>${b.kat != null ? b.kat : '-'}</dd></div><div><dt>Mahalle</dt><dd style="font-size:13.5px">${esc(b.mh)}</dd></div><div><dt>Son tarama</dt><dd style="font-size:13.5px">${esc(b.tarih || '-')}</dd></div></dl></div>`;
  if (role === 'belediye') {
    h += `<div class="sec"><h3>Denetim durumu</h3><div class="stat3" role="group" aria-label="Denetim durumu">${['bekliyor', 'planli', 'incelendi'].map(k => `<button data-st="${k}" aria-pressed="${st === k}">${STAT_TXT[k]}</button>`).join('')}</div>
    <textarea id="note" placeholder="Not ekle: ekip, tarih, bulgu…" aria-label="Denetim notu">${esc(state.notes[b.key] || '')}</textarea>
    <div class="actions"><button class="btn" data-rapor>Rapor oluştur</button><button class="btn alt" data-copy="one">Özeti kopyala</button></div></div>`;
  } else if (role === 'afad') {
    const grp = B.filter(x => x.mh === b.mh).sort((a, z) => z.top - a.top), rank = grp.findIndex(x => x.id === b.id) + 1;
    const ort = grp.reduce((s, x) => s + x.top, 0) / grp.length;
    h += `<div class="sec"><h3>Mahalledeki yeri</h3><p class="mtxt">${esc(b.mh)} içinde ${grp.length} binadan ${rank}. en riskli bina. Mahalle ortalaması ${f1(ort)}.</p>
    <div class="actions"><button class="btn" data-rapor>Rapor oluştur</button><button class="btn alt" data-copy="one">Özeti kopyala</button></div></div>`;
  } else {
    const todo = b.k === 'high' ? ['Bina yöneticisine bu raporu göster ve çatlakları fotoğrafla.', 'Bakanlıkça yetkilendirilmiş kuruluşlara resmi risk tespiti için başvur.', 'Belediyenin kentsel dönüşüm birimine danış.']
      : b.k === 'mid' ? ['Çatlakları tarihli fotoğraflarla kayıt altına al.', 'Bir inşaat mühendisinden görüş iste.', 'Altı ay sonra yeni taramayı bekle.']
      : ['Şu an ek işlem gerekmiyor.', 'Yeni bir çatlak görürsen fotoğraflayıp yöneticiye bildir.', 'Yıllık taramada skor güncellenir.'];
    h += `<div class="sec"><h3>Ne yapabilirsin?</h3><ul class="todo">${todo.map(t => `<li>${t}</li>`).join('')}</ul>
    <div class="actions"><button class="btn" data-copy="one">Paylaşmak için kopyala</button><button class="btn alt" data-rapor>Rapor oluştur</button></div></div>`;
  }
  return h + `<p class="disc">Bu skor drone fotoğraflarından yapılan ön değerlendirmedir. Binanın deprem güvenliği hakkında kesin hüküm vermez, resmi risk tespitinin yerine geçmez.</p>`;
}
function renderDetail() {
  const b = B.find(x => x.id === state.sel); sbody.innerHTML = detailHTML(b);
  const n = $('note'); if (n) n.addEventListener('input', () => { state.notes[b.key] = n.value; persist(); });
}
sbody.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('[data-back]')) { state.sel = null; setSheet('half'); renderAll(); return; }
  const sort = t.closest('[data-sort]');
  if (sort) { state.sort = sort.dataset.sort; if (state.sort === 'yakin' && !state.me) konumAl(); renderSheetListOnly(); return; }
  const st = t.closest('[data-st]');
  if (st) { const b = B.find(x => x.id === state.sel); state.status[b.key] = st.dataset.st; persist(); renderDetail(); toast('Durum güncellendi: ' + STAT_TXT[st.dataset.st]); return; }
  if (t.closest('[data-calc]')) { openCalc(B.find(x => x.id === state.sel)); return; }
  if (t.closest('[data-rapor]')) { raporAc(B.find(x => x.id === state.sel)); return; }
  const cp = t.closest('[data-copy]');
  if (cp) { const b = B.find(x => x.id === state.sel); kopyala(`${b.ad} (${b.adr || b.mh}): risk skoru ${Math.round(b.top)}/100, ${KAT[b.k]}. Yapım yılı ${b.yil}. Ön değerlendirmedir, resmi risk tespiti değildir. #RisktekiBina`, 'Özet kopyalandı'); return; }
  const mah = t.closest('[data-mah]');
  if (mah) { const m = mahalleOzet()[+mah.dataset.mah]; fitBuildings(m.a, state.sheet); return; }
  const row = t.closest('.rows button'); if (row) select(+row.dataset.id, true);
});
function renderAll() { if (state.sel == null) sbody.innerHTML = listHTML(); else renderDetail(); renderPins(); }

/* ================= YARDIMCILAR ================= */
function kopyala(text, msg) {
  const ok = () => toast(msg);
  const fb = () => { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (_) { toast('Kopyalanamadı'); } t.remove(); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fb); else fb();
}
let tt = 0;
function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 3200); }

function konumAl() {
  if (!navigator.geolocation) { toast('Bu cihaz konum özelliğini desteklemiyor'); return; }
  toast('Konum alınıyor…');
  navigator.geolocation.getCurrentPosition(pos => {
    state.me = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy };
    drawMe(); centerOn(state.me.lat, state.me.lon, 16); renderSheetListOnly();
  }, () => toast('Konum alınamadı. Tarayıcıdan veya uygulama ayarlarından konum iznini aç.'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
}
$('loc').onclick = konumAl;
$('zIn').onclick = () => MAP.m.zoomIn();
$('zOut').onclick = () => MAP.m.zoomOut();

/* ================= PENCERELER ================= */
const MODALS = ['mTools', 'mCalc', 'mPhoto', 'mRep'];
let lastFocus = null;
function openModal(id) {
  lastFocus = document.activeElement;
  MODALS.forEach(m => { $(m).hidden = m !== id; });
  const f = $(id).querySelector('button,input'); if (f) f.focus();
}
function closeModal() { MODALS.forEach(m => { $(m).hidden = true; }); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) closeModal(); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$('toolsBtn').onclick = () => openModal('mTools');
$('mTools').addEventListener('click', e => {
  const b = e.target.closest('[data-tool]'); if (!b) return;
  const t = b.dataset.tool;
  if (t === 'foto') fotoAc();
  else if (t === 'calc') openCalc(null);
  else if (t === 'liste') raporAc(null);
  else if (t === 'veri') $('dataFile').click();
  else if (t === 'ornek') { try { localStorage.removeItem(DATA_KEY); } catch (_) { } closeModal(); veriyiYukle().then(d => { setData(d.list, d.src); toast('Örnek veriye dönüldü'); }); }
});

/* ---- veri yükleme ---- */
$('dataFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const text = await f.text(), j = JSON.parse(text), arr = Array.isArray(j) ? j : j.binalar;
    if (!Array.isArray(arr)) throw new Error('liste yok');
    const r = listeyiHazirla(arr);
    if (!r.list.length) { closeModal(); toast('Dosyada kullanılabilir bina yok. Her binada enlem/boylam, yıl ve pga olmalı.'); return; }
    try { localStorage.setItem(DATA_KEY, text); } catch (_) { }
    closeModal(); setData(r.list, 'dosya');
    toast(`${r.list.length} bina yüklendi` + (r.bad ? `, ${r.bad} kayıt eksik bilgi yüzünden atlandı` : ''));
  } catch (err) { closeModal(); toast('Dosya okunamadı. Geçerli bir JSON dosyası seç.'); }
});
function setData(list, src) {
  B = list; state.src = src; state.sel = null; setSheet('peek');
  const n = $('srcnote');
  n.textContent = src === 'ornek' ? 'ÖRNEK VERİ · gerçek bina değil' : src === 'dosya' ? 'Yüklenen veri' : 'binalar.json';
  n.hidden = false;
  renderAll(); fitBuildings(B, 'peek', false);
}

/* ---- hesaplayıcı ---- */
const cl = (v, a, z) => Math.max(a, Math.min(z, v));
function openCalc(b) {
  if (b) {
    $('cCov').value = cl(b.cov != null ? b.cov : b.c / 40 * 9, 0, 20); $('cN').value = cl(b.n != null ? b.n : b.c / 40 * 4, 0, 8);
    $('cPga').value = cl(b.pga, 0.05, 0.9); $('cYil').value = b.yil;
  }
  openModal('mCalc'); hesapCiz();
}
function hesapCiz() {
  const b = { cov: +$('cCov').value, n: +$('cN').value, pga: +$('cPga').value, yil: Math.min(2026, Math.max(1900, +$('cYil').value || 1988)) };
  $('oCov').textContent = '%' + f1(b.cov); $('oN').textContent = f1(b.n); $('oPga').textContent = b.pga.toFixed(2).replace('.', ',') + ' g';
  const r = hesapla(b);
  $('res').style.cssText = `--k:var(--${r.k});--kb:var(--${r.k}-bg)`;
  $('res').innerHTML = `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><div style="font:700 48px/1 var(--f-display);color:var(--c)">${Math.round(r.top)}<small style="font:500 15px var(--f-data);color:var(--muted)"> /100</small></div><div><span class="badge" style="--c:var(--${r.k});--bgc:var(--${r.k}-bg)">${KAT[r.k]} risk</span><div style="font-size:13px;color:var(--muted);margin-top:6px">Çatlak ${f1(r.c)} + Tehlike ${f1(r.t)} + Yaş ${f1(r.ya)}</div></div></div>
  <div class="zones"><i style="left:${r.top}%"></i></div><div class="zlab"><span>0</span><span>40</span><span>70</span><span>100</span></div>`;
}
['cCov', 'cN', 'cPga', 'cYil'].forEach(i => $(i).addEventListener('input', hesapCiz));

/* ---- fotoğraf analizi ---- */
let ph = null;
function fotoAc() {
  const b = state.sel != null ? B.find(x => x.id === state.sel) : null;
  $('oConf').textContent = (+$('phConf').value).toFixed(2).replace('.', ','); $('phYil').value = b ? b.yil : 1988; $('phPga').value = b ? b.pga : 0.45;
  $('phBina').textContent = b ? `Yıl ve PGA değerleri seçili binadan alındı: ${b.ad}.` : 'Binayı seçmeden de deneyebilirsin. Yıl ve PGA değerlerini elle gir.';
  openModal('mPhoto');
}
function fotoSonuc() {
  if (!ph) return;
  const yil = Math.min(2026, Math.max(1900, +$('phYil').value || 1988)), pga = +$('phPga').value || 0.45;
  const r = hesapla({ cov: ph.cov, n: ph.n, pga, yil });
  $('phOut').innerHTML = `<div class="res" style="--k:var(--${r.k});--kb:var(--${r.k}-bg)"><div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <div style="font:700 44px/1 var(--f-display);color:var(--c)">${Math.round(r.top)}<small style="font:500 15px var(--f-data);color:var(--muted)"> /100</small></div>
    <div><span class="badge" style="--c:var(--${r.k});--bgc:var(--${r.k}-bg)">${KAT[r.k]} risk</span>
    <div style="font-size:13px;color:var(--muted);margin-top:6px">Çatlak ${f1(r.c)} + Tehlike ${f1(r.t)} + Yaş ${f1(r.ya)}</div></div></div></div>
    <p class="ph-note">Bu fotoğrafta ${ph.n} çatlak bulundu, görüntü alanının %${f1(ph.cov)}’i çatlaklı. Tek fotoğrafla yapılan bu hesap yalnızca deneme içindir. Gerçek skor bir binanın tüm fotoğraflarından hesaplanır.</p>`;
}
['phYil', 'phPga'].forEach(i => $(i).addEventListener('input', fotoSonuc));
let phRaw = null, phImg = null, phSc = 1, phSel = null;   // phSel: serbest çizilmiş bölge, tuval pikselinde nokta listesi
function polyAlan(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; } return Math.abs(a) / 2; }
function icinde(pt, p) {
  let in_ = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i].y > pt.y) !== (p[j].y > pt.y) && pt.x < (p[j].x - p[i].x) * (pt.y - p[i].y) / (p[j].y - p[i].y) + p[i].x) in_ = !in_;
  }
  return in_;
}
function phBoxes() {
  if (!phRaw) return [];
  const conf = +$('phConf').value;
  return phRaw.res.boxes.filter(b => b.score >= conf && (!phRaw.poly || icinde({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 }, phRaw.poly)));
}
function phDraw() {
  if (!phImg) return;
  const cv = $('phCanvas'), c = cv.getContext('2d');
  c.drawImage(phImg, 0, 0, cv.width, cv.height);
  if (phSel && phSel.length > 1) {
    c.save(); c.beginPath(); c.rect(0, 0, cv.width, cv.height);
    c.moveTo(phSel[0].x, phSel[0].y); phSel.slice(1).forEach(p => c.lineTo(p.x, p.y)); c.closePath();
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fill('evenodd'); c.restore();
    c.lineWidth = Math.max(2, cv.width / 260); c.strokeStyle = '#4da3ff'; c.setLineDash([10, 6]); c.lineJoin = 'round';
    c.beginPath(); c.moveTo(phSel[0].x, phSel[0].y); phSel.slice(1).forEach(p => c.lineTo(p.x, p.y)); c.closePath(); c.stroke(); c.setLineDash([]);
  }
  if (phRaw) {
    c.lineWidth = Math.max(2, cv.width / 220); c.strokeStyle = '#ff3b3b'; c.fillStyle = '#ff3b3b'; c.font = `600 ${Math.max(12, cv.width / 45)}px sans-serif`;
    phBoxes().forEach(b => {
      const x = (phRaw.off.x + b.x1) * phSc, y = (phRaw.off.y + b.y1) * phSc, w = (b.x2 - b.x1) * phSc, h = (b.y2 - b.y1) * phSc;
      c.strokeRect(x, y, w, h); c.fillText(b.score.toFixed(2), x + 3, Math.max(14, y - 5));
    });
  }
}
function fotoCiz() {
  $('oConf').textContent = (+$('phConf').value).toFixed(2).replace('.', ',');
  if (!phRaw) { phDraw(); return; }
  const res = phRaw.res, boxes = phBoxes();
  phDraw();
  ph = tespitOzeti({ boxes, w: res.w, h: res.h });
  if (phRaw.alan) ph.cov = Math.min(100, Math.round(ph.cov * (res.w * res.h) / phRaw.alan * 100) / 100);
  const t = (+$('phConf').value).toFixed(2).replace('.', ',');
  $('phNote').className = 'ph-note';
  $('phNote').textContent = ph.n ? `${ph.n} çatlak kutusu bulundu (güven eşiği ${t}).` : `Bu fotoğrafta çatlak bulunamadı (güven eşiği ${t}).`;
  fotoSonuc();
}
$('phConf').addEventListener('input', fotoCiz);

async function phAnaliz() {
  if (!phImg) return;
  const W = phImg.naturalWidth, H = phImg.naturalHeight;
  let sx = 0, sy = 0, sw = W, sh = H, poly = null, alan = 0;
  if (phSel && phSel.length > 2) {
    const xs = phSel.map(p => p.x / phSc), ys = phSel.map(p => p.y / phSc);
    sx = Math.max(0, Math.floor(Math.min(...xs))); sy = Math.max(0, Math.floor(Math.min(...ys)));
    sw = Math.min(W - sx, Math.ceil(Math.max(...xs)) - sx); sh = Math.min(H - sy, Math.ceil(Math.max(...ys)) - sy);
    poly = phSel.map(p => ({ x: p.x / phSc - sx, y: p.y / phSc - sy }));
    alan = polyAlan(poly);
  }
  const cr = document.createElement('canvas'); cr.width = sw; cr.height = sh;
  const cc = cr.getContext('2d');
  if (poly) {
    cc.fillStyle = 'rgb(114,114,114)'; cc.fillRect(0, 0, sw, sh);   // seçim dışı nötr gri, model bu alana bakmaz
    cc.save(); cc.beginPath(); cc.moveTo(poly[0].x, poly[0].y); poly.slice(1).forEach(p => cc.lineTo(p.x, p.y)); cc.closePath(); cc.clip();
    cc.drawImage(phImg, sx, sy, sw, sh, 0, 0, sw, sh); cc.restore();
  } else cc.drawImage(phImg, 0, 0, W, H);
  $('phOut').innerHTML = ''; ph = null; phRaw = null; phDraw();
  $('phNote').className = 'ph-note';
  $('phNote').textContent = 'Model çalışıyor… (ilk seferde model yüklendiği için biraz sürer)';
  try {
    const res = await aiTespit(cr, 0.1);
    phRaw = { res, off: { x: sx, y: sy }, poly, alan };
    fotoCiz();
  } catch (err) {
    $('phNote').className = 'ph-err';
    $('phNote').textContent = err.message === 'MODEL_YOK'
      ? 'Model dosyası (model.onnx) uygulamada yok. Ekibin eğitilmiş modeli depoya eklenince bu özellik çalışır.'
      : String(err.message).startsWith('BETIK') ? 'Model çalıştırıcısı yüklenemedi. İnternet bağlantını kontrol et.'
      : 'Analiz yapılamadı: ' + err.message;
  }
}
$('phRun').onclick = phAnaliz;
$('phClr').onclick = () => { phSel = null; phRaw = null; ph = null; $('phOut').innerHTML = ''; $('phNote').textContent = 'Seçim temizlendi. Tüm fotoğraf taranacak.'; phDraw(); };
(function phSelect() {
  const cv = $('phCanvas'); let drawing = false;
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(cv.width, (e.clientX - r.left) * cv.width / r.width)), y: Math.max(0, Math.min(cv.height, (e.clientY - r.top) * cv.height / r.height)) }; };
  cv.addEventListener('pointerdown', e => { drawing = true; cv.setPointerCapture(e.pointerId); phSel = [pos(e)]; phRaw = null; ph = null; $('phOut').innerHTML = ''; });
  cv.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = pos(e), l = phSel[phSel.length - 1];
    if (Math.hypot(p.x - l.x, p.y - l.y) >= 3) { phSel.push(p); phDraw(); }
  });
  const end = () => {
    if (!drawing) return; drawing = false;
    if (phSel.length < 8 || polyAlan(phSel) < 600) phSel = null;
    $('phNote').className = 'ph-note';
    $('phNote').textContent = phSel ? 'Bölge seçildi. “Analiz et”e bas.' : 'Duvarın etrafını parmağınla çizerek seç, sonra “Analiz et”e bas.';
    phDraw();
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
})();
$('phFile').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const url = URL.createObjectURL(f), img = new Image();
  $('phOut').innerHTML = ''; ph = null; phRaw = null; phSel = null; phImg = null;
  $('phNote').className = 'ph-note'; $('phNote').textContent = 'Fotoğraf okunuyor…';
  img.onerror = () => { $('phNote').className = 'ph-err'; $('phNote').textContent = 'Bu dosya bir resim olarak açılamadı.'; URL.revokeObjectURL(url); };
  img.onload = () => {
    const cv = $('phCanvas'); phSc = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
    cv.width = Math.round(img.naturalWidth * phSc); cv.height = Math.round(img.naturalHeight * phSc);
    phImg = img; cv.hidden = false; $('phBtns').hidden = false; phDraw();
    $('phNote').textContent = 'Duvarın etrafını parmağınla çizerek seç (toprak, ağaç ve gölge dışarıda kalsın), sonra “Analiz et”e bas. Çizmezsen tüm fotoğraf taranır.';
    URL.revokeObjectURL(url);
  };
  img.src = url;
});

/* ---- rapor ---- */
let rep = null;
async function raporAc(b) {
  openModal('mRep');
  const cv = $('repCv');
  $('repTitle').textContent = b ? 'Bina raporu' : 'Yüksek riskli binalar raporu';
  rep = { ad: b ? 'rapor-' + norm(b.ad).replace(/[^a-z0-9]+/g, '-') : 'yuksek-riskli-binalar' };
  $('repNote').textContent = 'Hazırlanıyor…';
  try {
    if (b) await tekBinaRaporu(b, cv); else await listeRaporu(cv);
    $('repNote').textContent = state.src === 'ornek' ? 'Bu rapor örnek verilerle hazırlandı, üzerinde “ÖRNEK VERİ” yazar.' : '';
  } catch (e) { $('repNote').textContent = 'Rapor hazırlanamadı: ' + e.message; }
}
$('repPng').onclick = () => rep && resimIndir($('repCv'), rep.ad);
$('repPdf').onclick = async () => {
  if (!rep) return;
  try { $('repNote').textContent = 'PDF hazırlanıyor…'; await pdfIndir($('repCv'), rep.ad); $('repNote').textContent = ''; }
  catch (e) { $('repNote').textContent = 'PDF oluşturulamadı. Resim olarak indirmeyi dene. İndirme çalışmazsa resmi basılı tutup kaydedebilirsin.'; }
};

/* ================= BAŞLANGIÇ ================= */
async function boot() {
  document.querySelectorAll('[data-role]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.role === state.role)));
  applySheet(); renderChips(); hesapCiz();
  initMap();
  const d = await veriyiYukle();
  setData(d.list, d.src);
}
window.addEventListener('resize', () => { applySheet(); if (MAP.m) { MAP.m.invalidateSize(); renderPins(); } renderSheetListOnly(); });
boot();
try { if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js'); } catch (e) { }
