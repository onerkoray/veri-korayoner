# Denetim ve iyileştirme — Kasım 2026

Mimari aynı kaldı: Astro statik site, Python veri hattı, GitHub Actions, statik
`/api/v1`. API v1 sözleşmesi korunur: alan silinmedi, yalnız dosya ve alan eklendi.
Lisans kapısı gevşetilmedi.

## Bulgular, önem sırasıyla

| Önem | Bulgu | Durum |
|---|---|---|
| Yüksek | Gezgin, boş aralıkta `Math.min()` / `Math.max()` ile geçersiz `Date` ve sonsuz renk ölçeği üretiyordu. | Düzeltildi, test var |
| Yüksek | Başarısız panel isteği önbellekte kalıyordu; sayfa yenilenmeden yeniden denenmiyordu. | Düzeltildi, test var |
| Yüksek | Sağlık uç noktası yoktu. `cekildi` yalnız veri değişince ilerlediği için "kaynak hâlâ okunuyor mu" görülemiyordu. | `durum.json` eklendi |
| Yüksek | `gozlemler.parquet.sha256` dosyanın özeti değil, satırların özetiydi; `sha256sum -c` başarısız olurdu. | Düzeltildi, test var |
| Yüksek | Gini (0–100) ve yaşam süresi (yıl) için yüzde değişim ve bileşik büyüme yazılıyordu. | Fark olarak yazılıyor, test var |
| Orta | Emsal karşılaştırma dönemi Türkiye'nin son döneminden eski olduğunda bu söylenmiyordu. | Söyleniyor, test var |
| Orta | Sıklık değişince görünmeyen seriler için yol gösterilmiyordu. | Ortak sıklığa geçiş düğmesi |
| Orta | Reel faizin ex post olduğu yalnız yöntem paragrafındaydı. | Başlık, etiket ve manşette |
| Orta | API dosyalarının bütünlüğü kısmen sınanıyordu; yayın sonrası canlı denetim yoktu. | Testler ve `canli.yml` |
| Orta | Gezgin sayfasında CLS 0,28 (telefon); Plot katmanlarında geçersiz `aria-label`. | CLS 0, erişilebilirlik 100 |
| Düşük | README "dizine kapalı" diyordu (canlıda `X-Robots-Tag` yok), olmayan `web/derle.mjs` komutunu ve eksik ADR bağlantısını taşıyordu. | Düzeltildi |
| Düşük | Grafik birim etiketi yüzde olmayan birimlerde (yıl, kişi, PPS) "yüzde" yazıyordu. | Düzeltildi |
| Düşük | Gezgin Dataset JSON-LD'si ve ana sayfa açıklaması ILO'yu saymıyordu. | Kayıttan türüyor |

## Dosya bazında değişiklikler

### Veri hattı

- `pipeline/veri/durum.py` (yeni). `api/v1/durum.json` yazar ve `saglik()` kırmızı/uyarı
  kurallarını tutar. Her seri için `son_kontrol`, `son_basarili_kontrol`,
  `son_veri_degisimi`, `son_gozlem`, `ardisik_hata`, `son_hata`, `gecikti`,
  `gecikme_gun` alanlarını yazar; kaynak bazında özet de çıkarır. `--seri` ile kısmi
  çalıştırmada denenmeyen serinin kaydı aynen kalır. Gecikme toleransı sıklığa göre
  belirlenir (aylık 120, çeyreklik 270, yarıyıllık 400, yıllık 730 gün); seri bunu
  `gecikme_gun` ile ezebilir. Kırmızı koşullar: üç ardışık hata ya da yedi günden eski
  başarılı kontrol.
- `pipeline/veri/canli.py` (yeni). Canlı `seriler.json`, `kaynaklar.json`, `durum.json`
  ve Parquet özetini depodakiyle karşılaştırır. Katalogdaki her seri dosyasını HEAD
  isteğiyle yoklar. Önbellek yayılması için altı tur dener. Yalnız
  `veri.korayoner.dev` adresine istek atar.
- `pipeline/veri/cli.py`: her serinin sonucu toplanıp `durum.yaz` çağrılıyor. Yeni
  komutlar `veri saglik` (kırmızıda çıkış 1) ve `veri canli`. `veri denetle`,
  `durum.json`'daki serilerin gösterim izinli olduğunu da denetliyor.
