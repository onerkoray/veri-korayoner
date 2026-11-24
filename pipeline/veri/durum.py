"""Sağlık ve güncellik: /api/v1/durum.json.

Üç zaman birbirinden ayrı tutulur:
- `son_kontrol`: hattın seriyi en son denediği an (başarılı ya da değil).
- `son_basarili_kontrol`: kaynağın en son doğrulanmış yanıt verdiği an.
- `son_gozlem`: yayımlanmış serideki en yeni dönem (kaynağın veri tarihi).
Seri dosyasındaki `cekildi` ise yalnız rakam değiştiğinde ilerler (sahte vintage
yok); bu yüzden "ne zaman kontrol edildi" sorusunun cevabı burada durur.

Gecikme: son gözlem döneminin bitişine sıklığa göre bir tolerans eklenir; bugün
o tarihi geçtiyse seri "gecikti" sayılır. Kayıtta `gecikme_gun` ile seri
bazında değiştirilebilir (ör. her yıl yayımlanmayan Gini).

Dosya her çalıştırmada yeniden yazılır; veri vintage'ı değildir, işletim
bilgisidir. Rakam geçmişi seri dosyalarında ve git'te durur.
"""

from __future__ import annotations

import json
import re
from calendar import monthrange
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

TOLERANS = {"aylik": 120, "ceyreklik": 270, "yariyillik": 400, "yillik": 730, "gunluk": 10, "haftalik": 30}
ARDISIK_ESIK = 3          # bu kadar ardışık başarısız çekim: sağlık kırmızı
KONTROL_ESIK = 7          # son başarılı kontrol bu kadar günden eskiyse: sağlık kırmızı


def donem_sonu(d: str) -> date:
    y = int(d[:4])
    if len(d) == 4:
        return date(y, 12, 31)
    if "-Q" in d:
        ay = int(d[-1]) * 3
        return date(y, ay, monthrange(y, ay)[1])
    if "-S" in d:
        return date(y, 6, 30) if d.endswith("1") else date(y, 12, 31)
    if "-W" in d:
        return date.fromisocalendar(y, int(d[6:]), 7)
    if len(d) == 7:
        ay = int(d[5:7])
        return date(y, ay, monthrange(y, ay)[1])
    return date.fromisoformat(d)


# Hata iletisinden sınıf (ag.AgHatasi iletileri ve bağlayıcı istisna adları).
# Sıra önemli: "5 denemede alınamadı (HTTP 503)" önce 5xx'e düşmeli, 4xx'e değil.
HATA_SINIFLARI = (
    (r"ConnectTimeout|ConnectError", "connect_timeout"),
    (r"ReadTimeout|WriteTimeout|PoolTimeout", "read_timeout"),
    (r"ToplamSüreAşıldı", "total_timeout"),
    (r"HTTP 429", "rate_limited"),
    (r"HTTP 5\d\d", "upstream_5xx"),
    (r"HTTP 4\d\d", "http_4xx"),
    (r"baytı aştı", "too_large"),
    (r"izinsiz adres", "forbidden_host"),
    (r"boş yanıt|boş seri", "empty"),
    (r"KaynakUyusmazligi|JSONDecodeError|ValueError|KeyError|ValidationError|ParserError", "schema"),
    (r"TransportError|RemoteProtocolError|NetworkError|ProxyError", "transport"),
)


def hata_sinifi(ileti: str | None) -> str | None:
    if not ileti:
        return None
    return next((sinif for desen, sinif in HATA_SINIFLARI if re.search(desen, ileti)), "other")


