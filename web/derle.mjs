// Yayın klasörünü kurar: dist/ = arayüz (şimdilik geçici sayfa) + yayin/api.
// Yalnız api/ kopyalanır; site-veri/ arayüzün derleme girdisidir, kamuya
// ayrıca açılmaz (API izni olmayan seriler orada durur).
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(KOK, "dist");
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(join(KOK, "web", "gecici"), DIST, { recursive: true });
const api = join(KOK, "yayin", "api");
if (existsSync(api)) cpSync(api, join(DIST, "api"), { recursive: true });
console.log("dist/ hazır");
