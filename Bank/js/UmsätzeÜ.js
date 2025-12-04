// ===== State =====
let alleUmsaetze = [];
let temporaereLabels = {}; // temporäre Labels pro UmsatzID
let accountID = null;      // kein Default – wird aus URL gelesen

// ===== 1) AccountID aus URL lesen =====
function leseAccountID() {
  const params = new URLSearchParams(window.location.search);
  const acc = Number.parseInt(params.get("account"), 10);

  if (!Number.isInteger(acc) || acc <= 0) {
    console.warn("Ungültiger oder fehlender 'account'-Parameter:", params.get("account"));
    alert("Kein gültiges Konto ausgewählt. Bitte über die Kontoauswahl erneut öffnen.");
    return false;
  }

  accountID = acc;
  return true;
}

// ===== 2) IBAN + Name für aktuelles Konto laden =====
async function ladeIBAN() {
  if (!Number.isInteger(accountID)) return;

  try {
    const response = await fetch(`http://localhost:3000/api/konten/${accountID}`);
    const konto = await response.json();

    if (konto && konto.IBAN) {
      document.getElementById("ibanAnzeige").textContent = konto.IBAN;
      const nameEl = document.querySelector(".konto-info h2");
      if (nameEl) nameEl.textContent = `${konto.Vorname} ${konto.Nachname}`;
    } else {
      document.getElementById("ibanAnzeige").textContent = "Keine Daten";
    }
  } catch (err) {
    console.error("Fehler beim Laden der IBAN/Account-Daten:", err);
  }
}

// ===== 3) Labels zu einem Umsatz abrufen =====
async function ladeLabels(umsatzID) {
  try {
    const response = await fetch(`http://localhost:3000/api/labels/${umsatzID}`);
    const labels = await response.json();

    const dbLabels = labels.map(l => l.Name);
    const tempLabels = temporaereLabels[umsatzID] || [];
    return [...dbLabels, ...tempLabels].join(", ");
  } catch (error) {
    console.error("Fehler beim Laden der Labels:", error);
    return "";
  }
}

// ===== 4) Umsätze für aktuelles Konto laden =====
async function ladeUmsaetze() {
  if (!Number.isInteger(accountID)) return;

  try {
    const response = await fetch(`http://localhost:3000/api/umsatz/${accountID}`);
    const umsaetze = await response.json();

    alleUmsaetze = [];
    let saldo = 0;

    for (const row of umsaetze) {
      const labels = await ladeLabels(row.UmsatzID);

      alleUmsaetze.push({
        id: row.UmsatzID,
        datum: row.Datum,
        beschreibung: row.Beschreibung,
        betrag: parseFloat(row.Betrag),
        labels
      });

      saldo += parseFloat(row.Betrag);
    }

    renderUmsaetze(alleUmsaetze);
    const saldoEl = document.getElementById("saldoAnzeige");
    if (saldoEl) saldoEl.textContent = `${saldo.toFixed(2)} €`;
  } catch (err) {
    console.error("Fehler beim Laden der Umsätze:", err);
  }
}

// ===== 5) Detailseite öffnen =====
function zeigeDetails(umsatzID) {
  const url = new URL("details.html", window.location.href);
  url.searchParams.set("umsatzID", umsatzID);
  url.searchParams.set("account", accountID);

  const tempLabels = temporaereLabels[umsatzID] || [];
  if (tempLabels.length > 0) {
    url.searchParams.set("tempLabels", tempLabels.join(","));
  }
  window.location.href = url.toString();
}

// ===== 6) Umsätze rendern =====
function renderUmsaetze(liste) {
  const tabelle = document.getElementById("umsatzTabelle");
  if (!tabelle) return;
  tabelle.innerHTML = "";

  liste.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.datum}</td>
      <td>${row.beschreibung}</td>
      <td class="${row.betrag < 0 ? 'negativ' : 'positiv'}">${row.betrag.toFixed(2)}</td>
      <td>${row.labels}</td>
      <td><button class="details-btn" data-id="${row.id}">Details</button></td>
    `;
    tabelle.appendChild(tr);
  });

  // Entkoppelt von inline onclick – sauberer Event-Delegation:
  tabelle.addEventListener("click", (e) => {
    const btn = e.target.closest(".details-btn");
    if (btn) {
      const id = Number.parseInt(btn.dataset.id, 10);
      if (Number.isInteger(id)) zeigeDetails(id);
    }
  }, { once: true }); // Listener nur einmal setzen
}

// ===== 7) Temporäre Labels hinzufügen =====
function addTemporaereLabels(umsatzID, neueLabels) {
  if (!temporaereLabels[umsatzID]) {
    temporaereLabels[umsatzID] = [];
  }
  neueLabels.forEach(label => {
    if (!temporaereLabels[umsatzID].includes(label)) {
      temporaereLabels[umsatzID].push(label);
    }
  });
  ladeUmsaetze();
}

// ===== 8) Live-Suche =====
document.addEventListener("DOMContentLoaded", () => {
  const search = document.getElementById("searchInput");
  if (!search) return;

  search.addEventListener("input", function() {
    const query = this.value.toLowerCase();
    const gefiltert = alleUmsaetze.filter(row =>
      (row.datum && String(row.datum).toLowerCase().includes(query)) ||
      (row.beschreibung && row.beschreibung.toLowerCase().includes(query)) ||
      row.betrag.toString().includes(query) ||
      (row.labels && row.labels.toLowerCase().includes(query))
    );
    renderUmsaetze(gefiltert);
  });
});

// ===== 9) Storage-Events von Detailseite =====
window.addEventListener("storage", function(e) {
  if (e.key === "labelUpdate" && e.newValue) {
    try {
      const data = JSON.parse(e.newValue);
      addTemporaereLabels(data.umsatzID, data.labels);
    } catch (err) {
      console.error("Fehler beim Verarbeiten von labelUpdate:", err);
    }
  }
});

// ===== 10) Darkmode-Switch mit Checkbox =====
document.addEventListener("DOMContentLoaded", () => {
  const checkbox = document.querySelector(".toggle-switch .checkbox");

  if (checkbox) {
    // Zustand aus localStorage wiederherstellen
    if (localStorage.getItem("darkMode") === "enabled") {
      document.body.classList.add("dark-mode");
      checkbox.checked = true;
    }

    // Event Listener für Umschalten
    checkbox.addEventListener("change", () => {
      document.body.classList.toggle("dark-mode", checkbox.checked);
      localStorage.setItem("darkMode", checkbox.checked ? "enabled" : "disabled");
    });
  }
});

// ===== 11) Print-Button für Übersicht =====
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("printOverviewBtn");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      window.print();
    });
  }
});

// ===== 12) Sequenzielle Initialisierung nach DOM =====
document.addEventListener("DOMContentLoaded", async () => {
  const ok = leseAccountID();
  if (!ok) return;

  await ladeIBAN();
  await ladeUmsaetze();
});
