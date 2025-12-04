// 1. Konten vom Backend laden
// Konten vom Backend laden (verwendet accountID, Karten immer anklickbar)
async function ladeKonten() {
  try {
    const response = await fetch("http://localhost:3000/api/konten");
    if (!response.ok) throw new Error("API nicht erreichbar: " + response.status);
    const konten = await response.json();

    const container = document.querySelector(".konto-auswahl");
    if (!container) {
      console.error("Kein .konto-auswahl Container gefunden");
      return;
    }
    container.innerHTML = "";

    konten.forEach((row, index) => {
      // genaues Feld verwenden
      const id = row.accountID ?? null;

      const card = document.createElement("div");
      card.className = "konto-card";
      card.innerHTML = `
        <h3>${row.Vorname ?? ""} ${row.Nachname ?? ""}</h3>
        <p>IBAN: ${row.IBAN ?? "—"}</p>
      `;

      // Entferne Hover-Titel/Deaktivierung — Karte bleibt anklickbar
      // Wenn id fehlt, verwende Fallback (Index) aber logge es
      let usedId = id;
      if (!usedId) {
        usedId = index + 1; // Fallback, damit Klick funktioniert
        console.warn(`Kein accountID im Backendobjekt. Verwende Fallback id=${usedId} für Eintrag:`, row);
      }

      // Klickhandler: setze den account-Parameter sauber
      card.addEventListener("click", () => {
        const targetPage = "Bankübersiht.html"; // ggf. anpassen
        const url = new URL(targetPage, window.location.href);
        url.searchParams.set("account", String(usedId));
        window.location.href = url.toString();
      });

      container.appendChild(card);
    });

    console.log("Konten geladen:", konten.length);
  } catch (error) {
    console.error("Fehler beim Laden der Konten:", error);
    const container = document.querySelector(".konto-auswahl");
    if (container) container.innerHTML = "<p>Fehler beim Laden der Konten.</p>";
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const checkbox = document.querySelector(".toggle-switch .checkbox");
  if (!checkbox) return;

  if (localStorage.getItem("darkMode") === "enabled") {
    document.body.classList.add("dark-mode");
    checkbox.checked = true;
  }

  checkbox.addEventListener("change", () => {
    document.body.classList.toggle("dark-mode", checkbox.checked);
    localStorage.setItem("darkMode", checkbox.checked ? "enabled" : "disabled");
  });
});
// Start
ladeKonten();
