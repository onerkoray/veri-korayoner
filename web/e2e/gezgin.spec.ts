// Veri gezgini uçtan uca: varsayılan görünüm, boş aralık, sıklık uygunluğu, başarısız
// istek ve yeniden deneme, klavye, grafik etkileşimi. Konsolda hata olmamalı.
import { test, expect, type Page } from "@playwright/test";

const GINI = "wb-si-pov-gini-tur", TUFE = "bis-tufe-yillik-tr";
function hataTopla(page: Page) {
  const hata: string[] = [];
  page.on("pageerror", (e) => hata.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") hata.push(m.text()); });
  return hata;
}

test("varsayılan görünüm üç grafik çizer", async ({ page }) => {
  const hata = hataTopla(page);
  await page.goto("/gezgin");
  await expect(page.locator(".g-tuval svg")).toHaveCount(3);
  await expect(page.locator("#g-durum")).toContainText("3 gösterge çiziliyor");
  expect(hata).toEqual([]);
});

test("boş aralık: anlamlı mesaj, geçersiz tarih yok, kapsama ayarlanır", async ({ page }) => {
  const hata = hataTopla(page);
  await page.goto(`/gezgin#g=${GINI}&s=yillik&d=ort&b=1961&e=1965&v=grafik`);
  const bos = page.locator(".g-bos");
  await expect(bos).toContainText("1961–1965 aralığında yıllık gözlem yok");
  await expect(bos).toContainText("1987–2023");
  await expect(page.locator(".g-tuval svg")).toHaveCount(0);
  for (const v of ["isi", "tablo"]) {
    await page.locator(`input[name="v"][value="${v}"]`).check({ force: true });
    await expect(bos).toBeVisible();
  }
  await bos.getByRole("button", { name: /Aralığı 1987–2023 yap/ }).click();
  await expect(page).toHaveURL(/b=1987&e=2023/);
  await expect(page.locator(".g-tablo")).toBeVisible();
  expect(hata).toEqual([]);
});

test("sıklık uygunluğu: yıllık seri aylık görünümde ortak sıklığa geçilir", async ({ page }) => {
  await page.goto(`/gezgin#g=${GINI},${TUFE}&s=aylik&d=ort&b=2010&e=2026&v=grafik`);
  await expect(page.locator(".g-tuval svg")).toHaveCount(1);
  const dugme = page.getByRole("button", { name: "Hepsini yıllık görünümde göster" });
  await dugme.click();
  await expect(page).toHaveURL(/s=yillik/);
  await expect(page.locator(".g-tuval svg")).toHaveCount(2);
});

test("başarısız istek önbellekte kalmaz; yeniden dene çalışır", async ({ page }) => {
  let ilk = true;
  await page.route("**/api/v1/panel/aylik.json", (r) => { if (ilk) { ilk = false; return r.fulfill({ status: 503, body: "" }); } return r.continue(); });
  await page.goto("/gezgin");
  await expect(page.locator("#g-durum")).toContainText("yüklenemedi (HTTP 503)");
  await page.getByRole("button", { name: "Yeniden dene" }).click();
  await expect(page.locator(".g-tuval svg")).toHaveCount(3);
});

test("klavye: arama, seçim ve görünüm değişimi", async ({ page }) => {
  await page.goto("/gezgin");
  await page.locator("#g-liste").evaluate((d: HTMLDetailsElement) => (d.open = true));
  await page.locator("#g-ara").fill("gini");
  await expect(page.locator("#g-ara-sonuc")).toContainText("1 gösterge eşleşti");
  await expect(page.locator(".g-sec:visible")).toHaveCount(1);
  await page.locator(`input[value="${GINI}"]`).focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(new RegExp(GINI));
  await page.locator('input[name="v"][value="tablo"]').focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".g-tablo")).toBeVisible();
  await page.locator("#g-ara").fill("bulunmayan-sozcuk");
  await expect(page.locator("#g-ara-sonuc")).toContainText("Eşleşen gösterge yok");
});

