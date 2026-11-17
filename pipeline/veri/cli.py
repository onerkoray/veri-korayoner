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

from . import gol
from .baglayicilar import baglayici
from .kayit import KOK, kaynaklar, seriler
from .modeller import SeriDosyasi
from .yayin import izin, katalog, kaynak_ozeti, yayinla

CIKTI = KOK / "yayin"


def guncelle(secili: list[str] | None, cikti: Path = CIKTI) -> int:
    ks, ss = kaynaklar(), seriler()
    simdi = datetime.now(UTC)
    hata = 0
    for s in ss:
        if secili and s.id not in secili:
            continue
        k = ks[s.kaynak]
        iz = izin(k, s)
        if not iz.gosterim:
            print(f"atla   {s.id}: yayın izni yok ({k.durum})")
            continue
        try:
            ham = baglayici(s.kaynak).cek(s)
            d = SeriDosyasi(id=s.id, baslik=s.baslik, ulke=s.ulke, siklik=s.siklik, birim=s.birim, carpan=s.carpan,
                            tema=s.tema, kaynak=kaynak_ozeti(k), kaynak_kod=s.kod, kaynak_adi=ham.kaynak_adi,
                            kaynak_not=ham.kaynak_not, kaynak_guncelleme=ham.kaynak_guncelleme, cekildi=simdi,
                            izin=iz, gozlemler=ham.gozlemler)
            yazilan = yayinla(d, cikti)
            son = next((g for g in reversed(d.gozlemler) if g.deger is not None), None)
            print(f"{'yazdı' if yazilan else 'aynı '}  {s.id}: {len(d.gozlemler)} gözlem, son {son.donem if son else '-'}")
        except Exception as e:  # noqa: BLE001 — bir seri düşerse diğerleri sürer
            hata += 1
            print(f"HATA   {s.id}: {type(e).__name__}: {e}", file=sys.stderr)
    katalog(ks, ss, cikti, simdi)
    print('göl  ' + ('yazıldı' if gol.yaz(cikti) else 'aynı'))
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
        csvyol = cikti / "api" / "v1" / "seri" / f"{s.id}.csv"
        if csvyol.exists() and not iz.indirme:
            sorun.append(f"{csvyol.relative_to(cikti)}: indirme izni yokken yayımlanmış")
    bilinen = {s.id for s in ss}
    for yol in (cikti / "api" / "v1" / "seri").glob("*") if (cikti / "api" / "v1" / "seri").exists() else []:
        if yol.stem not in bilinen:
            sorun.append(f"{yol.relative_to(cikti)}: kayıtta olmayan seri")
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
    alt.add_parser("denetle")
    a = p.parse_args(argv)
    if a.komut == "guncelle":
        return guncelle(a.seri)
    if a.komut == "katalog":
        katalog(kaynaklar(), seriler(), CIKTI, datetime.now(UTC))
        return 0
    return denetle()


if __name__ == "__main__":
    sys.exit(main())
