"""API v1 dosyalarının bayt düzeyinde yayın kimliği."""
import hashlib
import json
import os
from datetime import UTC, datetime
from pathlib import Path

from .modeller import SeriDosyasi
from .yayin import _yaz_atomik


def seri_semasi() -> str:
    """Dış istemci şeması: v1'e daha sonra eklenen alanlar da kabul edilir."""
    sema = SeriDosyasi.model_json_schema(mode="serialization")
    for nesne in (sema, *sema.get("$defs", {}).values()):
        if nesne.get("additionalProperties") is False:
            del nesne["additionalProperties"]
    sema["required"].append("surum")
    sema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    sema["$id"] = "https://veri.korayoner.dev/api/v1/sema/seri.json"
    return json.dumps(sema, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


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
    sema_yolu = cikti / "api/v1/sema/seri.json"
    sema = seri_semasi()
    if not sema_yolu.exists() or sema_yolu.read_text(encoding="utf-8") != sema:
        _yaz_atomik(sema_yolu, sema)
    kayit = envanter(cikti)
    yol = cikti / "api/v1/manifest.json"
    if yol.exists() and json.loads(yol.read_bytes()).get("release_id") == kayit["release_id"]:
        return
    kayit.update(generated_at=datetime.now(UTC).isoformat(), build_id=os.environ.get("GITHUB_RUN_ID") or kayit["release_id"])
    _yaz_atomik(yol, json.dumps(kayit, indent=1) + "\n")
