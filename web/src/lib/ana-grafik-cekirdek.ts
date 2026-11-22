// Panorama ana grafiğinin DOM'suz çekirdeği (test/ana-grafik.test.ts).
export interface AnaSeri { k: string; ad: string; kaynak: string; id?: string; turetilmis?: boolean; d: [string, string][] }
export interface Satir { donem: string; v: Record<string, number | null>; ham: Record<string, string | null> }

/** Son N yılın ilk ayı: en yeni dönem 2026-10 ve N=1 ise 2025-11 (12 ay). N=0: hepsi (null). */
export function aralikBaslangici(seriler: AnaSeri[], yil: number): string | null {
  if (!yil) return null;
  const son = seriler.flatMap((s) => s.d.map((r) => r[0])).sort().at(-1);
  if (!son) return null;
  const y = Number(son.slice(0, 4)), a = Number(son.slice(5, 7));
  const t = (y - yil) * 12 + a;                                  // (son − N yıl) ayının ertesi
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Görünen serilerin dönem birleşimi; eksik ay null kalır (sıfır yazılmaz). */
export function genisTablo(gorunen: AnaSeri[], bas: string | null): Satir[] {
  const harita = gorunen.map((s) => new Map(s.d));
  const donemler = [...new Set(gorunen.flatMap((s) => s.d.map((r) => r[0])))].filter((d) => !bas || d >= bas).sort();
  return donemler.map((donem) => {
    const v: Record<string, number | null> = {}, ham: Record<string, string | null> = {};
    gorunen.forEach((s, i) => { const x = harita[i].get(donem) ?? null; ham[s.k] = x; v[s.k] = x == null ? null : Number(x); });
    return { donem, v, ham };
  });
}
