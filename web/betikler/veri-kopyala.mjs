// Derlemeden önce: yayin/api → web/public/api (kamuya açık katman).
// site-veri/ kopyalanmaz; sayfalar onu derlemede doğrudan okur.
import { cpSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const hedef = join(WEB, "public", "api");
rmSync(hedef, { recursive: true, force: true });
const kaynak = join(WEB, "..", "yayin", "api");
if (!existsSync(kaynak)) throw new Error("yayin/api yok: önce `uv run veri guncelle`");
cpSync(kaynak, hedef, { recursive: true, filter: (y) => !y.endsWith(".sha256") });
console.log("api/ public klasörüne kopyalandı");
