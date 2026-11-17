"""Veri hattı testleri — ağsız. Fixture'lar Dünya Bankası API'sinin 17 Kasım
2026'da alınmış gerçek yanıtlarıdır (yalnız test alanında; yayına girmez)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from veri import ag
from veri.baglayicilar.world_bank import DunyaBankasi, KaynakUyusmazligi, ayristir_gozlem, ayristir_metaveri
from veri.kayit import kaynaklar, seriler
from veri.modeller import Izin, Kaynak, SeriDosyasi, SeriTanimi
from veri.yayin import YayinHatasi, izin, json_metni, yayinla

FIX = Path(__file__).parent / "fixtures"
GOZ = (FIX / "wb-gozlem-ny-gdp-mktp-cd.json").read_bytes()
MET = (FIX / "wb-metaveri-ny-gdp-mktp-cd.json").read_bytes()
SERI = SeriTanimi(id="wb-ny-gdp-mktp-cd-tur", kaynak="world_bank", kod="NY.GDP.MKTP.CD", ulke="TUR",
                  baslik="GSYH", tema="buyume", siklik="yillik", birim="USD")


# ---- bağlayıcı ---------------------------------------------------------------
def test_gercek_yanit_ayrisir_ve_kayipsiz():
    g, guncel, sayfa = ayristir_gozlem(GOZ, "NY.GDP.MKTP.CD", "TUR")
    assert [x.donem for x in g] == ["2023", "2024", "2025"]
    assert sayfa == 1 and guncel.isoformat() == "2026-11-11"
    # Kaynak metnindeki kuruşlar float yuvarlamasına uğramadan korunur.
    assert g[0].deger == Decimal("1141242864657.45")
    assert g[2].deger == Decimal("1597293229287")


def test_metaveri_kod_eslesmesi():
    ad, kaynak = ayristir_metaveri(MET, "NY.GDP.MKTP.CD")
    assert ad == "GDP (current US$)" and kaynak.startswith("Country official statistics")
    with pytest.raises(KaynakUyusmazligi):
        ayristir_metaveri(MET, "NY.GDP.PCAP.CD")


def test_yanlis_ulke_reddedilir():
    with pytest.raises(KaynakUyusmazligi):
        ayristir_gozlem(GOZ, "NY.GDP.MKTP.CD", "ARG")


def test_kaynak_hata_mesaji_reddedilir():
    b = json.dumps([{"message": [{"id": "120", "value": "Invalid value"}]}]).encode()
    with pytest.raises(KaynakUyusmazligi):
        ayristir_gozlem(b, "X", "TUR")


def test_bos_deger_sifir_olmaz_ve_sondaki_bosluk_atilir():
    v = json.loads(GOZ)
    v[1].insert(0, dict(v[1][0], date="2026", value=None))          # henüz yayımlanmamış yıl
    v[1].append(dict(v[1][0], date="2022", value=None))             # aradaki boşluk
    b = json.dumps(v).encode()
    h = DunyaBankasi(getirici=lambda url: MET if "/indicator/" in url and "/country/" not in url else b).cek(SERI)
    assert [x.donem for x in h.gozlemler] == ["2022", "2023", "2024", "2025"]
    assert h.gozlemler[0].deger is None


# ---- lisans kapısı ---------------------------------------------------------------
def _kaynak(**yayin):
    return Kaynak.model_validate({
        "id": "k", "ad": "K", "kurum": "K", "adres": "https://k", "erisim": "REST", "durum": "aktif",
        "lisans": {"ad": "CC BY 4.0", "kanit": "https://k/lisans", "inceleme_tarihi": "2026-11-17"},
        "yayin": {"gosterim": True, "indirme": True, "api": True} | yayin})


def test_kanitsiz_izin_kayda_girmez():
    with pytest.raises(ValueError, match="kanıtı"):
        Kaynak.model_validate({"id": "x", "ad": "X", "kurum": "X", "adres": "https://x", "erisim": "REST",
                               "durum": "aktif", "lisans": {"ad": None},
                               "yayin": {"gosterim": True, "indirme": False, "api": False}})


def test_lisans_gerekli_kaynakta_izin_acilamaz():
    with pytest.raises(ValueError):
        Kaynak.model_validate({"id": "x", "ad": "X", "kurum": "X", "adres": "https://x", "erisim": "feed",
                               "durum": "lisans-gerekli",
                               "lisans": {"ad": "L", "kanit": "https://x", "inceleme_tarihi": "2026-11-17"},
                               "yayin": {"gosterim": True, "indirme": False, "api": False}})


def test_seri_izni_yalniz_daraltir():
    k = _kaynak(api=False)
    s = SERI.model_copy(update={"yayin": Izin(gosterim=True, indirme=True, api=True)})
    assert izin(k, s) == Izin(gosterim=True, indirme=True, api=False)


def _dosya(gozlem, **izin_):
    return SeriDosyasi(id="t-seri", baslik="T", ulke="TUR", siklik="yillik", birim="USD", carpan=1, tema="t",
                       kaynak={"kurum": "K"}, kaynak_kod="X", cekildi=datetime(2026, 11, 17, tzinfo=UTC),
                       izin=Izin(**({"gosterim": True, "indirme": True, "api": True} | izin_)),
                       gozlemler=gozlem)


def test_izinsiz_seri_api_ve_csvye_yazilmaz(tmp_path):
    g, _, _ = ayristir_gozlem(GOZ, "NY.GDP.MKTP.CD", "TUR")
    yazilan = yayinla(_dosya(g, indirme=False, api=False), tmp_path)
    assert [p.relative_to(tmp_path).as_posix() for p in yazilan] == ["site-veri/seri/t-seri.json"]
    assert yayinla(_dosya(g, gosterim=False), tmp_path / "b") == []


def test_degismeyen_seri_dosyaya_dokunmaz_ve_kayip_donem_durdurur(tmp_path):
    g, _, _ = ayristir_gozlem(GOZ, "NY.GDP.MKTP.CD", "TUR")
    assert yayinla(_dosya(g), tmp_path)
    ikinci = _dosya(g).model_copy(update={"cekildi": datetime(2026, 11, 18, tzinfo=UTC)})
    assert yayinla(ikinci, tmp_path) == []                       # yalnız cekildi değişti: sahte vintage yok
    with pytest.raises(YayinHatasi, match="önceden yayımlanmış"):
        yayinla(_dosya(g[1:]), tmp_path)                         # 2023 kayboldu
    assert "2023" in (tmp_path / "site-veri/seri/t-seri.json").read_text(encoding="utf-8")


def test_json_degerleri_metin_olarak_kayipsiz():
    g, _, _ = ayristir_gozlem(GOZ, "NY.GDP.MKTP.CD", "TUR")
    v = json.loads(json_metni(_dosya(g)))
    assert v["gozlemler"][0]["deger"] == "1141242864657.45"


def test_donem_bicimi_ve_sira_zorlanir():
    from veri.modeller import Gozlem
    with pytest.raises(ValueError):
        _dosya([Gozlem(donem="2024-01", deger=None)])
    with pytest.raises(ValueError):
        _dosya([Gozlem(donem="2025", deger=None), Gozlem(donem="2024", deger=None)])


# ---- ağ ---------------------------------------------------------------------------
def test_izinsiz_host_ve_http_reddedilir():
    with pytest.raises(ag.AgHatasi):
        ag.getir("https://evil.example/x")
    with pytest.raises(ag.AgHatasi):
        ag.getir("http://api.worldbank.org/v2/")


def test_429_retry_after_ile_yeniden_dener_404_denemez():
    sayac = {"n": 0}
    def isle(req):
        sayac["n"] += 1
        if "eksik" in req.url.path:
            return httpx.Response(404)
        return httpx.Response(429, headers={"Retry-After": "3"}) if sayac["n"] == 1 else httpx.Response(200, content=b"[]")
    ist = httpx.Client(transport=httpx.MockTransport(isle))
    beklenen = []
    assert ag.getir("https://api.worldbank.org/v2/x", istemci=ist, uyu=beklenen.append) == b"[]"
    assert beklenen == [3.0]
    with pytest.raises(ag.AgHatasi, match="404"):
        ag.getir("https://api.worldbank.org/v2/eksik", istemci=ist, uyu=beklenen.append)


# ---- kayıt ------------------------------------------------------------------------
def test_kayit_gecerli_ve_izinli_kaynak_kanitli():
    ks = kaynaklar()
    ss = seriler()
    assert len(ss) >= 8
    for k in ks.values():
        if k.yayin.gosterim:
            assert k.lisans.kanit and k.lisans.kanit.startswith("https://")
    assert ks["bist"].yayin == Izin()