test("grafik üzerinde gezinme ipucu gösterir", async ({ page, isMobile }) => {
  test.skip(isMobile, "dokunmatikte üzerine gelme yok");
  await page.goto(`/gezgin#g=${TUFE}&s=yillik&d=ort&b=2000&e=2025&v=grafik`);
  const svg = page.locator(".g-tuval svg").first();
  await expect(svg).toBeVisible();
  await svg.scrollIntoViewIfNeeded();
  const k = (await svg.boundingBox())!;
  await page.mouse.move(k.x + k.width * 0.3, k.y + k.height / 2);
  await page.mouse.move(k.x + k.width * 0.6, k.y + k.height / 2, { steps: 8 });
  await expect(page.locator(".g-tuval svg g.g-ipucu").first()).toContainText(/20\d\d/);
  // axe: role'süz <g>'de aria-label olmaz; imleçle yeniden çizilen ipucu katmanı da etiketsiz kalmalı.
  await expect(page.locator(".g-tuval g[aria-label]")).toHaveCount(0);
});

for (const yol of ["/", "/gezgin", "/karsilastir", `/gosterge/${GINI}`, "/hesap/reel-politika-faizi", "/api", "/kaynaklar"]) {
  test(`yatay taşma yok: ${yol}`, async ({ page }) => {
    await page.goto(yol);
    await page.waitForLoadState("networkidle");
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw).toBeLessThanOrEqual(cw + 1);
  });
}

