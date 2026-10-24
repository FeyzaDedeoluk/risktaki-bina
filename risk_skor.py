#!/usr/bin/env python3
"""
SEMRUK - RISKTEKI BINA
Goruntuden risk skoruna: YOLOv8 catlak tespiti + AFAD tehlike + bina yasi -> 0-100 skor

Kullanim:
  python risk_skor.py --gorseller foto_klasoru --model best.pt --yil 1985 --pga 0.45 --ad "Bina-1"
  python risk_skor.py --bina-listesi binalar.csv --model best.pt --cikti sonuc.json

binalar.csv sutunlari: ad,klasor,yil,pga,enlem,boylam
(pga yoksa 'bolge' sutunu 1-5 verilebilir)

Skor = Catlak (0-40) + Deprem Tehlikesi (0-35) + Bina Yasi (0-25)
  0-40 Dusuk (yesil) | 41-70 Orta (sari) | 71-100 Yuksek (kirmizi)
"""
import argparse, csv, json, os, sys

UZANTILAR = (".jpg", ".jpeg", ".png", ".bmp", ".webp")

# ---------------------------------------------------------------- SKOR FORMULU
def catlak_skoru(kutular, goruntu_alani, goruntu_sayisi=1):
    """0-40. kutular: [(alan_px, guven), ...] tum goruntulerden.
    Kapsama (guvenle agirliklandirilmis alan orani) %60, catlak sayisi %40 agirlik."""
    if goruntu_sayisi <= 0 or goruntu_alani <= 0:
        return 0.0
    agirlikli_alan = sum(a * c for a, c in kutular)
    kapsama = agirlikli_alan / (goruntu_alani * goruntu_sayisi)   # 0..1
    kapsama_n = min(1.0, kapsama / 0.15)        # %15 kapsama = tam puan
    sayi_ort = len(kutular) / goruntu_sayisi
    sayi_n = min(1.0, sayi_ort / 5.0)           # goruntu basi 5 catlak = tam puan
    return round(40 * (0.6 * kapsama_n + 0.4 * sayi_n), 1)


def tehlike_skoru(pga=None, bolge=None):
    """0-35. pga: AFAD tepe yer ivmesi (g, DD-2 475 yil). 0.05g ve alti ~0, 0.80g ve ustu tam puan.
    pga yoksa bolge (1=cok yuksek ... 5=cok dusuk, eski harita) kullanilir."""
    if pga is not None:
        n = (float(pga) - 0.05) / (0.80 - 0.05)
    elif bolge is not None:
        n = {1: 1.0, 2: 0.75, 3: 0.5, 4: 0.25, 5: 0.1}[int(bolge)]
    else:
        raise ValueError("pga veya bolge verilmeli")
    return round(35 * max(0.0, min(1.0, n)), 1)


def yas_skoru(yapim_yili):
    """0-25. Turk deprem yonetmeligi donemlerine gore: 1975, 1998, 2018."""
    y = int(yapim_yili)
    if y < 1975:
        return 25.0
    if y < 1998:
        return 20.0 - (y - 1975) / (1998 - 1975) * 5      # 20 -> 15 (surekli)
    if y < 2018:
        return 12.0 - (y - 1998) / (2018 - 1998) * 6      # 12 -> 6
    return 3.0


def kategori(toplam):
    if toplam <= 40:
        return "Dusuk", "yesil"
    if toplam <= 70:
        return "Orta", "sari"
    return "Yuksek", "kirmizi"


def risk_hesapla(catlak, tehlike, yas):
    toplam = round(catlak + tehlike + yas, 1)
    ad, renk = kategori(toplam)
    return {"toplam": toplam, "kategori": ad, "renk": renk,
            "catlak_skoru": catlak, "tehlike_skoru": tehlike, "yas_skoru": round(yas, 1)}

# ---------------------------------------------------------------- GORUNTU ANALIZI
_model = None
def model_yukle(yol):
    global _model
    if _model is None:
        from ultralytics import YOLO   # tembel import: formul testleri model gerektirmez
        _model = YOLO(yol)
    return _model