- `pipeline/veri/gol.py`: `.sha256` artık dosyanın SHA-256'sı, `sha256sum` biçiminde.
  Gereksiz yeniden yazımı önleyen satır özeti `site-veri/gol-satir-ozeti.txt` dosyasına
  taşındı; site-veri kamuya açık değildir.
- `pipeline/veri/modeller.py`: `SeriTanimi.gecikme_gun` alanı eklendi (isteğe bağlı, ≥ 1).
- `registry/seriler.yaml`: Gini için `birim: puan` (önce `endeks`) ve
  `gecikme_gun: 1460` (Dünya Bankası her yıl yayımlamıyor). Bu, API'de bir serinin
  `birim` değerinin düzeltilmesidir; şema değişmedi.
- `pipeline/tests/test_durum.py` (yeni): dönem sonu, başarılı ve başarısız kontrolün
  ayrılığı, ardışık hata, kısmi çalıştırma, gecikme toleransı ve kırmızı koşulları.
- `pipeline/tests/test_api_butunluk.py` (yeni): depodaki gerçek `yayin/` üzerinde
  sınar. Katalog v1 alanlarını, her seri dosyasının şemaya uyduğunu ve CSV'sinin
  JSON'la aynı olduğunu (Decimal karşılaştırma), yayımlanmış seri, emsal ve panel
  dosyalarında lisans kapısını, panelde türetilmemiş değerlerin kaynakla aynı
  olduğunu, Parquet özetinin dosyanın kendisi olduğunu, `durum.json` ve günlük
  şemasını denetler.
- `pipeline/tests/test_canli.py` (yeni): sahte istemciyle aynı içerik, eski derleme,
  eksik dosya ve izinsiz adres.

### Site

- `web/src/lib/gezgin-cekirdek.ts` (yeni): gezginin DOM'suz çekirdeği. İçinde sıklık
  uygunluğu, ortak sıklık, yıl aralığı, kapsam, boş veride `null` dönen zaman alanı ve
  ölçek, Türkçe harf duyarsız arama, CSV ve metaveri üretimi var.
- `web/src/scripts/gezgin.ts`:
  - Çekirdeği kullanıyor. Başarısız istek önbellekten siliniyor; ekranda "Yeniden
    dene" düğmesi çıkıyor.
  - Boş aralıkta seri bazında mesaj çıkıyor: serinin kapsadığı yılları söylüyor ve
    "Aralığı … yap" düğmesi sunuyor.
  - Seçilen sıklıkta olmayan seriler için ortak sıklığa geçiş düğmesi var.
  - Gösterge arama, "Bağlantıyı kopyala" ve "Metaveri (JSON)" indirmesi eklendi; CSV
    dosya adında indirme tarihi var.
  - Grafik başlıklarında birim ve "kaynak değeri" / "türetilmiş" rozeti, tablo
    başlıklarında birim ve türetilmiş işareti var.
  - Grafiklere ad ve son değer veren `aria-label` eklendi. Plot katmanlarının geçersiz
    `aria-label`'ları kaldırıldı. Tek noktalı seriler nokta olarak çiziliyor.
- `web/public/gezgin-erken.js` (yeni): formu ilk boyamadan önce açar ve telefonda
  listeyi kapatır. Harici dosyadır, çünkü CSP satır içi betiğe izin vermiyor. Sonuç:
  telefonda CLS 0,28'den 0'a indi.
- `web/src/pages/gezgin.astro`: arama kutusu, eylem düğmeleri, rozet ve boş durum
  stilleri, ilk çizime kadar yer ayırma eklendi. Dataset JSON-LD'nin `description` ve
  `isBasedOn` alanları kayıttan türüyor (ILO artık dahil).
- `web/src/lib/okuma.ts`:
  - Gini (`puan`) ve yaşam süresinde (`yil`) değişim fark olarak yazılıyor; Gini'de
    yanında göreli değişim var.
  - Seyrek yayımlanan seride on yıllık karşılaştırma, en az on yıl önceki son
    gözlemle yapılıyor.
  - `siraCumlesi`, karşılaştırma dönemi Türkiye'nin son döneminden eskiyse bunu ve
    iki değeri yazıyor.
- `web/src/lib/veri.ts`: `puan` birimi; önceki döneme göre değişimde Gini için puan
  farkı ve göreli değişim, yaşam süresi için yıl farkı.
- `web/src/lib/turetilmis.ts`: reel faiz serisinin başlığında "gerçekleşen enflasyonla,
  ex post" var. Emsal satırları Türkiye'nin son dönemini taşıyor.
