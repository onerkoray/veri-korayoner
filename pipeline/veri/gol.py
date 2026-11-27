"""Analitik göl: kanonik seri dosyalarından tek Parquet (ADR 0002, katman 2).

Yalnız API izni olan seriler girer. Değer DECIMAL(38,14); kaynakta daha fazla
ondalık basamak varsa yuvarlanır. Tam metin JSON/CSV'de korunur. İçerik aynıysa yeniden
yazılmaz (karar satır özetiyle verilir: site-veri/gol-satir-ozeti.txt).
`gozlemler.parquet.sha256` dosyanın kendisinin SHA-256 özetidir (sha256sum biçimi);
istemci indirdiği dosyayı onunla doğrular.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path

import duckdb

SUTUNLAR = ("seri VARCHAR, donem VARCHAR, deger DECIMAL(38,14), birim VARCHAR, siklik VARCHAR, "
            "kaynak VARCHAR, kaynak_kod VARCHAR, ulke VARCHAR, cekildi TIMESTAMPTZ")


def satirlar(cikti: Path) -> list[tuple]:
    liste = []
    for yol in sorted((cikti / "api" / "v1" / "seri").glob("*.json")):
        d = json.loads(yol.read_text(encoding="utf-8"))
        for g in d["gozlemler"]:
            liste.append((d["id"], g["donem"], g["deger"], d["birim"], d["siklik"], d["kaynak"]["id"],
                          d["kaynak_kod"], d["ulke"], d["cekildi"]))
    return liste


def yaz(cikti: Path) -> bool:
    """Parquet'i üretir; değiştiyse True."""
    s = satirlar(cikti)
    ozet = hashlib.sha256(json.dumps(s, sort_keys=True).encode()).hexdigest()
    hedef = cikti / "api" / "v1" / "gozlemler.parquet"
    ozet_yolu = cikti / "api" / "v1" / "gozlemler.parquet.sha256"
    satir_yolu = cikti / "site-veri" / "gol-satir-ozeti.txt"
    if (hedef.exists() and satir_yolu.exists() and satir_yolu.read_text(encoding="utf-8").strip() == ozet
            and ozet_yolu.exists() and ozet_yolu.read_text(encoding="utf-8").split()[0] == dosya_ozeti(hedef)):
        return False
    hedef.parent.mkdir(parents=True, exist_ok=True)
    fd, gecici = tempfile.mkstemp(dir=hedef.parent, suffix=".parquet")
    os.close(fd)
    try:
        con = duckdb.connect()
        con.execute(f"CREATE TABLE g ({SUTUNLAR})")
        con.executemany("INSERT INTO g VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", s)
        con.execute("COPY (SELECT * FROM g ORDER BY seri, donem) TO ? (FORMAT parquet, COMPRESSION zstd)", [gecici])
        con.close()
        os.replace(gecici, hedef)
    except BaseException:
        Path(gecici).unlink(missing_ok=True)
        raise
    satir_yolu.parent.mkdir(parents=True, exist_ok=True)
    satir_yolu.write_text(ozet + "\n", encoding="utf-8", newline="\n")          # Windows'ta da LF
    ozet_yolu.write_text(f"{dosya_ozeti(hedef)}  gozlemler.parquet\n", encoding="utf-8", newline="\n")
    return True


def dosya_ozeti(yol: Path) -> str:
    return hashlib.sha256(yol.read_bytes()).hexdigest()
