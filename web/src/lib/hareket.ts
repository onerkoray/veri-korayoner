// Grafik hareketi: korayoner.dev/grafikler'deki desen (ana sitenin AGENTS.md bölüm 5).
//  - Grafik görünür alana girince çizgiler soldan sağa çizilir; noktalar çizgi
//    bitince belirir. Tek serili gösterge grafiğinde çizginin ucunda değeri sayan
//    bir izci yürür ve sonunda gerçek değere oturup kaybolur.
//  - Dinlenme hâli tam çizimdir: gizleme yalnız bu modül kurar, JS yoksa ya da
//    "hareketi azalt" açıksa grafik ilk karede eksiksizdir.
//  - Deterministik: aynı sayfa her açılışta aynı kareleri çizer, rastgelelik yok.
//  - Taşma yok: çizgi değerinden öteye gitmez, nokta büyüyüp küçülmez.
//  - Okurun yaptığı yeniden çizim (dönem düğmesi, gezginde seçim) yeniden oynar;
//    pencere boyutu değişince oynamaz.
// Grafik betikleri ayrıca bir şey çağırmak zorunda değil: yeni SVG'ler bir
// gözlemciyle bulunur. Değer sayan izci isteyen grafik izciTanimla() çağırır.

export interface Izci { ters: (py: number) => number; bicim: (v: number) => string; yol?: (svg: SVGSVGElement) => SVGPathElement | null }

const izciler = new WeakMap<SVGSVGElement, Izci>();
export function izciTanimla(svg: SVGSVGElement, iz: Izci) { izciler.set(svg, iz); }

const azHareket = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const SVGNS = "http://www.w3.org/2000/svg";
const yumusak = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

let sonBoyut = 0;
const goruldu = new WeakSet<Element>();       // içinde bir çizim oynamış kaplar
const bekleyen = new WeakSet<SVGSVGElement>(); // hazırlanıp görünmeyi bekleyenler

/* Çizgi: dolgusuz, kesiksiz ve en az üç köşeli yol. Izgara ve eksen çentikleri
   tek doğrudur (M…L…), ipucu kutusu dolguludur; ikisi de elenir. */
/* Sınıflama SVG başına bir kez yapılır: hazırlık çizgilere satır içi
   stroke-dasharray yazdığı için sonradan bakan onları "kesikli" sanardı. */
const parcalar = new WeakMap<SVGSVGElement, { duz: SVGPathElement[]; kesik: SVGPathElement[] }>();
function parca(svg: SVGSVGElement) {
  let p = parcalar.get(svg);
  if (p) return p;
  p = { duz: [], kesik: [] };
  for (const y of svg.querySelectorAll<SVGPathElement>("path")) {
    const s = getComputedStyle(y);
    if (s.fill !== "none" || s.stroke === "none") continue;
    if (((y.getAttribute("d") || "").match(/[LC]/g) || []).length < 2) continue;
    if (s.strokeDasharray !== "none") p.kesik.push(y);
    else if (y.getTotalLength() > 30) p.duz.push(y);
  }
  parcalar.set(svg, p);
  return p;
}
const cizgiler = (svg: SVGSVGElement) => parca(svg).duz;
const kesikliler = (svg: SVGSVGElement) => parca(svg).kesik;
const noktalar = (svg: SVGSVGElement) => [...svg.querySelectorAll<SVGCircleElement>("circle")];

function grafikMi(svg: SVGSVGElement): boolean {
  if (svg.closest(".tema-dugme, .konum, button")) return false;
  const b = svg.getBoundingClientRect();
  return b.width >= 100 && cizgiler(svg).length > 0;
}
const gorunurMu = (el: Element) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.top < innerHeight * 0.92 && b.bottom > innerHeight * 0.08; };

function hazirla(svg: SVGSVGElement) {
  for (const p of cizgiler(svg)) { const L = p.getTotalLength(); p.style.strokeDasharray = `${L} ${L}`; p.style.strokeDashoffset = String(L); }
  for (const el of [...kesikliler(svg), ...noktalar(svg)]) el.style.opacity = "0";
  bekleyen.add(svg);
}