- `web/src/pages/index.astro`: manşette reel faizin ex post olduğu yazıyor, emsal
  satırında Türkiye'nin son dönemi farklıysa o da yazıyor, açıklamada ILO var.
- `web/src/pages/hesap/reel-politika-faizi.astro`: etikette ve açıklamada "ex post"
  geçiyor. Ex post ile ex ante (beklenen enflasyonla) reel faizin farkı ayrı bir
  paragrafta anlatılıyor; beklenti verisi sitede olmadığı için ex ante hesap yapılmıyor.
- `web/src/pages/gosterge/[id].astro`: değişim açıklaması birime göre yazılıyor; emsal
  cümlesine Türkiye'nin son değeri geçiriliyor.
- `web/src/pages/yontem.astro`: türetilmiş değerler, sınırlı ölçekli göstergeler ve
  emsal dönemi kuralı eklendi. Kaldırılmış kur serilerine ait cümle silindi.
- `web/src/pages/api.astro`: `durum.json` ve `.sha256` uç noktaları belgelendi.
- `web/src/components/SeriGrafik.astro`: birim etiketi `birimAdi`'den geliyor.
- `web/test/okuma.test.ts`: Gini, yaşam süresi ve emsal dönemi testleri eklendi.
  `web/test/gezgin.test.ts` (yeni): boş aralık, tek nokta, uygunluk, arama, CSV ve
  metaveri.
- `web/e2e/gezgin.spec.ts` ve `web/playwright.config.ts` (yeni): masaüstü ve telefon
  için şunları sınar: varsayılan görünüm, boş aralık ve kapsama ayarlama, ortak sıklığa
  geçiş, 503 sonrası yeniden deneme, klavyeyle arama, seçim ve görünüm, grafik ipucu,
  beş sayfada yatay taşma olmaması. Konsolda hata olmamalı. Playwright 1.65.0'a
  sabitlendi.
- `web/package.json`: `npm test` iki birim test dosyasını koşuyor; `npm run e2e` eklendi.

### Süreç

- `.github/workflows/veri.yml`:
  - `arayuz` işi derlemeden sonra Chromium kuruyor ve `npm run e2e` koşuyor.
  - `guncelle` işi commit'ten sonra `veri saglik` koşuyor; kırmızıda "Veri hattı
    sağlık kırmızısı" issue'su açıyor ya da var olana yorum yazıyor.
- `.github/workflows/canli.yml` (yeni): Vercel main commit'ine "Vercel" statüsünü success
  yazınca (`status` olayı; Vercel bu depoda GitHub deployment kaydı açmıyor), o commit'te `veri canli` koşuyor; fark varsa "Canlı API
  depodan farklı" issue'su açıyor. Eylem SHA'ları mevcut iş akışındakilerle aynı.
- `README.md`: durum, komutlar, ADR bağlantıları, sağlık ve tazelik bölümü.

## Lighthouse (yerel, telefon öykünmesi, Lighthouse 12.8.2)

| Sayfa | Performans | Erişilebilirlik | En iyi uygulama | SEO |
|---|---|---|---|---|
| `/` | 99 | 100 | 100 | 100 |
| `/gezgin` (önce) | 85 | 96 | 100 | 100 |
| `/gezgin` (sonra) | 98 | 100 | 100 | 100 |
| `/gosterge/bis-tufe-yillik-tr` | 97 | 100 | 100 | 100 |
| `/hesap/reel-politika-faizi` | 97 | 100 | 100 | 100 |

## Belge bağlantıları

`registry/kaynaklar.yaml` içindeki belge ve lisans kanıtı adresleri 22 Kasım 2026'da
yoklandı:

- **Açılıyor:** Dünya Bankası, BIS, ILO lisans sayfası, Eurostat, ECB, EVDS, UN
  Comtrade ve Borsa İstanbul adreslerinin hepsi 200 döndü.
- **Bot koruması:** IMF API belgesi, OECD şartları ve ILO SDMX araçları sayfası 403
  döndü. Bu, ILO API'sinde daha önce görülen WAF davranışıyla aynı; bu üç sayfa
  tarayıcıda elle doğrulanmalı.
- **Zaman aşımı:** FRED API belgesi zaman aşımına uğradı. Kaynak planlı durumda.

## Yeni kaynaklar