test.describe("Panorama", () => {
  test("KPI kartları ve ana grafik: aralık, seri aç/kapa, boş seçim", async ({ page }) => {
    const hata = hataTopla(page);
    await page.goto("/");
    await expect(page.locator(".kpi")).toHaveCount(6);
    const tuval = page.locator(".ana-tuval svg");
    await expect(tuval).toHaveCount(1);
    await expect(page.locator(".ana-durum")).toContainText("120 ay");
    await expect(page.locator(".ana-tuval g[aria-label]")).toHaveCount(0);   // axe: role'süz <g>'de aria-label olmaz
    await page.getByRole("button", { name: "1 yıl" }).click();
    await expect(page.locator(".ana-durum")).toContainText("12 ay");
    await expect(page).toHaveURL(/aralik=1/);
    for (const s of ["faiz", "enf", "reel"]) await page.locator(`.ana-seri button[data-seri="${s}"]`).click();
    await expect(page.locator(".ana-durum")).toContainText("en az bir seri");
    await expect(tuval).toHaveCount(0);
    await page.locator('.ana-seri button[data-seri="enf"]').click();
    await expect(page.locator(".ana-seri button[data-seri=\"enf\"]")).toHaveAttribute("aria-pressed", "true");
    await expect(tuval).toHaveCount(1);
    await page.reload();                                           // durum adresten geri kurulur
    await expect(page.locator('.ana-seri button[data-seri="faiz"]')).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('.ana-seri button[data-seri="enf"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "1 yıl" })).toHaveAttribute("aria-pressed", "true");
    // TÜFE'nin son ayı yeni kaynak verisiyle değişir. Seçim yeniden kurulduğunda
    // grafiğin yalnız TÜFE'yi gösterdiğini ve aralığın 12 ayı aşmadığını sına.
    await expect(tuval).toHaveAttribute("aria-label", /Yıllık TÜFE son:/);
    await expect(tuval).not.toHaveAttribute("aria-label", /Politika faizi son:|Reel faiz \(ex post\) son:/);
    await expect(page.locator(".ana-durum")).toContainText(/· (?:[1-9]|1[0-2]) ay$/);
    expect(hata).toEqual([]);
  });
});

test.describe("Gezgin 2", () => {
  const NUF = "wb-sp-pop-totl-tur", GSYH = "wb-ny-gdp-mktp-cd-tur";
  test("geri/ileri tuşları görünümler arasında gezer", async ({ page }) => {
    await page.goto(`/gezgin#g=${TUFE}&s=aylik&d=ort&b=2010&e=2026&v=grafik&o=deger`);
    await expect(page.locator(".g-tuval svg")).toHaveCount(1);
    await page.locator('input[name="v"][value="tablo"]').check({ force: true });
    await expect(page.locator(".g-tablo")).toBeVisible();
    await page.locator('input[name="s"][value="yillik"]').check({ force: true });
    await expect(page).toHaveURL(/s=yillik/);
    await page.goBack();
    await expect(page).toHaveURL(/gezgin#g=bis-tufe-yillik-tr&v=tablo$/);   // varsayılanlar (aylık, ortalama…) adrese yazılmaz
    await expect(page.locator('input[name="s"][value="aylik"]')).toBeChecked();
    await page.goBack();
    await expect(page.locator(".g-tuval svg")).toHaveCount(1);
    await page.goForward();
    await expect(page.locator(".g-tablo")).toBeVisible();
  });

  test("baz = 100: düzeyler tek eksende, oran serisi için yol gösterilir", async ({ page }) => {
    const hata = hataTopla(page);
    await page.goto(`/gezgin#g=${NUF},${GSYH},${TUFE}&s=yillik&d=ort&b=2000&e=2025&v=grafik&o=endeks`);
    await expect(page.locator(".g-ortak-bas")).toContainText("2000 = 100");
    await expect(page.locator(".g-lejant li")).toHaveCount(2);
    await expect(page.locator(".g-bos").first()).toContainText("uygun değil");
    await page.locator('input[name="v"][value="tablo"]').check({ force: true });
    await expect(page.locator(".g-tablo tbody tr").last()).toContainText("100,0");   // dönem azalan: son satır baz yılı
    expect(hata).toEqual([]);
  });

  test("fark ölçeği ve tablo sıralaması", async ({ page }) => {
    await page.goto(`/gezgin#g=${TUFE}&s=yillik&d=ort&b=2015&e=2025&v=tablo&o=fark`);
    await expect(page.locator(".g-tablo thead")).toContainText("fark, puan (baz 2015)");
    const sutun = page.locator(".g-tablo thead th").nth(1);
    await sutun.getByRole("button").click();
    await expect(sutun).toHaveAttribute("aria-sort", "descending");
    const ilk = await page.locator(".g-tablo tbody tr").first().locator("th").textContent();
    expect(ilk).toBe("2022");                                       // en yüksek enflasyon yılı
    await page.locator(".g-tablo thead th").nth(1).getByRole("button").click();
    await expect(page.locator(".g-tablo thead th").nth(1)).toHaveAttribute("aria-sort", "ascending");
  });

  test("kurum ve sıklık süzgeci listeyi daraltır", async ({ page }) => {
    await page.goto("/gezgin");
    await page.locator("#g-liste").evaluate((d: HTMLDetailsElement) => (d.open = true));
    await page.locator("#g-kurum").selectOption("ILO");
    await expect(page.locator(".g-sec:visible")).toHaveCount(6);
    await page.locator("#g-ssuz").selectOption("aylik");
    await expect(page.locator("#g-ara-sonuc")).toContainText("Eşleşen gösterge yok");
    await page.locator("#g-kurum").selectOption("");
    await expect(page.locator(".g-sec:visible").first()).toBeVisible();
    await expect(page).not.toHaveURL(/kurum/);                     // süzgeç adrese yazılmaz
  });
});

test.describe("Karşılaştırma", () => {
  test("varsayılan: sıralama ve zaman grafiği, erişilebilir svg", async ({ page }) => {
    const hata = hataTopla(page);
    await page.goto("/karsilastir");
    await expect(page.locator(".k-tuval svg")).toHaveCount(2);
    await expect(page.locator(".k-cumle")).toContainText(/yüksekten düşüğe \d+ ülke içinde \d+\. sırada/);
    await expect(page.locator(".k-tuval g[aria-label]")).toHaveCount(0);
    await expect(page).toHaveURL(/\/karsilastir$/);                  // varsayılan görünüm: düz adres
    expect(hata).toEqual([]);
  });

  test("gösterge ve dönem değişimi, geri tuşu", async ({ page }) => {
    await page.goto("/karsilastir");
    await expect(page.locator(".k-tuval svg")).toHaveCount(2);
    await page.locator("#k-gosterge").selectOption("eurostat-asgari-ucret-pps-tr");
    await expect(page.locator(".k-cumle")).toContainText("yarıyıl");
    await expect(page.locator('input[name="u"][value="BRA"]')).toBeDisabled();   // Eurostat: yalnız AB üyeleri
    const ikinci = await page.locator("#k-donem option").nth(1).getAttribute("value");
    await page.locator("#k-donem").selectOption(ikinci!);
    await expect(page).toHaveURL(new RegExp(`d=${ikinci}`));
    await page.goBack();
    await expect(page.locator("#k-donem")).not.toHaveValue(ikinci!);
    await page.goBack();
    await expect(page.locator("#k-gosterge")).toHaveValue("wb-ny-gdp-mktp-kd-zg-tur");
  });

  test("ülke çıkarınca dönem kalmazsa anlamlı boş durum", async ({ page }) => {
    await page.goto("/karsilastir#g=eurostat-asgari-ucret-pps-tr&d=&x=POL,HUN,ROU");
    await expect(page.locator(".k-bos")).toContainText("Daha fazla ülke seçin");
    await expect(page.locator(".k-tuval svg")).toHaveCount(0);
    await page.getByRole("button", { name: "Bütün ülkeleri seç" }).click();
    await expect(page.locator(".k-tuval svg")).toHaveCount(2);
  });

  test("başarısız istek yeniden denenir", async ({ page }) => {
    let ilk = true;
    await page.route("**/api/v1/emsal/wb-ny-gdp-mktp-kd-zg-tur.json", (r) => { if (ilk) { ilk = false; return r.fulfill({ status: 502, body: "" }); } return r.continue(); });
    await page.goto("/karsilastir");
    await expect(page.locator("#k-durum")).toContainText("HTTP 502");
    await page.getByRole("button", { name: "Yeniden dene" }).click();
    await expect(page.locator(".k-tuval svg")).toHaveCount(2);
  });
});

test.describe("Kaynaklar ve API", () => {
  test("sağlık paneli durum.json'dan; ECB serisiz olarak işaretli", async ({ page }) => {
    await page.goto("/kaynaklar");
    await expect(page.locator(".s-ozet")).toContainText("Yayında seri");
    await expect(page.locator(".saglik tbody tr")).not.toHaveCount(0);
    await expect(page.getByText("İzin var, yayımlanan seri yok").first()).toBeVisible();
  });

  test("API deneme aracı: seri seçimi, yanıt, 404 açıklaması", async ({ page }) => {
    const hata = hataTopla(page);
    await page.goto("/api");
    await page.locator("#d-uc").selectOption("/api/v1/seri/{id}.json");
    await expect(page.locator("#d-id-alan")).toBeVisible();
    await page.locator("#d-id").selectOption("bis-tufe-yillik-tr");
    await expect(page.locator("#d-adres")).toContainText("/api/v1/seri/bis-tufe-yillik-tr.json");
    await page.getByRole("button", { name: "İsteği gönder" }).click();
    await expect(page.locator("#d-durum")).toContainText("HTTP 200");
    await expect(page.locator("#d-yanit")).toContainText('"kaynak_kod"');
    await expect(page.getByRole("button", { name: "Yanıtı kopyala" })).toBeEnabled();
    await page.route("**/api/v1/seriler.json", (r) => r.fulfill({ status: 404, body: "yok" }));
    await page.locator("#d-uc").selectOption("/api/v1/seriler.json");
    await page.getByRole("button", { name: "İsteği gönder" }).click();
    await expect(page.locator("#d-durum")).toContainText("HTTP 404");
    await expect(page.locator("#d-durum")).toContainText("dosya yok");
    expect(hata.filter((h) => !h.includes("404"))).toEqual([]);
  });
});

test.describe("Tema ve başlık", () => {
  test("tema düğmesi Sistem → Açık → Koyu döner, tercih bu cihazda kalır", async ({ page }) => {
    const hata = hataTopla(page);
    await page.goto("/");
    const d = page.locator("#tema-dugme");
    await expect(d).toBeVisible();
    await expect(d).toHaveAttribute("data-tema", "auto");
    await d.click(); await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await d.click(); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const zemin = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(zemin).toBe("rgb(11, 18, 32)");
    await page.goto("/gezgin");                                    // başka sayfada da ilk boyamadan koyu
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.locator("#tema-dugme").click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
    expect(hata).toEqual([]);
  });

  test("favicon SVG ve tema renkli; telefonda menü tek satır, etkin öğe görünür", async ({ page, isMobile }) => {
    await page.goto("/koray-oner");
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg");
    if (!isMobile) return;
    const ul = page.locator(".ust nav ul");
    const [h, sh] = await ul.evaluate((e) => [e.clientHeight, e.scrollWidth > e.clientWidth]);
    expect(h).toBeLessThan(60); expect(sh).toBe(true);
    await expect(page.locator('.ust nav a[aria-current="page"]')).toBeInViewport();
  });
});

test.describe("Gösterge sayfası", () => {
  test("güncellik, revizyon geçmişi, yıllık değişim ve gezgin bağlantısı", async ({ page }) => {
    await page.goto(`/gosterge/${GINI}`);
    await expect(page.locator(".guncellik")).toContainText("Kaynağın son güncellemesi");
    await expect(page.locator("#rv")).toHaveText("Revizyon geçmişi");
    await expect(page.locator(".revizyon a[href*='github.com/onerkoray/veri-korayoner/commits']")).toBeVisible();
    await expect(page.locator("table thead").last()).toContainText("Bir yıl önceye göre");
    await expect(page.locator("table tbody tr").filter({ hasText: /^2023/ }).first()).toContainText("puan");   // Gini: puan farkı
    await page.getByRole("link", { name: "Veri gezgininde aç →" }).click();
    await expect(page).toHaveURL(/gezgin#g=wb-si-pov-gini-tur&s=yillik&b=19\d\d$/);
    await expect(page.locator(".g-tuval svg")).toHaveCount(1);
  });
});

test.describe("Bağlam", () => {
  test("nüfus göstergesi ekonomik göstergelerle birlikte okunur", async ({ page }) => {
    await page.goto("/gosterge/wb-sp-pop-dpnd-tur");
    await expect(page.locator("#bg")).toHaveText("Bu gösterge neyi anlatır");
    await expect(page.locator(".baglam p").first()).toContainText("demografik fırsat penceresi");
    await expect(page.locator(".iliskili li")).toHaveCount(3);
    await expect(page.locator(".iliskili")).toContainText("İşgücüne katılım oranı");
    await page.getByRole("link", { name: "Hepsini veri gezgininde birlikte aç →" }).click();
    await expect(page).toHaveURL(/gezgin#g=wb-sp-pop-dpnd-tur,ilo-isgucune-katilim-tr,ilo-kadin-isgucune-katilim-tr,wb-sp-pop-dpnd-ol-tur&s=yillik$/);
    await expect(page.locator(".g-tuval svg")).toHaveCount(4);
  });

  test("doğurganlık birimi ve değişimi", async ({ page }) => {
    await page.goto("/gosterge/wb-sp-dyn-tfrt-in-tur");
    await expect(page.locator(".buyuk")).toContainText("çocuk");
    await expect(page.locator("table thead").last()).toContainText("Bir yıl önceye göre");
  });
});

test.describe("Konum şeridi ve grafik hareketi", () => {
  test("uzun sayfada şerit bölümü, satırı ve ilerlemeyi gösterir; adres durumuna dokunmaz", async ({ page }) => {
    await page.goto("/gosterge/bis-politika-faizi-tr");
    const serit = page.locator("nav.konum");
    await expect(serit).not.toHaveClass(/konum--acik/);
    // Gözlem tablosu kendi kutusunda kayar; kutunun üstü okuma çizgisinin biraz üstüne gelsin.
    await page.evaluate(() => { const k = document.querySelector(".gozlem-kutu")!; scrollTo(0, k.getBoundingClientRect().top + scrollY - innerHeight * 0.3); });
    await expect(serit).toHaveClass(/konum--acik/);
    await expect(serit.locator(".konum-sira")).toHaveText("07/07");
    await expect(serit.locator(".konum-baslik")).toHaveText("Gözlemler");
    await expect(serit.locator(".konum-satir")).toHaveText(/ · \d{4}-\d{2}/);
    await serit.locator(".konum-ad").click();
    await expect(page.locator("#konum-liste li")).toHaveCount(7);
    await page.locator("#konum-liste button", { hasText: "Emsallerle" }).click();
    await expect(serit.locator(".konum-baslik")).toHaveText("Emsallerle");
    await serit.locator(".konum-ust").click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    expect(new URL(page.url()).hash).toBe("");
  });

  test("hareketi azalt açıkken grafikler ilk karede tam çizilidir", async ({ page }) => {
    // playwright.config: reducedMotion "reduce"
    await page.goto("/gosterge/bis-politika-faizi-tr");
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const gizli = await page.evaluate(() => [...document.querySelectorAll<SVGPathElement>("main svg path")]
      .filter((p) => p.style.strokeDashoffset && p.style.strokeDashoffset !== "0").length);
    expect(gizli).toBe(0);
    await expect(page.locator(".izci")).toHaveCount(0);
  });
});

test.describe("Sade Panorama", () => {
  test("temalar sekmeyle tek tek görünür; arama bütün temalarda arar", async ({ page }) => {
    await page.goto("/");
    const sekmeler = page.getByRole("tab");
    expect(await sekmeler.count()).toBeGreaterThan(5);
    await expect(sekmeler.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("section.tema:not([hidden])")).toHaveCount(1);
    await sekmeler.nth(1).click();
    await expect(sekmeler.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("section.tema:not([hidden])")).toHaveCount(1);
    await sekmeler.nth(1).press("ArrowRight");
    await expect(sekmeler.nth(2)).toBeFocused();
    await page.getByRole("link", { name: "Bütün göstergeler", exact: true }).click();
    await expect(page).toHaveURL(/#gostergeler$/);
    await page.getByRole("searchbox", { name: "Gösterge, seri kodu veya kurum ara" }).fill("işsizlik");
    await expect(page.locator(".tema-sekme")).toBeHidden();
    expect(await page.locator("section.tema:not([hidden])").count()).toBeGreaterThan(0);
    await page.locator("#panorama-ara").fill("");
    await expect(page.locator(".tema-sekme")).toBeVisible();
    await expect(page.locator("section.tema:not([hidden])")).toHaveCount(1);
  });

  test("Türkiye nerede yalnız temel göstergeler; tamamı Karşılaştır'da", async ({ page }) => {
    await page.goto("/");
    const n = await page.locator(".nerede .satirlar > li").count();
    expect(n).toBeGreaterThan(2);
    expect(n).toBeLessThanOrEqual(6);
    await expect(page.locator(".nerede .devam a")).toHaveAttribute("href", "/karsilastir#k-son");
  });

  test("gözlem tablosu kutuda kayar, başlığı sabit", async ({ page }) => {
    await page.goto("/gosterge/bis-politika-faizi-tr");
    const kutu = page.locator(".gozlem-kutu");
    const [yukseklik, ic] = await kutu.evaluate((k) => [k.clientHeight, k.scrollHeight]);
    expect(ic).toBeGreaterThan(yukseklik);
    await kutu.evaluate((k) => { k.scrollTop = 2000; });
    const ust = await page.evaluate(() => {
      const k = document.querySelector(".gozlem-kutu")!, th = k.querySelector("thead th")!;
      return Math.abs(th.getBoundingClientRect().top - k.getBoundingClientRect().top);
    });
    expect(ust).toBeLessThan(3);
  });
});

test("istatistik görünümü seçime ve hazır dönem aralığına göre güncellenir", async ({ page, isMobile }) => {
  await page.goto("/gezgin");
  await page.getByRole("radio", { name: "İstatistik", exact: true }).check();
  await expect(page.getByRole("heading", { name: "İstatistik ve ilişkiler" })).toBeVisible();
  await expect(page.locator(".g-istatistik-panel").first().locator("tbody tr")).toHaveCount(3);
  await expect(page.locator(".g-korelasyon tbody tr")).toHaveCount(3);
  await expect(page.locator(".g-iliski-grafik svg")).toBeVisible();
  const cift = page.getByLabel("Seri çifti");
  await cift.selectOption({ index: 1 });
  const secim = await cift.inputValue();
  await page.getByRole("button", { name: "Son 5 yıl", exact: true }).click();
  const bitis = Number(await page.locator("#g-e").inputValue());
  await expect(page).toHaveURL(new RegExp(`b=${bitis - 4}.*v=analiz`));
  await expect(page.locator(".g-istatistik-panel").first().locator("tbody tr").first()).toContainText("/ 60");
  await expect(cift).toHaveValue(secim);
  if (isMobile) {
    await page.getByRole("button", { name: "Sonuçlara git" }).click();
    await expect(page.getByRole("heading", { name: "İstatistik ve ilişkiler" })).toBeFocused();
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "İstatistik ve ilişkiler" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Son 5 yıl", exact: true })).toHaveAttribute("aria-pressed", "true");
});
