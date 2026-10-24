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

`index.html` tek dosyalık mobil uygulama prototipidir. Telefona "Ana ekrana ekle" ile kurulabilir (PWA).

- Sürüklenip yakınlaştırılan harita, risk renkli pinler ve kümeleme
- Bina arama, filtreler, risk sıralı liste
- Bina kartı: skorun nedeni, şematik çatlak çizimi, ne yapılmalı
- Vatandaş ve Belediye görünümleri (denetim durumu, not)
- Skor hesaplayıcı

**Önemli:** Haritadaki şehir, binalar ve değerler prototip için uydurulmuş örnek veridir. Harita arka planı kodla çizilmiştir. Gerçek harita altlığı (OpenStreetMap) uygulama aşamasında eklenecektir.

## Yayınlama

**GitHub Pages:** Settings → Pages → Branch: `main`, klasör `/ (root)` → Save. Adres: `https://feyzadedeoluk.github.io/risktaki-bina/`

**APK:** Actions sekmesi → "APK derle" → Run workflow. Bitince çalışmanın altındaki `risktaki-bina-apk` dosyasını indir.

## Sınırlar

Skor, fotoğraflardan yapılan ön değerlendirmedir. Binanın deprem güvenliği hakkında kesin hüküm vermez ve resmi risk tespitinin yerine geçmez.
