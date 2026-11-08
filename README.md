# Risktaki Bina

**Deprem gelmeden önce hangi binanın daha riskli olduğunu görebilsek?**

Risktaki Bina, drone ile çekilen bina fotoğraflarından duvardaki çatlakları yapay zekâ ile bulur. Bunu bölgenin deprem tehlikesi ve binanın yaşıyla birleştirip her bina için 0–100 arası bir risk puanı verir. Puanlar, vatandaşın, belediyenin ve AFAD'ın kullanabileceği bir harita uygulamasında görünür.

TEKNOFEST 2026 Deneyap Takımlar Dönemi projesi, ekip **SEMRUK**.

**Uygulamayı dene:** https://feyzadedeoluk.github.io/risktaki-bina/ (telefonda açıp "Ana ekrana ekle" ile kurabilirsin)

## Proje şu an nerede?

| Parça | Durum |
|---|---|
| Çatlak bulan yapay zekâ modeli | Çalışıyor, iki veri setiyle eğitildi |
| Risk puanı hesabı | Çalışıyor |
| Harita uygulaması (Vatandaş, Belediye, AFAD) | Çalışıyor |
| Fotoğraf analizi ve PDF rapor | Çalışıyor |
| Drone fotoğraflarını otomatik işleyen program | Yazıldı, yapay verilerle test edildi |
| **Gerçek drone taraması** | **Henüz yapılmadı** (drone hazırlanıyor) |

Uygulamadaki binalar şimdilik **örnek veridir**, gerçek bina değildir. Ekranda "ÖRNEK VERİ" etiketi görünür. Gerçek tarama yapılınca bu veriler gerçekleriyle değişecek.

## Nasıl çalışıyor?

```
Drone fotoğrafları → çatlak tespiti → risk puanı (0-100) → harita uygulaması
```

**Puan = Çatlak (0–40) + Deprem tehlikesi (0–35) + Bina yaşı (0–25)**

| Puan | Kategori | Renk |
|---|---|---|
| 0–40 | Düşük | yeşil |
| 41–70 | Orta | sarı |
| 71–100 | Yüksek | kırmızı |

- **Çatlak:** Fotoğraflarda ne kadar çatlak bulunduğu ve duvarın ne kadarını kapladığı.
- **Deprem tehlikesi:** Bölgenin AFAD Türkiye Deprem Tehlike Haritası'ndaki değeri.
- **Bina yaşı:** Binanın hangi deprem yönetmeliği döneminde yapıldığı (1975, 1998, 2018). Yaş fotoğraftan anlaşılmaz, belediye kaydından alınır. Kayıt yoksa uygulamada "tahmini" yazar.

## Uygulamada neler var?

- Gerçek harita: risk renkli binalar, arama, filtre, "bana yakın" sıralaması
- Bina kartı: puanın nedeni, yapılabilecekler, drone fotoğrafı (gerçek veri varsa)
- **Vatandaş**, **Belediye** (denetim durumu ve not) ve **AFAD** (mahalle risk özeti) görünümleri
- **Fotoğraf analizi:** Telefondan çekilen fotoğrafta çatlaklar işaretlenir. Fotoğraf cihazdan dışarı çıkmaz.
- **Rapor:** Tek bina raporu veya yüksek riskli binalar listesi, PDF olarak
- Skor hesaplayıcı: değerleri girip puanın nasıl değiştiğini gör

## Yapay zekâ modeli

YOLOv8n ile tek sınıflı (`crack`) çatlak tespiti. İki ayrı model eğitildi:

| Model | Veri | Precision | Recall | mAP50 | mAP50-95 |
|---|---|---|---|---|---|
| Yakın plan beton | Concrete Crack, ~10.000 görsel | 0,850 | 0,779 | 0,869 | 0,739 |
| Drone cephe | BFD-UAV2K, 2.000 görsel (640 px parçalara bölündü) | 0,567 | 0,528 | 0,534 | 0,246 |

İki satır birbiriyle karşılaştırılamaz: farklı veri setleri, farklı zorluk. Drone cephe verisinde çatlak çok küçük ve görüntüde az yer kaplar, bu yüzden sayılar daha düşüktür. Cephe verisinde dökülme hasarları da çatlakla aynı sınıfta toplanmıştır. Her iki sonuç da kendi doğrulama setindendir, bağımsız bir test seti değildir.

Bilinen sınırlar: gölge, ağaç ve pencere kenarları yanlış alarm verebilir. Çatlağı görmek için duvara yaklaşık 3–5 metreden bakmak gerekir.

