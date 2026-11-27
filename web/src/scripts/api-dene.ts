import { eslesir } from "../lib/gezgin-cekirdek.ts";

// API deneme aracı: uç nokta seç, aynı kökenden iste, yanıtı biçimle. Sunucu yok; durum tutulmaz.
const SATIR = 400;
const AZAMI_YANIT = 2 * 1024 * 1024;
const ISTEK_SURESI = 12_000;
const UCLAR = /^\/api\/v1\/(?:manifest\.json|seriler\.json|kaynaklar\.json|durum\.json|degisiklikler\.json|sema\/seri\.json|seri\/[a-z0-9-]+\.(?:json|csv)|emsal\/[a-z0-9-]+\.json|panel\/(?:aylik|ceyreklik|yillik)\.(?:json|csv))$/;

async function oku(yanit: Response): Promise<{ metin: string; bayt: number }> {
  if (Number(yanit.headers.get("Content-Length")) > AZAMI_YANIT) {
    await yanit.body?.cancel();
    throw new Error("Yanıt önizleme sınırını aşıyor. Uç noktayı doğrudan açın.");
  }
  const okuyucu = yanit.body?.getReader();
  if (!okuyucu) return { metin: "", bayt: 0 };
  const decoder = new TextDecoder();
  let metin = "", bayt = 0;
  try {
    while (true) {
      const { done, value } = await okuyucu.read();
      if (done) break;
      bayt += value.byteLength;
      if (bayt > AZAMI_YANIT) {
        await okuyucu.cancel();
        throw new Error("Yanıt önizleme sınırını aşıyor. Uç noktayı doğrudan açın.");
      }
      metin += decoder.decode(value, { stream: true });
    }
    return { metin: metin + decoder.decode(), bayt };
  } finally {
    okuyucu.releaseLock();
  }
}

const form = document.getElementById("dene") as HTMLFormElement | null;
if (form) kur(form);

