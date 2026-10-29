/* Risktaki Bina: skor formülü, örnek veri ve veri yükleme.
   Formül risk_skor.py ile aynıdır. */

function catlakSkoru(cov, n) { return 40 * (0.6 * Math.min(1, cov / 15) + 0.4 * Math.min(1, n / 5)); }
function tehlikeSkoru(pga) { return 35 * Math.max(0, Math.min(1, (pga - 0.05) / 0.75)); }
function yasSkoru(y) {
  if (y < 1975) return 25;
  if (y < 1998) return 20 - (y - 1975) / 23 * 5;
  if (y < 2018) return 12 - (y - 1998) / 20 * 6;
  return 3;
}
function hesapla(b) {
  const hasCN = b.cov != null && b.n != null;
  const c = hasCN ? catlakSkoru(b.cov, b.n) : (b.c0 != null ? b.c0 : 0);
  const t = tehlikeSkoru(b.pga), ya = yasSkoru(b.yil);
  const top = Math.round((c + t + ya) * 10) / 10;
  return { c, t, ya, top, k: top <= 40 ? 'low' : top <= 70 ? 'mid' : 'high' };
}

const KAT = { low: 'Düşük', mid: 'Orta', high: 'Yüksek' };
const STAT_TXT = { bekliyor: 'Denetim bekliyor', planli: 'Planlandı', incelendi: 'İncelendi', yok: 'Gerekmiyor' };
const ISLEM = {
  high: 'Öncelikli yerinde mühendis incelemesi önerilir. Belediyeye ve AFAD’a bildirim listesine eklenir.',
  mid: 'Yakın dönemde uzman kontrolü planlanmalı. Altı ayda bir yeniden tarama önerilir.',
  low: 'Rutin izleme yeterli. Yıllık drone taramasında yeniden değerlendirilir.'
};
const KATSAY = b => b.top <= 40 ? 'Rutin izleme yeterli görünüyor' : b.top <= 70 ? 'Yakın dönemde uzman kontrolü önerilir' : 'Öncelikli inceleme gerektiriyor';
function donem(y) {
  return y < 1975 ? '1975 deprem yönetmeliğinden önce yapılmış'
    : y < 1998 ? '1975 yönetmeliği döneminde yapılmış'
    : y < 2018 ? '1998 yönetmeliği döneminde yapılmış'
    : '2018 deprem yönetmeliği (TBDY) döneminde yapılmış';
}
const f1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');

/* Skorun nedenleri: bina kartında ve raporda aynı metin kullanılır */
function nedenler(b) {
  const tehTxt = b.pga >= 0.55 ? 'Yüksek tehlike bölgesi' : b.pga >= 0.45 ? 'Orta-yüksek tehlike bölgesi' : b.pga >= 0.3 ? 'Orta tehlike bölgesi' : 'Düşük-orta tehlike bölgesi';
  const catTxt = (b.cov != null && b.n != null)
    ? `${b.foto || '?'} fotoğrafta, fotoğraf başına ortalama ${f1(b.n)} çatlak bulundu. Görüntü alanının %${f1(b.cov)}’i çatlaklı.`
    : 'Çatlak skoru dosyadaki değerden alındı, ayrıntı verilmemiş.';
  return [
    { ad: 'Çatlak', val: b.c, max: 40, txt: catTxt },
    { ad: 'Deprem tehlikesi', val: b.t, max: 35, txt: `Bölgenin tepe yer ivmesi ${String(b.pga).replace('.', ',')} g. ${tehTxt}.` },
    { ad: 'Bina yaşı', val: b.ya, max: 25, txt: `${b.yil} yapımı${b.yilT ? ' (tahmini, resmî kayıt yok)' : ''}, ${donem(b.yil)}.` }
  ];
}
function enEtkili(b) {
  return [['çatlak bulguları', b.c / 40], ['bölgenin deprem tehlikesi', b.t / 35], ['bina yaşı', b.ya / 25]].sort((a, z) => z[1] - a[1])[0][0];
}

