"""Ülke kodları: kayıt ISO 3166 alfa-3 kullanır; kaynaklar farklı kod ister.

Emsal kümesi: Türkiye'yle sık karşılaştırılan yükselen ekonomiler. Seçim
ölçüt kümesidir, sıralama değildir; değiştirmek yöntem sayfasına yazılır.
AB toplamı için alfa-3 karşılığı olmadığından Dünya Bankası'nın EUU kodu
kullanılır; Eurostat'ta EU27_2020'ye çevrilir.
"""

from __future__ import annotations

ALFA2 = {
    "TUR": "TR", "BRA": "BR", "MEX": "MX", "ZAF": "ZA", "POL": "PL", "HUN": "HU",
    "IND": "IN", "IDN": "ID", "CHL": "CL", "ROU": "RO", "COL": "CO",
}
EUROSTAT = ALFA2 | {"EUU": "EU27_2020"}


def anahtar_ulke(anahtar: str, eski: str, yeni: str) -> str:
    """SDMX anahtarında ülke boyutunu değiştirir: yalnız tam eşleşen nokta parçası.

    "M.TR.771" içinde "TR" → "BR"; "M.TRY.EUR" içindeki "TRY" dokunulmaz.
    Anahtarda tam olarak bir eşleşme yoksa hata: yanlış boyutu değiştirmeyiz.
    """
    parca = anahtar.split(".")
    yer = [i for i, p in enumerate(parca) if p == eski]
    if len(yer) != 1:
        raise ValueError(f"anahtarda ülke boyutu tek değil: {anahtar!r} ({eski})")
    parca[yer[0]] = yeni
    return ".".join(parca)
