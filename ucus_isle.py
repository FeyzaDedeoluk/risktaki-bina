#!/usr/bin/env python3
"""Risktaki Bina: drone uçuşunu otomatik işler.

Klasördeki fotoğraflar -> konuma göre binalara ayrılır -> gökyüzü, ağaç ve zemin
elenir (yalnızca duvar taranır) -> çatlak tespiti -> bina bilgisi (OpenStreetMap,
belediye CSV'si) -> risk skoru -> binalar.json (uygulamaya "Veri yükle" ile verilir).

Örnek:
  python ucus_isle.py ucus_klasoru --model best.pt --pga 0.45 --yil 1990
  python ucus_isle.py ucus_klasoru --model best.pt --gpx ucus.gpx --csv belediye.csv --osm
"""
import argparse, csv, json, math, os, re, sys, time
from datetime import datetime, timedelta
import cv2, numpy as np
from PIL import Image, ExifTags

# ---- skor formülü: risk_skor.py ve data.js ile aynı ----
def catlak_skoru(cov, n): return 40 * (0.6 * min(1, cov / 15) + 0.4 * min(1, n / 5))
def tehlike_skoru(pga): return 35 * max(0, min(1, (pga - 0.05) / 0.75))
def yas_skoru(y):
    if y < 1975: return 25
    if y < 1998: return 20 - (y - 1975) / 23 * 5
    if y < 2018: return 12 - (y - 1998) / 20 * 6
    return 3
def skor(cov, n, pga, yil):
    c, t, a = catlak_skoru(cov, n), tehlike_skoru(pga), yas_skoru(yil)
    top = round(c + t + a, 1)
    return top, 'Düşük' if top <= 40 else 'Orta' if top <= 70 else 'Yüksek'

# ---- EXIF ----
def _deg(v): return float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
def exif_oku(path):
    """(enlem, boylam, zaman) döner; olmayan None."""
    try:
        ex = Image.open(path).getexif()
    except Exception:
        return None, None, None
    lat = lon = zaman = None
    try:
        g = ex.get_ifd(0x8825)
        if g and 2 in g and 4 in g:
            lat = _deg(g[2]) * (-1 if g.get(1) == 'S' else 1)
            lon = _deg(g[4]) * (-1 if g.get(3) == 'W' else 1)
    except Exception:
        pass
    try:
        s = ex.get_ifd(0x8769).get(0x9003) or ex.get(0x0132)
        if s: zaman = datetime.strptime(str(s).strip(), '%Y:%m:%d %H:%M:%S')
    except Exception:
        pass
    return lat, lon, zaman

def gpx_oku(path):
    pts = []
    txt = open(path, encoding='utf-8', errors='ignore').read()
    for m in re.finditer(r'<trkpt[^>]*lat="([\d.\-]+)"[^>]*lon="([\d.\-]+)"[^>]*>(.*?)</trkpt>', txt, re.S):
        t = re.search(r'<time>([^<]+)</time>', m.group(3))
        if not t: continue
        z = datetime.fromisoformat(t.group(1).replace('Z', '+00:00')).replace(tzinfo=None)
        pts.append((z, float(m.group(1)), float(m.group(2))))
    return sorted(pts)

def gpx_konum(pts, z, kayma_dk=0):
    if not pts or z is None: return None, None
    z = z - timedelta(minutes=kayma_dk)
    if z < pts[0][0] - timedelta(seconds=30) or z > pts[-1][0] + timedelta(seconds=30): return None, None
    for (z1, a1, o1), (z2, a2, o2) in zip(pts, pts[1:]):
        if z1 <= z <= z2:
            k = 0 if z2 == z1 else (z - z1).total_seconds() / (z2 - z1).total_seconds()
            return a1 + (a2 - a1) * k, o1 + (o2 - o1) * k
    return pts[0][1:] if z < pts[0][0] else pts[-1][1:]

def mesafe(a, b):
    R, r = 6371000, math.pi / 180
    dl, dn = (b[0] - a[0]) * r, (b[1] - a[1]) * r
    x = math.sin(dl / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dn / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))

