"""Yayın: lisans kapısı, atomik yazım, katalog.

- İzin: kaynak izni ∩ seri izni. `gosterim` kapalıysa seri hiç yazılmaz.
  `api` kapalıysa seri dosyası /api altına konmaz, yalnız site derlemesine
  (`site-veri/`) gider. `indirme` kapalıysa CSV yazılmaz.
- Atomik: önce geçici dosyaya, sonra `os.replace`. Doğrulamadan geçemeyen
  seri yazılmaz; eski dosya yerinde kalır.
- Kaybolan gözlem: kaynak, önceden yayımlanmış bir dönemi artık vermiyorsa
  yazım durur (sessizce silmeyiz; revizyon değil veri kaybı olabilir).
"""

from __future__ import annotations

import csv
import io
import json
import os
import tempfile
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from .modeller import Izin, Kaynak, SeriDosyasi, SeriTanimi


class YayinHatasi(RuntimeError):
    pass


def izin(kaynak: Kaynak, seri: SeriTanimi) -> Izin:
    return kaynak.yayin.daralt(seri.yayin)


def _yaz_atomik(yol: Path, icerik: str) -> None:
    yol.parent.mkdir(parents=True, exist_ok=True)
    fd, gecici = tempfile.mkstemp(dir=yol.parent, prefix=".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(icerik)
        os.replace(gecici, yol)
    except BaseException:
        Path(gecici).unlink(missing_ok=True)
        raise


def _json_varsayilan(o):
    if isinstance(o, Decimal):
        return format(o, "f")   # kayıpsız metin; JSON sayısı yerine dize (hassasiyet)
    if isinstance(o, datetime):
        return o.isoformat().replace("+00:00", "Z")
    return o.isoformat()


def json_metni(d: SeriDosyasi) -> str:
    return json.dumps(d.model_dump(mode="python", by_alias=True), ensure_ascii=False, indent=1,
                      default=_json_varsayilan, sort_keys=False) + "\n"


def csv_metni(d: SeriDosyasi) -> str:
    b = io.StringIO()
    w = csv.writer(b, lineterminator="\n")
    w.writerow(["donem", "deger", "birim", "seri", "kaynak", "kaynak_kod", "cekildi"])
    for g in d.gozlemler:
        w.writerow([g.donem, "" if g.deger is None else format(g.deger, "f"), d.birim, d.id,
                    d.kaynak["kurum"], d.kaynak_kod, _json_varsayilan(d.cekildi)])
    return b.getvalue()


def onceki(yol: Path) -> dict | None:
    try:
        return json.loads(yol.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


def yayinla(d: SeriDosyasi, cikti: Path) -> list[Path]:
    """Seriyi izinlere göre yazar; değişmediyse dokunmaz (cekildi hariç). Yazılan yolları döndürür."""
    if not d.izin.gosterim:
        return []
    hedefler = [cikti / "site-veri" / "seri" / f"{d.id}.json"]
    if d.izin.api:
        hedefler.append(cikti / "api" / "v1" / "seri" / f"{d.id}.json")
    eski = onceki(hedefler[0])
    if eski:
        yeni_d = {g.donem for g in d.gozlemler}
        kayip = [g["donem"] for g in eski.get("gozlemler", []) if g["donem"] not in yeni_d]
        if kayip:
            raise YayinHatasi(f"{d.id}: kaynak önceden yayımlanmış dönemleri vermiyor: {kayip[:5]}")
        # Değer ve metaveri aynıysa dosyaya dokunma: commit gürültüsü ve sahte vintage olmasın.
        kiyas = json.loads(json_metni(d))
        kiyas.pop("cekildi")
        eski_k = dict(eski)
        eski_k.pop("cekildi", None)
        if kiyas == eski_k:
            return []
    metin = json_metni(d)
    yazilan = []
    for h in hedefler:
        _yaz_atomik(h, metin)
        yazilan.append(h)
    if d.izin.indirme:
        h = cikti / "api" / "v1" / "seri" / f"{d.id}.csv"
        _yaz_atomik(h, csv_metni(d))
        yazilan.append(h)
    return yazilan


def kaynak_ozeti(k: Kaynak) -> dict:
    return {"id": k.id, "ad": k.ad, "kurum": k.kurum, "adres": k.adres, "belge": k.belge,
            "lisans": k.lisans.ad, "lisans_kanit": k.lisans.kanit,
            "lisans_inceleme": k.lisans.inceleme_tarihi.isoformat() if k.lisans.inceleme_tarihi else None,
            "atif_zorunlu": k.lisans.atif_zorunlu, "kosullar": list(k.lisans.kosullar)}


def katalog(kaynaklar: dict[str, Kaynak], seriler: list[SeriTanimi], cikti: Path, simdi: datetime) -> None:
    """api/v1/kaynaklar.json ve api/v1/seriler.json: yalnız yayımlanmış seriler listelenir."""
    k_liste = []
    for k in kaynaklar.values():
        k_liste.append(kaynak_ozeti(k) | {"durum": k.durum, "erisim": k.erisim,
                                          "yayin": k.yayin.model_dump()})
    s_liste = []
    for s in seriler:
        iz = izin(kaynaklar[s.kaynak], s)
        yol = cikti / "site-veri" / "seri" / f"{s.id}.json"
        if not iz.gosterim or not yol.exists():
            continue
        d = json.loads(yol.read_text(encoding="utf-8"))
        son = next((g for g in reversed(d["gozlemler"]) if g["deger"] is not None), None)
        s_liste.append({"id": s.id, "baslik": s.baslik, "tema": s.tema, "siklik": s.siklik, "birim": s.birim,
                        "kaynak": s.kaynak, "son": son, "kaynak_guncelleme": d.get("kaynak_guncelleme"),
                        "cekildi": d["cekildi"], "izin": iz.model_dump(),
                        "api": f"/api/v1/seri/{s.id}.json" if iz.api else None,
                        "csv": f"/api/v1/seri/{s.id}.csv" if iz.indirme else None})
    ust = {"surum": 1, "uretildi": simdi.astimezone(UTC).isoformat().replace("+00:00", "Z")}
    _yaz_atomik(cikti / "api" / "v1" / "kaynaklar.json",
                json.dumps(ust | {"kaynaklar": k_liste}, ensure_ascii=False, indent=1) + "\n")
    _yaz_atomik(cikti / "api" / "v1" / "seriler.json",
                json.dumps(ust | {"seriler": [s for s in s_liste if s["izin"]["api"]]}, ensure_ascii=False, indent=1) + "\n")
    _yaz_atomik(cikti / "site-veri" / "seriler.json",
                json.dumps(ust | {"seriler": s_liste}, ensure_ascii=False, indent=1) + "\n")
    # Değişiklik günlüğünün API kopyası: yalnız API izni olan serilerin kayıtları.
    gunluk = onceki(cikti / "site-veri" / "degisiklikler.json")
    if gunluk is None:     # günlük boş da olsa var: API adresi 404 vermesin
        gunluk = {"surum": 1, "kayitlar": []}
        _yaz_atomik(cikti / "site-veri" / "degisiklikler.json", json.dumps(gunluk, ensure_ascii=False, indent=1) + "\n")
    if gunluk is not None:
        api_ser = {s["id"] for s in s_liste if s["izin"]["api"]}
        _yaz_atomik(cikti / "api" / "v1" / "degisiklikler.json",
                    json.dumps({"surum": 1, "kayitlar": [k for k in gunluk["kayitlar"] if k["seri"] in api_ser]},
                               ensure_ascii=False, indent=1) + "\n")


# ---- değişiklik günlüğü: yeni dönem ve revizyon ------------------------------------
GUNLUK_SINIRI = 400      # günlükte tutulan en fazla kayıt (yeniden eskiye)
TOPLU = 12               # bir çekimde bundan fazla değişiklik tek kayda toplanır


def _d(v) -> Decimal | None:
    return None if v is None else Decimal(str(v))


def _metin(v) -> str | None:
    return None if v is None else format(v, "f")


def farklar(eski: dict | None, d: SeriDosyasi, gun: str) -> list[dict]:
    """Önceki yayımla yeni seri arasındaki olaylar. İlk yayında olay yok (geçmiş olay sayılmaz)."""
    if not eski:
        return []
    once = {g["donem"]: _d(g["deger"]) for g in eski.get("gozlemler", [])}
    yeni, rev = [], []
    for g in d.gozlemler:
        if g.donem not in once:
            if g.deger is not None:
                yeni.append(g)
        elif once[g.donem] != g.deger:
            rev.append((g, once[g.donem]))
    taban = {"gun": gun, "seri": d.id}
    olay: list[dict] = []
    if len(yeni) > TOPLU:
        olay.append(taban | {"tur": "yeni-donem", "adet": len(yeni), "ilk": yeni[0].donem, "son": yeni[-1].donem,
                             "yeni": _metin(yeni[-1].deger)})
    else:
        olay += [taban | {"tur": "yeni-donem", "donem": g.donem, "yeni": _metin(g.deger)} for g in yeni]
    if len(rev) > TOPLU:
        olay.append(taban | {"tur": "revizyon", "adet": len(rev), "ilk": rev[0][0].donem, "son": rev[-1][0].donem})
    else:
        olay += [taban | {"tur": "revizyon", "donem": g.donem, "onceki": _metin(o), "yeni": _metin(g.deger)}
                 for g, o in rev]
    return olay


def gunluge_ekle(olaylar: list[dict], cikti: Path) -> None:
    if not olaylar:
        return
    yol = cikti / "site-veri" / "degisiklikler.json"
    eski = onceki(yol) or {"surum": 1, "kayitlar": []}
    kayit = (list(reversed(olaylar)) + eski["kayitlar"])[:GUNLUK_SINIRI]
    _yaz_atomik(yol, json.dumps({"surum": 1, "kayitlar": kayit}, ensure_ascii=False, indent=1) + "\n")


# ---- emsal ülkeler -----------------------------------------------------------------
def emsal_yaz(seri: SeriTanimi, iz: Izin, ulkeler: dict[str, list], cikti: Path) -> bool:
    """Emsal ülke gözlemlerini yazar. Bu çekimde düşen ülkenin önceki verisi korunur.

    `ulkeler`: alfa-3 → Gozlem listesi. Değişiklik yoksa dosyaya dokunmaz.
    """
    if not iz.gosterim or not seri.emsal:
        return False
    hedefler = [cikti / "site-veri" / "emsal" / f"{seri.id}.json"]
    if iz.api:
        hedefler.append(cikti / "api" / "v1" / "emsal" / f"{seri.id}.json")
    eski_dosya = onceki(hedefler[0])
    eski = (eski_dosya or {}).get("ulkeler", {})
    birlesik = {u: eski[u] for u in seri.emsal if u in eski}
    for u, gl in ulkeler.items():
        birlesik[u] = [{"donem": g.donem, "deger": _metin(g.deger)} for g in gl]
    if not birlesik:          # hiçbir ülke yok: boş dosya yayımlanmaz
        return False
    icerik = {"surum": 1, "id": seri.id, "baslik": seri.baslik, "birim": seri.birim, "siklik": seri.siklik,
              "kaynak": seri.kaynak, "kaynak_kod": seri.kod,
              "ulkeler": {u: birlesik[u] for u in seri.emsal if u in birlesik}}
    if eski_dosya == icerik and all(h.exists() for h in hedefler):
        return False
    metin = json.dumps(icerik, ensure_ascii=False, indent=1) + "\n"
    for h in hedefler:
        _yaz_atomik(h, metin)
    return True
