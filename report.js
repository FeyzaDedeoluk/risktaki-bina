/* Rapor: A4 boyutunda bir resim çizer (canvas). Resim olarak veya PDF olarak indirilebilir.
   Türkçe karakterler tarayıcının yazı tipiyle çizildiği için doğru çıkar. */

const RP = { W: 1240, H: 1754, M: 80 };
const RC = { low: '#1f8a5b', mid: '#b07d08', high: '#cf3a3a', lowBg: '#dff3e9', midBg: '#fbefc9', highBg: '#fadcdc',
  ink: '#15202d', mut: '#586577', line: '#dde3ea', acc: '#0e63b3', soft: '#f1f4f8' };
const RF = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function rrect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function wrapText(c, text, x, y, maxW, lh) {
  const words = String(text).split(' '); let line = '', yy = y;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (c.measureText(t).width > maxW && line) { c.fillText(line, x, yy); line = w; yy += lh; } else line = t;
  }
  if (line) { c.fillText(line, x, yy); yy += lh; }
  return yy;
}
function fitText(c, text, maxW) {
  let t = String(text);
  if (c.measureText(t).width <= maxW) return t;
  while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function raporBaslik(c, baslik, alt) {
  const { W, M } = RP;
  c.fillStyle = '#fff'; c.fillRect(0, 0, W, RP.H);
  c.fillStyle = RC.acc; c.fillRect(0, 0, W, 170);
  c.fillStyle = '#fff'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.font = `700 46px ${RF}`; c.fillText('RİSKTEKİ BİNA', M, 84);
  c.font = `500 27px ${RF}`; c.fillText(baslik, M, 126);
  c.textAlign = 'right'; c.font = `500 24px ${RF}`;
  c.fillText(new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }), W - M, 84);
  c.font = `500 22px ${RF}`; c.fillText(alt || '', W - M, 126);
  c.textAlign = 'left';
  if (state.src === 'ornek') {
    c.save(); c.translate(W / 2, RP.H / 2 + 60); c.rotate(-0.5);
    c.font = `700 190px ${RF}`; c.fillStyle = 'rgba(207,58,58,0.10)'; c.textAlign = 'center';
    c.fillText('ÖRNEK VERİ', 0, 0); c.restore(); c.textAlign = 'left';
  }
}
function raporAltBilgi(c) {
  const { W, H, M } = RP;
  c.strokeStyle = RC.line; c.lineWidth = 2; c.beginPath(); c.moveTo(M, H - 150); c.lineTo(W - M, H - 150); c.stroke();
  c.fillStyle = RC.mut; c.font = `400 21px ${RF}`;
  wrapText(c, 'Bu skor, drone fotoğraflarından yapılan ön değerlendirmedir. Binanın deprem güvenliği hakkında kesin hüküm vermez ve resmi risk tespitinin yerine geçmez.', M, H - 110, W - 2 * M, 30);
  c.font = `500 20px ${RF}`;
  c.fillText('Risktaki Bina · SEMRUK' + (state.src === 'ornek' ? ' · Örnek veri, gerçek bina değildir' : ''), M, H - 36);
}

