"""Kaynak çekme güvenilirliği ve yayın bütünlüğü (denetim raporu D-01, D-02, D-04).

Ağ yok: httpx.MockTransport ve sahte saat. Her test deterministik.
"""

import json
from datetime import UTC, datetime

import httpx
import pytest

from veri import ag, canli, durum, manifest


# ---------------------------------------------------------------- hata sınıfı
@pytest.mark.parametrize(("ileti", "sinif"), [
    ("5 denemede alınamadı (ReadTimeout)", "read_timeout"),
    ("3 denemede alınamadı (ConnectTimeout)", "connect_timeout"),
    ("ToplamSüreAşıldı", "total_timeout"),
    ("5 denemede alınamadı (HTTP 429)", "rate_limited"),
    ("5 denemede alınamadı (HTTP 503)", "upstream_5xx"),
    ("HTTP 404", "http_4xx"),
    ("yanıt 20971520 baytı aştı", "too_large"),
    ("KaynakUyusmazligi", "schema"),
    ("JSONDecodeError", "schema"),
    ("ZeroDivisionError", "other"),
    (None, None),
])
def test_hata_sinifi(ileti, sinif):
    assert durum.hata_sinifi(ileti) == sinif


# ---------------------------------------------------------------- yeniden deneme bütçesi
def test_zaman_asimi_sinirli_dener_ve_nedeni_yazar():
    istek = []

    def isle(r):
        istek.append(r.url.path)
        raise httpx.ReadTimeout("yavaş", request=r)

    bekleme = []
    with httpx.Client(transport=httpx.MockTransport(isle)) as ist, pytest.raises(ag.AgHatasi) as e:
        ag.getir("https://api.worldbank.org/v2/x", istemci=ist, uyu=bekleme.append)
    assert "ReadTimeout" in str(e.value)
    assert len(istek) == ag.DENEME                 # üst sınır aşılmaz
    assert len(bekleme) == ag.DENEME - 1           # son denemeden sonra beklenmez
    assert all(b <= 2 ** (ag.DENEME - 2) + 1 for b in bekleme)   # üstel + en çok 1 sn jitter
    assert "worldbank" not in str(e.value)         # adres ve sorgu günlüğe sızmaz


def test_gecici_hatadan_sonra_basarili_yanit_doner():
    sayac = {"n": 0}

    def isle(r):
        sayac["n"] += 1
        if sayac["n"] < 3:
            return httpx.Response(503)
        return httpx.Response(200, content=b"[1]")

    with httpx.Client(transport=httpx.MockTransport(isle)) as ist:
        assert ag.getir("https://api.worldbank.org/v2/x", istemci=ist, uyu=lambda s: None) == b"[1]"
    assert sayac["n"] == 3


def test_retry_after_http_tarihi_ve_butce():
    assert ag._retry_after("Fri, 27 Nov 2026 08:00:07 GMT", datetime(2026, 11, 27, 8, tzinfo=UTC)) == 7
    assert ag._retry_after("hatalı") is None
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(429, headers={"Retry-After": "600"}))) as ist:
        bekleme = []
        with pytest.raises(ag.AgHatasi, match="1 denemede.*429"):
            ag.getir("https://api.worldbank.org/v2/x", istemci=ist, uyu=bekleme.append)
        assert bekleme == []


# ---------------------------------------------------------------- sağlık alanları
class _Izin:
    gosterim = True


def _seri(sid="s1"):
    from veri.modeller import SeriTanimi
    return SeriTanimi(id=sid, kaynak="world_bank", kod="X", ulke="TUR", baslik="b", tema="t", siklik="yillik", birim="yuzde")


def test_erisim_durumu_ve_hata_sinifi_ayri_tutulur(tmp_path):
    from datetime import UTC, datetime
    yaz = lambda yol, metin: (yol.parent.mkdir(parents=True, exist_ok=True), yol.write_text(metin, encoding="utf-8"))  # noqa: E731
    s = _seri()
    t0 = datetime(2026, 11, 20, 5, tzinfo=UTC)
    d = durum.yaz(tmp_path, [s], {"world_bank": None}, lambda k, s: _Izin(), {}, t0, yaz)
    assert d["seriler"][0]["source_reachable"] is None            # hiç denenmedi: bilinmiyor
    d = durum.yaz(tmp_path, [s], {"world_bank": None}, lambda k, s: _Izin(), {"s1": None}, t0, yaz)
    assert d["seriler"][0]["source_reachable"] is True
    t1 = datetime(2026, 11, 21, 5, tzinfo=UTC)
    d = durum.yaz(tmp_path, [s], {"world_bank": None}, lambda k, s: _Izin(),
                  {"s1": "5 denemede alınamadı (ReadTimeout)"}, t1, yaz)
    r = d["seriler"][0]
    assert r["source_reachable"] is False
    assert r["error_class"] == "read_timeout" and r["son_hata"]["sinif"] == "read_timeout"
    assert r["last_successful_fetch"] == "2026-11-20T05:00:00Z"   # başarı tarihi uydurulmaz, eskisi kalır
    kirmizi, uyari = durum.saglik(d, t1)
    assert not kirmizi and "read_timeout" in uyari[0]


