// Veri gezgini: /api/v1/panel/{sıklık}.json üzerinde seçim, grafik, yıl×dönem ısı tablosu,
// geniş tablo ve CSV. Durum yalnız adresin # kısmında (sorgu dizesi kurulmaz).
import * as Plot from "@observablehq/plot";

type Satir = [string, string, string, number, boolean];   // donem, ort, son, n, tam
interface Tanim { id: string; baslik: string; birim: string; tema: string; kaynak: string; kaynak_kod: string; kaynak_siklik: string; lisans: string | null; turetilmis: boolean }
interface Panel { siklik: string; seriler: Tanim[]; veri: Record<string, Satir[]> }
interface Durum { g: string[]; s: string; d: "ort" | "son"; b: number; e: number; v: "grafik" | "isi" | "tablo" }

const SIRA = ["gunluk", "haftalik", "aylik", "ceyreklik", "yillik"];
const SIKLIK: Record<string, string> = { aylik: "aylık", ceyreklik: "çeyreklik", yillik: "yıllık", gunluk: "günlük" };
const AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const AY_UZUN = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const AZAMI = 6;
const VARSAYILAN = ["bis-tufe-yillik-tr", "bis-politika-faizi-tr", "ecb-eur-try-aylik"];

const n1 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

// kip: "tam" metin ve ipucu, "eksen" kısa ve yuvarlak, "hucre" tabloda sabit ondalık, birimsiz.
function yaz(birim: string, v: number, kip: "tam" | "eksen" | "hucre" = "tam"): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v), e = v < 0 ? "−" : "", kisa = kip !== "tam";
  if (birim.startsWith("yuzde")) return `${e}%${(kip === "eksen" ? n0 : n1).format(a)}`;
  if (birim === "USD") {
    if (a >= 1e12) return `${e}${n2.format(a / 1e12)} tr $`;
    if (a >= 1e9) return `${e}${n1.format(a / 1e9)} mr $`;
    if (a >= 1e6) return `${e}${n1.format(a / 1e6)} mn $`;
    return `${e}${n0.format(a)} $`;
  }
  if (birim === "TRY/USD" || birim === "TRY/EUR") {
    if (a < 0.01) return `${a.toPrecision(2).replace(".", ",")}${kisa ? "" : " TL"}`;
    return kip === "eksen" ? n0.format(a) : `${n2.format(a)}${kisa ? "" : " TL"}`;
  }
  return `${e}${(kip === "eksen" ? n0 : n1).format(a)}`;
}
const donemAdi = (d: string) => {
  const q = /^(\d{4})-Q(\d)$/.exec(d);
  if (q) return `${q[1]} Ç${q[2]}`;
  return d.length === 7 ? `${AY_UZUN[Number(d.slice(5)) - 1]} ${d.slice(0, 4)}` : d;
};
const tarih = (d: string) => {
  const y = Number(d.slice(0, 4)), q = /-Q(\d)$/.exec(d);
  if (q) return new Date(Date.UTC(y, (Number(q[1]) - 1) * 3 + 1, 15));
  return d.length === 7 ? new Date(Date.UTC(y, Number(d.slice(5)) - 1, 15)) : new Date(Date.UTC(y, 6, 1));
};

const form = document.getElementById("g-form") as HTMLFormElement | null;
if (form) baslat(form);