async function tekBinaRaporu(b, canvas) {
  try { await document.fonts.ready; } catch (e) { }
  canvas.width = RP.W; canvas.height = RP.H;
  const c = canvas.getContext('2d'), { W, M } = RP, col = RC[b.k], colBg = RC[b.k + 'Bg'];
  raporBaslik(c, 'Bina Risk Ön Değerlendirme Raporu', b.mh);
  // bina adı
  c.fillStyle = RC.ink; c.font = `700 52px ${RF}`; c.fillText(fitText(c, b.ad, W - 2 * M), M, 270);
  c.fillStyle = RC.mut; c.font = `400 27px ${RF}`; c.fillText(fitText(c, b.adr || b.mh, W - 2 * M), M, 312);
  // skor halıkası
  const cx = M + 150, cy = 500, r = 120;
  c.lineWidth = 26; c.lineCap = 'round';
  c.strokeStyle = RC.soft; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = col; c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * b.top / 100); c.stroke();
  c.fillStyle = RC.ink; c.textAlign = 'center'; c.font = `700 100px ${RF}`; c.fillText(String(Math.round(b.top)), cx, cy + 28);
  c.fillStyle = RC.mut; c.font = `500 26px ${RF}`; c.fillText('/ 100', cx, cy + 72); c.textAlign = 'left';
  // kategori ve cümle
  const tx = M + 340;
  rrect(c, tx, 400, 230, 56, 28); c.fillStyle = colBg; c.fill();
  c.fillStyle = col; c.font = `700 28px ${RF}`; c.fillText(KAT[b.k] + ' risk', tx + 28, 438);
  c.fillStyle = RC.ink; c.font = `600 32px ${RF}`;
  let y = wrapText(c, KATSAY(b) + '.', tx, 508, W - M - tx, 44);
  c.fillStyle = RC.mut; c.font = `400 26px ${RF}`;
  wrapText(c, 'Skoru en çok etkileyen: ' + enEtkili(b) + '.', tx, y + 4, W - M - tx, 36);
  // skorun dağılımı
  y = 700;
  c.fillStyle = RC.ink; c.font = `700 34px ${RF}`; c.fillText('Skor neden böyle çıktı?', M, y);
  y += 30;
  nedenler(b).forEach(n => {
    y += 40;
    c.fillStyle = RC.ink; c.font = `600 27px ${RF}`; c.fillText(n.ad, M, y);
    c.textAlign = 'right'; c.font = `500 26px ${RF}`; c.fillText(f1(n.val) + ' / ' + n.max, W - M, y); c.textAlign = 'left';
    y += 16; rrect(c, M, y, W - 2 * M, 16, 8); c.fillStyle = RC.soft; c.fill();
    rrect(c, M, y, Math.max(16, (W - 2 * M) * n.val / n.max), 16, 8); c.fillStyle = RC.acc; c.fill();
    y += 46; c.fillStyle = RC.mut; c.font = `400 23px ${RF}`;
    y = wrapText(c, n.txt, M, y, W - 2 * M, 32) + 4;
  });
  // bilgiler
  y += 20;
  c.fillStyle = RC.ink; c.font = `700 34px ${RF}`; c.fillText('Bina bilgileri', M, y); y += 24;
  const info = [['Yapım yılı', String(b.yil)], ['Kat sayısı', b.kat != null ? String(b.kat) : 'belirtilmemiş'],
    ['Deprem ivmesi (PGA)', String(b.pga).replace('.', ',') + ' g'], ['Son tarama', b.tarih || 'belirtilmemiş'],
    ['Taranan fotoğraf', b.foto ? String(b.foto) : '-'], ['Konum', b.lat.toFixed(5) + ', ' + b.lon.toFixed(5)]];
  const cw = (W - 2 * M - 20) / 2;
  info.forEach((it, i) => {
    const x = M + (i % 2) * (cw + 20), yy = y + Math.floor(i / 2) * 92;
    rrect(c, x, yy, cw, 78, 12); c.fillStyle = RC.soft; c.fill();
    c.fillStyle = RC.mut; c.font = `500 20px ${RF}`; c.fillText(it[0].toUpperCase(), x + 20, yy + 30);
    c.fillStyle = RC.ink; c.font = `600 28px ${RF}`; c.fillText(fitText(c, it[1], cw - 40), x + 20, yy + 62);
  });
  y += 3 * 92 + 24;
  // öneri
  c.fillStyle = RC.ink; c.font = `700 34px ${RF}`; c.fillText('Önerilen işlem', M, y); y += 20;
  const hh = 110; rrect(c, M, y, W - 2 * M, hh, 14); c.fillStyle = colBg; c.fill();
  c.fillStyle = col; c.fillRect(M, y, 8, hh);
  c.fillStyle = RC.ink; c.font = `500 26px ${RF}`; wrapText(c, ISLEM[b.k], M + 32, y + 46, W - 2 * M - 64, 38);
  raporAltBilgi(c);
}

