# Riskteki Bina

Deprem öncesi drone ve yapay zekâ ile bina risk tespit sistemi. Drone fotoğraflarından yapısal hasarları (çatlak, beton kopması, korozyon) bulur, bölgenin deprem tehlikesi ve bina yaşıyla birleştirip her bina için 0–100 arası risk skoru üretir, sonucu harita tabanlı bir mobil uygulamada gösterir.

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

- YOLOv8n ile hasar tespiti: çatlak, beton kopması, korozyon ve tuzlanma (tuzlanma bilgi amaçlıdır, skora girmez)
- Yapısal hasar, deprem tehlikesi ve bina yaşından oluşan 0–100 risk skoru
- Leaflet ve OpenStreetMap tabanlı harita: risk renkli pinler, kümeleme, arama, filtre, yakınlık sıralaması
- Üç görünüm: Vatandaş, Belediye (denetim durumu, not), AFAD (mahalle risk özeti)
- Tarayıcıda çalışan fotoğraf analizi (ONNX Runtime Web, fotoğraf cihazdan çıkmaz)
- PDF ve resim olarak tek bina veya yüksek riskli binalar raporu
- Drone uçuşunu otomatik işleyen komut satırı aracı: konum eşleştirme, bina gruplama, gökyüzü/ağaç/zemin eleme, duvar tarama, kanıt fotoğrafı
- Çevrimdışı çalışma (service worker), Capacitor ile APK

## Nasıl çalışır

```
Drone fotoğrafları → konuma göre bina gruplama → duvar maskesi → hasar tespiti → risk skoru → harita
```

**Skor = Yapısal hasar (0–40) + Deprem tehlikesi (0–35) + Bina yaşı (0–25)**

| Bileşen | Formül |
|---|---|
| Yapısal hasar | `40 × (0,6 × min(1; kapsama/%15) + 0,4 × min(1; hasar sayısı/5))`. Çatlak, beton kopması ve korozyon birlikte sayılır |
| Deprem tehlikesi | `35 × clamp((PGA − 0,05) / 0,75)`, PGA: AFAD Türkiye Deprem Tehlike Haritası, tepe yer ivmesi (g) |
| Bina yaşı | 1975 öncesi 25; 1975–1997: 20'den 15'e; 1998–2017: 12'den 6'ya; 2018 ve sonrası 3 |

| Skor | Kategori |
|---|---|
| 0–40 | Düşük |
| 41–70 | Orta |
| 71–100 | Yüksek |

Kapsama, çatlak, beton kopması ve korozyon kutularının birleşik alanının duvar alanına oranıdır (%). Tuzlanma kutuları ayrıca gösterilir ama skora girmez; sınıf ağırlıkları takım kararıdır ve bilimsel olarak doğrulanmamıştır. Aynı formül `risk_skor.py`, `ucus_isle.py`, `data.js` ve `ucus.js` içinde kullanılır.

## Kurulum

Uygulama için kurulum gerekmez, `index.html` bir web sunucusundan açılır:

```bash
python -m http.server 8000
```

Python araçları için:

```bash
pip install -r requirements.txt
```

Model ağırlıkları (`best_hasar.pt`) boyutu nedeniyle depoda yoktur. Uygulamadaki fotoğraf analizi için dört sınıflı `model.onnx` depo köküne konur (Colab'da `best_hasar.pt` ONNX'e çevrilir, aşağıya bak).

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

YOLOv8n, Google Colab T4 GPU. Üç model eğitildi; uygulamada kullanılan **çok sınıflı hasar modelidir**:

| Model | Veri | Precision | Recall | mAP50 | mAP50-95 |
|---|---|---|---|---|---|
| Yakın plan beton | Concrete Crack, ~10.000 görsel | 0,850 | 0,779 | 0,869 | 0,739 |
| Drone cephe | BFD-UAV2K, 2.000 görsel, 640 px parçalara bölünmüş | 0,567 | 0,528 | 0,534 | 0,246 |
| **Çok sınıflı hasar** (uygulamadaki) | building_defect + concrete_defect (Roboflow Universe), 4 sınıf, 60 epoch | 0,714 | 0,652 | 0,666 | 0,447 |

Çok sınıflı modelin sınıf bazında doğrulama sonuçları:

| Sınıf | Precision | Recall | mAP50 |
|---|---|---|---|
| crack (çatlak) | 0,770 | 0,759 | 0,768 |
| spalling (beton kopması) | 0,745 | 0,702 | 0,701 |
| corrosion (korozyon) | 0,708 | 0,631 | 0,678 |
| efflorescence (tuzlanma) | 0,635 | 0,517 | 0,518 |

Tuzlanma sınıfı en zayıf olanıdır (doğrulamada 74 örnek) ve bu yüzden skora katılmaz. Doğrulama sırasında etiketleri çokgen ve kutu karışık olan 15 görsel Ultralytics tarafından atlanmıştır.

Satırlar birbiriyle karşılaştırılamaz: veri setleri ve zorluk farklıdır. Cephe verisinde çatlaklar küçüktür ve dökülme hasarı çatlakla aynı sınıfta toplanmıştır. Sonuçlar bağımsız bir test setinden değil, doğrulama setinden alınmıştır.

## Proje yapısı

```
index.html, style.css      Arayüz
ui.js, map.js, data.js     Uygulama mantığı, harita, skor ve veri
ai.js, model.onnx          Tarayıcıda hasar tespiti (4 sınıf)
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
- [x] Çok sınıflı hasar modeli (çatlak, beton kopması, korozyon, tuzlanma)
- [ ] Gerçek drone taraması ve gerçek bina verisi
- [ ] Drone için GPS kaydedici
- [ ] Bina yaşı için belediye kayıtlarıyla eşleştirme
- [ ] Gerçek fotoğraflarla model karşılaştırması ve iyileştirme

## Sınırlamalar

- Skor fotoğraflardan yapılan **ön değerlendirmedir**, binanın deprem güvenliği hakkında kesin hüküm vermez ve resmi risk tespitinin yerine geçmez.
- Model kaynak veri setlerinin etiket ölçütlerine göre öğrendi; farklı bina ve ışık koşullarında sonuç değişebilir. Doğrulama sonuçları bağımsız bir test setinden değildir.
- Gölge, ağaç ve pencere kenarları yanlış alarm verebilir. Çatlağı görmek için duvara yaklaşık 3–5 m mesafeden bakmak gerekir.
- Duvar maskesi varsayılan olarak klasik renk yöntemidir, beyaz duvar ve bulutu karıştırabilir. `--seg` daha sağlamdır.
- Harita altlığı OpenStreetMap'tir, yoğun kullanım için kendi harita sağlayıcısı gerekir.

## Kaynaklar

- Veri setleri: BFD-UAV2K (RealUAV-SD), Concrete Crack, [building_defect](https://universe.roboflow.com/jq3/building_defect) ve [concrete_defect](https://universe.roboflow.com/new-workspace-yur70/concrete_defect) (Roboflow Universe, CC BY 4.0). Lisans koşullarına uyulacaktır.
- Deprem tehlikesi: AFAD Türkiye Deprem Tehlike Haritası
- Kütüphaneler: Ultralytics YOLOv8, ONNX Runtime Web, Leaflet, OpenStreetMap, jsPDF, Capacitor
- Geliştirme sürecinde yapay zekâ asistanından (Claude) yardım alınmıştır.