- **IMF:** 17 Kasım incelemesi geçerli, kaynak kapalı kalıyor. Ticari yeniden kullanım
  ve otomatik toplu indirme için yazılı izin gerekiyor.
- **TCMB EVDS:** şart sayfası (`evds3.tcmb.gov.tr/hakkinda`) yalnız JavaScript ile
  çiziliyor, metni otomatik okunamadı. Lisans kapısı kanıt adresi ve okunmuş şart
  ister; okunana kadar EVDS `planlandi` durumunda ve serisi yok.

## Panorama (ikinci tur)

- `web/src/components/KpiKart.astro` (yeni): son gözlem, kaynağın dönemi, önceki
  karşılaştırılabilir döneme göre değişim (oranlarda puan), küçük çizgi, kaynak.
  `durum.json`'a göre "gecikmiş" ve "son çekim başarısız; önceki veri gösteriliyor"
  notu. Reel faiz kartı kesikli çerçeveyle "bu sitenin hesabı".
- `web/src/components/AnaGrafik.astro` ve `web/src/scripts/ana-grafik.ts` (yeni):
  politika faizi, yıllık TÜFE ve ex post reel faiz tek grafikte. Üçü de aylık ve
  yüzde olduğu için aynı eksende; reel faiz türetilmiş olduğu için kesikli ve nötr
  renkte. Aralık seçenekleri 1/3/5/10 yıl ve tümü; seriler açılıp kapanabiliyor;
  imleçte üç değer görünüyor. CSV kaynak metniyle indiriliyor, bağlantı
  kopyalanabiliyor. Durum adresin `#` kısmında. Aralık, bütün serilerin en yeni
  dönemine göre kuruluyor.
- `web/src/lib/ana-grafik-cekirdek.ts` + `web/test/ana-grafik.test.ts` (yeni):
  aralık başlangıcı ve eksik ayların null kaldığı geniş tablo.
- `web/src/pages/index.astro`:
  - Başlık "Türkiye ekonomisinin görünümü"; kaynak listesi kayıttan türüyor.
  - "Veri sağlığı" özeti `durum.json`'dan geliyor.
  - Altı KPI kartı eski reel faiz manşetinin yerini aldı.
  - "Son açıklanan veriler" tablosuna önceki değer ve güncelleme türü (yeni dönem /
    revizyon, değişiklik günlüğünden) eklendi.
- `web/src/lib/veri.ts`: `durum()` okuyucusu.
- Plot erişilebilirliği: katman `aria-label`'ı işaret türünden gelir ve `ariaLabel`
  seçeneği onu kapatmaz. İlk turdaki `ariaLabel: null` yaklaşımı bu yüzden
  yetersizdi; gezginde erişilebilirlik 96'ya düşmüştü. Artık iki grafikte de svg
  içindeki bütün `g[aria-label]` MutationObserver ile siliniyor; e2e testi bunu sınıyor.
- Gezgin CLS: `.g-kontrol { display: grid }` `hidden`'ı eziyor. Telefonda liste
  sonradan kapanınca aralıklı 0,12–0,28 kayma oluyordu. Liste artık ilk boyamada CSS
  ile kapalı (`data-ilk`); dört ölçümde CLS 0.
- `web/betikler/kare.mjs` (yeni): önce/sonra kareleri (masaüstü açık/koyu, telefon).

| Sayfa (Lighthouse 12.8.2, telefon) | Performans | Erişilebilirlik | En iyi uygulama | SEO | CLS |
|---|---|---|---|---|---|
| `/` önce | 99 | 100 | 100 | 100 | 0 |
| `/` sonra | 99 | 100 | 100 | 100 | 0 |
| `/gezgin` sonra (4 ölçüm) | 99 | 100 | — | — | 0 |

## Veri gezgini 2 ve ülke karşılaştırması (üçüncü tur)

- `web/src/scripts/gezgin.ts`:
  - Geri/ileri tuşları çalışıyor: her değişiklik `pushState`, adres `popstate`/`hashchange` ile yeniden kuruluyor.
  - Ölçek seçimi (Değer / Baz = 100 / Fark): uygun seriler ortak baz döneminden itibaren tek eksende.
  - Bir panelde en çok 4 seri; daha fazlası yeni panele geçiyor. Uygun olmayan seri için ölçek önerisi çıkıyor.
  - Tablo sütun başlığından sıralanıyor (`aria-sort`).
  - Kurum ve sıklık süzgeçleri eklendi; adrese yazılmıyor.