function baslat(form: HTMLFormElement) {
  const cikti = document.getElementById("g-cikti")!, durumP = document.getElementById("g-durum")!, sayac = document.getElementById("g-sayac")!;
  const kutular = [...form.querySelectorAll<HTMLInputElement>('input[name="g"]')];
  const yilSec = [...form.querySelectorAll<HTMLSelectElement>("select")];
  const yillar = [...yilSec[0].options].map((o) => Number(o.value));
  const onbellek = new Map<string, Promise<Panel>>();
  const yukle = (s: string) => {
    if (!onbellek.has(s)) onbellek.set(s, fetch(`/api/v1/panel/${s}.json`).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }));
    return onbellek.get(s)!;
  };

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
  const formaYaz = () => {
    kutular.forEach((k) => (k.checked = durum.g.includes(k.value)));
    for (const [ad, v] of [["s", durum.s], ["d", durum.d], ["v", durum.v]] as const)
      form.querySelectorAll<HTMLInputElement>(`input[name="${ad}"]`).forEach((r) => (r.checked = r.value === v));
    yilSec[0].value = String(durum.b); yilSec[1].value = String(durum.e);
    // Bu sıklıkta olmayan seriler (ör. aylıkta yıllık seri) işaretlenir.
    kutular.forEach((k) => {
      const yok = SIRA.indexOf(k.closest<HTMLElement>("label")!.dataset.siklik!) > SIRA.indexOf(durum.s);
      k.closest("label")!.classList.toggle("yok", yok && !k.disabled);
      k.closest("label")!.title = yok ? `${SIKLIK[durum.s]} görünümde yok: kaynak seri daha seyrek` : "";
    });
    sayac.textContent = `· ${durum.g.length}/${AZAMI} seçili`;
    const ozet = document.querySelector<HTMLElement>("#g-liste > summary");
    if (ozet) ozet.textContent = `Gösterge listesi (${durum.g.length} seçili) — açmak için dokunun`;
  };
  const formdanOku = (degisen?: HTMLInputElement) => {
    let g = kutular.filter((k) => k.checked).map((k) => k.value);
    if (g.length > AZAMI && degisen) { degisen.checked = false; g = g.filter((x) => x !== degisen.value); durumP.textContent = `En çok ${AZAMI} gösterge seçilebilir.`; }
    const f = new FormData(form);
    const b = Number(yilSec[0].value), e = Number(yilSec[1].value);
    durum = { g, s: String(f.get("s")), d: f.get("d") === "son" ? "son" : "ort", b: Math.min(b, e), e: Math.max(b, e), v: (String(f.get("v")) as Durum["v"]) };
    history.replaceState(null, "", `#${new URLSearchParams({ g: durum.g.join(","), s: durum.s, d: durum.d, b: String(durum.b), e: String(durum.e), v: durum.v })}`);
    formaYaz(); ciz();
  };

  let son: { panel: Panel; secili: Tanim[]; satir: Record<string, Satir[]> } | null = null;
  async function ciz() {
    const d = durum;
    durumP.textContent = "Yükleniyor…";
    let panel: Panel;
    try { panel = await yukle(d.s); } catch { durumP.textContent = "Veri yüklenemedi; sayfayı yenileyin."; return; }
    if (d !== durum) return;                                        // bu arada durum değişti
    const tanim = new Map(panel.seriler.map((t) => [t.id, t]));
    const secili = d.g.map((id) => tanim.get(id)).filter((t): t is Tanim => !!t);
    const disarida = d.g.filter((id) => !tanim.has(id)).map((id) => kutular.find((k) => k.value === id)?.closest("label")?.querySelector("span")?.textContent ?? id);
    const satir = Object.fromEntries(secili.map((t) => [t.id, panel.veri[t.id].filter((r) => { const y = Number(r[0].slice(0, 4)); return y >= d.b && y <= d.e; })]));
    son = { panel, secili, satir };
    const i = d.d === "ort" ? 1 : 2;
    durumP.textContent = secili.length
      ? `${secili.length} gösterge · ${SIKLIK[d.s]} · ${d.d === "ort" ? "dönem ortalaması" : "dönem sonu"} · ${d.b}–${d.e}` + (disarida.length ? ` · ${SIKLIK[d.s]} görünümde olmayan: ${disarida.join(", ")}` : "")
      : disarida.length ? `Seçilen göstergeler ${SIKLIK[d.s]} görünümde yok (${disarida.join(", ")}); daha seyrek bir sıklık seçin.` : "Gösterge seçin.";
    cikti.replaceChildren();
    if (!secili.length) return;
    if (d.v === "grafik") grafik(secili, satir, i, d);
    else if (d.v === "isi") isi(secili, satir, i, d);
    else tablo(secili, satir, i);
  }

  function baslik(t: Tanim, sat: Satir[], i: number) {
    const ust = document.createElement("div"); ust.className = "g-panel-bas";
    const a = document.createElement("a"); a.href = `/gosterge/${t.id}`; a.textContent = t.baslik;
    const s = document.createElement("span"); const sn = sat.at(-1);
    s.innerHTML = "";
    if (sn) { const b = document.createElement("strong"); b.textContent = yaz(t.birim, Number(sn[i])); s.append(b, ` ${donemAdi(sn[0])}${sn[4] ? "" : " (eksik dönem)"} · ${t.kaynak.replace(/\s*\(.*\)$/, "")}`); }
    ust.append(a, s);
    return ust;
  }
  function not(t: Tanim, d: Durum) {
    const p = document.createElement("p"); p.className = "g-not";
    p.textContent = t.turetilmis
      ? `Kaynak sıklığı ${SIKLIK[t.kaynak_siklik]}; ${SIKLIK[d.s]} değer ${d.d === "ort" ? "dönem ortalaması" : "dönemin son gözlemi"} (bu sitenin hesabı). Boş daire: eksik dönem.`
      : `Kaynaktaki değer (${t.kaynak_kod}).`;
    return p;
  }

  function grafik(secili: Tanim[], satir: Record<string, Satir[]>, i: number, d: Durum) {
    const tum = secili.flatMap((t) => satir[t.id].map((r) => +tarih(r[0])));
    const alan: [Date, Date] = [new Date(Math.min(...tum, Date.UTC(d.b, 0, 1))), new Date(Math.max(...tum))];
    for (const t of secili) {
      const kutu = document.createElement("section"); kutu.className = "g-panel";
      const tuval = document.createElement("div"); tuval.className = "g-tuval";
      kutu.append(baslik(t, satir[t.id], i), tuval, not(t, d));
      cikti.append(kutu);
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
          Plot.dot(veri.filter((x) => !x.tam), { x: "t", y: "v", r: 3.5, fill: "var(--yuzey)", stroke: "var(--dv-1)", strokeWidth: 1.5 }),
          Plot.ruleX(veri, Plot.pointerX({ x: "t", stroke: "var(--soluk)", strokeDasharray: "3 3" })),
          Plot.dot(veri, Plot.pointerX({ x: "t", y: "v", r: 4, fill: "var(--dv-2)" })),
          Plot.tip(veri, Plot.pointerX({ x: "t", y: "v", title: (x: { donem: string; v: number; tam: boolean }) => `${donemAdi(x.donem)}\n${yaz(t.birim, x.v)}${x.tam ? "" : "\neksik dönem"}` })),
        ],
      });
      p.setAttribute("aria-label", `${t.baslik}, ${d.b}–${d.e}`);
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
  function hucre(tr: HTMLTableRowElement, t: Tanim, r: Satir | undefined, i: number, lo: number, hi: number) {
    const td = tr.insertCell();
    if (!r) { td.textContent = ""; return; }
    const v = Number(r[i]); const [st, koyu] = renk(v, lo, hi);
    td.textContent = yaz(t.birim, v, "hucre"); td.setAttribute("style", st);
    td.title = `${donemAdi(r[0])}: ${yaz(t.birim, v)}${r[4] ? "" : " (eksik dönem)"}`;
    if (koyu) td.classList.add("koyu");
    if (!r[4]) td.classList.add("kismi");
  }
  function isi(secili: Tanim[], satir: Record<string, Satir[]>, i: number, d: Durum) {
    if (d.s === "yillik") {                                         // yıllıkta: satır yıl, sütun gösterge
      const kutu = document.createElement("section"); kutu.className = "g-panel";
      const tbl = document.createElement("table"); tbl.className = "g-isi";
      const bas = tbl.createTHead().insertRow(); bas.append(Object.assign(document.createElement("th"), { textContent: "Yıl" }));
      for (const t of secili) bas.append(Object.assign(document.createElement("th"), { textContent: t.baslik, scope: "col" }));
      const yil = [...new Set(secili.flatMap((t) => satir[t.id].map((r) => r[0])))].sort().reverse();
      const olcek = Object.fromEntries(secili.map((t) => { const v = satir[t.id].map((r) => Number(r[i])); return [t.id, [Math.min(...v), Math.max(...v)]]; }));
      const gov = tbl.createTBody();
      for (const y of yil) {
        const tr = gov.insertRow(); tr.append(Object.assign(document.createElement("th"), { textContent: y, scope: "row" }));
        for (const t of secili) hucre(tr, t, satir[t.id].find((r) => r[0] === y), i, ...(olcek[t.id] as [number, number]));
      }
      const kay = document.createElement("div"); kay.className = "kaydir"; kay.append(tbl);
      kutu.append(kay, Object.assign(document.createElement("p"), { className: "g-not", textContent: "Her sütun kendi ölçeğinde renklenir: koyu = o göstergenin seçili aralıktaki yüksek değerleri. Kesikli çerçeve: eksik yıl." }));
      cikti.append(kutu);
      return;
    }
    const alt = d.s === "aylik" ? AY : ["Ç1", "Ç2", "Ç3", "Ç4"];
    for (const t of secili) {
      const kutu = document.createElement("section"); kutu.className = "g-panel";
      const sat = satir[t.id];
      const v = sat.map((r) => Number(r[i])), lo = Math.min(...v), hi = Math.max(...v);
      const harita = new Map(sat.map((r) => [r[0], r]));
      const tbl = document.createElement("table"); tbl.className = "g-isi";
      const bas = tbl.createTHead().insertRow();
      for (const a of ["Yıl", ...alt, "Ort."]) bas.append(Object.assign(document.createElement("th"), { textContent: a, scope: "col" }));
      const gov = tbl.createTBody();
      for (const y of [...new Set(sat.map((r) => r[0].slice(0, 4)))].sort().reverse()) {
        const tr = gov.insertRow(); tr.append(Object.assign(document.createElement("th"), { textContent: y, scope: "row" }));
        const satirV: number[] = [];
        alt.forEach((_, k) => {
          const anahtar = d.s === "aylik" ? `${y}-${String(k + 1).padStart(2, "0")}` : `${y}-Q${k + 1}`;
          const r = harita.get(anahtar); if (r) satirV.push(Number(r[i]));
          hucre(tr, t, r, i, lo, hi);
        });
        const td = tr.insertCell(); td.className = "ort";
        td.textContent = satirV.length ? yaz(t.birim, satirV.reduce((a, b) => a + b, 0) / satirV.length, "hucre") + (satirV.length < alt.length ? "*" : "") : "";
        td.title = satirV.length < alt.length ? `${satirV.length}/${alt.length} dönemin ortalaması` : "Yıl ortalaması";
      }
      const kay = document.createElement("div"); kay.className = "kaydir"; kay.append(tbl);
      kutu.append(baslik(t, sat, i), kay, Object.assign(document.createElement("p"), { className: "g-not",
        textContent: `Renk seçili aralıkta bu göstergenin düşükten yükseğe konumu${lo < 0 && hi > 0 ? " (turuncu negatif, mavi pozitif)" : ""}. Ort.: satırdaki dönemlerin ortalaması; * eksik yıl.` }));
      cikti.append(kutu);
    }
  }

  function tablo(secili: Tanim[], satir: Record<string, Satir[]>, i: number) {
    const kutu = document.createElement("section"); kutu.className = "g-panel";
    const tbl = document.createElement("table"); tbl.className = "g-tablo";
    const bas = tbl.createTHead().insertRow();
    bas.append(Object.assign(document.createElement("th"), { textContent: "Dönem", scope: "col" }));
    for (const t of secili) bas.append(Object.assign(document.createElement("th"), { textContent: t.baslik, scope: "col", className: "n" }));
    const haritalar = secili.map((t) => new Map(satir[t.id].map((r) => [r[0], r])));
    const gov = tbl.createTBody();
    for (const p of [...new Set(secili.flatMap((t) => satir[t.id].map((r) => r[0])))].sort().reverse()) {
      const tr = gov.insertRow(); tr.append(Object.assign(document.createElement("th"), { textContent: donemAdi(p), scope: "row" }));
      secili.forEach((t, k) => {
        const r = haritalar[k].get(p), td = tr.insertCell(); td.className = "n";
        if (r) { td.textContent = yaz(t.birim, Number(r[i])); if (!r[4]) { td.classList.add("kismi"); td.title = "eksik dönem"; } }
      });
    }
    const kay = document.createElement("div"); kay.className = "kaydir"; kay.append(tbl);
    kutu.append(kay, Object.assign(document.createElement("p"), { className: "g-not", textContent: "* eksik dönem. CSV indir, bu tabloyu ham değerlerle (nokta ondalık) verir." }));
    cikti.append(kutu);
  }

  document.getElementById("g-indir")!.addEventListener("click", () => {
    if (!son || !son.secili.length) return;
    const i = durum.d === "ort" ? 1 : 2;
    const { secili, satir } = son;
    const har = secili.map((t) => new Map(satir[t.id].map((r) => [r[0], r])));
    const donemler = [...new Set(secili.flatMap((t) => satir[t.id].map((r) => r[0])))].sort();
    const satirlar = [["donem", ...secili.flatMap((t) => [t.id, `${t.id}__tam`])].join(",")];
    for (const p of donemler) satirlar.push([p, ...har.flatMap((h) => { const r = h.get(p); return r ? [r[i], r[4] ? "1" : "0"] : ["", ""]; })].join(","));
    // Düz CSV (yorum satırı yok: pandas/Excel bozulmasın). Kaynak ve yöntem panel JSON'unda.
    const blob = new Blob([satirlar.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `turkiye-panel-${durum.s}-${durum.d}-${durum.b}-${durum.e}.csv`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  form.addEventListener("change", (e) => formdanOku(e.target instanceof HTMLInputElement && e.target.name === "g" ? e.target : undefined));
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
