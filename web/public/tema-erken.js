/* Tema tercihi sayfa ilk kez boyanmadan uygulanır. CSP satır içi betiğe izin vermediği için
 * ayrı, ertelenmeyen küçük bir dosya; <head> içinde. Tercih yalnız bu cihazda (localStorage)
 * durur, hiçbir yere gönderilmez; yoksa sistem teması geçerlidir. Düğme ve telefonda menünün
 * etkin öğeyi göstermesi DOM hazır olunca. korayoner.dev'deki tema-erken.js ile aynı değerler. */
(function () {
  var kok = document.documentElement, ANAHTAR = "veri.tema";
  try {
    var t = localStorage.getItem(ANAHTAR);
    if (t === "light" || t === "dark") kok.setAttribute("data-theme", t);
  } catch (e) { /* depolama kapalı: sistem teması */ }

  document.addEventListener("DOMContentLoaded", function () {
    var b = document.getElementById("tema-dugme");
    if (b) {
      var AD = { auto: "Sistem", light: "Açık", dark: "Koyu" }, SIRA = ["auto", "light", "dark"];
      var simdi = function () { return kok.getAttribute("data-theme") || "auto"; };
      var yaz = function () {
        var t = simdi();
        b.querySelector(".tema-ad").textContent = AD[t];
        b.setAttribute("aria-label", "Tema: " + AD[t] + ". Değiştirmek için basın");
        b.setAttribute("data-tema", t);
      };
      b.addEventListener("click", function () {
        var t = SIRA[(SIRA.indexOf(simdi()) + 1) % SIRA.length];
        if (t === "auto") kok.removeAttribute("data-theme"); else kok.setAttribute("data-theme", t);
        try { if (t === "auto") localStorage.removeItem(ANAHTAR); else localStorage.setItem(ANAHTAR, t); } catch (e) { /* yalnız bu sayfa */ }
        yaz();
      });
      yaz();
      b.style.visibility = "visible";
    }
    /* Telefonda menü yatay kayar: etkin sayfa görünür olsun. */
    var etkin = document.querySelector('.ust nav a[aria-current="page"]');
    var serit = etkin && etkin.closest("ul");
    if (serit && serit.scrollWidth > serit.clientWidth) serit.scrollLeft = etkin.offsetLeft - (serit.clientWidth - etkin.offsetWidth) / 2;
  });
})();
