"""Komut satırı.

  veri guncelle [--seri ID ...]   kaynaklardan çek, doğrula, izinle yayımla, katalog yaz
  veri katalog                    yalnız kataloğu yeniden yaz
  veri denetle                    kayıt ve yayımlanmış dosyaları ağsız doğrula (CI)
  veri panel                      panel veri setini yeniden yaz
  veri saglik                     durum.json'a göre kırmızı/uyarı; kırmızıda çıkış 1
  veri canli [--taban URL]        canlı API dosyaları depodakiyle aynı mı (yayın sonrası)

Bir seri düşerse diğerleri sürer; çıkış kodu 1 olur ve düşen seri yazılmaz.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from functools import partial
from pathlib import Path

from . import canli, durum, gol, manifest, panel
from .ag import AgHatasi, getir, istemci_ac
from .baglayicilar import baglayici
from .kayit import KOK, kaynaklar, seriler
from .modeller import SeriDosyasi
from .yayin import _yaz_atomik, emsal_yaz, farklar, gunluge_ekle, izin, katalog, kaynak_ozeti, onceki, yayinla

CIKTI = KOK / "yayin"


def guncelle(secili: list[str] | None, cikti: Path = CIKTI) -> int:
    with istemci_ac() as istemci:
        return _guncelle(secili, cikti, partial(getir, istemci=istemci))


# İkinci tur: geçici sınıftaki hatalar (zaman aşımı, 5xx, 429, ağ) turun sonunda bir kez daha
# denenir. Dünya Bankası 23 Kasım 2026'da GitHub koşucusundan 11 seride ReadTimeout/502 verdi;
# aynı seriler dakikalar sonra yerelden yanıt verdi. Kalıcı hatalar (4xx, şema) yeniden denenmez.
GECICI = frozenset({"connect_timeout", "read_timeout", "total_timeout", "rate_limited", "upstream_5xx", "transport"})
IKINCI_TUR_BEKLEME = 90.0


def _guncelle(secili, cikti, getirici, uyu=None):
    import time
    uyu = uyu or time.sleep
    ks, ss = kaynaklar(), seriler()
    simdi = datetime.now(UTC)
    gun = simdi.date().isoformat()
    olaylar: list[dict] = []
    bag: dict = {}       # kaynak başına tek bağlayıcı (metaveri önbelleği çekim boyunca yaşar)
    sonuc: dict[str, str | None] = {}   # seri → None (başarılı) ya da hata iletisi; durum.json için
    denemeler: dict[str, datetime] = {}
    hedef = []
    for s in ss:
        if secili and s.id not in secili:
            continue
        k = ks[s.kaynak]
        if not izin(k, s).gosterim:
            print(f"atla   {s.id}: yayın izni yok ({k.durum})")
            continue
        hedef.append(s)
    for s in hedef:
        _seri_isle(s, ks[s.kaynak], cikti, getirici, bag, simdi, gun, olaylar, sonuc)
        denemeler[s.id] = datetime.now(UTC)
    tekrar = [s for s in hedef if sonuc.get(s.id) and durum.hata_sinifi(sonuc[s.id]) in GECICI]
    if tekrar:
        print(f"ikinci tur: {len(tekrar)} seri {IKINCI_TUR_BEKLEME:.0f} sn sonra yeniden denenecek")
        uyu(IKINCI_TUR_BEKLEME)
        for s in tekrar:
            _seri_isle(s, ks[s.kaynak], cikti, getirici, bag, simdi, gun, olaylar, sonuc)
            denemeler[s.id] = datetime.now(UTC)
    hata = sum(1 for s in hedef if sonuc.get(s.id))
    gunluge_ekle(olaylar, cikti)
    katalog(ks, ss, cikti, simdi)
    print('göl  ' + ('yazıldı' if gol.yaz(cikti) else 'aynı'))
    print(f"panel  {len(panel.yaz(cikti, _yaz_atomik))} dosya yazıldı")
    d = durum.yaz(cikti, ss, ks, izin, sonuc, datetime.now(UTC), _yaz_atomik, denemeler=denemeler)
    print(f"durum  {d['ozet']}")
    manifest.yaz(cikti)
    return 1 if hata else 0


def _seri_isle(s, k, cikti, getirici, bag, simdi, gun, olaylar, sonuc) -> None:
    """Bir seriyi çeker ve yayımlar; sonucu `sonuc`a yazar (None: başarılı)."""
    iz = izin(k, s)
    try:
        if s.kaynak not in bag:
            bag[s.kaynak] = baglayici(s.kaynak, getirici)
        b = bag[s.kaynak]
        ham = b.cek(s)
        d = SeriDosyasi(id=s.id, baslik=s.baslik, ulke=s.ulke, siklik=s.siklik, birim=s.birim, carpan=s.carpan,
                        tema=s.tema, kaynak=kaynak_ozeti(k), kaynak_kod=s.kod, kaynak_adi=ham.kaynak_adi,
                        kaynak_not=ham.kaynak_not, kaynak_guncelleme=ham.kaynak_guncelleme, cekildi=simdi,
                        izin=iz, gozlemler=ham.gozlemler)
        eski = onceki(cikti / "site-veri" / "seri" / f"{s.id}.json")
        yazilan = yayinla(d, cikti)
        if yazilan:
            olaylar += farklar(eski, d, gun)
        sonuc[s.id] = None
        son = next((g for g in reversed(d.gozlemler) if g.deger is not None), None)
        print(f"{'yazdı' if yazilan else 'aynı '}  {s.id}: {len(d.gozlemler)} gözlem, son {son.donem if son else '-'}")
    except Exception as e:  # noqa: BLE001 — bir seri düşerse diğerleri sürer
        sonuc[s.id] = str(e) if isinstance(e, AgHatasi) else type(e).__name__
        print(f"HATA   {s.id}: {sonuc[s.id]}", file=sys.stderr)
        return
    # Emsal ülkeler: biri düşerse önceki verisi kalır; Türkiye serisini düşürmez, hata sayılmaz.
    if s.emsal:
        alinan = {}
        if hasattr(b, "cek_coklu"):
            try:
                alinan = b.cek_coklu(s, s.emsal)
            except Exception as e:  # noqa: BLE001 — toplu istek düşerse ülke ülke denenir
                print(f"uyarı  {s.id} [emsal toplu]: {type(e).__name__}", file=sys.stderr)
        if not alinan:
            for u in s.emsal:
                try:
                    alinan[u] = b.cek(s.model_copy(update={"ulke": u})).gozlemler
                except Exception as e:  # noqa: BLE001
                    print(f"uyarı  {s.id} [{u}]: {type(e).__name__}", file=sys.stderr)
        yazildi = emsal_yaz(s, iz, alinan, cikti)
        print(f"emsal  {s.id}: {len(alinan)}/{len(s.emsal)} ülke" + (" yazıldı" if yazildi else " aynı"))


def saglik(cikti: Path = CIKTI) -> int:
    icerik = json.loads((cikti / "api" / "v1" / "durum.json").read_text(encoding="utf-8"))
    kirmizi, uyari = durum.saglik(icerik, datetime.now(UTC))
    for x in kirmizi:
        print("  KIRMIZI  " + x)
    for x in uyari:
        print("  uyarı    " + x)
    print(f"sağlık: {len(kirmizi)} kırmızı, {len(uyari)} uyarı (son kontrol {icerik['son_kontrol']})")
    return 1 if kirmizi else 0


def denetle(cikti: Path = CIKTI) -> int:
    ks, ss = kaynaklar(), seriler()
    sorun = []
    for s in ss:
        iz = izin(ks[s.kaynak], s)
        site = cikti / f"site-veri/seri/{s.id}.json"
        api = cikti / f"api/v1/seri/{s.id}.json"
        csvyol = cikti / f"api/v1/seri/{s.id}.csv"
        if site.exists() and iz.gosterim:
            if iz.api and (not api.exists() or site.read_bytes() != api.read_bytes()):
                sorun.append(f"{s.id}: web ve API JSON dosyaları uyuşmuyor")
            if iz.indirme and not csvyol.exists():
                sorun.append(f"{s.id}: CSV eksik")
        elif api.exists() or csvyol.exists():
            sorun.append(f"{s.id}: web seri dosyası olmadan API çıktısı var")
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
        if csvyol.exists() and not iz.indirme:
            sorun.append(f"{csvyol.relative_to(cikti)}: indirme izni yokken yayımlanmış")
    myol = cikti / "api/v1/manifest.json"
    sema = cikti / "api/v1/sema/seri.json"
    if not sema.exists() or sema.read_text(encoding="utf-8") != manifest.seri_semasi():
        sorun.append("tek seri JSON Schema: dosya eksik veya yayın modeliyle farklı")
    try:
        mevcut = json.loads(myol.read_bytes()) if myol.exists() else {}
        if any(mevcut.get(k) != v for k, v in manifest.envanter(cikti).items()):
            sorun.append("manifest: dosya envanteri ile yayın farklı")
    except (ValueError, KeyError, OSError) as e:
        sorun.append(f"manifest: yayın envanteri doğrulanamadı ({type(e).__name__})")
    bilinen = {s.id for s in ss}
    for yol in [*(cikti / "api" / "v1" / "seri").glob("*"), *(cikti / "api" / "v1" / "emsal").glob("*")]:
        if yol.stem not in bilinen:
            sorun.append(f"{yol.relative_to(cikti)}: kayıtta olmayan seri")
    dyol = cikti / "api" / "v1" / "durum.json"
    if dyol.exists():
        dj = json.loads(dyol.read_text(encoding="utf-8"))
        gosterilen = {s.id for s in ss if izin(ks[s.kaynak], s).gosterim}
        if {r["id"] for r in dj["seriler"]} - gosterilen:
            sorun.append("api/v1/durum.json: kayıtta ya da gösterim izninde olmayan seri")
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
    alt.add_parser("saglik")
    alt.add_parser("denetle")
    c = alt.add_parser("canli")
    c.add_argument("--taban", default="https://veri.korayoner.dev")
    a = p.parse_args(argv)
    if a.komut == "guncelle":
        return guncelle(a.seri)
    if a.komut == "katalog":
        katalog(kaynaklar(), seriler(), CIKTI, datetime.now(UTC))
        manifest.yaz(CIKTI)
        return 0
    if a.komut == "saglik":
        return saglik()
    if a.komut == "canli":
        sorun = canli.denetle(a.taban, CIKTI)
        for x in sorun:
            print("  " + x)
        print(f"canlı: {len(sorun)} sorun ({a.taban})")
        return 1 if sorun else 0
    if a.komut == "panel":
        print(f"panel  {len(panel.yaz(CIKTI, _yaz_atomik))} dosya yazıldı")
        manifest.yaz(CIKTI)
        return 0
    return denetle()


if __name__ == "__main__":
    sys.exit(main())
