# veri.korayoner.dev

Uluslararası kurumların Türkiye verileri — kaynağıyla, birimiyle, çekildiği
günle, lisansıyla ve revizyon geçmişiyle.

**Durum:** yayında ve dizine açık. Kaynaklar: BIS, Dünya Bankası, OECD,
Eurostat, ILO. ECB'nin lisansı onaylı ama şu an yayımlanan serisi yok.

## Nasıl çalışır

- `registry/kaynaklar.yaml` — kurumlar ve **lisans kapısı**. Yayın izni
  yalnız resmî kullanım şartı okunup kanıt adresi yazıldıktan sonra açılır.
  Seri izni kaynağınkini yalnız daraltabilir.
- `registry/seriler.yaml` — Türkiye serileri; emsal ülkeler ve gecikme
  toleransı (`gecikme_gun`) burada.
- `pipeline/` — Python veri hattı (uv). Komutlar aşağıda.
- `yayin/api/v1/` — kamuya açık statik API (JSON, izinliyse CSV). Sözleşme:
  v1'de alan silinmez, yalnız eklenir.
- `yayin/site-veri/` — sitenin derlemede okuduğu dosyalar; kamuya açık değildir.
- Her commit o günün vintage'ıdır: `git log -p yayin/` bir gözlemin ilk
  açıklanan değerini ve her düzeltmesini gösterir.
- `web/` — Astro statik site; veri gezgini (`/gezgin`) panel veri setini
  tarayıcıda okur, durum adresin `#` kısmında durur.

Kararlar: [mimari](docs/adr/0001-mimari.md) ·
[depolama ve panel veri seti](docs/adr/0002-depolama-ve-panel.md) ·
[denetim ve iyileştirme kaydı, Kasım 2026](docs/denetim-2026-11.md).

## Komutlar

```sh
cd pipeline
uv sync
uv run ruff check .
uv run pytest -q          # ağsız; yayin/ varsa API bütünlük testleri de koşar
uv run veri guncelle      # çek, doğrula, yayımla; panel, Parquet ve durum.json'ı yaz
uv run veri denetle       # kayıt ve yayımlanmış dosyalar lisans kapısından geçiyor mu
uv run veri saglik        # durum.json'a göre kırmızı/uyarı; kırmızıda çıkış 1
uv run veri canli         # canlı /api/v1 dosyaları depodakiyle aynı mı

cd ../web
npm ci
npm test                  # okuma cümleleri ve gezgin çekirdeği
npm run build             # derle + denetle (satır içi betik, NaN, lisans dışı dosya, noindex)
```

## Sağlık ve tazelik

`/api/v1/durum.json` her çalıştırmada yazılır ve üç zamanı ayrı tutar:

- `son_kontrol`: seri bu çalıştırmada denendi mi, ne zaman.
- `son_basarili_kontrol`: kaynaktan en son ne zaman başarıyla okundu (veri
  değişmemiş olsa da).
- `son_veri_degisimi` ve `son_gozlem`: dosya en son ne zaman değişti, en yeni
  dönem hangisi.

`ardisik_hata` ve `son_hata` düşen kaynağı, `gecikti` ise beklenen yayın
takviminin gerisinde kalan seriyi gösterir. Kırmızı koşullar (`veri saglik`):
üç ardışık hata ya da yedi günden eski başarılı kontrol. Zamanlanmış iş
kırmızıda issue açar; Vercel main commit'ine başarılı statü yazınca `canli.yml` canlı
dosyaları depodakiyle karşılaştırır.

## Atıf

Her seri dosyası kaynak kurumu, lisansı ve lisans kanıt adresini taşır.
Veriyi kullanırken asıl kaynağa atıf yapın. Bu proje kurumlardan
bağımsızdır; resmî kurum sitesi değildir.

Kod: MIT. Veri: her serinin kendi kaynak lisansı.