async function listeRaporu(canvas) {
  try { await document.fonts.ready; } catch (e) { }
  canvas.width = RP.W; canvas.height = RP.H;
  const c = canvas.getContext('2d'), { W, M } = RP;
  const yuksek = B.filter(b => b.k === 'high').sort((a, z) => z.top - a.top);
  const liste = (yuksek.length >= 5 ? yuksek : B.slice().sort((a, z) => z.top - a.top)).slice(0, 18);
  const baslik = yuksek.length >= 5 ? 'Yüksek Riskli Binalar Özeti' : 'En Riskli Binalar Özeti';
  raporBaslik(c, baslik, `${B.length} bina tarandı`);
  const say = { high: 0, mid: 0, low: 0 }; B.forEach(b => say[b.k]++);
  const ort = B.reduce((s, b) => s + b.top, 0) / (B.length || 1);
  let y = 250;
  const kutular = [['Toplam bina', B.length, RC.ink], ['Yüksek risk', say.high, RC.high], ['Orta risk', say.mid, RC.mid], ['Düşük risk', say.low, RC.low], ['Ortalama skor', f1(ort), RC.ink]];
  const bw = (W - 2 * M - 4 * 16) / 5;
  kutular.forEach((k, i) => {
    const x = M + i * (bw + 16);
    rrect(c, x, y, bw, 120, 14); c.fillStyle = RC.soft; c.fill();
    c.fillStyle = k[2]; c.font = `700 48px ${RF}`; c.fillText(String(k[1]), x + 18, y + 62);
    c.fillStyle = RC.mut; c.font = `500 20px ${RF}`; c.fillText(k[0], x + 18, y + 98);
  });
  y += 170;
  const cols = [M, M + 60, M + 480, M + 790, M + 900, M + 1010];
  c.fillStyle = RC.mut; c.font = `600 20px ${RF}`;
  ['#', 'BİNA', 'MAHALLE', 'SKOR', 'KATEGORİ', 'DURUM'].forEach((t, i) => c.fillText(t, cols[i], y));
  y += 14; c.strokeStyle = RC.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(M, y); c.lineTo(W - M, y); c.stroke();
  liste.forEach((b, i) => {
    y += 70;
    if (i % 2 === 0) { c.fillStyle = '#f7f9fb'; c.fillRect(M - 10, y - 46, W - 2 * M + 20, 70); }
    c.fillStyle = RC.mut; c.font = `500 24px ${RF}`; c.fillText(String(i + 1), cols[0], y);
    c.fillStyle = RC.ink; c.font = `600 25px ${RF}`; c.fillText(fitText(c, b.ad, 400), cols[1], y);
    c.fillStyle = RC.mut; c.font = `400 22px ${RF}`; c.fillText(fitText(c, b.mh, 290), cols[2], y);
    rrect(c, cols[3], y - 34, 84, 46, 12); c.fillStyle = RC[b.k + 'Bg']; c.fill();
    c.fillStyle = RC[b.k]; c.font = `700 26px ${RF}`; c.textAlign = 'center'; c.fillText(String(Math.round(b.top)), cols[3] + 42, y); c.textAlign = 'left';
    c.fillStyle = RC[b.k]; c.font = `600 22px ${RF}`; c.fillText(KAT[b.k], cols[4], y);
    c.fillStyle = RC.ink; c.font = `400 21px ${RF}`; c.fillText(fitText(c, STAT_TXT[durumu(b)] || '', 190), cols[5], y);
  });
  raporAltBilgi(c);
}

/* ---- indirme ---- */
function resimIndir(canvas, ad) {
  canvas.toBlob(blob => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ad + '.png';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}
async function pdfIndir(canvas, ad) {
  if (!window.jspdf) await betikYukle('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
  pdf.save(ad + '.pdf');
}
