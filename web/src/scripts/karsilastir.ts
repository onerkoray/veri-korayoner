// Ülke karşılaştırması: gösterge, dönem ve ülke seçimi; sıralı çubuklar ve zaman içinde
// Türkiye ile emsal medyanı. Yalnız API izinli /api/v1/emsal ve /api/v1/seri dosyalarını okur.
// Durum adresin # kısmında; her değişiklik geçmişe yazılır (geri/ileri çalışır).
import * as Plot from "@observablehq/plot";
import { yaz, donemAdi } from "../lib/bicim.ts";
import { tarih, adresParcasi } from "../lib/gezgin-cekirdek.ts";
import { uygunDonemler, siralaDonem, medyanSerisi, esik } from "../lib/karsilastir-cekirdek.ts";
import { tarihselKiyas, type Nokta } from "../lib/okuma.ts";

interface Kalem { id: string; baslik: string; birim: string; siklik: string; tema: string; kaynak: string; indir: boolean }
interface Veri { tr: Nokta[]; ulkeler: Record<string, Nokta[]>; kaynakKod: string }
interface Durum { g: string; d: string; x: string[] }

const form = document.getElementById("k-form") as HTMLFormElement | null;
if (form) baslat(form);

function baslat(form: HTMLFormElement) {
  const { katalog, ulke, varsayilan } = JSON.parse(form.dataset.katalog!) as { katalog: Kalem[]; ulke: Record<string, string>; varsayilan: string };
  const ad = (k: string) => ulke[k] ?? k;
  const gSec = document.getElementById("k-gosterge") as HTMLSelectElement, dSec = document.getElementById("k-donem") as HTMLSelectElement;
  const kutular = [...form.querySelectorAll<HTMLInputElement>('input[name="u"]')];
  const cikti = document.getElementById("k-cikti")!, durumP = document.getElementById("k-durum")!;
  const el = <K extends keyof HTMLElementTagNameMap>(a: K, o: Partial<HTMLElementTagNameMap[K]> = {}, ...c: (Node | string)[]) => { const x = Object.assign(document.createElement(a), o); x.append(...c); return x; };
  const sayi = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12))));

  const onbellek = new Map<string, Promise<Veri>>();
  const yukle = (id: string) => {
    let p = onbellek.get(id);
    if (!p) {
      const al = (u: string) => fetch(u, { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
      const nokta = (g: { donem: string; deger: string | null }[]) => g.filter((x) => x.deger != null).map((x) => ({ donem: x.donem, v: Number(x.deger) }));
      p = Promise.all([al(`/api/v1/seri/${id}.json`), al(`/api/v1/emsal/${id}.json`)]).then(([s, e]) => ({
        tr: nokta(s.gozlemler), kaynakKod: s.kaynak_kod,
        ulkeler: Object.fromEntries(Object.entries(e.ulkeler as Record<string, { donem: string; deger: string | null }[]>).map(([k, g]) => [k, nokta(g)])),
      }));
      p.catch(() => onbellek.delete(id));                          // başarısız istek önbellekte kalmaz
      onbellek.set(id, p);
    }
    return p;
  };

  // Yalnız varsayılandan farklı alanlar: en yeni karşılaştırılabilir dönem (enYeni) adrese yazılmaz.
  let enYeni = "";
  const hashMetni = (d: Durum) => adresParcasi([["g", d.g, varsayilan], ["d", d.d, enYeni], ["x", d.x.join(","), ""]]);
  const oku = (): Durum => {
    const h = new URLSearchParams(location.hash.slice(1));
    const g = katalog.some((k) => k.id === h.get("g")) ? h.get("g")! : varsayilan;
    return { g, d: h.get("d") ?? "", x: (h.get("x") ?? "").split(",").filter((k) => kutular.some((u) => u.value === k)) };
  };
  let durum = oku();
  const yerlestir = (yeni: Partial<Durum>, gecmis = true) => {
    durum = { ...durum, ...yeni };
    const h = hashMetni(durum);
    if (gecmis && h !== location.hash) history.pushState(null, "", h || location.pathname); else history.replaceState(null, "", h || location.pathname);
    ciz();
  };

  const bildirim = (metin: string, ...eylem: HTMLButtonElement[]) => el("section", { className: "k-panel k-bos" }, el("p", { textContent: metin }), ...eylem);
  const dugme = (metin: string, is: () => void) => { const b = el("button", { type: "button", className: "g-eylem-d", textContent: metin }); b.addEventListener("click", is); return b; };
  // Plot her katmana işaret türünü aria-label olarak yazar; role'süz <g>'de geçersiz (axe). Ad svg'de.
  const etiketle = (p: Element, etiket: string) => {
    const temizle = () => p.querySelectorAll("g[aria-label]").forEach((g) => g.removeAttribute("aria-label"));
    new MutationObserver(temizle).observe(p, { childList: true, subtree: true });
    temizle(); p.setAttribute("role", "img"); p.setAttribute("aria-label", etiket);
  };

  let son: { k: Kalem; s: NonNullable<ReturnType<typeof siralaDonem>> } | null = null;
  async function ciz() {
    const d = durum, k = katalog.find((x) => x.id === d.g)!;
    gSec.value = d.g;
    (document.getElementById("k-gosterge-bag") as HTMLAnchorElement).href = `/gosterge/${d.g}`;
    durumP.textContent = "Yükleniyor…";
    let v: Veri;
    try { v = await yukle(d.g); } catch (e) {
      if (d !== durum) return;
      son = null; delete cikti.dataset.bekle;
      durumP.textContent = `Veri yüklenemedi (${(e as Error).message}).`;
      cikti.replaceChildren(bildirim("Emsal verisi alınamadı. Bağlantınızı kontrol edip yeniden deneyin; seçimleriniz korunur.", dugme("Yeniden dene", () => ciz())));
      return;
    }
    if (d !== durum) return;
    // Bu göstergede verisi hiç olmayan ülkeler seçilemez; kullanıcının çıkardıkları süzülür.
    kutular.forEach((u) => { const var_ = !!v.ulkeler[u.value]?.length; u.disabled = !var_; u.checked = var_ && !d.x.includes(u.value); u.closest("label")!.title = var_ ? "" : "Bu göstergede verisi yok"; });
    const ulkeler = Object.fromEntries(Object.entries(v.ulkeler).filter(([u]) => u === "EUU" || !d.x.includes(u)));
    const donemler = uygunDonemler(v.tr, ulkeler);
    dSec.replaceChildren(...donemler.map((x) => el("option", { value: x, textContent: donemAdi(x) })));
    dSec.disabled = !donemler.length;
    cikti.replaceChildren(); delete cikti.dataset.bekle;
    const sayiUlke = Object.keys(ulkeler).filter((u) => u !== "EUU").length;
    if (!donemler.length) {
      son = null;
      durumP.textContent = `${k.baslik}: karşılaştırılabilir dönem yok.`;
      cikti.append(bildirim(`Seçili ${sayiUlke} ülkeyle hiçbir dönemde Türkiye'nin değeri ve en az ${esik(sayiUlke)} ülkenin değeri birlikte yok. Daha fazla ülke seçin.`,
        dugme("Bütün ülkeleri seç", () => yerlestir({ x: [] }))));
      return;
    }
    const donem = donemler.includes(d.d) ? d.d : donemler[0];
    dSec.value = donem;
    enYeni = donemler[0];
    if (donem !== d.d) durum = { ...d, d: donem };
    history.replaceState(null, "", hashMetni(durum) || location.pathname);
    const s = siralaDonem(v.tr, ulkeler, donem)!;
    son = { k, s };
    const trV = s.satirlar.find((r) => r.kod === "TUR")!.v, trSon = v.tr.at(-1)!;
    const y = (x: number) => yaz(k.birim, x);
    durumP.textContent = `${k.baslik} · ${donemAdi(donem)} · ${s.toplam} ülke · kaynak ${k.kaynak}` +
      (tarihselKiyas(trSon.donem, donem) ? " · Tarihsel karşılaştırma" : "");

    // 1) Sıralı çubuklar
    const cumle = `${donemAdi(donem)}: Türkiye ${y(trV)}, yüksekten düşüğe ${s.toplam} ülke içinde ${s.sira}. sırada; emsal medyanı ${y(s.medyan)}` +
      (s.toplamlar.length ? `; ${s.toplamlar.map((t) => `${ad(t.kod)} ${y(t.v)}`).join(", ")}` : "") + "." +
      (s.eksik.length ? ` Bu dönemde verisi olmayan: ${s.eksik.map(ad).join(", ")}.` : "") +
      (trSon.donem !== donem ? ` Türkiye'nin en son verisi ${donemAdi(trSon.donem)}: ${y(trSon.v)}.` : "");
    const tuval1 = el("div", { className: "k-tuval" });
    const tablo = el("table", {},
      el("caption", { textContent: `${k.baslik} · ${donemAdi(donem)}` }),
      el("thead", {}, el("tr", {}, ...["Sıra", "Ülke", "Değer"].map((x) => el("th", { scope: "col", textContent: x })))),
      el("tbody", {}, ...s.satirlar.map((r, i) => el("tr", {}, el("td", { textContent: String(i + 1) }),
        el("th", { scope: "row", textContent: ad(r.kod) }), el("td", { textContent: y(r.v) })))));
    const veriTablosu = el("details", {}, el("summary", { textContent: "Sıralama tablosunu aç" }), tablo);
    cikti.append(el("section", { className: "k-panel" }, el("h2", { textContent: "Sıralama" }), el("p", { className: "k-cumle", textContent: cumle }), tuval1,
      el("p", { className: "g-not", textContent: `Seçili emsallerin ${s.toplam - 1}/${sayiUlke} tanesi bu dönemde mevcut. Kesikli çizgi emsal medyanı (Türkiye hariç)${s.toplamlar.length ? ", noktalı çizgi AB-27 (sıraya girmez)" : ""}. Kaynak kodu: ${v.kaynakKod}.` }), veriTablosu));
    const satirlar = s.satirlar.map((r) => ({ ...r, ad: ad(r.kod), tr: r.kod === "TUR" }));
    const gen1 = tuval1.clientWidth || 800;
    const p1 = Plot.plot({
      width: gen1, height: 34 * satirlar.length + 40, marginLeft: 104, marginRight: 64,
      style: { background: "transparent", color: "var(--soluk)", fontSize: "12px" },
      x: { grid: true, label: null, tickFormat: (x: number) => yaz(k.birim, x, "eksen"), ticks: Math.max(3, Math.floor(gen1 / 140)) },
      y: { label: null, domain: satirlar.map((r) => r.ad) },
      marks: [
        // Türkiye vurgu renginde; emsaller nötr gri (değer etiketi her çubukta, renk tek taşıyıcı değil).
        Plot.barX(satirlar.filter((r) => !r.tr), { x: "v", y: "ad", fill: "var(--soluk)", fillOpacity: 0.5, insetTop: 5, insetBottom: 5 }),
        Plot.barX(satirlar.filter((r) => r.tr), { x: "v", y: "ad", fill: "var(--dv-1)", insetTop: 5, insetBottom: 5 }),
        Plot.ruleX([0], { stroke: "var(--soluk)" }),
        Plot.ruleX([s.medyan], { stroke: "var(--metin)", strokeDasharray: "5 3", strokeWidth: 1.5 }),
        ...s.toplamlar.map((t) => Plot.ruleX([t.v], { stroke: "var(--metin)", strokeDasharray: "1 3", strokeWidth: 1.5 })),
        // fontWeight, dx ve textAnchor Plot'ta sabit seçenek (kanal değil): vurgu ve işarete göre dört katman.
        ...[false, true].flatMap((vurgu) => [false, true].map((neg) => Plot.text(satirlar.filter((r) => r.tr === vurgu && (r.v < 0) === neg), {
          x: "v", y: "ad", text: (r: { v: number }) => yaz(k.birim, r.v, "hucre"), fill: "var(--metin)", fontWeight: vurgu ? 700 : 400, stroke: "var(--yuzey)", strokeWidth: 4, paintOrder: "stroke",
          dx: neg ? -6 : 6, textAnchor: neg ? "end" : "start" }))),
      ],
    });
    etiketle(p1, `${k.baslik}, ${donemAdi(donem)}: ${satirlar.map((r) => `${r.ad} ${y(r.v)}`).join(", ")}. Emsal medyanı ${y(s.medyan)}.`);
    tuval1.append(p1);

    // 2) Zaman içinde: Türkiye ve emsal medyanı, en düşük–en yüksek bandı
    const ms = medyanSerisi(v.tr, ulkeler);
    if (ms.length >= 2) {
      const ilk = ms[0].donem, trS = v.tr.filter((p) => p.donem >= ilk);
      const tuval2 = el("div", { className: "k-tuval" });
      const lejant = el("ul", { className: "k-lejant" },
        el("li", {}, el("span", { className: "k-ornek", style: "background: var(--dv-1)" } as Partial<HTMLSpanElement>), "Türkiye"),
        el("li", {}, el("span", { className: "k-ornek kesik" }), "Emsal medyanı"),
        el("li", {}, el("span", { className: "k-ornek bant", style: "background: var(--soluk)" } as Partial<HTMLSpanElement>), "Emsallerin en düşüğü – en yükseği"));
      cikti.append(el("section", { className: "k-panel" }, el("h2", { textContent: "Zaman içinde" }), lejant, tuval2,
        el("p", { className: "g-not", textContent: `Yalnız karşılaştırılabilir dönemler (Türkiye'nin değeri ve emsallerin en az %60'ı). Medyan ve bant Türkiye'yi içermez; seçili ülkelerle hesaplanır.` })));
      const gen2 = tuval2.clientWidth || 800;
      const msT = ms.map((m) => ({ ...m, t: tarih(m.donem) })), trT = trS.map((p) => ({ ...p, t: tarih(p.donem) }));
      const medyanOf = new Map(ms.map((m) => [m.donem, m.medyan]));
      const p2 = Plot.plot({
        width: gen2, height: gen2 < 520 ? 230 : 280, marginLeft: 56, marginRight: 12,
        style: { background: "transparent", color: "var(--soluk)", fontSize: "12px" },
        x: { type: "utc", label: null, ticks: Math.max(3, Math.floor(gen2 / 110)) },
        y: { grid: true, nice: true, label: null, tickFormat: (x: number) => yaz(k.birim, x, "eksen") },
        marks: [
          Plot.areaY(msT, { x: "t", y1: "lo", y2: "hi", fill: "var(--soluk)", fillOpacity: 0.14 }),
          Plot.lineY(msT, { x: "t", y: "medyan", stroke: "var(--metin)", strokeDasharray: "5 3", strokeWidth: 1.5 }),
          Plot.lineY(trT, { x: "t", y: "v", stroke: "var(--dv-1)", strokeWidth: 2.2 }),
          Plot.ruleX(trT, Plot.pointerX({ x: "t", stroke: "var(--soluk)", strokeDasharray: "3 3" })),
          Plot.tip(trT, Plot.pointerX({ x: "t", y: "v", title: (p: { donem: string; v: number }) =>
            `${donemAdi(p.donem)}\nTürkiye: ${y(p.v)}${medyanOf.has(p.donem) ? `\nEmsal medyanı: ${y(medyanOf.get(p.donem)!)}` : ""}` })),
        ],
      });
      etiketle(p2, `${k.baslik}: Türkiye ve emsal medyanı, ${donemAdi(ms[0].donem)}–${donemAdi(ms.at(-1)!.donem)}. Son karşılaştırılabilir dönemde Türkiye ${y(trV)}, medyan ${y(s.medyan)}.`);
      tuval2.append(p2);
    }
  }

  gSec.addEventListener("change", () => yerlestir({ g: gSec.value, d: "" }));
  dSec.addEventListener("change", () => yerlestir({ d: dSec.value }));
  kutular.forEach((u) => u.addEventListener("change", () => yerlestir({ x: kutular.filter((x) => !x.checked && !x.disabled).map((x) => x.value) })));
  form.addEventListener("submit", (e) => e.preventDefault());
  const adrestenKur = () => { const y = oku(); if (hashMetni(y) === hashMetni(durum)) return; durum = y; ciz(); };
  addEventListener("popstate", adrestenKur);
  addEventListener("hashchange", adrestenKur);
  document.getElementById("k-csv")!.addEventListener("click", () => {
    if (!son) { durumP.textContent = "İndirilecek karşılaştırma yok."; return; }
    if (!son.k.indir) { durumP.textContent = "Bu göstergenin kaynağı indirmeye izin vermiyor."; return; }
    const sat = ["ulke_kodu,ulke,donem,deger,sira", ...son.s.satirlar.map((r, i) => `${r.kod},${ad(r.kod)},${son!.s.donem},${sayi(r.v)},${i + 1}`),
      ...son.s.toplamlar.map((t) => `${t.kod},${ad(t.kod)},${son!.s.donem},${sayi(t.v)},`), `MEDYAN,emsal medyanı (Türkiye hariç; bu sitenin hesabı),${son.s.donem},${sayi(son.s.medyan)},`];
    const a = el("a", { href: URL.createObjectURL(new Blob([sat.join("\n") + "\n"], { type: "text/csv;charset=utf-8" })), download: `karsilastirma-${son.k.id}-${son.s.donem}.csv` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  document.getElementById("k-bagla")!.addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}${hashMetni(durum)}`;
    try { await navigator.clipboard.writeText(url); durumP.textContent = "Bağlantı kopyalandı."; } catch { durumP.textContent = `Kopyalanamadı; bağlantı: ${url}`; }
  });
  let zaman = 0;
  addEventListener("resize", () => { clearTimeout(zaman); zaman = window.setTimeout(ciz, 200); });
  ciz();
}
