// Panorama ana grafiği: aralık (1/3/5/10 yıl, tümü), seri aç/kapa, imleçte üç değer,
// CSV ve bağlantı. Durum yalnız adresin # kısmında (sorgu dizesi yok).
import * as Plot from "@observablehq/plot";
import { tarih, adresParcasi } from "../lib/gezgin-cekirdek.ts";
import { aralikBaslangici, genisTablo, type AnaSeri } from "../lib/ana-grafik-cekirdek.ts";

const RENK: Record<string, string> = { faiz: "var(--dv-1)", enf: "var(--dv-2)", reel: "var(--metin)" };
const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const n1 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const yuzde = (v: number, f = n1) => (v < 0 ? "−%" : "%") + f.format(Math.abs(v));
const donemAdi = (d: string) => `${AY[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

const tuval = document.querySelector<HTMLElement>("[data-ana-grafik]");
if (tuval) kur(tuval);

function kur(tuval: HTMLElement) {
  const bolum = tuval.closest("section")!;
  const { seriler } = JSON.parse(tuval.dataset.anaGrafik!) as { seriler: AnaSeri[] };
  const durumP = bolum.querySelector<HTMLElement>(".ana-durum")!;
  const aralikD = [...bolum.querySelectorAll<HTMLButtonElement>(".ana-aralik button")];
  const seriD = [...bolum.querySelectorAll<HTMLButtonElement>(".ana-seri button")];

  const h = new URLSearchParams(location.hash.slice(1));
  let yil = [0, 1, 3, 5, 10].includes(Number(h.get("aralik"))) && h.has("aralik") ? Number(h.get("aralik")) : 10;
  const istenen = (h.get("seri") ?? "").split(",").filter((k) => seriler.some((s) => s.k === k));
  const acik = new Set(istenen.length ? istenen : seriler.map((s) => s.k));
  // Yalnız varsayılandan farklıysa adrese yazılır (10 yıl, üç seri açık: düz adres).
  const tumu = seriler.map((s) => s.k).join(",");
  const parca = () => adresParcasi([["aralik", String(yil), "10"], ["seri", seriler.filter((s) => acik.has(s.k)).map((s) => s.k).join(","), tumu]]);
  const hashYaz = () => history.replaceState(null, "", parca() || location.pathname);

  let tablo: ReturnType<typeof genisTablo> = [];
  function ciz() {
    aralikD.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.yil) === yil)));
    seriD.forEach((b) => b.setAttribute("aria-pressed", String(acik.has(b.dataset.seri!))));
    const gorunen = seriler.filter((s) => acik.has(s.k));
    const bas = aralikBaslangici(seriler, yil);
    tablo = genisTablo(gorunen, bas);
    tuval.replaceChildren();
    if (!gorunen.length) { durumP.textContent = "Grafik için en az bir seri seçin."; return; }
    if (!tablo.length) { durumP.textContent = "Bu aralıkta seçili serilerin gözlemi yok; daha uzun bir aralık seçin."; return; }
    const ilk = tablo[0].donem, son = tablo.at(-1)!.donem;
    durumP.textContent = `${donemAdi(ilk)} – ${donemAdi(son)} · ${tablo.length} ay`;
    const gen = tuval.clientWidth - 16 || 900;
    const uzun = gorunen.flatMap((s) => tablo.filter((r) => r.v[s.k] != null).map((r) => ({ k: s.k, t: tarih(r.donem), v: r.v[s.k]! })));
    const p = Plot.plot({
      width: gen, height: gen < 520 ? 260 : 320, marginLeft: 48, marginRight: 14, marginTop: 14,
      style: { background: "transparent", color: "var(--soluk)", fontSize: "12px" },
      x: { type: "utc", label: null, ticks: Math.max(3, Math.floor(gen / 120)) },
      y: { grid: true, nice: true, label: null, tickFormat: (v: number) => yuzde(v, n0) },
      marks: [
        Plot.ruleY([0], { stroke: "var(--soluk)", strokeOpacity: 0.8 }),
        ...gorunen.map((s) => Plot.lineY(uzun.filter((x) => x.k === s.k), { x: "t", y: "v", stroke: RENK[s.k], strokeWidth: 2, strokeDasharray: s.turetilmis ? "5 3" : undefined })),
        Plot.ruleX(tablo, Plot.pointerX({ className: "g-imlec", x: (r: { donem: string }) => tarih(r.donem), stroke: "var(--soluk)", strokeDasharray: "3 3" })),
        Plot.tip(tablo, Plot.pointerX({
          className: "g-ipucu", x: (r: { donem: string }) => tarih(r.donem),
          y: (r: { v: Record<string, number | null> }) => Math.max(...Object.values(r.v).filter((x): x is number => x != null)),
          title: (r: { donem: string; v: Record<string, number | null> }) => [donemAdi(r.donem),
            ...gorunen.map((s) => `${s.ad}: ${r.v[s.k] == null ? "yok" : yuzde(r.v[s.k]!)}`)].join("\n"),
        })),
      ],
    });
    // Plot her katmana işaret türünü aria-label olarak yazar ve imleç katmanını her harekette
    // yeniden çizer; role'süz <g>'de aria-label geçersiz (axe). Grafiğin adı svg'de.
    const temizle = () => p.querySelectorAll("g[aria-label]").forEach((g) => g.removeAttribute("aria-label"));
    new MutationObserver(temizle).observe(p, { childList: true, subtree: true });
    temizle();
    p.setAttribute("role", "img");
    const sonSatir = tablo.at(-1)!;
    p.setAttribute("aria-label", `Enflasyon ve politika faizi, ${donemAdi(ilk)}–${donemAdi(son)}. ${gorunen.map((s) => `${s.ad} son: ${sonSatir.v[s.k] == null ? "yok" : yuzde(sonSatir.v[s.k]!)}`).join("; ")}.`);
    tuval.append(p);
  }

  aralikD.forEach((b) => b.addEventListener("click", () => { yil = Number(b.dataset.yil); hashYaz(); ciz(); }));
  seriD.forEach((b) => b.addEventListener("click", () => { const k = b.dataset.seri!; acik.has(k) ? acik.delete(k) : acik.add(k); hashYaz(); ciz(); }));
  bolum.querySelector('[data-eylem="csv"]')?.addEventListener("click", () => {
    if (!tablo.length) { durumP.textContent = "İndirilecek veri yok."; return; }
    const gorunen = seriler.filter((s) => acik.has(s.k));
    const sat = [["donem", ...gorunen.map((s) => s.id ?? `${s.k}_bu_sitenin_hesabi`)].join(",")];
    for (const r of tablo) sat.push([r.donem, ...gorunen.map((s) => r.ham[s.k] ?? "")].join(","));
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([sat.join("\n") + "\n"], { type: "text/csv;charset=utf-8" })),
      download: `turkiye-faiz-enflasyon-${tablo[0].donem}-${tablo.at(-1)!.donem}.csv`,
    });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  bolum.querySelector('[data-eylem="bagla"]')?.addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}${parca()}`;
    try { await navigator.clipboard.writeText(url); durumP.textContent = "Bağlantı kopyalandı."; }
    catch { durumP.textContent = `Kopyalanamadı; bağlantı: ${url}`; }
  });
  let zaman = 0;
  addEventListener("resize", () => { clearTimeout(zaman); zaman = window.setTimeout(ciz, 200); });
  bolum.querySelectorAll<HTMLElement>("[hidden]").forEach((e) => (e.hidden = false));
  ciz();
}
