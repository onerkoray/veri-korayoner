# veri.korayoner.dev

Uluslararası kurumların Türkiye verileri — kaynağıyla, birimiyle, çekildiği
günle, lisansıyla ve revizyon geçmişiyle.

**Durum:** yapım aşamasında. Dizine kapalı (`X-Robots-Tag: noindex`).

## Nasıl çalışır

- `registry/kaynaklar.yaml` — kurumlar ve **lisans kapısı**. Yayın izni
  yalnız resmî kullanım şartı okunup kanıt adresi yazıldıktan sonra açılır.
- `registry/seriler.yaml` — Türkiye serileri.
- `pipeline/` — Python veri hattı (uv). `uv run veri guncelle` çeker,
  doğrular, izne göre `yayin/` altına yazar; `uv run veri denetle` ağsız
  denetler.
- `yayin/api/v1/` — kamuya açık statik API (JSON, izinliyse CSV).
- Her gece commit'i o günün vintage'ıdır: `git log -p yayin/` bir
  gözlemin ilk açıklanan değerini ve her düzeltmesini gösterir.

Mimari kararı: [docs/adr/0001-mimari.md](docs/adr/0001-mimari.md).

## Yerelde

```sh
cd pipeline
uv sync
uv run pytest -q
uv run veri guncelle
uv run veri denetle
node ../web/derle.mjs
```

## Atıf

Her seri dosyası kaynak kurumu, lisansı ve lisans kanıt adresini taşır.
Veriyi kullanırken asıl kaynağa atıf yapın. Bu proje kurumlardan
bağımsızdır; resmî kurum sitesi değildir.

Kod: MIT. Veri: her serinin kendi kaynak lisansı.
