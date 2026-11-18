"""Panel: seyrekleştirme kuralları — ağsız, elle kurulmuş küçük seriler."""

from __future__ import annotations

import json

from veri.panel import donem, topla, yaz
from veri.yayin import _yaz_atomik


def _g(pairs):
    return [{"donem": d, "deger": v} for d, v in pairs]


def test_donem_eslemesi():
    assert donem("2024-05", "aylik", "ceyreklik") == "2024-Q2"
    assert donem("2024-12", "aylik", "yillik") == "2024"
    assert donem("2024-Q3", "ceyreklik", "yillik") == "2024"
    assert donem("2024-03-14", "gunluk", "aylik") == "2024-03"


def test_kendi_sikliginda_kaynak_degeri_aynen():
    s = topla(_g([("2024-01", "64.7700"), ("2024-02", None)]), "aylik", "aylik")
    assert s == [["2024-01", "64.7700", "64.7700", 1, True]]   # basamak korunur, boş dönem yok


def test_yillik_seriden_aylik_uretilmez():
    assert topla(_g([("2024", "3.1")]), "yillik", "aylik") == []


def test_ortalama_son_ve_eksik_donem():
    aylar = [(f"2025-{m:02d}", str(m)) for m in range(1, 13)] + [("2026-01", "10"), ("2026-02", "20")]
    s = topla(_g(aylar), "aylik", "yillik")
    assert s[0] == ["2025", "6.5", "12", 12, True]                 # (1+…+12)/12 = 6,5; son = Aralık
    assert s[1] == ["2026", "15", "20", 2, False]                  # iki ay: eksik yıl işaretli
    q = topla(_g(aylar), "aylik", "ceyreklik")
    assert q[0] == ["2025-Q1", "2", "3", 3, True] and q[-1][4] is False


def test_kucuk_degerler_yuvarlanip_kaybolmaz():
    s = topla(_g([("1950-01", "0.0000028"), ("1950-02", "0.0000029"), ("1950-03", "0.0000030")]), "aylik", "ceyreklik")
    assert s[0][1] == "0.0000029"


def test_panel_yalniz_indirme_izinli_seriler_ve_tam_donem_csv(tmp_path):
    (tmp_path / "site-veri" / "seri").mkdir(parents=True)
    kat = {"seriler": [{"id": "a", "izin": {"indirme": True}}, {"id": "b", "izin": {"indirme": False}}]}
    (tmp_path / "site-veri" / "seriler.json").write_text(json.dumps(kat), encoding="utf-8")
    for i in ("a", "b"):
        d = {"baslik": i, "birim": "yuzde", "tema": "t", "kaynak": {"kurum": "K", "lisans": "L"}, "kaynak_kod": "X",
             "siklik": "aylik", "gozlemler": _g([("2025-11", "1"), ("2025-12", "3"), ("2026-01", "5")])}
        (tmp_path / "site-veri" / "seri" / f"{i}.json").write_text(json.dumps(d), encoding="utf-8")
    yaz(tmp_path, _yaz_atomik)
    y = json.loads((tmp_path / "api/v1/panel/yillik.json").read_text(encoding="utf-8"))
    assert [t["id"] for t in y["seriler"]] == ["a"] and y["seriler"][0]["turetilmis"] is True
    csv = (tmp_path / "api/v1/panel/yillik.csv").read_text(encoding="utf-8").splitlines()
    assert csv == ["donem,a"]                                       # 2025 ve 2026 eksik: geniş CSV'ye girmez
    assert yaz(tmp_path, _yaz_atomik) == []                         # değişmediyse yeniden yazılmaz
