"""durum.json: üç zamanın ayrılığı, ardışık hata, gecikme — ağsız."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime

from veri.durum import donem_sonu, saglik, yaz
from veri.modeller import Izin, Kaynak, SeriTanimi
from veri.yayin import _yaz_atomik


def _kaynak():
    return Kaynak(id="k", ad="K", kurum="K", adres="https://x", erisim="api", durum="aktif",
                  lisans={"ad": "CC BY 4.0", "kanit": "https://x/lisans", "inceleme_tarihi": "2026-11-01"},
                  yayin=Izin(gosterim=True, indirme=True, api=True))


def _seri(id_, siklik="aylik", **k):
    return SeriTanimi(id=id_, kaynak="k", kod="X", ulke="TUR", baslik="T", tema="t", siklik=siklik, birim="yuzde", **k)


def _yayinla(tmp, id_, donemler):
    yol = tmp / "site-veri" / "seri" / f"{id_}.json"
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(json.dumps({"cekildi": "2026-10-01T05:00:00Z",
                               "gozlemler": [{"donem": d, "deger": "1"} for d in donemler]}), encoding="utf-8")


def _izin(k, s):
    return k.yayin


def test_donem_sonu():
    assert donem_sonu("2026-02") == date(2026, 2, 28)
    assert donem_sonu("2026-Q1") == date(2026, 3, 31)
    assert donem_sonu("2025-S1") == date(2025, 6, 30)
    assert donem_sonu("2025") == date(2025, 12, 31)


def test_basarili_ve_basarisiz_kontrol_ayri_tutulur(tmp_path):
    ks, ss = {"k": _kaynak()}, [_seri("s-a"), _seri("s-b")]
    _yayinla(tmp_path, "s-a", ["2026-09"])
    t1 = datetime(2026, 11, 18, 5, 20, tzinfo=UTC)
    yaz(tmp_path, ss, ks, _izin, {"s-a": None, "s-b": "AgHatasi: 502"}, t1, _yaz_atomik)
    t2 = datetime(2026, 11, 19, 5, 20, tzinfo=UTC)
    d = yaz(tmp_path, ss, ks, _izin, {"s-a": "ReadTimeout", "s-b": "AgHatasi: 502"}, t2, _yaz_atomik)
    a, b = (next(r for r in d["seriler"] if r["id"] == i) for i in ("s-a", "s-b"))
    assert a["son_kontrol"] == "2026-11-19T05:20:00Z" and a["son_basarili_kontrol"] == "2026-11-18T05:20:00Z"
    assert a["ardisik_hata"] == 1 and a["son_gozlem"] == "2026-09" and a["son_veri_degisimi"] == "2026-10-01T05:00:00Z"
    assert b["ardisik_hata"] == 2 and b["son_basarili_kontrol"] is None and not b["yayinda"]
    assert d["kaynaklar"][0]["hatali"] == ["s-a", "s-b"]
    # Bu çalıştırmada denenmeyen seri dokunulmadan kalır (kısmi --seri çalıştırması).
    d = yaz(tmp_path, ss, ks, _izin, {"s-b": None}, t2, _yaz_atomik)
    assert next(r for r in d["seriler"] if r["id"] == "s-a")["ardisik_hata"] == 1


def test_gecikme_toleransi_ve_seri_bazinda_ezme(tmp_path):
    ks = {"k": _kaynak()}
    ss = [_seri("eski", "aylik"), _seri("gini", "yillik", gecikme_gun=1460)]
    _yayinla(tmp_path, "eski", ["2026-03"])     # 31 Mart + 120 gün = 29 Temmuz < 19 Kasım
    _yayinla(tmp_path, "gini", ["2023"])        # 31 Aralık 2023 + 1460 gün: henüz değil
    d = yaz(tmp_path, ss, ks, _izin, {}, datetime(2026, 11, 19, tzinfo=UTC), _yaz_atomik)
    r = {x["id"]: x for x in d["seriler"]}
    assert r["eski"]["gecikti"] and r["eski"]["gecikme_gun"] == 113
    assert not r["gini"]["gecikti"]
    kirmizi, uyari = saglik(d, datetime(2026, 11, 19, tzinfo=UTC))
    assert kirmizi == [] and any("eski" in u for u in uyari)


def test_saglik_kirmizi_kosullari():
    def r(**k):
        return {"id": "x", "ardisik_hata": 0, "son_hata": None, "son_basarili_kontrol": "2026-11-18T05:00:00Z",
                "gecikti": False, "son_gozlem": "2026-09", "gecikme_gun": 0} | k
    simdi = datetime(2026, 11, 19, tzinfo=UTC)
    assert saglik({"seriler": [r(ardisik_hata=3, son_hata={"ileti": "502"})]}, simdi)[0]
    assert saglik({"seriler": [r(son_basarili_kontrol="2026-11-01T05:00:00Z")]}, simdi)[0]
    assert saglik({"seriler": [r()]}, simdi) == ([], [])
