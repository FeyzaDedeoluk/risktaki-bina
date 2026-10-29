# Risktaki Bina

Deprem öncesi akıllı bina risk tespit sistemi. TEKNOFEST 2026 Deneyap Takımlar Dönemi projesi, ekip **SEMRUK**.

Drone ile çekilen bina fotoğraflarından yapay zekâ ile çatlakları bulur, bunu deprem tehlikesi ve bina yaşıyla birleştirip 0–100 arası bir risk skoru üretir. Sonuç, vatandaşın ve belediyenin kullanacağı bir mobil harita uygulamasında gösterilir.

## Nasıl çalışıyor

```
Drone fotoğrafları → YOLOv8 çatlak tespiti → risk skoru (0-100) → harita uygulaması
```

**Skor = Çatlak (0–40) + Deprem tehlikesi (0–35) + Bina yaşı (0–25)**

| Skor | Kategori | Renk |
|---|---|---|
| 0–40 | Düşük | yeşil |
| 41–70 | Orta | sarı |
| 71–100 | Yüksek | kırmızı |

- **Çatlak:** `40 × (0,6 × min(1; kapsama/%15) + 0,4 × min(1; çatlak sayısı/5))`. Kapsama, çatlak kutularının fotoğraf alanına güvenle ağırlıklı oranıdır.
- **Deprem tehlikesi:** AFAD Türkiye Deprem Tehlike Haritası'ndaki tepe yer ivmesi (PGA). 0,05 g ve altı 0 puan, 0,80 g ve üstü 35 puan.
- **Bina yaşı:** Deprem yönetmeliği dönemlerine göre (1975, 1998, 2018).

## Model

YOLOv8n ile tek sınıflı (`crack`) çatlak tespiti. Aynı eğitim ayarlarıyla iki veri setinde denendi:

| Veri seti | Görsel sayısı | Precision | Recall | mAP50 | mAP50-95 |
|---|---|---|---|---|---|
| İlk deneme | 430 | 0,156 | 0,090 | 0,059 | - |
| Concrete Crack | ~10.000 | 0,850 | 0,779 | 0,869 | 0,739 |

Veri artınca model belirgin biçimde iyileşti. Mevcut veri genel beton çatlağı fotoğraflarıdır. Deprem hasarlı bina fotoğraflarıyla genişletilmesi planlanıyor.

## Kullanım

```bash
pip install -r requirements.txt
python risk_skor.py --gorseller foto_klasoru --model best.pt --yil 1985 --pga 0.45 --ad "Bina-1"
```

Birden fazla bina için `binalar.csv` (sütunlar: `ad,klasor,yil,pga,enlem,boylam`):

```bash
python risk_skor.py --bina-listesi binalar.csv --model best.pt --cikti sonuc.json
```

Çıktı: `sonuc.json` (risk sırasına göre) ve tespitlerin çizildiği fotoğraflar (`isaretli_gorseller/`).

Model dosyası (`best.pt`) boyutu nedeniyle ayrıca eklenir. Eğitim Google Colab'da T4 GPU ile yapıldı.

## Uygulama

`index.html` mobil uygulama prototipidir (PWA: telefona "Ana ekrana ekle" ile kurulur, APK olarak da derlenir).

- Gerçek harita (Leaflet + OpenStreetMap): sürükleni, yakınlaştırılır, konuma gidilir
- Risk renkli pinler ve kümeleme, bina arama, filtreler, risk veya yakınlık sıralı liste
- Bina kartı: skorun nedeni, şematik çatlak çizimi, ne yapılmalı
- Vatandaş, Belediye (denetim durumu, not, bekleyen filtresi) ve AFAD (mahalle risk özeti) görünümleri
- **Fotoğraf analizi:** fotoğraf seçilir, çatlaklar cihazda işaretlenir ve skor hesaplanır (`model.onnx` gerekir)
- **Uçuş yükle:** bir uçuştaki bütün fotoğraflar seçilir, binalara ayrılır, otomatik taranır ve haritaya eklenir
- **Rapor:** tek bina raporu veya yüksek riskli binalar listesi, PDF veya resim olarak
- Skor hesaplayıcı

### Gerçek veri akışı

1. `python risk_skor.py --bina-listesi binalar.csv --model best.pt --cikti sonuc.json`
2. Uygulamada **Araçlar › Veri yükle** ile `sonuc.json` seçilir (cihazda saklanır), ya da dosya depoya `binalar.json` adıyla konur.
3. Veri yoksa uygulama, "ÖRNEK VERİ" etiketli uydurma binalar gösterir.

`binalar.csv` sütunları: `ad,klasor,yil,pga,enlem,boylam` (isteğe bağlı: `adres,mahalle,kat`).

### Drone uçuşunu otomatik işleme

Uçuştaki bütün fotoğraflar bir klasöre konur:

```
pip install -r requirements.txt
python ucus_isle.py ucus_klasoru --model best.pt --pga 0.45 --yil 1990 --osm
```

Betik sırayla şunları yapar: fotoğraf konumunu okur (EXIF GPS, yoksa `--gpx` uçuş kaydı ve saat eşleştirmesi) → konuma göre binalara ayırır → her fotoğrafta gökyüzünü, ağacı ve zemini eler (`--seg` ile SegFormer, varsayılan klasik renk yöntemi) → duvarı orijinal çözünürlükte 640 px karolarla tarar (küçültme yok, ince çatlaklar kaybolmaz) → `--osm` ile OpenStreetMap'ten kat sayısı, varsa yapım yılı ve adresi alır → skoru hesaplar → `binalar.json` yazar ve `kanit/` klasörüne işaretli fotoğraf kaydeder.

Bina yaşı fotoğraftan çıkmaz. Sırayla: `--csv` belediye listesi (enlem, boylam, yil) → OpenStreetMap `start_date` → `--yil` tahmini (uygulamada "tahmini" yazar). Deprem ivmesi için `--pga` ya da CSV'ye `pga` sütunu.

### Model dosyası (fotoğraf analizi için)

```python
from ultralytics import YOLO
YOLO('best.pt').export(format='onnx', imgsz=640, simplify=False, opset=12)
```

Çıkan dosya `model.onnx` adıyla depoya (index.html ile aynı klasöre) yüklenir.

**Önemli:** Örnek verideki binalar ve değerler uydurmadır. Harita altlığı OpenStreetMap'tir, yoğun kullanım için kendi harita sağlayıcısı gerekir.

## Yayınlama

**GitHub Pages:** Settings → Pages → Branch: `main`, klasör `/ (root)` → Save. Adres: `https://<kullanici>.github.io/risktaki-bina/`

**APK:** Actions sekmesi → "APK derle" → Run workflow. Bitince çalışmanın altındaki `risktaki-bina-apk` dosyasını indir.

## Sınırlar

Skor, fotoğraflardan yapılan ön değerlendirmedir. Binanın deprem güvenliği hakkında kesin hüküm vermez ve resmi risk tespitinin yerine geçmez.
