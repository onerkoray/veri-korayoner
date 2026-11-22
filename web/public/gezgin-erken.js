// Gezgin formu ilk boyamadan önce: telefonda gösterge listesi kapalı, form görünür.
// Ayrıştırıcıyı durduran küçük harici betik (CSP satır içi betiğe izin vermez);
// böylece liste sonradan kapanıp alttaki içeriği kaydırmaz.
(function () {
  var f = document.getElementById("g-form"), l = document.getElementById("g-liste");
  if (l && window.matchMedia("(max-width: 40rem)").matches) l.open = false;
  if (l) l.removeAttribute("data-ilk");
  if (f) f.hidden = false;
})();