def grupla(fotolar, yaricap):
    """Açgözlü gruplama; merkez her eklemede güncellenir (uygulamadaki ucus.js ile aynı)."""
    gr = []
    for f in sorted(fotolar, key=lambda f: f['zaman'] or datetime.min):
        en, enk = None, 1e18
        for g in gr:
            d = mesafe((f['lat'], f['lon']), (g['lat'], g['lon']))
            if d < yaricap and d < enk: en, enk = g, d
        if en is None:
            gr.append({'lat': f['lat'], 'lon': f['lon'], 'fotolar': [f]})
        else:
            en['fotolar'].append(f); k = len(en['fotolar'])
            en['lat'] += (f['lat'] - en['lat']) / k; en['lon'] += (f['lon'] - en['lon']) / k
    return gr

# ---- duvar maskesi: gökyüzü, bitki, zemin dışarıda ----
def duvar_maskesi(bgr):
    """Klasik yöntem (ek paket gerekmez). 1 = duvar adayı. Daha iyisi için --seg."""
    h, w = bgr.shape[:2]
    s = 640 / max(h, w); k = cv2.resize(bgr, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(k, cv2.COLOR_BGR2HSV)
    H, S, V = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
    b, g, r = [k[..., i].astype(int) for i in range(3)]
    mavi = (H >= 90) & (H <= 135) & (S >= 35) & (V >= 90)
    bulut = (S < 40) & (V > 215)
    gok = (mavi | bulut).astype(np.uint8)
    n, lab = cv2.connectedComponents(gok)
    ust = set(np.unique(lab[0:3, :])) - {0}
    gok = np.isin(lab, list(ust)).astype(np.uint8) if ust else np.zeros_like(gok)
    exg = 2 * g - r - b
    bitki = ((exg > 25) & (S > 40)).astype(np.uint8)
    bitki = cv2.morphologyEx(bitki, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    bitki = cv2.dilate(bitki, np.ones((5, 5), np.uint8))
    maske = (1 - np.clip(gok + bitki, 0, 1)).astype(np.uint8)
    maske = cv2.morphologyEx(maske, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return cv2.resize(maske, (w, h), interpolation=cv2.INTER_NEAREST)

_seg = {}
def duvar_maskesi_seg(bgr):
    """SegFormer (ADE20K): bina/duvar sınıfları kalır. İlk çalıştırmada model indirilir (~15 MB)."""
    import torch
    from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation
    if not _seg:
        ad = 'nvidia/segformer-b0-finetuned-ade-512-512'
        _seg['p'] = SegformerImageProcessor.from_pretrained(ad); _seg['m'] = SegformerForSemanticSegmentation.from_pretrained(ad).eval()
    h, w = bgr.shape[:2]
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    x = _seg['p'](images=rgb, return_tensors='pt')
    with torch.no_grad(): lg = _seg['m'](**x).logits
    lg = torch.nn.functional.interpolate(lg, size=(h, w), mode='bilinear')
    sinif = lg.argmax(1)[0].numpy()
    return np.isin(sinif, [0, 1, 25, 48, 84]).astype(np.uint8)  # wall, building, house, skyscraper, tower

# ---- çatlak tespiti: kırpılmadan, orijinal çözünürlükte karolar ----
def tespit(model, bgr, maske, conf, kare=640, adim=480, min_duvar=0.6):
    import torch, torchvision
    h, w = bgr.shape[:2]
    kutular, skorlar = [], []
    for y in range(0, max(1, h - kare) + adim, adim):
        for x in range(0, max(1, w - kare) + adim, adim):
            x0, y0 = min(x, max(0, w - kare)), min(y, max(0, h - kare))
            m = maske[y0:y0 + kare, x0:x0 + kare]
            if m.size == 0 or m.mean() < min_duvar: continue
            r = model.predict(bgr[y0:y0 + kare, x0:x0 + kare], conf=conf, verbose=False, imgsz=kare)[0]
            for bx in r.boxes:
                x1, y1, x2, y2 = bx.xyxy[0].tolist()
                cx, cy = int((x1 + x2) / 2) + x0, int((y1 + y2) / 2) + y0
                if 0 <= cy < h and 0 <= cx < w and maske[cy, cx]:
                    kutular.append([x1 + x0, y1 + y0, x2 + x0, y2 + y0]); skorlar.append(float(bx.conf[0]))
    if not kutular: return []
    t = torch.tensor(kutular); s = torch.tensor(skorlar)
    keep = torchvision.ops.nms(t, s, 0.45).tolist()
    return [(kutular[i], skorlar[i]) for i in keep]

def ozet(kutular, maske):
    """cov = kutuların birleşik alanı / duvar alanı (%), n = çatlak sayısı."""
    duvar = int(maske.sum())
    if duvar == 0: return 0.0, 0
    m = np.zeros(maske.shape, np.uint8)
    for (x1, y1, x2, y2), _ in kutular: m[int(y1):int(y2), int(x1):int(x2)] = 1
    return min(100.0, float((m & maske).sum()) / duvar * 100), len(kutular)

# ---- bina bilgisi ----
def osm_bina(lat, lon, r=35):
    """OpenStreetMap'te en yakın bina: kat sayısı, yapım yılı (varsa), ad, adres."""
    import requests
    q = f'[out:json][timeout:20];way(around:{r},{lat},{lon})["building"];out tags center;'
    for url in ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'):
        try:
            j = requests.post(url, data={'data': q}, timeout=25).json()
            adaylar = [e for e in j.get('elements', []) if 'center' in e]
            if not adaylar: return {}
            e = min(adaylar, key=lambda e: mesafe((lat, lon), (e['center']['lat'], e['center']['lon'])))
            t = e.get('tags', {})
            yil = re.search(r'(1[89]\d\d|20\d\d)', t.get('start_date', '') or '')
            kat = t.get('building:levels')
            adres = ' '.join(x for x in (t.get('addr:street'), t.get('addr:housenumber')) if x)
            return {'kat': float(kat) if kat and re.match(r'^\d+(\.\d+)?$', kat) else None,
                    'yil': int(yil.group(1)) if yil else None, 'ad': t.get('name'), 'adres': adres or None}
        except Exception:
            continue
    return {}

def csv_oku(path):
    kayit = []
    with open(path, encoding='utf-8-sig', newline='') as f:
        ilk = f.readline(); f.seek(0)
        for r in csv.DictReader(f, delimiter=';' if ilk.count(';') > ilk.count(',') else ','):
            r = {k.strip().lower(): (v or '').strip() for k, v in r.items() if k}
            try: kayit.append({**r, 'lat': float(r['enlem'].replace(',', '.')), 'lon': float(r['boylam'].replace(',', '.'))})
            except Exception: pass
    return kayit

def csv_en_yakin(kayit, lat, lon, r=40):
    en, d0 = None, r
    for k in kayit:
        d = mesafe((lat, lon), (k['lat'], k['lon']))
        if d < d0: en, d0 = k, d
    return en

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('klasor'); ap.add_argument('--model', default='best.pt')
    ap.add_argument('--out', default='binalar.json'); ap.add_argument('--r', type=float, default=25, help='bina ayrım mesafesi (m)')
    ap.add_argument('--conf', type=float, default=0.5); ap.add_argument('--pga', type=float, default=0.45)
    ap.add_argument('--yil', type=int, default=1990, help='kayıt yoksa tahmini yapım yılı')
    ap.add_argument('--gpx'); ap.add_argument('--gpx-kayma', type=float, default=0, help='GPX saat farkı (dk)')
    ap.add_argument('--csv', help='belediye listesi: enlem, boylam, yil (ad, adres, kat, pga isteğe bağlı)')
    ap.add_argument('--osm', action='store_true', help='kat/yıl/adres için OpenStreetMap sorgula (internet gerekir)')
    ap.add_argument('--seg', action='store_true', help='duvarı SegFormer ile bul (transformers gerekir)')
    ap.add_argument('--min-foto', type=int, default=3); ap.add_argument('--kanit', default='kanit', help='işaretli fotoğraf klasörü')
    ap.add_argument('--tarih', default=None)
    a = ap.parse_args()

    from ultralytics import YOLO
    model = YOLO(a.model)
    gpx = gpx_oku(a.gpx) if a.gpx else []
    csvk = csv_oku(a.csv) if a.csv else []
    yollar = sorted(os.path.join(d, f) for d, _, fs in os.walk(a.klasor) for f in fs if f.lower().endswith(('.jpg', '.jpeg')))
    print(f'{len(yollar)} fotoğraf bulundu')
    fotolar, konumsuz = [], []
    for p in yollar:
        lat, lon, z = exif_oku(p)
        if lat is None and gpx: lat, lon = gpx_konum(gpx, z, a.gpx_kayma)
        (fotolar if lat is not None else konumsuz).append({'yol': p, 'lat': lat, 'lon': lon, 'zaman': z})
    if konumsuz: print(f'UYARI: {len(konumsuz)} fotoğrafın konumu yok, atlandı (GPX verin veya konumlu çekin).')
    if not fotolar: sys.exit('Konumlu fotoğraf yok.')
    gruplar = grupla(fotolar, a.r)
    print(f'{len(gruplar)} bina grubu')
    os.makedirs(a.kanit, exist_ok=True)
    tarih = a.tarih or (max((f['zaman'] for f in fotolar if f['zaman']), default=datetime.now())).strftime('%d.%m.%Y')
    maskefn = duvar_maskesi_seg if a.seg else duvar_maskesi
    cikti = []
    for gi, g in enumerate(gruplar, 1):
        covs, ns, kullanilan = [], [], 0
        en_iyi = (-1, None)
        for f in g['fotolar']:
            bgr = cv2.imread(f['yol'])
            if bgr is None: continue
            maske = maskefn(bgr)
            if maske.mean() < 0.25: continue  # kadrajda duvar yok
            kb = tespit(model, bgr, maske, a.conf)
            cov, n = ozet(kb, maske); covs.append(cov); ns.append(n); kullanilan += 1
            if len(kb) > en_iyi[0]:
                im = bgr.copy(); im[maske == 0] = (im[maske == 0] * 0.35).astype(np.uint8)
                for (x1, y1, x2, y2), s in kb: cv2.rectangle(im, (int(x1), int(y1)), (int(x2), int(y2)), (0, 0, 255), max(2, im.shape[1] // 600))
                en_iyi = (len(kb), im)
        if not covs:
            print(f'  bina {gi}: duvar görünen fotoğraf yok, atlandı'); continue
        if en_iyi[1] is not None: cv2.imwrite(os.path.join(a.kanit, f'bina_{gi:02d}.jpg'), en_iyi[1], [cv2.IMWRITE_JPEG_QUALITY, 80])
        cov, n = float(np.mean(covs)), float(np.mean(ns))
        bilgi = osm_bina(g['lat'], g['lon']) if a.osm else {}
        kr = csv_en_yakin(csvk, g['lat'], g['lon']) if csvk else None
        yil, tahmini, kaynak_yil = a.yil, True, 'tahmini'
        if kr and kr.get('yil', '').isdigit(): yil, tahmini, kaynak_yil = int(kr['yil']), False, 'belediye'
        elif bilgi.get('yil'): yil, tahmini, kaynak_yil = bilgi['yil'], False, 'OSM'
        pga = float(kr['pga'].replace(',', '.')) if kr and kr.get('pga') else a.pga
        kat = (float(kr['kat']) if kr and kr.get('kat') else None) or bilgi.get('kat')
        ad = (kr or {}).get('ad') or bilgi.get('ad') or f'Bina {gi}'
        adres = (kr or {}).get('adres') or bilgi.get('adres') or ''
        top, kat_ad = skor(cov, n, pga, yil)
        print(f'  {ad}: {kullanilan}/{len(g["fotolar"])} foto, kapsama %{cov:.2f}, çatlak {n:.1f}, yıl {yil} ({kaynak_yil}) -> {top} {kat_ad}')
        r = {'ad': ad, 'adres': adres, 'mahalle': f'Uçuş {tarih}', 'enlem': round(g['lat'], 6), 'boylam': round(g['lon'], 6),
             'yil': yil, 'yil_tahmin': tahmini, 'kat': kat, 'pga': pga, 'kapsama_yuzde': round(cov, 2), 'catlak_ort': round(n, 2),
             'foto': kullanilan, 'tarih': tarih, 'kaynak': 'ucus'}
        if kullanilan < a.min_foto: r['uyari'] = 'az fotoğraf'
        cikti.append(r)
    onceki = []
    if os.path.exists(a.out):
        try:
            j = json.load(open(a.out, encoding='utf-8')); onceki = j['binalar'] if isinstance(j, dict) else j
        except Exception: pass
    json.dump({'binalar': onceki + cikti}, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(cikti)} bina {a.out} dosyasına yazıldı (toplam {len(onceki) + len(cikti)}). Uygulamada Araçlar > Veri yükle ile ver.')

if __name__ == '__main__':
    main()