function oynat(svg: SVGSVGElement, sure = 1300) {
  bekleyen.delete(svg);
  const kap = svg.parentElement; if (kap) goruldu.add(kap);
  const yollar = cizgiler(svg), boy = yollar.map((p) => p.getTotalLength());
  const sonra = [...kesikliler(svg), ...noktalar(svg)];
  for (const el of sonra) el.style.opacity = "0";
  const iz = izciler.get(svg);
  const izYol = iz ? (iz.yol?.(svg) ?? yollar[boy.indexOf(Math.max(...boy))]) : null;
  let izG: SVGGElement | null = null, izMetin: SVGTextElement | null = null;
  if (iz && izYol) {
    izG = document.createElementNS(SVGNS, "g") as SVGGElement;
    izG.setAttribute("class", "izci"); izG.setAttribute("aria-hidden", "true");
    izG.innerHTML = '<circle class="izci-hale" r="9"/><circle r="4"/><text dy="-13" text-anchor="middle"></text>';
    svg.appendChild(izG);
    izMetin = izG.querySelector("text");
  }
  const izBoy = izYol ? izYol.getTotalLength() : 0;
  let bas: number | null = null;
  const kare = (z: number) => {
    if (bas === null) bas = z;
    const t = Math.min(1, (z - bas) / sure), e = yumusak(t);
    yollar.forEach((p, i) => { p.style.strokeDasharray = `${boy[i]} ${boy[i]}`; p.style.strokeDashoffset = String(boy[i] * (1 - e)); });
    if (izG && izYol && iz) {
      const n = izYol.getPointAtLength(izBoy * e);
      izG.setAttribute("transform", `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`);
      if (izMetin) izMetin.textContent = iz.bicim(iz.ters(n.y));
    }
    if (t < 1) { requestAnimationFrame(kare); return; }
    yollar.forEach((p) => { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; });
    for (const el of sonra) { el.style.transition = "opacity .35s ease"; el.style.opacity = ""; }
    if (izG) {
      const g = izG;
      g.style.transition = "opacity .5s ease .7s"; g.style.opacity = "0";
      setTimeout(() => g.remove(), 1400);
    }
  };
  requestAnimationFrame(kare);
}

const gozcu = typeof IntersectionObserver === "function" ? new IntersectionObserver((g) => {
  for (const x of g) {
    if (!x.isIntersecting) continue;
    gozcu!.unobserve(x.target);
    if (bekleyen.has(x.target as SVGSVGElement)) oynat(x.target as SVGSVGElement);
  }
}, { threshold: 0.3 }) : null;

function ele(svg: SVGSVGElement) {
  if (!svg.isConnected || bekleyen.has(svg) || !grafikMi(svg)) return;
  const kap = svg.parentElement;
  if (performance.now() - sonBoyut < 600) return;           // boyut değişimi: oynatma
  if (kap && goruldu.has(kap)) { if (gorunurMu(svg)) oynat(svg, 900); return; } // okurun yeniden çizimi
  if (gorunurMu(svg)) { oynat(svg); return; }
  if (!gozcu) return;
  hazirla(svg);
  gozcu.observe(svg);
}

