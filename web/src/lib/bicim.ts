// Tarayıcı betiklerinin ortak değer ve dönem biçimi (gezgin, karşılaştırma). DOM'suz.
const AY_UZUN = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const n1 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const n2 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const n0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

// kip: "tam" metin ve ipucu, "eksen" kısa ve yuvarlak, "hucre" tabloda sabit ondalık, birimsiz.
export function yaz(birim: string, v: number, kip: "tam" | "eksen" | "hucre" = "tam"): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v), e = v < 0 ? "−" : "", kisa = kip !== "tam";
  if (birim.startsWith("yuzde")) return `${e}%${(kip === "eksen" ? n0 : n1).format(a)}`;
  if (birim === "PPS") return `${n0.format(a)}${kisa ? "" : " PPS"}`;
  if (birim === "yil") return `${n1.format(a)}${kisa ? "" : " yıl"}`;
  if (birim === "kisi") return a >= 1e6 ? `${n1.format(a / 1e6)}${kip === "eksen" ? " mn" : " milyon"}` : n0.format(a);
  if (birim === "USD") {
    if (a >= 1e12) return `${e}${n2.format(a / 1e12)} tr $`;
    if (a >= 1e9) return `${e}${n1.format(a / 1e9)} mr $`;
    if (a >= 1e6) return `${e}${n1.format(a / 1e6)} mn $`;
    return `${e}${n0.format(a)} $`;
  }
  return `${e}${(kip === "eksen" ? n0 : n1).format(a)}`;
}
export const donemAdi = (d: string) => {
  const q = /^(\d{4})-Q(\d)$/.exec(d);
  if (q) return `${q[1]} Ç${q[2]}`;
  const h = /^(\d{4})-S(\d)$/.exec(d);
  if (h) return `${h[1]} ${h[2]}. yarıyıl`;
  return d.length === 7 ? `${AY_UZUN[Number(d.slice(5)) - 1]} ${d.slice(0, 4)}` : d;
};