def klasorden_goruntuler(klasor):
    return sorted(os.path.join(klasor, f) for f in os.listdir(klasor) if f.lower().endswith(UZANTILAR))


def goruntu_analiz(yollar, model_yolu, esik=0.25, kayit_klasoru=None):
    """Tum goruntulerde catlak tespiti. (kutular, toplam_alan, goruntu_sayisi) dondurur."""
    model = model_yukle(model_yolu)
    kutular, alan_ort, n = [], 0, 0
    for yol in yollar:
        sonuc = model.predict(yol, conf=esik, verbose=False)[0]
        h, w = sonuc.orig_shape
        alan_ort += h * w
        n += 1
        for b in sonuc.boxes:
            x1, y1, x2, y2 = b.xyxy[0].tolist()
            kutular.append(((x2 - x1) * (y2 - y1), float(b.conf[0])))
        if kayit_klasoru:
            os.makedirs(kayit_klasoru, exist_ok=True)
            sonuc.save(filename=os.path.join(kayit_klasoru, os.path.basename(yol)))
    return kutular, (alan_ort / n if n else 0), n


def bina_analiz(ad, klasor, model_yolu, yil, pga=None, bolge=None, enlem=None, boylam=None, esik=0.25, kayit=None):
    yollar = klasorden_goruntuler(klasor)
    kutular, alan, n = goruntu_analiz(yollar, model_yolu, esik, kayit)
    c = catlak_skoru(kutular, alan, n)
    t = tehlike_skoru(pga, bolge)
    y = yas_skoru(yil)
    r = risk_hesapla(c, t, y)
    r.update({"ad": ad, "yil": int(yil), "pga": pga, "bolge": bolge, "enlem": enlem, "boylam": boylam,
              "goruntu_sayisi": n, "tespit_sayisi": len(kutular)})
    return r


def main():
    p = argparse.ArgumentParser(description="SEMRUK bina risk skoru")
    p.add_argument("--model", default="best.pt")
    p.add_argument("--gorseller", help="tek bina icin foto klasoru")
    p.add_argument("--ad", default="Bina")
    p.add_argument("--yil", type=int, help="yapim yili")
    p.add_argument("--pga", type=float)
    p.add_argument("--bolge", type=int)
    p.add_argument("--bina-listesi", help="csv: ad,klasor,yil,pga,enlem,boylam")
    p.add_argument("--esik", type=float, default=0.25, help="YOLO guven esigi")
    p.add_argument("--cikti", default="sonuc.json")
    p.add_argument("--isaretli", default="isaretli_gorseller", help="tespit cizili foto klasoru")
    a = p.parse_args()

    sonuclar = []
    if a.bina_listesi:
        with open(a.bina_listesi, encoding="utf-8") as f:
            for s in csv.DictReader(f):
                sonuclar.append(bina_analiz(
                    s["ad"], s["klasor"], a.model, int(s["yil"]),
                    float(s["pga"]) if s.get("pga") else None,
                    int(s["bolge"]) if s.get("bolge") else None,
                    float(s["enlem"]) if s.get("enlem") else None,
                    float(s["boylam"]) if s.get("boylam") else None,
                    a.esik, os.path.join(a.isaretli, s["ad"])))
    elif a.gorseller and a.yil:
        sonuclar.append(bina_analiz(a.ad, a.gorseller, a.model, a.yil, a.pga, a.bolge,
                                    esik=a.esik, kayit=os.path.join(a.isaretli, a.ad)))
    else:
        p.error("--gorseller ve --yil ya da --bina-listesi ver")

    sonuclar.sort(key=lambda r: -r["toplam"])
    with open(a.cikti, "w", encoding="utf-8") as f:
        json.dump(sonuclar, f, ensure_ascii=False, indent=2)
    for r in sonuclar:
        print(f'{r["ad"]:<14} {r["toplam"]:>5}/100  {r["kategori"]:<7} '
              f'(catlak {r["catlak_skoru"]} + tehlike {r["tehlike_skoru"]} + yas {r["yas_skoru"]})')
    print("->", a.cikti)


if __name__ == "__main__":
    main()