- `web/src/lib/gezgin-cekirdek.ts`: `olcekUygun`, `ortakBaz`, `donustur`, `sirala`; testler `web/test/gezgin.test.ts`.
- `web/src/lib/bicim.ts` (yeni): gezgin ve karşılaştırmanın ortak değer ve dönem biçimi (yarıyıl dahil).
- `web/src/styles/taban.css`: `--kat-1..4` dört renkli palet. OKLab ölçüsünde renk körlüğü benzetimiyle bütün çiftler ≥ 9, normal görüşte ≥ 16. Yüzeye karşıtlık ≥ 3:1. Altı renk denendi; renk körlüğünde ayrışmadığı için 4 ile sınırlandı.
- `web/src/pages/karsilastir.astro` ve `web/src/scripts/karsilastir.ts` (yeni):
  - Gösterge, dönem ve ülke seçimi; sıralı çubuklarda Türkiye vurgulu.
  - Emsal medyanı ve AB-27 başvuru çizgisi.
  - Zaman içinde Türkiye, emsal medyanı ve en düşük–en yüksek bandı.
  - Verisi olmayan ülke adıyla yazılıyor.
  - CSV (indirme izniyle), bağlantı kopyalama, geri/ileri ve yeniden deneme var.
  - Yalnız API izinli `/api/v1/emsal` ve `/api/v1/seri` dosyalarını okuyor.
  - Sunucuda her göstergenin son karşılaştırma tablosu çiziliyor (JS'siz okunur).
- `web/src/lib/karsilastir-cekirdek.ts` + `web/test/karsilastir.test.ts`: dönem kuralı `okuma.ts`'deki `sirala` ile aynı (test bunu doğruluyor).
- Menü ve site haritası `/karsilastir`'ı içeriyor; `web/src/pages/yontem.astro`'ya `#olcek` bölümü eklendi.

| Sayfa (Lighthouse 12.8.2, telefon) | Performans | Erişilebilirlik | En iyi uygulama | SEO | CLS |
|---|---|---|---|---|---|
| `/` | 99 | 100 | 100 | 100 | 0 |
| `/gezgin` | 99 | 100 | 100 | 100 | 0 |
| `/karsilastir` | 99 | 100 | 100 | 100 | 0 |

## Kaynak sağlığı ve geliştirici sayfası (dördüncü tur)

- `web/src/pages/kaynaklar.astro`: `durum.json`'dan beslenen "Veri sağlığı" paneli eklendi.
  - Özet sayılar: yayımlayan kurum, yayında seri, gözlem, son kontrol, son çekimi başarısız, takvimin gerisinde.
  - Kurum başına son başarılı kontrol, başarısız ve gecikmiş seriler; hata metni sayfaya konmuyor, yalnız sayı ve seri adı.
  - İzni olup yayımlanan serisi olmayan kurum (ECB) açıkça işaretli.
- `web/src/pages/api.astro`:
  - Kod örnekleri: curl, Python (standart kitaplık ve pandas), JavaScript ve DuckDB. Dördü de 22 Kasım'da canlı siteye karşı çalıştırıldı.
  - Seri dosyası alan sözlüğü, dönem biçimleri, hata ve boş veri davranışı, atıf örneği, v1 sözleşmesi.
- `web/src/scripts/api-dene.ts` (yeni): tarayıcıda deneme aracı.
  - Uç nokta, seri ve sıklık seçiliyor; yanıt biçimlenip 400 satırda kısaltılıyor, kopyalama yanıtın tamamını alıyor.
  - HTTP durumu, boyut ve süre gösteriliyor; 404'te açıklama çıkıyor.
  - Sunucu yok, durum tutulmuyor.
- `web/betikler/denetle.mjs`: yinelenen `id` artık derlemeyi kırıyor. Deneme aracı bu yüzden çalışmıyordu (`<h2 id="dene">` formla aynı kimlikteydi). Kapı ayrıca `/koray-oner`'de atlama bağlantısının hedefi `main#ana` ile aynı kimliği taşıyan bir başlık buldu; düzeltildi.

| Sayfa (Lighthouse 12.8.2, telefon) | Performans | Erişilebilirlik | En iyi uygulama | SEO | CLS |
|---|---|---|---|---|---|
| `/kaynaklar` | 100 | 100 | 100 | 100 | 0 |
| `/api` | 100 | 100 | 100 | 100 | 0 |

## Kısa adresler

Kullanıcı bildirimi: gezgin adresi gereksiz uzun ve standart dışıydı. Varsayılan görünüm bile
`#g=…%2C…&s=aylik&d=ort&b=2010&e=2026&v=grafik&o=deger` biçiminde yazılıyordu.

- `adresParcasi` (`web/src/lib/gezgin-cekirdek.ts`): adrese yalnız varsayılandan farklı ve boş
  olmayan alanlar yazılıyor. Virgül kodlanmıyor; `#` sonrasında serbest bir karakter. Hepsi
  varsayılansa adres `#`'siz kalıyor.
- Gezgin, karşılaştırma ve Panorama grafiği bu yardımcıyı kullanıyor. Gezginde seçim sırası adresi
  değiştirmiyor (küme karşılaştırması). Karşılaştırmada en yeni dönem adrese yazılmıyor.
- Eski uzun bağlantılar çalışmaya devam ediyor ve açılınca sadeleşiyor. Örnekler:
  - Kullanıcının gönderdiği adres: `/gezgin`.
  - Sıklığı yıllık yapınca: `/gezgin#s=yillik`.
  - Panorama'da 3 yıl seçince: `/#aralik=3`.

## Görsel kimlik, tema düğmesi ve favicon (beşinci tur)

- `web/public/favicon.svg`: eski favicon `#17201d` çizgiliydi ve koyu sekme çubuğunda neredeyse
  görünmüyordu. Yenisi koyu karo üstünde yeşil, yükselen çizgi. SVG içindeki
  `prefers-color-scheme` ile koyu tarayıcıda karo açık, çizgi koyu yeşil oluyor. PNG yok
  (kullanıcı tercihi).
- `web/public/tema-erken.js` (yeni): tema tercihini ilk boyamadan önce uyguluyor. Değerler
  korayoner.dev ile aynı (`data-theme` light/dark, yoksa sistem). Tercih yalnız bu cihazda,
  `localStorage` içinde. Düğme Sistem → Açık → Koyu döngüsüyle çalışıyor. Telefonda kayan
  menüde etkin öğe ortalanıyor.
- `web/src/styles/taban.css`: koyu tokenlar hem sistem tercihi
  (`:root:not([data-theme="light"])`) hem elle seçim (`:root[data-theme="dark"]`) için
  tanımlı. Logo ve favicon renkleri `--isaret-*`.
- `web/src/layouts/Taban.astro`:
  - Logo, favicon ile aynı satır içi SVG.
  - Başlıkta veri durumu (son kontrol günü ve uyarı sayısı, `/kaynaklar`'a bağlantı).
  - Tema düğmesi; boşluğu `visibility` ile ayrılıyor, CLS 0.
  - Telefonda başlık iki satır, menü tek satırda yatay kayıyor (önce üç satırdı).
  - `theme-color` meta etiketleri eklendi.
- `web/betikler/kare.mjs`: tam sayfa AVIF 16.000 px'te kesiliyor (AVIF sınırı 16.384).
- e2e: tema döngüsü ve sayfalar arası kalıcılık, favicon, telefonda tek satır menü.
  Toplam 51 test.

## Gösterge sayfaları (altıncı tur)

- `web/src/pages/gosterge/[id].astro`:
  - Başlığın altında güncellik satırı: kaynağın son güncellemesi, son başarılı kontrol, "gecikmiş" ve "son çekim başarısız" işaretleri (`durum.json`).
  - "Veri gezgininde aç" (yıllık serilerde bütün dönem) ve "Emsallerle karşılaştır" bağlantıları.
  - Revizyon geçmişi: değişiklik günlüğündeki yeni dönem ve düzeltme kayıtları ile dosyanın GitHub sürüm geçmişine bağlantı (ilk açıklanan değer ve her düzeltme).
  - Gözlem tablosunda "Bir yıl önceye göre" sütunu. Oran ve puanda fark (puan), yaşam süresinde yıl, düzeyde yüzde; önceki değer pozitif değilse yazılmıyor.
- `web/src/lib/okuma.ts`: `yillikDegisimler` + test.
- e2e: gösterge sayfası (güncellik, revizyon, yıllık değişim, gezgin bağlantısı). Toplam 53 test.
- Lighthouse `/gosterge/bis-tufe-yillik-tr`: 97/100/100/100, CLS 0.
