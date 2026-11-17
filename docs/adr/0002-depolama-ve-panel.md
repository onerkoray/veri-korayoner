# ADR 0002 — Depolama katmanları ve panel: bir kez karar

Tarih: 17 Kasım 2026 · Durum: kabul edildi

Amaç: seri sayısı 8'den 8.000'e, kaynak sayısı 1'den 30'a çıktığında
veritabanı ya da panel için yeniden karar almamak.

## Depolama: üç katman, tek yönde akar

```
kaynak API ──► 1. Kanonik seri (JSON, git) ──► 2. Analitik göl (Parquet) ──► 3. Yayın (API JSON/CSV, panel)
```

1. **Kanonik katman — `yayin/site-veri/seri/{id}.json`.** Tek doğruluk
   kaynağı. Değer `Decimal`'den metin olarak yazılır (kayıpsız). Depo bu
   katmanın veritabanıdır: her commit bir vintage; `git log -p` revizyon
   geçmişidir. Değişmeyen seri yeniden yazılmaz, yani her commit gerçek
   bir değişikliktir. Ölçek: bir seri birkaç KB; 10.000 seri ~100 MB ve
   git bunu rahat taşır.
2. **Analitik göl — `yayin/api/v1/gozlemler.parquet`.** Bütün izinli
   gözlemler uzun biçimde (seri, dönem, değer DECIMAL(38,14), birim,
   kaynak, çekildi). DuckDB ile her çalıştırmada kanonik katmandan yeniden
   üretilir; elle düzenlenmez. Parquet, DuckDB / Polars / pandas / R /
   Excel Power Query'nin doğrudan okuduğu açık kolonlu biçimdir.
   **Büyüme yolu:** Panel ileride serbest sorgu (karşılaştırma, filtre,
   toplama) isterse DuckDB-WASM tarayıcıda aynı Parquet dosyasını okur.
   Sunucu, şema göçü ya da yeni veritabanı gerekmez.
3. **Yayın katmanı.** Seri başına JSON ve (izinliyse) CSV, katalog
   dosyaları ve panel sayfaları. Hepsi 1. ve 2. katmandan türer.

PostgreSQL, TimescaleDB, ClickHouse **gerekmez**: yazma tek bir zamanlanmış
iş, okuma statik. Bir gün kullanıcıya ait yazma (hesap, alarm, kişisel API
anahtarı) gerekirse, o ayrı bir servistir ve bu katmanlara dokunmaz.

## Panel

- **Astro** (statik çıktı) + **TypeScript**. Her seri ve kaynak için sayfa
  derlemede üretilir: arama motoru ve JS'siz okur tam sayfayı görür.
- **Grafik:** sunucuda çizilen SVG (JS'siz de okunur) + **Observable Plot**
  adası (imleç, ipucu, dönem seçimi). Plot D3 tabanlı, ISC lisanslı, küçük.
- **Tasarım tokenları** korayoner.dev'den; açık/koyu tema; WCAG AA.
- **Yönetim paneli yok:** kaynak ekleme = `registry/*.yaml` PR'ı; lisans
  onayı = kanıt adresiyle PR; iş geçmişi = GitHub Actions; hata = otomatik
  issue. Her değişiklik denetlenebilir ve geri alınabilir.

## Güvenlik

Sunucu kodu yok. CSP `script-src 'self'`, satır içi betik yok; üçüncü
taraf betik, yazı tipi, ölçüm yok. Bağımlılıklar kilit dosyalarıyla, CI
eylemleri SHA ile sabit. Ağ katmanı izinli host listesiyle çalışır.

## Kaynak ekleme sözleşmesi (değişmez)

Yeni kaynak = `pipeline/veri/baglayicilar/{id}.py` (`cek(seri) -> HamSeri`)
+ `registry/kaynaklar.yaml` satırı (lisans kanıtıyla) + gerçek yanıt
fixture'ıyla test. Katmanlar, API ve panel kendiliğinden genişler.