# ---------------------------------------------------------------- manifest
def _yayin(kok):
    api = kok / "api/v1"
    (api / "seri").mkdir(parents=True)
    (api / "seri/a.json").write_text(json.dumps({"gozlemler": [{"donem": "2025", "deger": "1"},
                                                                {"donem": "2026", "deger": None}]}), encoding="utf-8")
    (api / "seri/a.csv").write_text("donem,deger\n2025,1\n", encoding="utf-8")
    (api / "seriler.json").write_text(json.dumps({"seriler": [{"id": "a", "api": "/api/v1/seri/a.json"}]}),
                                      encoding="utf-8")
    return api


def test_manifest_deterministik_ve_bozulmayi_yakalar(tmp_path):
    api = _yayin(tmp_path)
    e1 = manifest.envanter(tmp_path)
    assert e1 == manifest.envanter(tmp_path)                       # aynı dosyalar, aynı kimlik
    assert e1["series_count"] == 1 and e1["observation_count"] == 1   # boş gözlem sayılmaz
    assert {f["path"] for f in e1["files"]} == {"seri/a.json", "seri/a.csv", "seriler.json"}
    manifest.yaz(tmp_path)
    m = json.loads((api / "manifest.json").read_text(encoding="utf-8"))
    assert m["release_id"] == manifest.envanter(tmp_path)["release_id"]
    assert {f["path"] for f in m["files"]} == {"seri/a.json", "seri/a.csv", "seriler.json", "sema/seri.json"}
    sema = json.loads((api / "sema/seri.json").read_bytes())
    assert sema["properties"]["surum"]["const"] == 1 and "surum" in sema["required"]
    assert "additionalProperties" not in sema
    (api / "seri/a.csv").write_text("donem,deger\n2025,2\n", encoding="utf-8")
    assert manifest.envanter(tmp_path)["release_id"] != m["release_id"]


def test_canli_ornek_her_turden_dosya_icerir():
    dosyalar = [{"path": p} for p in ["durum.json", "emsal/a.json", "gozlemler.parquet", "panel/aylik.csv",
                                      "seri/a.csv", "seri/a.json", "seri/b.csv", "seri/b.json", "seriler.json"]]
    secim = {f["path"] for f in canli.ornekle(dosyalar, n=6)}
    assert {"seri/a.json", "seri/a.csv", "emsal/a.json", "panel/aylik.csv"} <= secim
    assert "gozlemler.parquet" in secim and len(secim) <= 6
    assert secim == {f["path"] for f in canli.ornekle(dosyalar, n=6)}   # deterministik


# ---------------------------------------------------------------- ikinci tur
def test_gecici_hata_ikinci_turda_yeniden_denenir_kalici_denenmez(tmp_path):
    from pathlib import Path

    from veri import cli
    fix = Path(__file__).parent / "fixtures"
    goz, met = (fix / "wb-gozlem-ny-gdp-mktp-cd.json").read_bytes(), (fix / "wb-metaveri-ny-gdp-mktp-cd.json").read_bytes()
    cagri = {"veri": 0}

    def getirici(url):
        if "/country/" not in url:
            return met
        cagri["veri"] += 1
        if cagri["veri"] == 1:
            raise ag.AgHatasi("5 denemede alınamadı (HTTP 502)")
        return goz

    beklenen = []
    assert cli._guncelle(["wb-ny-gdp-mktp-cd-tur"], tmp_path, getirici, uyu=beklenen.append) == 0
    assert beklenen == [cli.IKINCI_TUR_BEKLEME] and cagri["veri"] == 2
    r = json.loads((tmp_path / "api/v1/durum.json").read_text(encoding="utf-8"))["seriler"]
    wb = next(x for x in r if x["id"] == "wb-ny-gdp-mktp-cd-tur")
    assert wb["source_reachable"] is True and wb["ardisik_hata"] == 0

    def kalici(url):
        if "/country/" not in url:
            return met
        raise ag.AgHatasi("HTTP 404")

    beklenen.clear()
    assert cli._guncelle(["wb-ny-gdp-mktp-cd-tur"], tmp_path, kalici, uyu=beklenen.append) == 1
    assert beklenen == []                       # 4xx kalıcı: ikinci tur yok
