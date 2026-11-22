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
  await expect(page.locator(".g-tuval g.g-ipucu[aria-label], .g-tuval g.g-imlec[aria-label]")).toHaveCount(0);
});

for (const yol of ["/", "/gezgin", `/gosterge/${GINI}`, "/hesap/reel-politika-faizi", "/api"]) {
  test(`yatay taşma yok: ${yol}`, async ({ page }) => {
    await page.goto(yol);
    await page.waitForLoadState("networkidle");
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw).toBeLessThanOrEqual(cw + 1);
  });
}
