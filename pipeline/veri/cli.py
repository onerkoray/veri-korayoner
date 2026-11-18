"""Komut satırı.

  veri guncelle [--seri ID ...]   kaynaklardan çek, doğrula, izinle yayımla, katalog yaz
  veri katalog                    yalnız kataloğu yeniden yaz
  veri denetle                    kayıt ve yayımlanmış dosyaları ağsız doğrula (CI)

Bir seri düşerse diğerleri sürer; çıkış kodu 1 olur ve düşen seri yazılmaz.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from . import gol, panel
from .baglayicilar import baglayici
from .kayit import KOK, kaynaklar, seriler
from .modeller import SeriDosyasi
from .yayin import _yaz_atomik, emsal_yaz, farklar, gunluge_ekle, izin, katalog, kaynak_ozeti, onceki, yayinla

CIKTI = KOK / "yayin"


def guncelle(secili: list[str] | None, cikti: Path = CIKTI) -> int:
    ks, ss = kaynaklar(), seriler()
    simdi = datetime.now(UTC)
    gun = simdi.date().isoformat()
    hata = 0
    olaylar: list[dict] = []
    bag: dict = {}       # kaynak başına tek bağlayıcı (metaveri önbelleği çekim boyunca yaşar)
    for s in ss:
        if secili and s.id not in secili:
            continue
        k = ks[s.kaynak]
        iz = izin(k, s)
        if not iz.gosterim:
            print(f"atla   {s.id}: yayın izni yok ({k.durum})")
            continue
        try:
            b = bag.setdefault(s.kaynak, baglayici(s.kaynak))
            ham = b.cek(s)
            d = SeriDosyasi(id=s.id, baslik=s.baslik, ulke=s.ulke, siklik=s.siklik, birim=s.birim, carpan=s.carpan,
                            tema=s.tema, kaynak=kaynak_ozeti(k), kaynak_kod=s.kod, kaynak_adi=ham.kaynak_adi,
                            kaynak_not=ham.kaynak_not, kaynak_guncelleme=ham.kaynak_guncelleme, cekildi=simdi,
                            izin=iz, gozlemler=ham.gozlemler)
            eski = onceki(cikti / "site-veri" / "seri" / f"{s.id}.json")
            yazilan = yayinla(d, cikti)
            if yazilan:
                olaylar += farklar(eski, d, gun)
            son = next((g for g in reversed(d.gozlemler) if g.deger is not None), None)
            print(f"{'yazdı' if yazilan else 'aynı '}  {s.id}: {len(d.gozlemler)} gözlem, son {son.donem if son else '-'}")
        except Exception as e:  # noqa: BLE001 — bir seri düşerse diğerleri sürer
            hata += 1
            print(f"HATA   {s.id}: {type(e).__name__}: {e}", file=sys.stderr)
            continue
        # Emsal ülkeler: biri düşerse önceki verisi kalır; Türkiye serisini düşürmez, hata sayılmaz.
        if s.emsal:
            alinan = {}
            if hasattr(b, "cek_coklu"):
                try:
                    alinan = b.cek_coklu(s, s.emsal)
                except Exception as e:  # noqa: BLE001 — toplu istek düşerse ülke ülke denenir
                    print(f"uyarı  {s.id} [emsal toplu]: {type(e).__name__}: {e}", file=sys.stderr)
            if not alinan:
                for u in s.emsal:
                    try:
                        alinan[u] = b.cek(s.model_copy(update={"ulke": u})).gozlemler
                    except Exception as e:  # noqa: BLE001
                        print(f"uyarı  {s.id} [{u}]: {type(e).__name__}: {e}", file=sys.stderr)
            yazildi = emsal_yaz(s, iz, alinan, cikti)
            print(f"emsal  {s.id}: {len(alinan)}/{len(s.emsal)} ülke" + (" yazıldı" if yazildi else " aynı"))
    gunluge_ekle(olaylar, cikti)
    katalog(ks, ss, cikti, simdi)
    print('göl  ' + ('yazıldı' if gol.yaz(cikti) else 'aynı'))
    print(f"panel  {len(panel.yaz(cikti, _yaz_atomik))} dosya yazıldı")
    return 1 if hata else 0


def denetle(cikti: Path = CIKTI) -> int:
    ks, ss = kaynaklar(), seriler()
    sorun = []
    for s in ss:
        iz = izin(ks[s.kaynak], s)
        for alt, gerekli in (("site-veri/seri", iz.gosterim), ("api/v1/seri", iz.api)):
            yol = cikti / alt / f"{s.id}.json"
            if yol.exists() and not gerekli:
                sorun.append(f"{yol.relative_to(cikti)}: izin yokken yayımlanmış")
            if yol.exists():
                try:
                    SeriDosyasi.model_validate(json.loads(yol.read_text(encoding="utf-8")))
                except Exception as e:  # noqa: BLE001
                    sorun.append(f"{yol.relative_to(cikti)}: şemaya uymuyor: {e}")
        for alt, gerekli in (("site-veri/emsal", iz.gosterim and bool(s.emsal)),
                             ("api/v1/emsal", iz.api and bool(s.emsal))):
            yol = cikti / alt / f"{s.id}.json"
            if yol.exists() and not gerekli:
                sorun.append(f"{yol.relative_to(cikti)}: izin ya da emsal kaydı yokken yayımlanmış")
        csvyol = cikti / "api" / "v1" / "seri" / f"{s.id}.csv"
        if csvyol.exists() and not iz.indirme:
            sorun.append(f"{csvyol.relative_to(cikti)}: indirme izni yokken yayımlanmış")
    bilinen = {s.id for s in ss}
    for yol in [*(cikti / "api" / "v1" / "seri").glob("*"), *(cikti / "api" / "v1" / "emsal").glob("*")]:
        if yol.stem not in bilinen:
            sorun.append(f"{yol.relative_to(cikti)}: kayıtta olmayan seri")
    indirilebilir = {s.id for s in ss if izin(ks[s.kaynak], s).indirme}
    for yol in (cikti / "api" / "v1" / "panel").glob("*.json"):
        for t in json.loads(yol.read_text(encoding="utf-8"))["seriler"]:
            if t["id"] not in indirilebilir:
                sorun.append(f"{yol.relative_to(cikti)}: indirme izni olmayan seri panelde: {t['id']}")
    for x in sorun:
        print("  SORUN  " + x)
    print(f"{len(ks)} kaynak, {len(ss)} seri; {len(sorun)} sorun.")
    return 1 if sorun else 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="veri")
    alt = p.add_subparsers(dest="komut", required=True)
    g = alt.add_parser("guncelle")
    g.add_argument("--seri", action="append")
    alt.add_parser("katalog")
    alt.add_parser("panel")
    alt.add_parser("denetle")
    a = p.parse_args(argv)
    if a.komut == "guncelle":
        return guncelle(a.seri)
    if a.komut == "katalog":
        katalog(kaynaklar(), seriler(), CIKTI, datetime.now(UTC))
        return 0
    if a.komut == "panel":
        print(f"panel  {len(panel.yaz(CIKTI, _yaz_atomik))} dosya yazıldı")
        return 0
    return denetle()


if __name__ == "__main__":
    sys.exit(main())