function kur(form: HTMLFormElement) {
  const secenek = JSON.parse(form.dataset.secenek!) as Record<"seri" | "csv" | "emsal", [string, string][]>;
  const uc = document.getElementById("d-uc") as HTMLSelectElement, id = document.getElementById("d-id") as HTMLSelectElement;
  const siklik = document.getElementById("d-siklik") as HTMLSelectElement;
  const idAlan = document.getElementById("d-id-alan")!, sAlan = document.getElementById("d-siklik-alan")!;
  const adres = document.getElementById("d-adres")!, durum = document.getElementById("d-durum")!;
  const yanit = document.getElementById("d-yanit")!, kod = yanit.querySelector("code")!, kopyala = document.getElementById("d-kopyala") as HTMLButtonElement;
  const ac = document.getElementById("d-ac") as HTMLAnchorElement;
  const curl = document.getElementById("d-curl") as HTMLButtonElement;
  const gonder = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  let tam = "", etkin: AbortController | null = null;

  const filtre = document.getElementById("k-filtreler")!;
  const ara = document.getElementById("k-ara") as HTMLInputElement;
  const kurum = document.getElementById("k-kurum") as HTMLSelectElement;
  const sik = document.getElementById("k-siklik") as HTMLSelectElement;
  const listeDurumu = document.getElementById("k-sonuc")!;
  const bos = document.getElementById("k-bos")!;
  const satirlar = [...document.querySelectorAll<HTMLElement>("[data-k-seri]")];
  const suz = () => {
    let n = 0;
    for (const sat of satirlar) {
      const secili = (!kurum.value || kurum.value === sat.dataset.kKurum)
        && (!sik.value || sik.value === sat.dataset.kSiklik)
        && eslesir(sat.dataset.kAra ?? "", ara.value);
      sat.hidden = !secili;
      if (secili) n++;
    }
    bos.hidden = n > 0;
    listeDurumu.textContent = `${n} / ${satirlar.length} seri`;
  };
  ara.addEventListener("input", suz);
  kurum.addEventListener("change", suz);
  sik.addEventListener("change", suz);
  filtre.hidden = false;
  listeDurumu.hidden = false;
  suz();

  const liste = () => (uc.value.includes("/emsal/") ? secenek.emsal : uc.value.endsWith(".csv") && uc.value.includes("/seri/") ? secenek.csv : secenek.seri);
  const yol = () => uc.value.replace("{id}", id.value).replace("{siklik}", siklik.value);
  const guncelle = () => {
    etkin?.abort(); etkin = null;
    yanit.hidden = true; kopyala.disabled = true; tam = ""; durum.textContent = "";
    const idli = uc.value.includes("{id}");
    idAlan.hidden = !idli; sAlan.hidden = !uc.value.includes("{siklik}");
    if (idli) {
      const onceki = id.value, l = liste();
      id.replaceChildren(...l.map(([v, a]) => Object.assign(document.createElement("option"), { value: v, textContent: a })));
      id.value = l.some(([v]) => v === onceki) ? onceki : l[0]?.[0] ?? "";
    }
    const eksik = !UCLAR.test(yol());
    gonder.disabled = eksik; curl.disabled = eksik; ac.hidden = eksik;
    if (eksik) ac.removeAttribute("href");
    else ac.href = yol();
    adres.textContent = eksik ? "Bu uç nokta için uygun seri yok." : location.origin + yol();
  };
  uc.addEventListener("change", guncelle);
  id.addEventListener("change", guncelle);
  siklik.addEventListener("change", guncelle);

  document.querySelectorAll<HTMLButtonElement>("[data-k-dene]").forEach((b) => {
    b.dataset.hazir = "";
    b.addEventListener("click", () => {
      uc.value = "/api/v1/seri/{id}.json";
      guncelle();
      id.value = b.dataset.kDene!;
      guncelle();
      document.getElementById("deneyin")?.focus();
    });
  });
  curl.addEventListener("click", async () => {
    if (!UCLAR.test(yol())) return;
    const komut = `curl -fsS "${location.origin + yol()}"`;
    try { await navigator.clipboard.writeText(komut); durum.textContent = "curl komutu kopyalandı."; }
    catch { durum.textContent = komut; }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (gonder.disabled || !UCLAR.test(yol())) return;
    etkin?.abort();
    const istek = new AbortController();
    etkin = istek;
    const u = yol(), t0 = performance.now();
    durum.textContent = "İstek gönderildi…";
    kopyala.disabled = true; tam = ""; kod.textContent = ""; yanit.hidden = true;
    let zamanAsimi = false;
    const zaman = window.setTimeout(() => { zamanAsimi = true; istek.abort(); }, ISTEK_SURESI);
    try {
      const r = await fetch(u, { signal: istek.signal, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
      const { metin, bayt } = await oku(r);
      const ms = Math.round(performance.now() - t0);
      if (etkin !== istek) return;
      const tur = r.headers.get("content-type") ?? "";
      let goster = metin;
      if (tur.includes("json")) { try { goster = JSON.stringify(JSON.parse(metin), null, 2); } catch { /* ham göster */ } }
      tam = metin;
      const satir = goster.split("\n");
      kod.textContent = satir.length > SATIR ? `${satir.slice(0, SATIR).join("\n")}\n… (${satir.length - SATIR} satır daha; tamamı için "Yanıtı kopyala" ya da adresi açın)` : goster;
      yanit.hidden = false; kopyala.disabled = !r.ok;
      durum.textContent = `HTTP ${r.status} · ${(bayt / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} KiB · ${ms} ms · ${tur.split(";")[0] || "tür bilinmiyor"}` +
        (r.ok ? "" : " — bu adreste dosya yok (seri API izni olmayabilir ya da kimlik yanlış).");
    } catch (h) {
      if (etkin !== istek) return;
      yanit.hidden = true;
      durum.textContent = zamanAsimi ? "İstek 12 saniyede tamamlanmadı. Yeniden deneyin."
        : `İstek tamamlanamadı: ${(h as Error).message}`;
    } finally {
      window.clearTimeout(zaman);
      if (etkin === istek) etkin = null;
    }
  });
  kopyala.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(tam); durum.textContent += " · kopyalandı"; }
    catch { durum.textContent = "Kopyalanamadı; yanıt alanını seçip kopyalayın."; }
  });
  guncelle();
}
