// API deneme aracı: uç nokta seç, aynı kökenden iste, yanıtı biçimle. Sunucu yok; durum tutulmaz.
const SATIR = 400;                                   // ekranda en çok bu kadar satır (kopyalama tamamını alır)

const form = document.getElementById("dene") as HTMLFormElement | null;
if (form) kur(form);

function kur(form: HTMLFormElement) {
  const secenek = JSON.parse(form.dataset.secenek!) as Record<"seri" | "csv" | "emsal", [string, string][]>;
  const uc = document.getElementById("d-uc") as HTMLSelectElement, id = document.getElementById("d-id") as HTMLSelectElement;
  const siklik = document.getElementById("d-siklik") as HTMLSelectElement;
  const idAlan = document.getElementById("d-id-alan")!, sAlan = document.getElementById("d-siklik-alan")!;
  const adres = document.getElementById("d-adres")!, durum = document.getElementById("d-durum")!;
  const yanit = document.getElementById("d-yanit")!, kod = yanit.querySelector("code")!, kopyala = document.getElementById("d-kopyala") as HTMLButtonElement;
  let tam = "";

  const liste = () => (uc.value.includes("/emsal/") ? secenek.emsal : uc.value.endsWith(".csv") && uc.value.includes("/seri/") ? secenek.csv : secenek.seri);
  const yol = () => uc.value.replace("{id}", id.value).replace("{siklik}", siklik.value);
  const guncelle = () => {
    const idli = uc.value.includes("{id}");
    idAlan.hidden = !idli; sAlan.hidden = !uc.value.includes("{siklik}");
    if (idli) {
      const onceki = id.value, l = liste();
      id.replaceChildren(...l.map(([v, a]) => Object.assign(document.createElement("option"), { value: v, textContent: a })));
      id.value = l.some(([v]) => v === onceki) ? onceki : l[0][0];
    }
    adres.textContent = location.origin + yol();
  };
  uc.addEventListener("change", guncelle);
  id.addEventListener("change", guncelle);
  siklik.addEventListener("change", guncelle);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = yol(), t0 = performance.now();
    durum.textContent = "İstek gönderildi…";
    kopyala.disabled = true; tam = "";
    try {
      const r = await fetch(u);
      const metin = await r.text(), ms = Math.round(performance.now() - t0);
      const tur = r.headers.get("content-type") ?? "";
      let goster = metin;
      if (tur.includes("json")) { try { goster = JSON.stringify(JSON.parse(metin), null, 2); } catch { /* ham göster */ } }
      tam = goster;
      const satir = goster.split("\n");
      kod.textContent = satir.length > SATIR ? `${satir.slice(0, SATIR).join("\n")}\n… (${satir.length - SATIR} satır daha; tamamı için "Yanıtı kopyala" ya da adresi açın)` : goster;
      yanit.hidden = false; kopyala.disabled = !r.ok;
      durum.textContent = `HTTP ${r.status} · ${(metin.length / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} KB · ${ms} ms · ${tur.split(";")[0] || "tür bilinmiyor"}` +
        (r.ok ? "" : " — bu adreste dosya yok (seri API izni olmayabilir ya da kimlik yanlış).");
    } catch (h) {
      yanit.hidden = true;
      durum.textContent = `İstek başarısız: ${(h as Error).message}. Bağlantınızı kontrol edip yeniden deneyin.`;
    }
  });
  kopyala.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(tam); durum.textContent += " · kopyalandı"; }
    catch { durum.textContent = "Kopyalanamadı; yanıt alanını seçip kopyalayın."; }
  });
  guncelle();
}
