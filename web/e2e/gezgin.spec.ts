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

for (const yol of ["/", "/gezgin", "/karsilastir", `/gosterge/${GINI}`, "/hesap/reel-politika-faizi", "/api"]) {
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
    // Aralık bütün serilerin en yeni dönemine göre kurulur (faiz Ekim): yalnız TÜFE açıkken Kasım 2025–Eylül 2026.
    await expect(page.locator(".ana-durum")).toContainText("Kasım 2025 – Eylül 2026 · 11 ay");
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
    await expect(page).toHaveURL(/s=aylik&.*v=tablo/);
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
    await expect(page).toHaveURL(/g=wb-ny-gdp-mktp-kd-zg-tur&d=\d{4}/);
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
