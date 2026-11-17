# ADR 0001 — Mimari: sunucusuz veri hattı, kenardan servis edilen API

Tarih: 17 Kasım 2026 · Durum: kabul edildi

## Bağlam

veri.korayoner.dev, uluslararası kurumların (Dünya Bankası, IMF, BIS, OECD,
Eurostat, ECB) ve TCMB'nin Türkiye verilerini kaynağıyla, birimiyle,
çekilme zamanıyla ve revizyon geçmişiyle yayımlar.

Başlangıç önerisi (CLAUDE_MASTER_PROMPT.md) Next.js + FastAPI + PostgreSQL +
Celery + Redis + Docker + Caddy idi. Bu yedi servis 7/24 çalışan bir sunucu,
yama, yedek, şifreli yönetim paneli ve nöbet ister. Sitenin sahibi tek kişi;
ana sitedeki temel sorun zaten bakım yükü.

Verilerin hepsi açıklama takvimine bağlı: yıllık, çeyreklik, aylık. Hiçbiri
saniyelik değil. Okur yazmıyor, yalnız okuyor.

## Karar

1. **Veri hattı** GitHub Actions'ta zamanlanmış Python 3.12 işidir.
   Bağımlılıklar `uv` kilit dosyasıyla sabit; her bağlayıcı aynı sözleşmeyi
   uygular (`pipeline/veri/baglayici.py`): getir → ayrıştır → doğrula
   (Pydantic) → normalize et.
2. **Depolama**: her seri için kanonik JSON (gözlemler, metaveri, kaynak).
   Depo kendisi revizyon veritabanıdır: her gece commit'i o günün
   vintage'ıdır; `git log -p` bir gözlemin ilk açıklanan değerini ve her
   düzeltmesini kayıpsız verir. Analitik dışa aktarım Parquet + DuckDB
   (Faz 2).
3. **API**, sürümlü statik JSON/CSV dosyalarıdır (`/api/v1/...`), CDN
   kenarından servis edilir. Sunucu kodu yok: enjeksiyon, kimlik doğrulama,
   oturum ve hız sınırı saldırı yüzeyi yok.
4. **Lisans kapısı** kod değil, veri: `registry/kaynaklar.yaml` her kaynak
   için gösterim/indirme/API izinlerini ve kanıt adresini taşır. Yayın adımı
   izni `true` olmayan seriyi yazmaz; CI bunu ayrıca sınar.
5. **Bozuk veri iyi veriyi ezmez**: bir bağlayıcı doğrulamadan geçemezse o
   serinin dosyası değişmez, iş kırmızıya döner, takip issue'su açılır.
6. **Arayüz** Astro + TypeScript, statik çıktı; JavaScript yalnız grafik
   adalarında. Üçüncü taraf betik yok, sıkı CSP.

## Sonuçlar

- Aylık altyapı maliyeti sıfır; bakım = PR onayı.
- Gerçek zamanlı veri bu mimaride yok. Lisanslı piyasa verisi (BIST, CDS)
  zaten Faz 3'te ve ayrı sözleşme ister; o gün sunucu ayrı bir ADR'dir.
- Kullanıcıya ait yazma (hesap, favori, API anahtarı) yok. Gerekirse ayrı ADR.
