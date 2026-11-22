// Veri gezgini: /api/v1/panel/{sıklık}.json üzerinde seçim, grafik, yıl×dönem ısı tablosu,
// geniş tablo, CSV ve metaveri. Durum yalnız adresin # kısmında (sorgu dizesi kurulmaz).
// Saf hesaplar ../lib/gezgin-cekirdek.ts içinde ve test/gezgin.test.ts ile sınanır.
import * as Plot from "@observablehq/plot";
import { uygunMu, ortakSiklik, yilAraligi, kapsam, tarih, zamanAlani, olcek, eslesir, csvMetni, metaveri, type Satir, type Tanim } from "../lib/gezgin-cekirdek.ts";

interface Panel { siklik: string; yontem: string; seriler: Tanim[]; veri: Record<string, Satir[]> }
interface Durum { g: string[]; s: "aylik" | "ceyreklik" | "yillik"; d: "ort" | "son"; b: number; e: number; v: "grafik" | "isi" | "tablo" }

const SIKLIK: Record<string, string> = { aylik: "aylık", ceyreklik: "çeyreklik", yariyillik: "yarıyıllık", yillik: "yıllık", gunluk: "günlük", haftalik: "haftalık" };
const BIRIM: Record<string, string> = { yuzde: "yüzde", "yuzde-gsyh": "GSYH'ye oran, %", USD: "ABD doları", endeks: "endeks", puan: "puan (0–100)", PPS: "PPS", yil: "yıl", kisi: "kişi" };
const AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const AY_UZUN = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const AZAMI = 6;
const VARSAYILAN = ["bis-tufe-yillik-tr", "bis-politika-faizi-tr", "eurostat-issizlik-aylik-tr"];
const YONTEM_SAYFASI = "https://veri.korayoner.dev/yontem";

const n1 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