export function grafikHareketi() {
  if (azHareket()) return;
  addEventListener("resize", () => { sonBoyut = performance.now(); }, { passive: true });
  const tara = (kok: ParentNode) => kok.querySelectorAll<SVGSVGElement>("main svg").forEach(ele);
  /* Grafik betikleri aynı turda çiziyor; bir kare beklemek, statik SVG'nin
     Plot adasıyla değişmesini görmeden yanlış SVG'yi hazırlamayı önler. */
  requestAnimationFrame(() => tara(document));
  new MutationObserver((kayitlar) => {
    for (const k of kayitlar) for (const n of k.addedNodes) {
      if (n instanceof SVGSVGElement && !n.ownerSVGElement) requestAnimationFrame(() => ele(n));
      else if (n instanceof HTMLElement) n.querySelectorAll<SVGSVGElement>("svg").forEach((s) => { if (!s.ownerSVGElement) requestAnimationFrame(() => ele(s)); });
    }
  }).observe(document.querySelector("main") ?? document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Konum şeridi: uzun sayfada neredeyiz? Altta sabit şerit: bölüm sırası ve adı,
// önceki/sonraki bölüm, başa dön, içindekiler ve ilerleme çubuğu. JS yoksa
// sayfa olduğu gibi kalır. Bölümler sayfanın görünür h2'leridir. Adres çubuğuna
// dokunmaz: gezgin durumunu # içinde tutar, şerit kaydırmayla gezer.

export function konumSeridi() {
  const main = document.querySelector("main");
  if (!main) return;
  const bolumler = [...main.querySelectorAll<HTMLHeadingElement>("h2")]
    .filter((h) => !h.closest("[hidden], .gizli, dialog") && !h.classList.contains("gizli") && h.textContent!.trim());
  const yumusakKaydir = (y: number) => scrollTo({ top: y, behavior: azHareket() ? "auto" : "smooth" });
  const ustBosluk = () => 16;                      // başlık yapışkan değil: yalnız nefes payı
  const git = (h: HTMLElement) => yumusakKaydir(h.getBoundingClientRect().top + scrollY - ustBosluk());

  const nav = document.createElement("nav");
  nav.className = "konum"; nav.inert = true; nav.setAttribute("aria-label", "Sayfada konum");
  const iki = (n: number) => String(n).padStart(2, "0");
  const cok = bolumler.length >= 2;
  nav.innerHTML = `
    <div class="konum-ic">
      <button type="button" class="konum-dugme konum-ust" aria-label="Sayfanın başına dön" title="Başa dön">↑</button>
      ${cok ? `<button type="button" class="konum-dugme konum-onceki" aria-label="Önceki bölüm">‹</button>
      <button type="button" class="konum-ad" aria-label="İçindekiler" aria-expanded="false" aria-controls="konum-liste"><span class="konum-sira"></span><span class="konum-baslik">Giriş</span><span class="konum-satir"></span></button>
      <button type="button" class="konum-dugme konum-sonraki" aria-label="Sonraki bölüm">›</button>` : `<span class="konum-yuzde" aria-live="off"></span><span class="konum-satir"></span>`}
      <span class="konum-cubuk" aria-hidden="true"><i></i></span>
    </div>
    ${cok ? `<ol class="konum-liste" id="konum-liste" hidden>${bolumler.map((h, i) => `<li><button type="button" data-i="${i}"><span>${iki(i + 1)}</span>${h.textContent!.trim().replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))}</button></li>`).join("")}</ol>` : ""}`;
  document.body.appendChild(nav);
  const sira = nav.querySelector<HTMLElement>(".konum-sira"), baslik = nav.querySelector<HTMLElement>(".konum-baslik");
  const ad = nav.querySelector<HTMLButtonElement>(".konum-ad"), liste = nav.querySelector<HTMLOListElement>(".konum-liste");
  const yuzde = nav.querySelector<HTMLElement>(".konum-yuzde"), cubuk = nav.querySelector<HTMLElement>(".konum-cubuk i")!;
  const satirYeri = nav.querySelector<HTMLElement>(".konum-satir")!;
  let etkin = -1;

  const listeAc = (ac: boolean) => { if (!liste || !ad) return; liste.hidden = !ac; ad.setAttribute("aria-expanded", String(ac)); };
  nav.querySelector(".konum-ust")!.addEventListener("click", () => { listeAc(false); yumusakKaydir(0); });
  nav.querySelector(".konum-onceki")?.addEventListener("click", () => {
    const h = bolumler[etkin > 0 ? etkin - 1 : -1];
    if (h) git(h); else yumusakKaydir(0);
  });
  nav.querySelector(".konum-sonraki")?.addEventListener("click", () => { const h = bolumler[Math.min(bolumler.length - 1, etkin + 1)]; if (h) git(h); });
  ad?.addEventListener("click", () => listeAc(liste!.hidden));
  liste?.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-i]");
    if (!b) return;
    listeAc(false); git(bolumler[Number(b.dataset.i)]);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && liste && !liste.hidden) { listeAc(false); ad?.focus(); } });
  document.addEventListener("click", (e) => { if (liste && !liste.hidden && !nav.contains(e.target as Node)) listeAc(false); });

  /* Etkin bölüm konumdan hesaplanır (ana sitedeki şeridin dersi: gözlemci hızlı
     kaydırmada aradaki bölümleri kaçırabiliyor). */
  let bekliyor = false;
  const guncelle = () => {
    bekliyor = false;
    const uzun = document.documentElement.scrollHeight;
    const yeterli = uzun > innerHeight * 2.2;
    const acik = yeterli && scrollY > innerHeight * 0.5;
    nav.inert = !acik;
    nav.classList.toggle("konum--acik", acik);
    const oran = Math.max(0, Math.min(1, scrollY / Math.max(1, uzun - innerHeight)));
    cubuk.style.transform = `scaleX(${oran.toFixed(3)})`;
    if (yuzde) yuzde.textContent = `%${Math.round(oran * 100)}`;
    const cizgi = innerHeight * 0.4;
    /* Uzun tabloda hangi satırdayız: okuma çizgisinin altındaki satırın ilk
       hücresi (gözlem tablosunda dönem, gezginde yıl). Sonradan çizilen
       tablolarda da çalışsın diye her seferinde noktadan bulunur. */
    const altta = document.elementFromPoint(innerWidth / 2, cizgi);
    const tr = altta?.closest("main tbody tr") as HTMLTableRowElement | null;
    const ilk = tr?.cells[0]?.textContent?.trim() ?? "";
    satirYeri.textContent = ilk && ilk.length <= 24 ? ` · ${ilk}` : "";
    if (!cok) return;
    let i = -1;
    bolumler.forEach((h, j) => { if (h.getBoundingClientRect().top <= cizgi) i = j; });
    if (i === etkin) return;
    etkin = i;
    sira!.textContent = i < 0 ? `00/${iki(bolumler.length)}` : `${iki(i + 1)}/${iki(bolumler.length)}`;
    baslik!.textContent = i < 0 ? "Giriş" : bolumler[i].textContent!.trim();
    ad?.setAttribute("aria-label", `İçindekiler · ${baslik!.textContent}`);
    liste!.querySelectorAll("button").forEach((b, j) => { if (j === i) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
  };
  addEventListener("scroll", () => { if (!bekliyor) { bekliyor = true; requestAnimationFrame(guncelle); } }, { passive: true });
  addEventListener("resize", () => { if (!bekliyor) { bekliyor = true; requestAnimationFrame(guncelle); } }, { passive: true });
  guncelle();
}
