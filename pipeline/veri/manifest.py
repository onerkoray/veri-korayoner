"""API v1 dosyalarının bayt düzeyinde yayın kimliği."""
import hashlib
import json
import os
from datetime import UTC, datetime
from pathlib import Path

from .yayin import _yaz_atomik


def envanter(cikti: Path) -> dict:
    api = cikti / "api/v1"
    dosyalar = []
    for p in sorted(api.rglob("*"), key=lambda p: p.relative_to(api).as_posix()):
        if p.is_file() and p != api / "manifest.json":
            veri = p.read_bytes()
            dosyalar.append({"path": p.relative_to(api).as_posix(), "bytes": len(veri),
                             "sha256": hashlib.sha256(veri).hexdigest()})
    katalog = json.loads((api / "seriler.json").read_bytes())["seriler"]
    gozlem = 0
    for seri in katalog:
        d = json.loads((cikti / seri["api"].lstrip("/")).read_bytes())
        gozlem += sum(g["deger"] is not None for g in d["gozlemler"])
    kimlik = hashlib.sha256(json.dumps(dosyalar, sort_keys=True).encode()).hexdigest()
    return {"release_id": kimlik, "series_count": len(katalog), "observation_count": gozlem, "files": dosyalar}


def yaz(cikti: Path):
    kayit = envanter(cikti)
    yol = cikti / "api/v1/manifest.json"
    if yol.exists() and json.loads(yol.read_bytes()).get("release_id") == kayit["release_id"]:
        return
    kayit.update(generated_at=datetime.now(UTC).isoformat(), build_id=os.environ.get("GITHUB_RUN_ID") or kayit["release_id"])
    _yaz_atomik(yol, json.dumps(kayit, indent=1) + "\n")
