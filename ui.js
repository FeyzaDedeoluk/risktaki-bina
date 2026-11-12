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
  state.role = r; persist(); $('app').dataset.role = r;
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
  return `<div class="big" role="img" aria-label="Risk skoru ${Math.round(b.top)} / 100"><b>${Math.round(b.top)}</b><span>/ 100</span></div>`;
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
  ${b.kanit ? `<img class="kanit" src="${b.kanit}" alt="Binanın işaretli drone fotoğrafı"><div class="cap">Gerçek fotoğraf: kutular tespit edilen hasarlar (kırmızı çatlak, turuncu beton kopması, kahverengi korozyon, mavi tuzlanma), koyulaştırılan bölge (gökyeri, ağaç, zemin) taramaya katılmadı.</div>` : `${facade(b)}<div class="cap">Şematik gösterim: çizgiler tespit edilen hasar yoğunluğunu temsil eder.</div>`}</div>
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
    const todo = b.k === 'high' ? ['Bina yöneticisine bu raporu göster ve hasarlı yerleri fotoğraflа.'.replace('а',''), 'Bakanlıkça yetkilendirilmiş kuruluşlara resmi risk tespiti için başvur.', 'Belediyenin kentsel dönüşüm birimine danış.']
      : b.k === 'mid' ? ['Hasarlı yerleri tarihli fotoğraflarla kayıt altına al.', 'Bir inşaat mühendisinden görüş iste.', 'Altı ay sonra yeni taramayı bekle.']
      : ['Şu an ek işlem gerekmiyor.', 'Yeni bir çatlak veya dökülme gördüysen fotoğraflayıp yöneticiye bildir.', 'Yıllık taramada skor güncellenir.'];
    h += `<div class="sec"><h3>Ne yapabilirsin?</h3><ul class="todo">${todo.map(t => `<li>${t}</li>`).join('')}</ul>
    <div class="actions"><button class="btn" data-copy="one">Paylaşmak için kopyala</button><button class="btn alt" data-rapor>Rapor oluştur</button></div></div>`;
  }
  return h + `<p class="disc">Bu skor drone fotoğraflarından yapılan ön değerlendirmedir. Binanın deprem güvenliği hakkında kesin hüküm vermez, resmi risk tespitinin yerine geçmez.</p>`;
}