/* ---------- yardımcılar ---------- */
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function haversine(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function distTxt(m) { return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${f1(m / 1000)} km`; }

/* ---------- ÖRNEK VERİ (uydurma) ----------
   Binalar, adlar ve değerler gerçek değildir. Haritadaki gerçek yapılarla ilgisi yoktur. */
const ORNEK_MERKEZ = { lat: 38.4615, lon: 27.2165 };
function ornekVeri() {
  const R = rng(20261024), pts = [], clamp = (v, a, z) => Math.max(a, Math.min(z, v));
  let guard = 0;
  while (pts.length < 36 && guard++ < 4000) {
    const p = { lat: ORNEK_MERKEZ.lat + (R() - 0.5) * 0.017, lon: ORNEK_MERKEZ.lon + (R() - 0.5) * 0.023 };
    if (pts.every(q => haversine(p, q) > 120)) pts.push(p);
  }
  return pts.map((p, i) => {
    const r = R(); let yil;
    if (r < 0.34) yil = 1962 + Math.floor(R() * 24);
    else if (r < 0.62) yil = 1986 + Math.floor(R() * 14);
    else if (r < 0.88) yil = 2000 + Math.floor(R() * 18);
    else yil = 2018 + Math.floor(R() * 8);
    const kat = yil < 1986 ? 3 + Math.floor(R() * 5) : yil < 2000 ? 4 + Math.floor(R() * 5) : 5 + Math.floor(R() * 6);
    const north = p.lat >= ORNEK_MERKEZ.lat, east = p.lon >= ORNEK_MERKEZ.lon;
    const mh = 'Örnek Mahalle ' + (north ? (east ? 'B' : 'A') : (east ? 'D' : 'C'));
    const pga = Math.round((0.26 + R() * 0.3 + (mh.endsWith('D') ? 0.05 : 0)) * 100) / 100;
    const age = clamp((2026 - yil) / 60, 0, 1);
    const cov = Math.round(clamp(age * 16 + (R() * 6 - 3.5), 0.3, 16) * 2) / 2;
    const n = Math.round(clamp(cov * 0.38 + (R() * 2 - 0.7), 0.3, 7) * 2) / 2;
    const day = 1 + Math.floor(R() * 21), mon = R() < 0.5 ? 'Eylül' : 'Ekim';
    const st = R();
    return {
      ad: 'Örnek Bina ' + String(i + 1).padStart(2, '0'),
      adr: `${mh}, örnek adres ${2 + Math.floor(R() * 38)}`,
      mh, yil, kat, pga, cov, n, foto: 8 + Math.floor(R() * 17), tarih: `${day} ${mon} 2026`,
      lat: p.lat, lon: p.lon, _st: st
    };
  });
}

/* Dosyadaki ham kaydı uygulamanın kullandığı biçime çevirir. Geçersizse null döner. */
function normalizeBina(raw, i) {
  const num = v => { if (v === null || v === undefined || v === '') return null; const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };
  const lat = num(raw.lat ?? raw.enlem), lon = num(raw.lon ?? raw.boylam ?? raw.lng);
  const yil = num(raw.yil ?? raw.yapim_yili);
  let pga = num(raw.pga);
  if (pga == null && raw.bolge != null) pga = { 1: 0.8, 2: 0.61, 3: 0.43, 4: 0.24, 5: 0.13 }[raw.bolge] ?? null;
  if (lat == null || lon == null || yil == null || pga == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const b = {
    id: i + 1, ad: String(raw.ad || ('Bina ' + (i + 1))), adr: String(raw.adr || raw.adres || ''),
    mh: String(raw.mh || raw.mahalle || 'Mahalle belirtilmemiş'),
    yil: Math.round(yil), kat: num(raw.kat), pga, lat, lon,
    cov: num(raw.cov ?? raw.kapsama_yuzde), n: num(raw.n ?? raw.catlak_ort),
    c0: num(raw.catlak_skoru), foto: num(raw.foto ?? raw.goruntu_sayisi) || 0, tarih: String(raw.tarih || ''),
    yilT: !!(raw.yil_tahmin), _st: raw._st
  };
  b.key = b.ad + '|' + lat.toFixed(5) + '|' + lon.toFixed(5);
  Object.assign(b, hesapla(b));
  return b;
}
function listeyiHazirla(rawList) {
  const out = []; let bad = 0;
  rawList.forEach((r, i) => { const b = r && normalizeBina(r, out.length); if (b) out.push(b); else bad++; });
  return { list: out, bad };
}

/* Veri kaynağı sırası: yüklenen dosya (cihazda saklı) > binalar.json > örnek veri */
const DATA_KEY = 'risktaki-bina-veri-v1';
async function veriyiYukle() {
  try {
    const t = localStorage.getItem(DATA_KEY);
    if (t) {
      const j = JSON.parse(t), arr = Array.isArray(j) ? j : j.binalar;
      const r = listeyiHazirla(arr || []);
      if (r.list.length) return { list: r.list, src: 'dosya' };
    }
  } catch (e) { }
  try {
    const res = await fetch('binalar.json', { cache: 'no-store' });
    if (res.ok) {
      const j = await res.json(), arr = Array.isArray(j) ? j : j.binalar;
      const r = listeyiHazirla(arr || []);
      if (r.list.length) return { list: r.list, src: 'binalar.json' };
    }
  } catch (e) { }
  return { list: listeyiHazirla(ornekVeri()).list, src: 'ornek' };
}
