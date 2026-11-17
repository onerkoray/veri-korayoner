// Yazar kimliği: korayoner.dev'deki Person kümesine bağlanır (aynı @id).
// Tam küme (bütün sameAs) ana sitede tutulur; burada çekirdek alanlar var.
// Değiştirme: önce korayoner.dev/hakkimda JSON-LD'si, sonra burası.
export const KISI_ID = "https://korayoner.dev/#oner-koray";

export const KISI = {
  "@type": "Person",
  "@id": KISI_ID,
  name: "Koray Öner",
  url: "https://korayoner.dev/",
  jobTitle: "Yazılım Geliştirici",
  sameAs: [
    "https://orcid.org/0009-0005-8730-3577",
    "https://github.com/onerkoray",
    "https://www.linkedin.com/in/korayoner/",
    "https://x.com/korayonerdev",
    "https://www.youtube.com/@onerkoray",
  ],
};

/** Başka düğümlerden yazara başvuru (tam düğüm yerine). */
export const KISI_REF = { "@type": "Person", "@id": KISI_ID, name: "Koray Öner", url: "https://korayoner.dev/" };