// kip: "tam" metin ve ipucu, "eksen" kısa ve yuvarlak, "hucre" tabloda sabit ondalık, birimsiz.
function yaz(birim: string, v: number, kip: "tam" | "eksen" | "hucre" = "tam"): string {
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
const donemAdi = (d: string) => {
  const q = /^(\d{4})-Q(\d)$/.exec(d);
  if (q) return `${q[1]} Ç${q[2]}`;
  return d.length === 7 ? `${AY_UZUN[Number(d.slice(5)) - 1]} ${d.slice(0, 4)}` : d;
};
const el = <K extends keyof HTMLElementTagNameMap>(ad: K, ozellik: Partial<HTMLElementTagNameMap[K]> = {}, ...cocuk: (Node | string)[]) => {
  const x = Object.assign(document.createElement(ad), ozellik); x.append(...cocuk); return x;
};

const form = document.getElementById("g-form") as HTMLFormElement | null;
if (form) baslat(form);

function baslat(form: HTMLFormElement) {
  const cikti = document.getElementById("g-cikti")!, durumP = document.getElementById("g-durum")!, sayac = document.getElementById("g-sayac")!;
  const kutular = [...form.querySelectorAll<HTMLInputElement>('input[name="g"]')];
  const siklikOf = (id: string) => kutular.find((k) => k.value === id)?.closest<HTMLElement>("label")?.dataset.siklik ?? "yillik";
  const adOf = (id: string) => kutular.find((k) => k.value === id)?.closest("label")?.querySelector("span")?.textContent ?? id;
  const yilSec = [form.querySelector<HTMLSelectElement>("#g-b")!, form.querySelector<HTMLSelectElement>("#g-e")!];
  const yillar = [...yilSec[0].options].map((o) => Number(o.value));
  const ara = document.getElementById("g-ara") as HTMLInputElement | null;

  // Başarısız istek önbellekte kalmaz: bir sonraki çizim (ya da "Yeniden dene") yeniden ister.
  const onbellek = new Map<string, Promise<Panel>>();
  const yukle = (s: string) => {
    let p = onbellek.get(s);
    if (!p) {
      p = fetch(`/api/v1/panel/${s}.json`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<Panel>; });
      p.catch(() => onbellek.delete(s));
      onbellek.set(s, p);
    }
    return p;
  };

  const hashMetni = (d: Durum) => new URLSearchParams({ g: d.g.join(","), s: d.s, d: d.d, b: String(d.b), e: String(d.e), v: d.v }).toString();
  const oku = (): Durum => {
    const h = new URLSearchParams(location.hash.slice(1));
    const gecerli = new Set(kutular.filter((k) => !k.disabled).map((k) => k.value));
    const g = (h.get("g") ?? "").split(",").filter((x) => gecerli.has(x)).slice(0, AZAMI);
    const sayi = (k: string, v: number) => { const x = Number(h.get(k)); return yillar.includes(x) ? x : v; };
    const sec = <T extends string>(k: string, l: readonly T[], v: T): T => (l.includes(h.get(k) as T) ? (h.get(k) as T) : v);
    const b = sayi("b", 2010), e = sayi("e", yillar.at(-1)!);
    return { g: g.length ? g : VARSAYILAN.filter((x) => gecerli.has(x)), s: sec("s", ["aylik", "ceyreklik", "yillik"] as const, "aylik"),
      d: sec("d", ["ort", "son"] as const, "ort"), b: Math.min(b, e), e: Math.max(b, e), v: sec("v", ["grafik", "isi", "tablo"] as const, "grafik") };
  };
  let durum = oku();
  const uygula = (yeni: Partial<Durum>) => {
    durum = { ...durum, ...yeni };
    history.replaceState(null, "", `#${hashMetni(durum)}`);
    formaYaz(); ciz();
  };
  const formaYaz = () => {
    kutular.forEach((k) => (k.checked = durum.g.includes(k.value)));
    for (const [ad, v] of [["s", durum.s], ["d", durum.d], ["v", durum.v]] as const)
      form.querySelectorAll<HTMLInputElement>(`input[name="${ad}"]`).forEach((r) => (r.checked = r.value === v));
    yilSec[0].value = String(durum.b); yilSec[1].value = String(durum.e);
    // Bu sıklıkta olmayan seriler (ör. aylıkta yıllık seri) işaretlenir.
    kutular.forEach((k) => {
      const lab = k.closest<HTMLElement>("label")!, yok = !uygunMu(lab.dataset.siklik!, durum.s);
      lab.classList.toggle("yok", yok && !k.disabled);
      lab.title = yok ? `${SIKLIK[durum.s]} görünümde yok: kaynak seri daha seyrek` : "";
    });
    sayac.textContent = `· ${durum.g.length}/${AZAMI} seçili`;
    const ozet = document.querySelector<HTMLElement>("#g-liste > summary");
    if (ozet) ozet.textContent = `Gösterge listesi · ${durum.g.length} seçili`;
  };
  const formdanOku = (degisen?: HTMLInputElement) => {
    let g = kutular.filter((k) => k.checked).map((k) => k.value);
    if (g.length > AZAMI && degisen) { degisen.checked = false; g = g.filter((x) => x !== degisen.value); durumP.textContent = `En çok ${AZAMI} gösterge seçilebilir.`; }
    const f = new FormData(form);
    const b = Number(yilSec[0].value), e = Number(yilSec[1].value);
    uygula({ g, s: String(f.get("s")) as Durum["s"], d: f.get("d") === "son" ? "son" : "ort", b: Math.min(b, e), e: Math.max(b, e), v: String(f.get("v")) as Durum["v"] });
  };

  const dugme = (metin: string, is: () => void) => { const b = el("button", { type: "button", className: "g-eylem-d", textContent: metin }); b.addEventListener("click", is); return b; };
  const bildirim = (metin: string, ...eylem: HTMLButtonElement[]) =>
    el("section", { className: "g-panel g-bos" }, el("p", { textContent: metin }), ...(eylem.length ? [el("p", { className: "g-bos-eylem" }, ...eylem)] : []));
  const sinirla = (y: number) => Math.min(Math.max(y, yillar[0]), yillar.at(-1)!);

  let son: { panel: Panel; secili: Tanim[]; satir: Record<string, Satir[]> } | null = null;
  async function ciz() {
    const d = durum;
    durumP.textContent = "Yükleniyor…";
    let panel: Panel;
    try { panel = await yukle(d.s); } catch (hata) {
      if (d !== durum) return;
      son = null;
      durumP.textContent = `${SIKLIK[d.s]} panel yüklenemedi (${(hata as Error).message || "ağ hatası"}).`;
      delete cikti.dataset.bekle;
      cikti.replaceChildren(bildirim("Veri dosyası alınamadı. Bağlantınızı kontrol edip yeniden deneyin; seçimleriniz korunur.", dugme("Yeniden dene", () => ciz())));
      return;
    }
    if (d !== durum) return;                                        // bu arada durum değişti
    const tanim = new Map(panel.seriler.map((t) => [t.id, t]));
    const secili = d.g.map((id) => tanim.get(id)).filter((t): t is Tanim => !!t);
    const disarida = d.g.filter((id) => !tanim.has(id));
    const satir = Object.fromEntries(secili.map((t) => [t.id, yilAraligi(panel.veri[t.id] ?? [], d.b, d.e)]));
    const dolu = secili.filter((t) => satir[t.id].length), bos = secili.filter((t) => !satir[t.id].length);
    son = { panel, secili: dolu, satir };
    const i = d.d === "ort" ? 1 : 2;
    durumP.textContent = !d.g.length ? "Gösterge seçin."
      : `${dolu.length} gösterge çiziliyor · ${SIKLIK[d.s]} · ${d.d === "ort" ? "dönem ortalaması" : "dönem sonu"} · ${d.b}–${d.e}` +
        (bos.length ? ` · aralıkta verisi olmayan: ${bos.length}` : "") + (disarida.length ? ` · bu sıklıkta olmayan: ${disarida.length}` : "");
    cikti.replaceChildren();
    delete cikti.dataset.bekle;

    if (disarida.length) {
      const ortak = ortakSiklik(d.g.map(siklikOf));
      const ad = disarida.map(adOf).join(", ");
      cikti.append(bildirim(`${ad}: ${SIKLIK[d.s]} görünümde yok, çünkü kaynak seri daha seyrek yayımlanıyor (yıllık seriden aylık değer üretilmez).`,
        ...(ortak !== d.s ? [dugme(`Hepsini ${SIKLIK[ortak]} görünümde göster`, () => uygula({ s: ortak }))] : [])));
    }
    if (dolu.length) {
      if (d.v === "grafik") grafik(dolu, satir, i, d);
      else if (d.v === "isi") isi(dolu, satir, i, d);
      else tablo(dolu, satir, i);
    }
    for (const t of bos) {
      const k = kapsam(panel.veri[t.id] ?? []);
      cikti.append(bildirim(k
        ? `${t.baslik}: ${d.b}–${d.e} aralığında ${SIKLIK[d.s]} gözlem yok. Seri ${k[0]}–${k[1]} yıllarını kapsıyor.`
        : `${t.baslik}: bu sıklıkta hiç gözlem yok.`,
        ...(k ? [dugme(`Aralığı ${sinirla(k[0])}–${sinirla(k[1])} yap`, () => uygula({ b: sinirla(k[0]), e: sinirla(k[1]) }))] : [])));
    }
    if (!dolu.length && !bos.length && !disarida.length && d.g.length) cikti.append(bildirim("Seçili göstergelerin hiçbiri bu panelde yok."));
  }

  function rozetler(t: Tanim, d: Durum) {
    const r = el("span", { className: "g-rozetler" }, el("span", { className: "g-rozet", textContent: BIRIM[t.birim] ?? t.birim }));
    r.append(t.turetilmis
      ? el("span", { className: "g-rozet tur", textContent: `türetilmiş · ${d.d === "ort" ? "ortalama" : "dönem sonu"}`, title: `Kaynak ${SIKLIK[t.kaynak_siklik]}; bu değer bu sitenin hesabı` })
      : el("span", { className: "g-rozet", textContent: "kaynak değeri", title: `Kaynaktaki değer (${t.kaynak_kod})` }));
    return r;
  }
  function baslik(t: Tanim, sat: Satir[], i: number, d: Durum) {
    const ust = el("div", { className: "g-panel-bas" });
    const sol = el("div", { className: "g-panel-ad" }, el("a", { href: `/gosterge/${t.id}`, textContent: t.baslik }), rozetler(t, d));
    const s = el("span"); const sn = sat.at(-1);
    if (sn) s.append(el("strong", { textContent: yaz(t.birim, Number(sn[i])) }), ` ${donemAdi(sn[0])}${sn[4] ? "" : " (eksik dönem)"} · ${t.kaynak.replace(/\s*\(.*\)$/, "")}`);
    ust.append(sol, s);
    return ust;
  }
  function not(t: Tanim, d: Durum) {
    return el("p", { className: "g-not", textContent: t.turetilmis
      ? `Kaynak sıklığı ${SIKLIK[t.kaynak_siklik]}; ${SIKLIK[d.s]} değer ${d.d === "ort" ? "dönem ortalaması" : "dönemin son gözlemi"} (bu sitenin hesabı). Boş daire: eksik dönem.`
      : `Kaynaktaki değer (${t.kaynak_kod}).` });
  }

  function grafik(secili: Tanim[], satir: Record<string, Satir[]>, i: number, d: Durum) {
    const z = zamanAlani(secili.map((t) => satir[t.id]));
    if (!z) return;                                                 // dolu seri yoksa çağrılmaz; yine de geçersiz Date üretme
    const alan: [Date, Date] = [new Date(Math.min(+z[0], Date.UTC(d.b, 0, 1))), z[1]];
    for (const t of secili) {
      const tuval = el("div", { className: "g-tuval" });
      cikti.append(el("section", { className: "g-panel" }, baslik(t, satir[t.id], i, d), tuval, not(t, d)));
      const veri = satir[t.id].map((r) => ({ t: tarih(r[0]), v: Number(r[i]), donem: r[0], tam: r[4] }));
      const oran = t.birim.startsWith("yuzde");
      const gen = tuval.clientWidth || 900;
      const p = Plot.plot({
        width: gen, height: 210, marginLeft: 58, marginRight: 12,
        style: { background: "transparent", color: "var(--soluk)", fontSize: "12px" },
        x: { type: "utc", domain: alan, label: null, ticks: Math.max(3, Math.floor(gen / 110)) },
        y: { grid: true, nice: true, label: null, zero: oran || t.birim === "USD", tickFormat: (v: number) => yaz(t.birim, v, "eksen") },
        marks: [
          Plot.ruleY([0], { stroke: "var(--soluk)", strokeOpacity: oran ? 0.7 : 0 }),
          Plot.lineY(veri, { x: "t", y: "v", stroke: "var(--dv-1)", strokeWidth: 1.8 }),
          // Tek gözlemde çizgi görünmez: her noktayı küçük işaretle göster.
          ...(veri.length < 3 ? [Plot.dot(veri, { x: "t", y: "v", r: 3.5, fill: "var(--dv-1)" })] : []),
          Plot.dot(veri.filter((x) => !x.tam), { x: "t", y: "v", r: 3.5, fill: "var(--yuzey)", stroke: "var(--dv-1)", strokeWidth: 1.5 }),
          Plot.ruleX(veri, Plot.pointerX({ className: "g-imlec", x: "t", stroke: "var(--soluk)", strokeDasharray: "3 3" })),
          Plot.dot(veri, Plot.pointerX({ className: "g-imlec", x: "t", y: "v", r: 4, fill: "var(--dv-2)" })),
          Plot.tip(veri, Plot.pointerX({ className: "g-ipucu", x: "t", y: "v", title: (x: { donem: string; v: number; tam: boolean }) => `${donemAdi(x.donem)}\n${yaz(t.birim, x.v)}${x.tam ? "" : "\neksik dönem"}` })),
        ],
      });
      const sn = satir[t.id].at(-1)!;
      // Plot her katmana işaret türünü aria-label olarak yazar (ariaLabel seçeneği bunu kapatmaz) ve
      // imleç katmanlarını her harekette yeniden çizer; role'süz <g>'de aria-label geçersiz (axe).
      // Grafiğin adı svg'nin kendisinde.
      const temizle = () => p.querySelectorAll("g[aria-label]").forEach((g) => g.removeAttribute("aria-label"));
      new MutationObserver(temizle).observe(p, { childList: true, subtree: true });
      temizle();
      p.setAttribute("role", "img");
      p.setAttribute("aria-label", `${t.baslik}, ${d.b}–${d.e}; ${satir[t.id].length} dönem, son değer ${donemAdi(sn[0])}: ${yaz(t.birim, Number(sn[i]))}. Değerlerin tamamı Tablo görünümünde.`);
      tuval.append(p);
    }
  }

  function renk(v: number, lo: number, hi: number): [string, boolean] {
    if (!Number.isFinite(v)) return ["", false];
    let p: number, renk = "var(--dv-1)";
    if (lo < 0 && hi > 0) { if (v < 0) { p = v / lo; renk = "var(--dv-2)"; } else p = v / hi; }
    else p = hi === lo ? 0.5 : (v - lo) / (hi - lo);
    const yuzde = Math.round(8 + p * 72);
    return [`background: color-mix(in oklab, ${renk} ${yuzde}%, var(--yuzey))`, yuzde > 52];
  }
  function hucre(tr: HTMLTableRowElement, t: Tanim, r: Satir | undefined, i: number, [lo, hi]: [number, number]) {
    const td = tr.insertCell();
    if (!r) return;
    const v = Number(r[i]); const [st, koyu] = renk(v, lo, hi);
    td.textContent = yaz(t.birim, v, "hucre"); td.setAttribute("style", st);
    td.title = `${donemAdi(r[0])}: ${yaz(t.birim, v)}${r[4] ? "" : " (eksik dönem)"}`;
    if (koyu) td.classList.add("koyu");
    if (!r[4]) td.classList.add("kismi");
  }
  const olc = (sat: Satir[], i: number): [number, number] => olcek(sat.map((r) => Number(r[i]))) ?? [0, 0];
  const kaydir = (tbl: HTMLTableElement) => el("div", { className: "kaydir", tabIndex: 0 }, tbl);

  function isi(secili: Tanim[], satir: Record<string, Satir[]>, i: number, d: Durum) {
    if (d.s === "yillik") {                                         // yıllıkta: satır yıl, sütun gösterge
      const tbl = el("table", { className: "g-isi" });
      const bas = tbl.createTHead().insertRow(); bas.append(el("th", { textContent: "Yıl" }));
      for (const t of secili) bas.append(el("th", { textContent: t.baslik, scope: "col" }));
      const yil = [...new Set(secili.flatMap((t) => satir[t.id].map((r) => r[0])))].sort().reverse();
      const o = Object.fromEntries(secili.map((t) => [t.id, olc(satir[t.id], i)]));
      const gov = tbl.createTBody();
      for (const y of yil) {
        const tr = gov.insertRow(); tr.append(el("th", { textContent: y, scope: "row" }));
        for (const t of secili) hucre(tr, t, satir[t.id].find((r) => r[0] === y), i, o[t.id]);
      }
      cikti.append(el("section", { className: "g-panel" }, kaydir(tbl), el("p", { className: "g-not", textContent: "Her sütun kendi ölçeğinde renklenir: koyu = o göstergenin seçili aralıktaki yüksek değerleri. Kesikli çerçeve: eksik yıl." })));
      return;
    }
    const alt = d.s === "aylik" ? AY : ["Ç1", "Ç2", "Ç3", "Ç4"];
    for (const t of secili) {
      const sat = satir[t.id];
      const [lo, hi] = olc(sat, i);
      const harita = new Map(sat.map((r) => [r[0], r]));
      const tbl = el("table", { className: "g-isi" });
      const bas = tbl.createTHead().insertRow();
      for (const a of ["Yıl", ...alt, "Ort."]) bas.append(el("th", { textContent: a, scope: "col" }));
      const gov = tbl.createTBody();
      for (const y of [...new Set(sat.map((r) => r[0].slice(0, 4)))].sort().reverse()) {
        const tr = gov.insertRow(); tr.append(el("th", { textContent: y, scope: "row" }));
        const satirV: number[] = [];
        alt.forEach((_, k) => {
          const r = harita.get(d.s === "aylik" ? `${y}-${String(k + 1).padStart(2, "0")}` : `${y}-Q${k + 1}`);
          if (r) satirV.push(Number(r[i]));
          hucre(tr, t, r, i, [lo, hi]);
        });
        const td = tr.insertCell(); td.className = "ort";
        td.textContent = satirV.length ? yaz(t.birim, satirV.reduce((a, b) => a + b, 0) / satirV.length, "hucre") + (satirV.length < alt.length ? "*" : "") : "";
        td.title = satirV.length < alt.length ? `${satirV.length}/${alt.length} dönemin ortalaması` : "Yıl ortalaması";
      }
      cikti.append(el("section", { className: "g-panel" }, baslik(t, sat, i, d), kaydir(tbl), el("p", { className: "g-not",
        textContent: `Renk seçili aralıkta bu göstergenin düşükten yükseğe konumu${lo < 0 && hi > 0 ? " (turuncu negatif, mavi pozitif)" : ""}. Ort.: satırdaki dönemlerin ortalaması; * eksik yıl.` })));
    }
  }

  function tablo(secili: Tanim[], satir: Record<string, Satir[]>, i: number) {
    const tbl = el("table", { className: "g-tablo" });
    tbl.append(el("caption", { className: "gizli", textContent: "Seçili göstergeler, dönemlere göre" }));
    const bas = tbl.createTHead().insertRow();
    bas.append(el("th", { textContent: "Dönem", scope: "col" }));
    for (const t of secili) bas.append(el("th", { scope: "col", className: "n" }, t.baslik, el("small", { textContent: ` ${BIRIM[t.birim] ?? t.birim}${t.turetilmis ? " · türetilmiş" : ""}` })));
    const haritalar = secili.map((t) => new Map(satir[t.id].map((r) => [r[0], r])));
    const gov = tbl.createTBody();
    for (const p of [...new Set(secili.flatMap((t) => satir[t.id].map((r) => r[0])))].sort().reverse()) {
      const tr = gov.insertRow(); tr.append(el("th", { textContent: donemAdi(p), scope: "row" }));
      secili.forEach((t, k) => {
        const r = haritalar[k].get(p), td = tr.insertCell(); td.className = "n";
        if (r) { td.textContent = yaz(t.birim, Number(r[i])); if (!r[4]) { td.classList.add("kismi"); td.title = "eksik dönem"; } }
        else { td.textContent = "·"; td.title = "bu dönemde gözlem yok"; td.classList.add("bos"); }
      });
    }
    cikti.append(el("section", { className: "g-panel" }, kaydir(tbl), el("p", { className: "g-not", textContent: "* eksik dönem; · gözlem yok. CSV indir, bu tabloyu ham değerlerle (nokta ondalık) verir; Metaveri her sütunun kaynağını ve lisansını açıklar." })));
  }

  const indir = (icerik: string, tur: string, ad: string) => {
    const a = el("a", { href: URL.createObjectURL(new Blob([icerik], { type: tur })), download: ad });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const dosyaAdi = (uzanti: string) => `turkiye-panel-${durum.s}-${durum.d}-${durum.b}-${durum.e}-${new Date().toISOString().slice(0, 10)}.${uzanti}`;
  const baglanti = () => `${location.origin}${location.pathname}#${hashMetni(durum)}`;
  document.getElementById("g-indir")!.addEventListener("click", () => {
    if (!son?.secili.length) { durumP.textContent = "İndirilecek veri yok: aralıkta gözlemi olan bir gösterge seçin."; return; }
    // Düz CSV (yorum satırı yok: pandas/Excel bozulmasın). Açıklama yanındaki metaveri dosyasında.
    indir(csvMetni(son.secili, son.satir, durum.d === "ort" ? 1 : 2), "text/csv;charset=utf-8", dosyaAdi("csv"));
  });
  document.getElementById("g-meta")?.addEventListener("click", () => {
    if (!son?.secili.length) { durumP.textContent = "Metaveri için önce aralıkta gözlemi olan bir gösterge seçin."; return; }
    const m = metaveri(son.secili, durum, `${son.panel.yontem} Ayrıntı: ${YONTEM_SAYFASI}`, baglanti(), new Date());
    indir(JSON.stringify(m, null, 1) + "\n", "application/json;charset=utf-8", dosyaAdi("metaveri.json"));
  });
  document.getElementById("g-bagla")?.addEventListener("click", async () => {
    const url = baglanti();
    try { await navigator.clipboard.writeText(url); durumP.textContent = "Bağlantı kopyalandı: bu görünümü aynen açar."; }
    catch { durumP.textContent = `Kopyalanamadı; bağlantı: ${url}`; }
  });

  // Arama: gösterge listesini süzer; seçimi değiştirmez.
  if (ara) {
    const sonuc = document.getElementById("g-ara-sonuc");
    const sec = [...form.querySelectorAll<HTMLElement>(".g-sec")], temalar = [...form.querySelectorAll<HTMLElement>(".g-tema")];
    ara.addEventListener("input", () => {
      const q = ara.value;
      let n = 0;
      for (const l of sec) { const ok = eslesir(l.textContent ?? "", q); l.hidden = !ok; if (ok) n++; }
      for (const t of temalar) t.hidden = ![...t.querySelectorAll<HTMLElement>(".g-sec")].some((l) => !l.hidden);
      if (sonuc) sonuc.textContent = q.trim() ? (n ? `${n} gösterge eşleşti.` : "Eşleşen gösterge yok; başka bir sözcük deneyin.") : "";
      const liste = document.getElementById("g-liste") as HTMLDetailsElement | null;
      if (liste && q.trim()) liste.open = true;
    });
  }

  form.addEventListener("submit", (e) => e.preventDefault());       // aramada Enter sayfayı göndermesin
  form.addEventListener("change", (e) => {
    if (e.target === ara) return;
    formdanOku(e.target instanceof HTMLInputElement && e.target.name === "g" ? e.target : undefined);
  });
  addEventListener("hashchange", () => { durum = oku(); formaYaz(); ciz(); });
  let zaman = 0;
  addEventListener("resize", () => { clearTimeout(zaman); zaman = window.setTimeout(() => durum.v === "grafik" && ciz(), 200); });
  form.hidden = false;
  // Telefonda gösterge listesi kapalı başlar; seçim sayısı özetle görünür.
  const liste = document.getElementById("g-liste") as HTMLDetailsElement | null;
  if (liste && matchMedia("(max-width: 40rem)").matches) liste.open = false;
  formaYaz();
  ciz();
}
