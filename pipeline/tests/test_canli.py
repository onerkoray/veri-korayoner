"""Yayın sonrası canlı denetim — sahte istemciyle, ağsız."""

from __future__ import annotations

import json

import httpx
import pytest

from veri.canli import denetle


def _yayin(tmp):
    api = tmp / "api" / "v1"
    (api / "seri").mkdir(parents=True)
    katalog = {"surum": 1, "seriler": [{"id": "s-a", "api": "/api/v1/seri/s-a.json", "csv": "/api/v1/seri/s-a.csv"}]}
    (api / "seriler.json").write_text(json.dumps(katalog), encoding="utf-8")
    (api / "durum.json").write_text(json.dumps({"son_kontrol": "2026-11-20T05:20:00Z"}), encoding="utf-8")
    return tmp, katalog


def _istemci(dosyalar: dict[str, bytes]):
    def yanit(istek: httpx.Request):
        govde = dosyalar.get(istek.url.path)
        return httpx.Response(200, content=govde) if govde is not None else httpx.Response(404)
    return httpx.Client(transport=httpx.MockTransport(yanit))


def test_canli_depoyla_ayni(tmp_path):
    yayin, katalog = _yayin(tmp_path)
    canli = {"/api/v1/seriler.json": json.dumps(katalog, indent=1).encode(),          # biçim farkı sorun değil
             "/api/v1/durum.json": b'{"son_kontrol": "2026-11-20T05:20:00Z"}',
             "/api/v1/seri/s-a.json": b"{}", "/api/v1/seri/s-a.csv": b"donem,deger\n"}
    assert denetle("https://veri.korayoner.dev", yayin, istemci=_istemci(canli), uyu=lambda s: None) == []


def test_eski_derleme_ve_eksik_dosya_yakalanir(tmp_path):
    yayin, katalog = _yayin(tmp_path)
    canli = {"/api/v1/seriler.json": json.dumps(katalog).encode(),
             "/api/v1/durum.json": b'{"son_kontrol": "2026-11-19T05:20:00Z"}', "/api/v1/seri/s-a.json": b"{}"}
    bekleme = []
    sorun = denetle("https://veri.korayoner.dev", yayin, deneme=3, istemci=_istemci(canli), uyu=bekleme.append)
    assert len(bekleme) == 2
    assert any("durum.json" in s and "farklı" in s for s in sorun)
    assert any("s-a.csv" in s and "404" in s for s in sorun)


def test_baska_host_reddedilir(tmp_path):
    with pytest.raises(ValueError):
        denetle("https://ornek.com", tmp_path)
