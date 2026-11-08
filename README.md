# Risktaki Bina

Deprem öncesi drone ve yapay zekâ ile bina risk tespit sistemi. Drone fotoğraflarından çatlakları bulur, bölgenin deprem tehlikesi ve bina yaşıyla birleştirip her bina için 0–100 arası risk skoru üretir, sonucu harita tabanlı bir mobil uygulamada gösterir.

TEKNOFEST 2026 Deneyap Takımlar Dönemi projesi, ekip **SEMRUK**.

[Canlı demo](https://feyzadedeoluk.github.io/risktaki-bina/) (PWA, telefonda "Ana ekrana ekle" ile kurulur)

> **Durum:** Prototip. Uygulamadaki binalar örnek veridir ("ÖRNEK VERİ" etiketi görünür). Gerçek drone taraması henüz yapılmadı.

## İçindekiler

- [Özellikler](#özellikler)
- [Nasıl çalışır](#nasıl-çalışır)
- [Kurulum](#kurulum)
- [Kullanım](#kullanım)
- [Model](#model)
- [Proje yapısı](#proje-yapısı)
- [Yol haritası](#yol-haritası)
- [Sınırlamalar](#sınırlamalar)
- [Kaynaklar](#kaynaklar)

## Özellikler

- YOLOv8n ile çatlak tespiti
- Çatlak, deprem tehlikesi ve bina yaşından oluşan 0–100 risk skoru
- Leaflet ve OpenStreetMap tabanlı harita: risk renkli pinler, kümeleme, arama, filtre, yakınlık sıralaması
- Üç görünüm: Vatandaş, Belediye (denetim durumu, not), AFAD (mahalle risk özeti)
- Tarayıcıda çalışan fotoğraf analizi (ONNX Runtime Web, fotoğraf cihazdan çıkmaz)
- PDF ve resim olarak tek bina veya yüksek riskli binalar raporu
- Drone uçuşunu otomatik işleyen komut satırı aracı: konum eşleştirme, bina gruplama, gökyüzü/ağaç/zemin eleme, duvar tarama, kanıt fotoğrafı
- Çevrimdışı çalışma (service worker), Capacitor ile APK

## Nasıl çalışır

```
Drone fotoğrafları → konuma göre bina gruplama → duvar maskesi → çatlak tespiti → risk skoru → harita
```

**Skor = Çatlak (0–40) + Deprem tehlikesi (0–35) + Bina yaşı (0–25)**

| Bileşen | Formül |
|---|---|
| Çatlak | `40 × (0,6 × min(1; kapsama/%15) + 0,4 × min(1; çatlak sayısı/5))` |
| Deprem tehlikesi | `35 × clamp((PGA − 0,05) / 0,75)`, PGA: AFAD Türkiye Deprem Tehlike Haritası, tepe yer ivmesi (g) |
| Bina yaşı | 1975 öncesi 25; 1975–1997: 20'den 15'e; 1998–2017: 12'den 6'ya; 2018 ve sonrası 3 |

| Skor | Kategori |
|---|---|
| 0–40 | Düşük |
| 41–70 | Orta |
| 71–100 | Yüksek |

Kapsama, çatlak kutularının birleşik alanının duvar alanına oranıdır (%). Aynı formül `risk_skor.py`, `ucus_isle.py`, `data.js` ve `ucus.js` içinde kullanılır.

## Kurulum

Uygulama için kurulum gerekmez, `index.html` bir web sunucusundan açılır:

```bash
python -m http.server 8000
```

Python araçları için:

```bash
pip install -r requirements.txt
```

Model dosyası `best.pt` boyutu nedeniyle depoda yoktur. Uygulamadaki fotoğraf analizi için `model.onnx` depoda bulunur.

## Kullanım

### Tek bina veya klasör

```bash
python risk_skor.py --gorseller foto_klasoru --model best.pt --yil 1985 --pga 0.45 --ad "Bina-1"
```

Birden fazla bina için `binalar.csv` (sütunlar: `ad,klasor,yil,pga,enlem,boylam`; isteğe bağlı: `adres,mahalle,kat`):

```bash
python risk_skor.py --bina-listesi binalar.csv --model best.pt --cikti sonuc.json
```

Çıktı: `sonuc.json` (risk sırasına göre) ve işaretli fotoğraflar (`isaretli_gorseller/`).

### Drone uçuşunu işleme

```bash
python ucus_isle.py ucus_klasoru --model best.pt --pga 0.45 --yil 1990 --osm
```

| Seçenek | Açıklama |
|---|---|
| `--model` | YOLO ağırlık dosyası |
| `--gpx`, `--gpx-kayma` | Fotoğrafta GPS yoksa uçuş kaydı ve saat farkı (dk) |
| `--r` | Bina ayırma mesafesi, metre (varsayılan 25) |
| `--conf` | Güven eşiği (varsayılan 0,5) |
| `--pga` | Deprem ivmesi (g) |
| `--csv` | Belediye bina listesi: `enlem`, `boylam`, `yil` (isteğe bağlı: `ad`, `adres`, `kat`, `pga`). Şablon: `belediye_ornek.csv` |
| `--osm` | OpenStreetMap'ten kat sayısı, yapım yılı ve adres (internet gerekir) |
| `--yil` | Kayıt yoksa tahmini yapım yılı, uygulamada "tahmini" yazar |
| `--seg` | Duvar maskesini SegFormer ile üret (`transformers` gerekir) |

Betik, duvarı orijinal çözünürlükte 640 px karolarla tarar, çıktıyı `binalar.json` dosyasına ekler ve işaretli fotoğrafı `kanit/` klasörüne ve kayda (`kanit`, base64) yazar. Bina yaşı fotoğraftan çıkarılamaz. Öncelik sırası: belediye CSV, OpenStreetMap `start_date`, `--yil` tahmini.

### Veriyi uygulamaya yükleme

Uygulamada **Araçlar › Veri yükle** ile `binalar.json` veya `sonuc.json` seçilir (cihazda saklanır). Dosyayı depoya `binalar.json` adıyla koymak da yeterlidir. Veri yoksa uygulama örnek veri gösterir.

### Modeli ONNX'e çevirme

```python
from ultralytics import YOLO
YOLO('best.pt').export(format='onnx', imgsz=640, simplify=False, opset=12)
```

Çıkan dosya `model.onnx` adıyla depo köküne konur.

### Yayınlama

- **GitHub Pages:** Settings › Pages › Branch: `main`, klasör `/ (root)`
- **APK:** Actions › "APK derle" › Run workflow

## Model

YOLOv8n, tek sınıf (`crack`). İki model eğitildi, Google Colab T4 GPU:

| Model | Veri | Precision | Recall | mAP50 | mAP50-95 |
|---|---|---|---|---|---|
| Yakın plan beton | Concrete Crack, ~10.000 görsel | 0,850 | 0,779 | 0,869 | 0,739 |
| Drone cephe | BFD-UAV2K, 2.000 görsel, 640 px parçalara bölünmüş | 0,567 | 0,528 | 0,534 | 0,246 |

Satırlar birbiriyle karşılaştırılamaz: veri setleri ve zorluk farklıdır. Cephe verisinde çatlaklar küçüktür ve dökülme hasarı çatlakla aynı sınıfta toplanmıştır. Sonuçlar bağımsız bir test setinden değil, doğrulama setinden alınmıştır.

## Proje yapısı

```
index.html, style.css      Arayüz
ui.js, map.js, data.js     Uygulama mantığı, harita, skor ve veri
ai.js, model.onnx          Tarayıcıda çatlak tespiti
report.js                  PDF ve resim rapor
ucus.js                    Tarayıcıda uçuş fotoğrafı yükleme
sw.js, manifest.webmanifest  PWA
risk_skor.py               Skor ve toplu analiz (komut satırı)
ucus_isle.py               Drone uçuşu otomatik işleme
belediye_ornek.csv         Belediye bina listesi şablonu
requirements.txt           Python bağımlılıkları
```

## Yol haritası

- [x] Çatlak tespit modeli (iki veri seti)
- [x] Risk skoru ve harita uygulaması
- [x] Belediye ve AFAD görünümleri
- [x] Fotoğraf analizi ve rapor
- [x] Drone uçuşunu otomatik işleme
- [ ] Gerçek drone taraması ve gerçek bina verisi
- [ ] Drone için GPS kaydedici
- [ ] Bina yaşı için belediye kayıtlarıyla eşleştirme
- [ ] Gerçek fotoğraflarla model karşılaştırması ve iyileştirme

## Sınırlamalar

- Skor fotoğraflardan yapılan **ön değerlendirmedir**, binanın deprem güvenliği hakkında kesin hüküm vermez ve resmi risk tespitinin yerine geçmez.
- Gölge, ağaç ve pencere kenarları yanlış alarm verebilir. Çatlağı görmek için duvara yaklaşık 3–5 m mesafeden bakmak gerekir.
- Duvar maskesi varsayılan olarak klasik renk yöntemidir, beyaz duvar ve bulutu karıştırabilir. `--seg` daha sağlamdır.
- Harita altlığı OpenStreetMap'tir, yoğun kullanım için kendi harita sağlayıcısı gerekir.

## Kaynaklar

- Veri setleri: BFD-UAV2K (RealUAV-SD), Concrete Crack. Lisans koşullarına uyulacaktır.
- Deprem tehlikesi: AFAD Türkiye Deprem Tehlike Haritası
- Kütüphaneler: Ultralytics YOLOv8, ONNX Runtime Web, Leaflet, OpenStreetMap, jsPDF, Capacitor
- Geliştirme sürecinde yapay zekâ asistanından (Claude) yardım alınmıştır.