def _z(t: datetime) -> str:
    return t.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def yaz(cikti: Path, seriler, kaynaklar, izin, sonuc: dict[str, str | None], simdi: datetime, yaz_atomik) -> dict:
    """`sonuc`: bu çalıştırmada denenen seri → None (başarılı) ya da hata iletisi."""
    yol = cikti / "api" / "v1" / "durum.json"
    try:
        eski = {s["id"]: s for s in json.loads(yol.read_text(encoding="utf-8"))["seriler"]}
    except FileNotFoundError:
        eski = {}
    bugun = simdi.date()
    kayit = []
    for s in seriler:
        if not izin(kaynaklar[s.kaynak], s).gosterim:
            continue
        o = eski.get(s.id, {})
        r = {"id": s.id, "kaynak": s.kaynak, "siklik": s.siklik,
             "son_kontrol": o.get("son_kontrol"), "son_basarili_kontrol": o.get("son_basarili_kontrol"),
             "ardisik_hata": o.get("ardisik_hata", 0), "son_hata": o.get("son_hata")}
        if s.id in sonuc:
            r["son_kontrol"] = _z(simdi)
            if sonuc[s.id] is None:
                r["son_basarili_kontrol"], r["ardisik_hata"], r["son_hata"] = _z(simdi), 0, None
            else:
                r["ardisik_hata"] += 1
                ileti = str(sonuc[s.id])[:300]
                r["son_hata"] = {"zaman": _z(simdi), "ileti": ileti, "sinif": hata_sinifi(ileti)}
        dosya = cikti / "site-veri" / "seri" / f"{s.id}.json"
        r["yayinda"] = dosya.exists()
        r["son_gozlem"] = r["son_veri_degisimi"] = None
        r["gecikme_gun"], r["gecikti"] = None, False
        r["source_published_at"] = None
        if dosya.exists():
            d = json.loads(dosya.read_text(encoding="utf-8"))
            r["source_published_at"] = d.get("kaynak_guncelleme")
            son = next((g["donem"] for g in reversed(d["gozlemler"]) if g["deger"] is not None), None)
            r["son_gozlem"], r["son_veri_degisimi"] = son, d["cekildi"]
            if son:
                sinir = donem_sonu(son) + timedelta(days=s.gecikme_gun or TOLERANS[s.siklik])
                r["gecikme_gun"] = max(0, (bugun - sinir).days)
                r["gecikti"] = bugun > sinir
        r.update(last_reference_period=r["son_gozlem"], last_successful_fetch=r["son_basarili_kontrol"],
                 site_published_at=None, expected_release_at=None, schedule="unknown_schedule",
                 freshness_method="estimated", lag_days=r["gecikme_gun"],
                 data_freshness=("unknown" if not r["son_gozlem"] else "delayed" if r["gecikti"] else "within_tolerance"),
                 # Hiç denenmediyse bilinmiyor; son deneme başarısızsa False (eski veri yerinde kalır).
                 source_reachable=(None if not r["son_kontrol"] else not r["ardisik_hata"]),
                 error_class=(((r["son_hata"] or {}).get("sinif") or hata_sinifi((r["son_hata"] or {}).get("ileti")))
                              if r["ardisik_hata"] else None))
        kayit.append(r)
    kaynak_ozet = []
    for kid in sorted({r["kaynak"] for r in kayit}):
        rs = [r for r in kayit if r["kaynak"] == kid]
        basarili = [r["son_basarili_kontrol"] for r in rs if r["son_basarili_kontrol"]]
        kaynak_ozet.append({"id": kid, "seri": len(rs), "son_basarili_kontrol": max(basarili) if basarili else None,
                            "hatali": [r["id"] for r in rs if r["ardisik_hata"]],
                            "geciken": [r["id"] for r in rs if r["gecikti"]]})
    # Üst düzey son kontrol: bu çalıştırmada en az bir seri denendiyse şimdi; denenmediyse
    # (yalnız katalog/tolerans güncellemesi) önceki an korunur, olmayan kontrol yazılmaz.
    ust_kontrol = _z(simdi) if sonuc else max((r["son_kontrol"] for r in kayit if r.get("son_kontrol")), default=_z(simdi))
    icerik = {"surum": 1, "son_kontrol": ust_kontrol,
              "aciklama": "son_kontrol: hattın denediği an; son_basarili_kontrol: kaynağın doğrulanmış yanıt verdiği an; "
                          "son_gozlem: yayımlanmış en yeni dönem; gecikti: son gözlem, sıklığa göre beklenen süreyi aştı.",
              "ozet": {"seri": len(kayit), "yayinda": sum(r["yayinda"] for r in kayit),
                       "hatali": sum(1 for r in kayit if r["ardisik_hata"]), "geciken": sum(1 for r in kayit if r["gecikti"])},
              "kaynaklar": kaynak_ozet, "seriler": kayit}
    yaz_atomik(yol, json.dumps(icerik, ensure_ascii=False, indent=1) + "\n")
    return icerik


def saglik(icerik: dict, simdi: datetime) -> tuple[list[str], list[str]]:
    """(kırmızı, uyarı) iletileri. Kırmızı: ardışık başarısızlık ya da uzun süre başarılı kontrol yok."""
    kirmizi, uyari = [], []
    for r in icerik["seriler"]:
        sh = r["son_hata"] or {}
        sinif = sh.get("sinif") or hata_sinifi(sh.get("ileti"))
        if r["ardisik_hata"] >= ARDISIK_ESIK:
            kirmizi.append(f"{r['id']}: {r['ardisik_hata']} çekimdir alınamıyor [{sinif}] ({sh.get('ileti', '')[:120]})")
        elif r["ardisik_hata"]:
            uyari.append(f"{r['id']}: son çekim başarısız ({r['ardisik_hata']} kez, {sinif})")
        sb = r["son_basarili_kontrol"]
        if sb and (simdi - datetime.fromisoformat(sb.replace("Z", "+00:00"))).days > KONTROL_ESIK:
            kirmizi.append(f"{r['id']}: {KONTROL_ESIK} günden uzun süredir başarılı kontrol yok (son {sb})")
        if r["gecikti"]:
            uyari.append(f"{r['id']}: son gözlem {r['son_gozlem']}, beklenenden {r['gecikme_gun']} gün geç")
    return kirmizi, uyari
