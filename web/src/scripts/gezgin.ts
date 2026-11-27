// Veri gezgini: /api/v1/panel/{sıklık}.json üzerinde seçim, grafik, yıl×dönem ısı tablosu,
// geniş tablo, CSV ve metaveri. Durum yalnız adresin # kısmında (sorgu dizesi kurulmaz).
// Saf hesaplar ../lib/gezgin-cekirdek.ts içinde ve test/gezgin.test.ts ile sınanır.
import * as Plot from "@observablehq/plot";
import { yaz, donemAdi, n0, n1 } from "../lib/bicim.ts";
import { uygunMu, ortakSiklik, yilAraligi, kapsam, tarih, zamanAlani, olcek, eslesir, csvMetni, metaveri, olcekUygun, ortakBaz, donustur, sirala, adresParcasi, ORTAK_AZAMI,
  seriOzeti, farkIliskisi, donemSirasi, KORELASYON_ASGARI, type Satir, type Tanim, type Olcek, type Nokta } from "../lib/gezgin-cekirdek.ts";

interface Panel { siklik: string; yontem: string; seriler: Tanim[]; veri: Record<string, Satir[]> }
interface Durum { g: string[]; s: "aylik" | "ceyreklik" | "yillik"; d: "ort" | "son"; b: number; e: number; v: "grafik" | "isi" | "tablo" | "analiz"; o: Olcek }

const SIKLIK: Record<string, string> = { aylik: "aylık", ceyreklik: "çeyreklik", yariyillik: "yarıyıllık", yillik: "yıllık", gunluk: "günlük", haftalik: "haftalık" };
const BIRIM: Record<string, string> = { yuzde: "yüzde", "yuzde-gsyh": "GSYH'ye oran, %", "yuzde-puan": "yüzde puan", USD: "ABD doları", "PPP-2021-USD": "sabit 2021 uluslararası doları (SAGP)", abonelik: "100 kişi başına hat aboneliği", endeks: "endeks", puan: "puan (0–100)", PPS: "PPS", yil: "yıl", kisi: "kişi", ay: "ay", dogum: "kadın başına doğum" };
const AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const AZAMI = 6;
const VARSAYILAN = ["bis-tufe-yillik-tr", "bis-politika-faizi-tr", "eurostat-issizlik-aylik-tr"];
const YONTEM_SAYFASI = "https://veri.korayoner.dev/yontem";
const OLCEK_ADI: Record<Olcek, string> = { deger: "değer", endeks: "endeks (baz = 100)", fark: "baz döneme göre fark (puan)" };
const GORUNUM_BASLIK = { grafik: "Zaman serileri", isi: "Dönem profili", tablo: "Veri tablosu", analiz: "İstatistik ve ilişkiler" };
const R_BICIM = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const KAT = ["var(--kat-1)", "var(--kat-2)", "var(--kat-3)", "var(--kat-4)"];

const el = <K extends keyof HTMLElementTagNameMap>(ad: K, ozellik: Partial<HTMLElementTagNameMap[K]> = {}, ...cocuk: (Node | string)[]) => {
  const x = Object.assign(document.createElement(ad), ozellik); x.append(...cocuk); return x;
};

const form = document.getElementById("g-form") as HTMLFormElement | null;
if (form) baslat(form);

