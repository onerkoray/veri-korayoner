"""Panel: bütün seriler yıl / çeyrek / ay düzeyinde tek veri seti.

Kurallar:
- Bir seri yalnız kendi sıklığına ya da daha seyrek bir sıklığa çevrilir; yıllık
  seriden aylık değer üretilmez.
- Seyrekleştirme iki değer verir: dönem ortalaması (`ort`) ve dönemin son
  gözlemi (`son`). Kaynağın kendi sıklığında ikisi de kaynaktaki değerdir.
- Ortalama Decimal ile 12 anlamlı basamakla hesaplanır (ROUND_HALF_EVEN; eski TL'li
  1950'ler kuru gibi çok küçük değerler de korunur); kaynaktaki değer hiç yuvarlanmaz.
- `n`: döneme düşen gözlem sayısı. `tam`: dönem eksiksiz mi (ayda 1, çeyrekte 3
  ay, yılda 12 ay ya da 4 çeyrek). Eksik dönem JSON'da işaretli durur; geniş
  CSV'ye yalnız tam dönemler girer.
- Panel, kaynak seriden türetilmiş bir hesaptır; değerin kendisi kurumun
  değil, ortalaması bu sitenindir. Dosyalar bunu `yontem` alanında söyler.
- Yalnız indirme izni olan seriler panele girer (panel bir indirme biçimidir).
"""

from __future__ import annotations

import csv
import io
import json
from collections import defaultdict
from decimal import ROUND_HALF_EVEN, Decimal, localcontext
from pathlib import Path

SIRA = ["gunluk", "haftalik", "aylik", "ceyreklik", "yariyillik", "yillik"]
HEDEF = ["aylik", "ceyreklik", "yillik"]
BEKLENEN = {("aylik", "aylik"): 1, ("aylik", "ceyreklik"): 3, ("aylik", "yillik"): 12,
            ("ceyreklik", "ceyreklik"): 1, ("ceyreklik", "yillik"): 4, ("yariyillik", "yillik"): 2, ("yillik", "yillik"): 1}
BASAMAK = 12
YONTEM = ("Kaynağın kendi sıklığında değerler kaynaktaki gibidir. Daha seyrek sıklıkta 'ort' dönem "
          "ortalaması (12 anlamlı basamak, bu sitenin hesabı), 'son' dönemin son gözlemidir. 'tam': dönemin "
          "bütün alt dönemleri var mı.")


def donem(d: str, kaynak: str, hedef: str) -> str:
    """Kaynak dönem anahtarını hedef sıklığın anahtarına çevirir."""
    y = d[:4]
    if hedef == "yillik":
        return y
    if kaynak == "ceyreklik":          # yalnız ceyreklik → ceyreklik buraya düşer
        return d
    ay = int(d[5:7])
    return f"{y}-Q{(ay - 1) // 3 + 1}" if hedef == "ceyreklik" else f"{y}-{ay:02d}"


def _kisa(v: Decimal) -> str:
    s = format(v.normalize(), "f")
    return s.rstrip("0").rstrip(".") if "." in s else s


def topla(gozlemler: list[dict], kaynak: str, hedef: str) -> list[list]:
    """[[donem, ort, son, n, tam], ...] — değerler metin (kayıpsız)."""
    if SIRA.index(hedef) < SIRA.index(kaynak):
        return []
    gruplar: dict[str, list[tuple[str, Decimal]]] = defaultdict(list)
    for g in gozlemler:
        if g["deger"] is None:
            continue
        gruplar[donem(g["donem"], kaynak, hedef)].append((g["donem"], Decimal(g["deger"])))
    son_donem = max(gruplar) if gruplar else None
    satir = []
    for p in sorted(gruplar):
        d = sorted(gruplar[p])
        if kaynak == hedef:
            ham = next(g["deger"] for g in gozlemler if g["donem"] == d[0][0])
            satir.append([p, ham, ham, 1, True])
            continue
        with localcontext() as c:
            c.prec, c.rounding = BASAMAK, ROUND_HALF_EVEN
            ort = sum(v for _, v in d) / len(d)
        son = next(g["deger"] for g in gozlemler if g["donem"] == d[-1][0])
        beklenen = BEKLENEN.get((kaynak, hedef))
        tam = len(d) == beklenen if beklenen else p != son_donem   # günlük: yalnız son dönem eksik sayılır
        satir.append([p, _kisa(ort), son, len(d), tam])
    return satir


def yaz(cikti: Path, yaz_atomik) -> list[Path]:
    """api/v1/panel/{aylik,ceyreklik,yillik}.json ve .csv. Yalnız indirme izinli seriler."""
    katalog = json.loads((cikti / "site-veri" / "seriler.json").read_text(encoding="utf-8"))
    secili = [s for s in katalog["seriler"] if s["izin"]["indirme"]]
    yazilan = []
    for hedef in HEDEF:
        tanim, veri = [], {}
        for s in secili:
            d = json.loads((cikti / "site-veri" / "seri" / f"{s['id']}.json").read_text(encoding="utf-8"))
            satir = topla(d["gozlemler"], d["siklik"], hedef)
            if not satir:
                continue
            tanim.append({"id": s["id"], "baslik": d["baslik"], "birim": d["birim"], "tema": d["tema"],
                          "kaynak": d["kaynak"]["kurum"], "kaynak_kod": d["kaynak_kod"], "kaynak_siklik": d["siklik"],
                          "lisans": d["kaynak"].get("lisans"), "turetilmis": d["siklik"] != hedef})
            veri[s["id"]] = satir
        icerik = {"surum": 1, "siklik": hedef, "yontem": YONTEM,
                  "sutunlar": ["donem", "ort", "son", "n", "tam"], "seriler": tanim, "veri": veri}
        yol = cikti / "api" / "v1" / "panel" / f"{hedef}.json"
        metin = json.dumps(icerik, ensure_ascii=False, separators=(",", ":")) + "\n"
        if not yol.exists() or yol.read_text(encoding="utf-8") != metin:
            yaz_atomik(yol, metin)
            yazilan.append(yol)
        # Geniş CSV: satır = dönem, sütun = seri (dönem ortalaması), yalnız tam dönemler.
        donemler = sorted({r[0] for v in veri.values() for r in v})
        harita = {i: {r[0]: r[1] for r in v if r[4]} for i, v in veri.items()}
        b = io.StringIO()
        w = csv.writer(b, lineterminator="\n")
        w.writerow(["donem", *[t["id"] for t in tanim]])
        for p in donemler:
            hucre = [harita[t["id"]].get(p, "") for t in tanim]
            if any(hucre):
                w.writerow([p, *hucre])
        yol = cikti / "api" / "v1" / "panel" / f"{hedef}.csv"
        if not yol.exists() or yol.read_text(encoding="utf-8") != b.getvalue():
            yaz_atomik(yol, b.getvalue())
            yazilan.append(yol)
    return yazilan