Kullanılan veri setlerinin kaynakları: BFD-UAV2K (RealUAV-SD) ve Concrete Crack. Lisans koşullarına uyulacaktır.

## Geliştirme süreci

Proje takım tarafından yürütüldü: problemin seçimi, veri ve model kararları, test ve geri bildirim ekibe aittir. Yazılımın geliştirilmesinde bir yapay zekâ asistanından (Claude) yardım alındı. Depodaki tarihli kayıtlar (commit geçmişi) projenin aşamalarını gösterir.

## Sınırlar

Puan, fotoğraflardan yapılan **ön değerlendirmedir**. Binanın deprem güvenliği hakkında kesin hüküm vermez ve resmi risk tespitinin yerine geçmez.

---

# Teknik bilgiler

<details>
<summary>Kurulum, komutlar ve dosyalar</summary>

## Komut satırından kullanım

```bash
pip install -r requirements.txt
python risk_skor.py --gorseller foto_klasoru --model best.pt --yil 1985 --pga 0.45 --ad "Bina-1"
```

Birden fazla bina için `binalar.csv` (sütunlar: `ad,klasor,yil,pga,enlem,boylam`; isteğe bağlı: `adres,mahalle,kat`):

```bash
python risk_skor.py --bina-listesi binalar.csv --model best.pt --cikti sonuc.json
```

Çıktı: `sonuc.json` (risk sırasına göre) ve tespitlerin çizildiği fotoğraflar (`isaretli_gorseller/`). Model dosyası (`best.pt`) boyutu nedeniyle ayrıca eklenir. Eğitim Google Colab'da T4 GPU ile yapıldı.

## Formül ayrıntısı

- Çatlak: `40 × (0,6 × min(1; kapsama/%15) + 0,4 × min(1; çatlak sayısı/5))`
- Deprem tehlikesi: 0,05 g ve altı 0 puan, 0,80 g ve üstü 35 puan, arası doğrusal
- Bina yaşı: 1975 öncesi 25; 1975–1997 arası 20'den 15'e; 1998–2017 arası 12'den 6'ya; 2018 ve sonrası 3

## Gerçek veri akışı

1. `python risk_skor.py --bina-listesi binalar.csv --model best.pt --cikti sonuc.json`
2. Uygulamada **Araçlar › Veri yükle** ile `sonuc.json` seçilir (cihazda saklanır), ya da dosya depoya `binalar.json` adıyla konur.
3. Veri yoksa uygulama "ÖRNEK VERİ" etiketli uydurma binalar gösterir.

## Drone uçuşunu otomatik işleme

```bash
python ucus_isle.py ucus_klasoru --model best.pt --pga 0.45 --yil 1990 --osm
```

Betik sırayla şunları yapar: fotoğraf konumunu okur (EXIF GPS, yoksa `--gpx` uçuş kaydı ve saat eşleştirmesi) → konuma göre binalara ayırır → gökyüzünü, ağacı ve zemini eler (`--seg` ile SegFormer, varsayılan klasik renk yöntemi) → duvarı orijinal çözünürlükte 640 px karolarla tarar → `--osm` ile OpenStreetMap'ten kat sayısı, varsa yapım yılı ve adresi alır → skoru hesaplar → `binalar.json` yazar ve işaretli fotoğrafı hem `kanit/` klasörüne hem kayda gömer (uygulamada bina kartında görünür).

Bina yaşı sırasıyla: `--csv` belediye listesi (şablon: `belediye_ornek.csv`) → OpenStreetMap `start_date` → `--yil` tahmini. Deprem ivmesi için `--pga` ya da CSV'de `pga` sütunu.

## Model dosyası (uygulamadaki fotoğraf analizi için)

```python
from ultralytics import YOLO
YOLO('best.pt').export(format='onnx', imgsz=640, simplify=False, opset=12)
```

Çıkan dosya `model.onnx` adıyla `index.html` ile aynı klasöre konur.

## Yayınlama

- **GitHub Pages:** Settings → Pages → Branch: `main`, klasör `/ (root)` → Save.
- **APK:** Actions sekmesi → "APK derle" → Run workflow. Bitince `risktaki-bina-apk` dosyasını indir.

## Teknik not

Harita altlığı OpenStreetMap'tir; yoğun kullanım için kendi harita sağlayıcısı gerekir. Uygulama Leaflet, ONNX Runtime Web ve jsPDF kullanır.

</details>