function baslat(form: HTMLFormElement) {
  const cikti = document.getElementById("g-cikti")!, durumP = document.getElementById("g-durum")!, sayac = document.getElementById("g-sayac")!;
  const sonucUst = document.getElementById("g-sonuc-ust")!;
  const gorunumBaslik = document.getElementById("g-gorunum-bas")!;
  const seciliListe = document.getElementById("g-secili")!;
  const hizli = [...form.querySelectorAll<HTMLButtonElement>("[data-g-yil]")];
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
      p = fetch(`/api/v1/panel/${s}.json`, { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<Panel>; });
      p.catch(() => onbellek.delete(s));
      onbellek.set(s, p);
    }
    return p;
  };

  // Adrese yalnız varsayılandan farklı ayar yazılır; varsayılan görünüm düz /gezgin.
  const ayniKume = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));   // seçim sırası adresi değiştirmesin
  const hashMetni = (d: Durum) => adresParcasi([["g", ayniKume(d.g, VARSAYILAN) ? "" : d.g.join(","), ""], ["s", d.s, "aylik"], ["d", d.d, "ort"],
    ["b", String(d.b), "2010"], ["e", String(d.e), String(yillar.at(-1))], ["v", d.v, "grafik"], ["o", d.o, "deger"]]);
  const oku = (): Durum => {
    const h = new URLSearchParams(location.hash.slice(1));
    const gecerli = new Set(kutular.filter((k) => !k.disabled).map((k) => k.value));
    const g = (h.get("g") ?? "").split(",").filter((x) => gecerli.has(x)).slice(0, AZAMI);
    const sayi = (k: string, v: number) => { const x = Number(h.get(k)); return yillar.includes(x) ? x : v; };
    const sec = <T extends string>(k: string, l: readonly T[], v: T): T => (l.includes(h.get(k) as T) ? (h.get(k) as T) : v);
    const b = sayi("b", 2010), e = sayi("e", yillar.at(-1)!);
    return { g: g.length ? g : VARSAYILAN.filter((x) => gecerli.has(x)), s: sec("s", ["aylik", "ceyreklik", "yillik"] as const, "aylik"),
      d: sec("d", ["ort", "son"] as const, "ort"), b: Math.min(b, e), e: Math.max(b, e), v: sec("v", ["grafik", "isi", "tablo", "analiz"] as const, "grafik"),
      o: sec("o", ["deger", "endeks", "fark"] as const, "deger") };
  };
  let durum = oku();
  // Her kullanıcı değişikliği tarayıcı geçmişine yeni kayıt: geri/ileri tuşları görünümler arasında gezer.
  const uygula = (yeni: Partial<Durum>) => {
    durum = { ...durum, ...yeni };
    const h = hashMetni(durum);
    if (h !== location.hash) history.pushState(null, "", h || location.pathname);
    formaYaz(); ciz();
  };
  const hizliBas = (n: number) => n ? Math.max(yillar[0], yillar.at(-1)! - n + 1) : yillar[0];
  const formaYaz = () => {
    gorunumBaslik.textContent = GORUNUM_BASLIK[durum.v];
    seciliListe.replaceChildren(...durum.g.map((id) => el("li", { textContent: adOf(id) })));
    hizli.forEach((btn) => btn.setAttribute("aria-pressed", String(durum.b === hizliBas(Number(btn.dataset.gYil)) && durum.e === yillar.at(-1))));
    kutular.forEach((k) => (k.checked = durum.g.includes(k.value)));
    for (const [ad, v] of [["s", durum.s], ["d", durum.d], ["v", durum.v], ["o", durum.o]] as const)
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
    uygula({ g, s: String(f.get("s")) as Durum["s"], d: f.get("d") === "son" ? "son" : "ort", b: Math.min(b, e), e: Math.max(b, e), v: String(f.get("v")) as Durum["v"],
      o: (String(f.get("o") ?? "deger")) as Olcek });
  };

  const dugme = (metin: string, is: () => void) => { const b = el("button", { type: "button", className: "g-eylem-d", textContent: metin }); b.addEventListener("click", is); return b; };
  const bildirim = (metin: string, ...eylem: HTMLButtonElement[]) =>
    el("section", { className: "g-panel g-bos" }, el("p", { textContent: metin }), ...(eylem.length ? [el("p", { className: "g-bos-eylem" }, ...eylem)] : []));
  const sinirla = (y: number) => Math.min(Math.max(y, yillar[0]), yillar.at(-1)!);

  let seciliCift = "";
  let son: { panel: Panel; secili: Tanim[]; satir: Record<string, Satir[]> } | null = null;
  async function ciz() {
    const d = durum;
    son = null;
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
      : `${dolu.length} ${d.v === "grafik" ? "gösterge çiziliyor" : "gösterge"} · ${SIKLIK[d.s]} · ${d.d === "ort" ? "dönem ortalaması" : "dönem sonu"} · ${d.b}–${d.e}` +
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
      if (d.v === "grafik" && d.o !== "deger") ortakGrafik(dolu, satir, i, d);
      else if (d.v === "grafik") grafik(dolu, satir, i, d);
      else if (d.v === "isi") {
        if (d.o !== "deger") cikti.append(bildirim("Yıl × dönem görünümü ölçek dönüşümü kullanmaz; değerler kaynaktaki ölçekte."));
        isi(dolu, satir, i, d);
      } else if (d.v === "analiz") istatistik(dolu, satir, i, d);
      else tablo(dolu, satir, i, d);
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

  function istatistik(secili: Tanim[], satir: Record<string, Satir[]>, i: 1 | 2, d: Durum) {
    const hucre = (metin: string, alt?: string) => el("td", { className: "n sayi" }, metin, ...(alt ? [el("small", { textContent: alt })] : []));
    const satirlar = secili.map((t) => {
      const o = seriOzeti(satir[t.id], i, d.s, d.b, d.e);
      const birim = BIRIM[t.birim] ?? t.birim;
      const farkBirim = t.birim.startsWith("yuzde") ? "yuzde-puan" : t.birim;
      const fark = o.degisim === null ? "—" : farkBirim === "yuzde-puan"
        ? (o.degisim > 0 ? "+" : "") + R_BICIM.format(o.degisim) + " puan"
        : (o.degisim > 0 ? "+" : "") + yaz(farkBirim, o.degisim);
      const w = (n: number | null) => n === null ? "—" : yaz(t.birim, n);
      const ad = el("th", { scope: "row" }, el("a", { href: `/gosterge/${t.id}`, textContent: t.baslik }), el("small", { textContent: birim }));
      return el("tr", {}, ad, hucre(o.son ? w(Number(o.son[i])) : "—", o.son && (donemAdi(o.son[0]) + (o.son[4] ? "" : " · kısmi"))),
        hucre(fark), hucre(w(o.ortalama)), hucre(w(o.standartSapma)),
        hucre(o.aralik ? o.aralik.map(w).join(" / ") : "—"),
        hucre(`${o.tam} / ${o.beklenen}`, o.kismi ? `${o.kismi} kısmi` : undefined));
    });
    const tabloYap = (ad: string, sinif: string, basliklar: string[], rows: HTMLTableRowElement[], sayisal: boolean) => {
      const tablo = el("table", { className: sinif }, el("thead", {}, el("tr", {}, ...basliklar.map((v, j) =>
        el("th", { scope: "col", className: sayisal && j > 0 ? "n" : "", textContent: v })))), el("tbody", {}, ...rows));
      const kutu = kaydir(tablo);
      kutu.setAttribute("role", "region");
      kutu.setAttribute("aria-label", ad);
      return kutu;
    };
    const ad = "Betimleyici istatistikler";
    cikti.append(el("section", { className: "g-panel g-istatistik-panel" }, el("h3", { textContent: ad }),
      tabloYap(ad, "g-istatistik", ["Gösterge", "Son değer", "Dönem farkı", "Ortalama", "Std. sapma", "En düşük / En yüksek", "Tam / Beklenen"], satirlar, true),
      el("p", { className: "g-not", textContent: `Son değer kısmi olabilir. Ortalama, örneklem standart sapması (n−1) ve aralık yalnız tam dönemlerden hesaplanır. Dönem farkı iki ardışık tam gözlem gerektirir. Beklenen dönem sayısı seçili takvim aralığını esas alır.${d.o !== "deger" ? " Bu görünüm ham panel değerlerini kullanır; grafik ölçeği uygulanmaz." : ""}` })));
    if (secili.length < 2) return;
    const ciftler = secili.flatMap((a, j) => secili.slice(j + 1).map((b) => ({
      a, b, id: `${a.id}:${b.id}`, ...farkIliskisi(satir[a.id], satir[b.id], i, d.s),
    })));
    const iliskiler = ciftler.map(({ a, b, n, r, neden }) => {
      const etiket = r === null ? (neden === "az" ? `— (n < ${KORELASYON_ASGARI})` : "— (değişim sabit)") : R_BICIM.format(Math.abs(r) < .005 ? 0 : r);
      const cel = el("td", { className: "n sayi" }, etiket);
      if (r !== null) {
        const bar = el("span", { className: "iliski-cubuk" }, el("span"));
        bar.setAttribute("aria-hidden", "true");
        if (r < 0) bar.dataset.eksi = "";
        (bar.firstElementChild as HTMLElement).style.width = `${Math.abs(r) * 100}%`;
        cel.append(bar);
      }
      return el("tr", {}, el("th", { scope: "row", textContent: `${a.baslik} / ${b.baslik}` }), hucre(String(n)), cel);
    });
    const iliskiAdi = "Dönem farklarının korelasyonu";
    cikti.append(el("section", { className: "g-panel g-istatistik-panel" }, el("h3", { textContent: iliskiAdi }),
      tabloYap(iliskiAdi, "g-istatistik g-korelasyon", ["Seri çifti", "Eşleşen fark (n)", "Pearson r"], iliskiler, true),
      el("p", { className: "g-not", textContent: `Her serinin ardışık tam dönemleri arasındaki farklar, aynı döneme göre eşleştirilir. En az ${KORELASYON_ASGARI} eşleşme gerekir. Bu katsayı betimleyicidir; nedensellik veya istatistiksel anlamlılık göstermez.` })));
    const secim = el("select", { id: "g-iliski-cift" }, ...ciftler.map((c) => el("option", { value: c.id, textContent: `${c.a.baslik} / ${c.b.baslik}` })));
    const grafikAlani = el("div", { className: "g-iliski-grafik" });
    const grafikNotu = el("p", { className: "g-not", ariaLive: "polite" });
    cikti.append(el("section", { className: "g-panel g-istatistik-panel" },
      el("h3", { textContent: "Dönem farklarının dağılımı" }),
      el("label", { htmlFor: secim.id, className: "g-iliski-etiket" }, "Seri çifti"), secim,
      grafikAlani, grafikNotu));
    secim.value = ciftler.some((c) => c.id === seciliCift) ? seciliCift : (ciftler.find((c) => c.eslesme.length >= 2) ?? ciftler[0]).id;
    const cizIliski = () => {
      const c = ciftler.find((x) => x.id === secim.value)!;
      seciliCift = c.id;
      grafikAlani.replaceChildren();
      if (c.n < 2) {
        grafikNotu.textContent = "Dağılım grafiği için en az iki eşleşen fark gerekir.";
        return;
      }
      const farkBirim = (t: Tanim) => t.birim.startsWith("yuzde") ? "yüzde puan" : (BIRIM[t.birim] ?? t.birim);
      const farkYaz = (t: Tanim, v: number, kip: "eksen" | "tam" = "tam") => yaz(t.birim.startsWith("yuzde") ? "yuzde-puan" : t.birim, v, kip);
      const gen = grafikAlani.clientWidth || 600;
      const g = Plot.plot({
        ariaLabel: `${c.a.baslik} ve ${c.b.baslik}: aynı döneme ait ${c.n} gözlenen değişim çifti.`,
        width: gen, height: gen < 520 ? 235 : 300, marginLeft: 55, marginRight: 20, marginBottom: 32, marginTop: 10,
        style: { background: "transparent", color: "var(--soluk)", fontSize: "12px" },
        x: { grid: true, nice: true, zero: true, label: null, ticks: Math.max(3, Math.floor(gen / 110)), tickFormat: (v: number) => farkYaz(c.a, v, "eksen") },
        y: { grid: true, nice: true, zero: true, label: null, tickFormat: (v: number) => farkYaz(c.b, v, "eksen") },
        marks: [
          Plot.ruleX([0], { stroke: "var(--soluk)", strokeOpacity: .65 }),
          Plot.ruleY([0], { stroke: "var(--soluk)", strokeOpacity: .65 }),
          Plot.dot(c.eslesme, { x: "x", y: "y", r: 3.7, fill: "var(--dv-1)", fillOpacity: .65 }),
          Plot.tip(c.eslesme, Plot.pointer({ className: "g-ipucu", x: "x", y: "y",
            title: (p: { donem: string; x: number; y: number }) => `${donemAdi(p.donem)}
${c.a.baslik}: ${farkYaz(c.a, p.x)}
${c.b.baslik}: ${farkYaz(c.b, p.y)}` })),
        ],
      });
      const temizle = () => g.querySelectorAll("g[aria-label]").forEach((n) => n.removeAttribute("aria-label"));
      new MutationObserver(temizle).observe(g, { childList: true, subtree: true });
      temizle();
      grafikAlani.append(g);
      grafikNotu.textContent = `X: ${c.a.baslik} (${farkBirim(c.a)}). Y: ${c.b.baslik} (${farkBirim(c.b)}). Her nokta aynı dönemin iki değişimini gösterir.`;
    };
    secim.addEventListener("change", cizIliski);
    cizIliski();

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

  function grafik(secili: Tanim[], satir: Record<string, Satir[]>, i: 1 | 2, d: Durum) {
    const z = zamanAlani(secili.map((t) => satir[t.id]));
    if (!z) return;                                                 // dolu seri yoksa çağrılmaz; yine de geçersiz Date üretme
    const alan: [Date, Date] = [new Date(Math.min(+z[0], Date.UTC(d.b, 0, 1))), z[1]];
    for (const t of secili) {
      const tuval = el("div", { className: "g-tuval" });
      cikti.append(el("section", { className: "g-panel" }, baslik(t, satir[t.id], i, d), tuval, not(t, d)));
      let parca = 0;
      const gecerli = satir[t.id].filter((r) => r[i].trim() && Number.isFinite(Number(r[i])));
      const veri = gecerli.map((r, j) => {
        const once = gecerli[j - 1];
        if (once && donemSirasi(r[0], d.s) - donemSirasi(once[0], d.s) !== 1) parca++;
        return { t: tarih(r[0]), v: Number(r[i]), donem: r[0], tam: r[4], parca };
      });
      const adet = new Map<number, number>();
      for (const v of veri) adet.set(v.parca, (adet.get(v.parca) ?? 0) + 1);
      const oran = t.birim.startsWith("yuzde");
      const gen = tuval.clientWidth || 900;
      const p = Plot.plot({
        width: gen, height: 210, marginLeft: 58, marginRight: 12,
        style: { background: "transparent", color: "var(--soluk)", fontSize: "12px" },
        x: { type: "utc", domain: alan, label: null, ticks: Math.max(3, Math.floor(gen / 110)) },
        y: { grid: true, nice: true, label: null, zero: oran || t.birim === "USD", tickFormat: (v: number) => yaz(t.birim, v, "eksen") },
        marks: [
          Plot.ruleY([0], { stroke: "var(--soluk)", strokeOpacity: oran ? 0.7 : 0 }),
          Plot.lineY(veri, { x: "t", y: "v", z: "parca", stroke: "var(--dv-1)", strokeWidth: 1.8 }),
          // Tek gözlemde çizgi görünmez: her noktayı küçük işaretle göster.
          Plot.dot(veri.filter((x) => x.tam && adet.get(x.parca) === 1), { x: "t", y: "v", r: 3.5, fill: "var(--dv-1)" }),
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

  // Ölçek "endeks" ya da "fark": uygun seriler ortak baz döneminden itibaren tek eksende, en çok
  // ORTAK_AZAMI seri bir panelde (renk körlüğünde ayırt edilen palet); fazlası ikinci panele.
  function ortakGrafik(secili: Tanim[], satir: Record<string, Satir[]>, i: 1 | 2, d: Durum) {
    const uygun = secili.filter((t) => olcekUygun(t.birim, d.o)), disari = secili.filter((t) => !olcekUygun(t.birim, d.o));
    if (disari.length) {
      const oneri: Olcek = d.o === "endeks" ? "fark" : "endeks";
      cikti.append(bildirim(`${disari.map((t) => t.baslik).join(", ")}: ${OLCEK_ADI[d.o]} ölçeğine uygun değil (${d.o === "endeks" ? "oran ve puan serisinin endeksi anlamsız; yüzde serilerde fark kullanın" : "fark yalnız yüzde serilerinde yüzde puandır"}).`,
        ...(disari.every((t) => olcekUygun(t.birim, oneri)) ? [dugme(oneri === "fark" ? "Fark (puan) ölçeğine geç" : "Baz = 100 ölçeğine geç", () => uygula({ o: oneri }))] : []),
        dugme("Değer ölçeğine dön", () => uygula({ o: "deger" }))));
    }
    if (!uygun.length) return;
    const baz = ortakBaz(uygun.map((t) => satir[t.id]), i);
    if (!baz) { cikti.append(bildirim("Seçili serilerin bu aralıkta ortak dönemi yok; ortak baz kurulamıyor. Aralığı genişletin ya da seri çıkarın.")); return; }
    const veri = uygun.map((t) => ({ t, n: donustur(satir[t.id], i, d.o, baz) }));
    const negatif = veri.filter((x) => !x.n).map((x) => x.t.baslik);
    if (negatif.length) cikti.append(bildirim(`${negatif.join(", ")}: baz dönemindeki değer sıfır ya da negatif, endeks hesaplanamaz.`));
    const ciz_ = veri.filter((x): x is { t: Tanim; n: Nokta[] } => !!x.n);
    for (let k = 0; k < ciz_.length; k += ORTAK_AZAMI) {
      const grup = ciz_.slice(k, k + ORTAK_AZAMI);
      const tuval = el("div", { className: "g-tuval" });
      const lejant = el("ul", { className: "g-lejant" }, ...grup.map((x, j) => {
        const sn = x.n.at(-1);
        return el("li", {}, el("span", { className: "g-ornek", style: `background:${KAT[j]}` } as Partial<HTMLSpanElement>),
          el("a", { href: `/gosterge/${x.t.id}`, textContent: x.t.baslik }),
          el("span", { className: "g-lejant-v", textContent: sn ? ` ${olcekYaz(d.o, sn.v)} · ${donemAdi(sn.donem)}` : "" }));
      }));
      const baslikP = el("p", { className: "g-ortak-bas" }, el("strong", { textContent: d.o === "endeks" ? `Endeks, ${donemAdi(baz)} = 100` : `${donemAdi(baz)} değerine göre fark, yüzde puan` }),
        ` · ${SIKLIK[d.s]} · ${d.d === "ort" ? "dönem ortalaması" : "dönem sonu"}${ciz_.length > ORTAK_AZAMI ? ` · panel ${k / ORTAK_AZAMI + 1}/${Math.ceil(ciz_.length / ORTAK_AZAMI)}` : ""}`);
      cikti.append(el("section", { className: "g-panel" }, baslikP, lejant, tuval, el("p", { className: "g-not",
        textContent: `Ortak baz: bütün serilerin değeri olan ilk dönem (${donemAdi(baz)}). Dönüşüm bu sitenin hesabıdır; CSV ham değerleri verir.${ciz_.length > ORTAK_AZAMI ? ` Bir panelde en çok ${ORTAK_AZAMI} seri: daha fazlası renkle ayırt edilemez.` : ""}` })));
      const gen = tuval.clientWidth || 900;
      const uzun = grup.flatMap((x, j) => x.n.map((p) => ({ j, ad: x.t.baslik, t: tarih(p.donem), donem: p.donem, v: p.v })));
      const p = Plot.plot({
        width: gen, height: gen < 520 ? 240 : 300, marginLeft: 52, marginRight: 12,
        style: { background: "transparent", color: "var(--soluk)", fontSize: "12px" },
        x: { type: "utc", label: null, ticks: Math.max(3, Math.floor(gen / 110)) },
        y: { grid: true, nice: true, label: null, tickFormat: (v: number) => olcekYaz(d.o, v, true) },
        marks: [
          Plot.ruleY([d.o === "endeks" ? 100 : 0], { stroke: "var(--soluk)", strokeOpacity: 0.8 }),
          ...grup.map((_, j) => Plot.lineY(uzun.filter((x) => x.j === j), { x: "t", y: "v", stroke: KAT[j], strokeWidth: 2 })),
          Plot.tip(uzun, Plot.pointer({ className: "g-ipucu", x: "t", y: "v", title: (x: { ad: string; donem: string; v: number }) => `${x.ad}\n${donemAdi(x.donem)}: ${olcekYaz(d.o, x.v)}` })),
        ],
      });
      const temizle = () => p.querySelectorAll("g[aria-label]").forEach((g) => g.removeAttribute("aria-label"));
      new MutationObserver(temizle).observe(p, { childList: true, subtree: true });
      temizle();
      p.setAttribute("role", "img");
      p.setAttribute("aria-label", `${d.o === "endeks" ? "Endeks" : "Fark"}, baz ${donemAdi(baz)}: ${grup.map((x) => `${x.t.baslik} son ${olcekYaz(d.o, x.n.at(-1)?.v ?? NaN)}`).join("; ")}. Değerler Tablo görünümünde.`);
      tuval.append(p);
    }
  }
  function olcekYaz(o: Olcek, v: number, eksen = false): string {
    if (!Number.isFinite(v)) return "—";
    const f = eksen ? n0 : n1;
    if (o === "endeks") return f.format(v);
    return `${v > 0 ? "+" : v < 0 ? "−" : ""}${f.format(Math.abs(v))}${eksen ? "" : " puan"}`;
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

  // Tablo sıralaması görünüm içi tercih: adrese yazılmaz. -1 dönem sütunu.
  let siralama: { kolon: number; yon: "artan" | "azalan" } = { kolon: -1, yon: "azalan" };
  function tablo(secili: Tanim[], satir: Record<string, Satir[]>, i: 1 | 2, d: Durum) {
    const olcekli = d.o !== "deger";
    const baz = olcekli ? ortakBaz(secili.filter((t) => olcekUygun(t.birim, d.o)).map((t) => satir[t.id]), i) : null;
    const kolonlar = secili.map((t) => {
      const donus = olcekli && olcekUygun(t.birim, d.o) && baz ? donustur(satir[t.id], i, d.o, baz) : null;
      const harita = new Map(satir[t.id].map((r) => [r[0], r]));
      const deger = new Map(donus ? donus.map((x) => [x.donem, x.v]) : satir[t.id].map((r) => [r[0], Number(r[i])]));
      return { t, harita, deger, donus: !!donus };
    });
    const donemler = [...new Set(secili.flatMap((t) => satir[t.id].map((r) => r[0])))].map((donem) => ({ donem }));
    const sirali = siralama.kolon < 0
      ? [...donemler].sort((a, b) => (siralama.yon === "azalan" ? b.donem.localeCompare(a.donem) : a.donem.localeCompare(b.donem)))
      : sirala(donemler, (x) => kolonlar[siralama.kolon]?.deger.get(x.donem) ?? null, siralama.yon);
    const tbl = el("table", { className: "g-tablo" });
    tbl.append(el("caption", { className: "gizli", textContent: "Seçili göstergeler, dönemlere göre. Sütun başlığındaki düğmeyle sıralanır." }));
    const bas = tbl.createTHead().insertRow();
    const basHucre = (metin: string, kolon: number, alt?: string) => {
      const th = el("th", { scope: "col", className: kolon < 0 ? "" : "n" });
      const aktif = siralama.kolon === kolon;
      th.setAttribute("aria-sort", aktif ? (siralama.yon === "artan" ? "ascending" : "descending") : "none");
      const b = el("button", { type: "button", className: "g-sirala", textContent: metin, title: "Bu sütuna göre sırala" });
      b.append(el("span", { className: "g-ok", textContent: aktif ? (siralama.yon === "artan" ? " ▲" : " ▼") : " ↕", ariaHidden: "true" } as Partial<HTMLSpanElement>));
      b.addEventListener("click", () => {
        siralama = { kolon, yon: aktif && siralama.yon === "azalan" ? "artan" : "azalan" };
        ciz().then(() => cikti.querySelector<HTMLButtonElement>(`.g-tablo thead th:nth-child(${kolon + 2}) button`)?.focus());
      });
      th.append(b);
      if (alt) th.append(el("small", { textContent: alt }));
      bas.append(th);
    };
    basHucre("Dönem", -1);
    kolonlar.forEach((k, j) => basHucre(k.t.baslik, j,
      k.donus ? `${d.o === "endeks" ? `endeks, ${donemAdi(baz!)} = 100` : `fark, puan (baz ${donemAdi(baz!)})`}` : `${BIRIM[k.t.birim] ?? k.t.birim}${k.t.turetilmis ? " · türetilmiş" : ""}${olcekli ? " · ölçeksiz" : ""}`));
    const gov = tbl.createTBody();
    for (const { donem } of sirali) {
      const tr = gov.insertRow(); tr.append(el("th", { textContent: donemAdi(donem), scope: "row" }));
      for (const k of kolonlar) {
        const r = k.harita.get(donem), v = k.deger.get(donem), td = tr.insertCell(); td.className = "n";
        if (r && v !== undefined) {
          td.textContent = k.donus ? olcekYaz(d.o, v) : yaz(k.t.birim, v);
          if (!r[4]) { td.classList.add("kismi"); td.title = "eksik dönem"; }
        } else { td.textContent = "·"; td.title = k.donus && r ? "baz döneminden önce" : "bu dönemde gözlem yok"; td.classList.add("bos"); }
      }
    }
    cikti.append(el("section", { className: "g-panel" }, kaydir(tbl), el("p", { className: "g-not", textContent: `* eksik dönem; · gözlem yok${olcekli ? " ya da baz döneminden önce" : ""}. Sütun başlığına basarak sıralayın. CSV indir, tabloyu ham değerlerle (nokta ondalık) verir; Metaveri her sütunun kaynağını ve lisansını açıklar.` })));
  }

  const indir = (icerik: string, tur: string, ad: string) => {
    const a = el("a", { href: URL.createObjectURL(new Blob([icerik], { type: tur })), download: ad });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const dosyaAdi = (uzanti: string) => `turkiye-panel-${durum.s}-${durum.d}-${durum.b}-${durum.e}-${new Date().toISOString().slice(0, 10)}.${uzanti}`;
  const baglanti = () => `${location.origin}${location.pathname}${hashMetni(durum)}`;
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

  // Arama, kurum ve sıklık süzgeçleri gösterge listesini süzer; seçimi değiştirmez, adrese yazılmaz.
  const kurumSec = document.getElementById("g-kurum") as HTMLSelectElement | null, siklikSec = document.getElementById("g-ssuz") as HTMLSelectElement | null;
  const temaSec = document.querySelector<HTMLSelectElement>("#g-tema-sec");
  const suzgec = [ara, kurumSec, siklikSec, temaSec].filter((x): x is HTMLInputElement | HTMLSelectElement => !!x);
  const suz = () => {
    const q = ara?.value ?? "", kr = kurumSec?.value ?? "", sk = siklikSec?.value ?? "";
    const sec = [...form.querySelectorAll<HTMLElement>(".g-sec")], temalar = [...form.querySelectorAll<HTMLElement>(".g-tema")];
    let n = 0;
    for (const l of sec) {
      const ok = eslesir(`${l.dataset.arama} ${l.textContent ?? ""} ${l.querySelector("input")?.value ?? ""}`, q) && (!temaSec?.value || l.dataset.tema === temaSec.value) && (!kr || l.dataset.kurum === kr) && (!sk || l.dataset.siklik === sk);
      l.hidden = !ok; if (ok) n++;
    }
    for (const t of temalar) t.hidden = ![...t.querySelectorAll<HTMLElement>(".g-sec")].some((l) => !l.hidden);
    const sonuc = document.getElementById("g-ara-sonuc");
    const aktif = q.trim() || kr || sk || temaSec?.value;
    if (sonuc) sonuc.textContent = aktif ? (n ? `${n} gösterge eşleşti.` : "Eşleşen gösterge yok; süzgeçleri gevşetin.") : "";
    const liste = document.getElementById("g-liste") as HTMLDetailsElement | null;
    if (liste && aktif) liste.open = true;
  };
  for (const x of suzgec) x.addEventListener(x instanceof HTMLSelectElement ? "change" : "input", (e) => { e.stopPropagation(); suz(); });

  for (const btn of hizli) btn.addEventListener("click", () => uygula({ b: hizliBas(Number(btn.dataset.gYil)), e: yillar.at(-1)! }));
  sonucUst.hidden = false;
  const sonucDugme = document.getElementById("g-sonuca-git");
  if (sonucDugme) {
    sonucDugme.hidden = false;
    sonucDugme.addEventListener("click", () => gorunumBaslik.focus());
  }
  form.addEventListener("submit", (e) => e.preventDefault());       // aramada Enter sayfayı göndermesin
  form.addEventListener("change", (e) => {
    if (suzgec.includes(e.target as HTMLInputElement)) return;
    formdanOku(e.target instanceof HTMLInputElement && e.target.name === "g" ? e.target : undefined);
  });
  // Geri/ileri ya da elle değiştirilen adres: durumu adresten yeniden kur.
  const adrestenKur = () => { const y = oku(); if (hashMetni(y) === hashMetni(durum)) return; durum = y; formaYaz(); ciz(); };
  addEventListener("popstate", adrestenKur);
  addEventListener("hashchange", adrestenKur);
  let zaman = 0;
  addEventListener("resize", () => { clearTimeout(zaman); zaman = window.setTimeout(() => (durum.v === "grafik" || durum.v === "analiz") && ciz(), 200); });
  form.hidden = false;
  // Telefonda gösterge listesi kapalı başlar; seçim sayısı özetle görünür.
  const liste = document.getElementById("g-liste") as HTMLDetailsElement | null;
  if (liste && matchMedia("(max-width: 40rem)").matches) liste.open = false;
  history.replaceState(null, "", hashMetni(durum) || location.pathname);   // adresi sadeleştir; geri tuşu buraya döner
  formaYaz();
  ciz();
}
