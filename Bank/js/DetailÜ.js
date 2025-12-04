// ===== State =====
let umsatzID;
let accountID;
let Labels = []; // Array von { LabelID, Name }

// ===== URL Parameter robust lesen =====
const params = new URLSearchParams(window.location.search);
umsatzID = Number.parseInt(params.get("umsatzID"), 10);
accountID = Number.parseInt(params.get("account"), 10);

if (!Number.isInteger(umsatzID) || umsatzID <= 0) {
  alert("Ungültige UmsatzID");
  window.history.back();
}

// ===== Umsatzdetails laden =====
async function ladeDetails() {
  try {
    const response = await fetch(`http://localhost:3000/api/umsatz/${accountID}`);
    if (!response.ok) throw new Error("Umsatz-API nicht erreichbar");
    const umsaetze = await response.json();
    const daten = umsaetze.find(u => u.UmsatzID === umsatzID);

    if (!daten) {
      alert("Kein Umsatz mit dieser ID gefunden");
      window.history.back();
      return;
    }

    document.getElementById("detail-datum").textContent = daten.Datum ?? "";
    document.getElementById("detail-text").textContent = daten.Beschreibung ?? "";

    const betragEl = document.getElementById("detail-betrag");
    const betrag = parseFloat(daten.Betrag) || 0;
    betragEl.textContent = `${betrag.toFixed(2)} €`;
    betragEl.className = `betrag value ${betrag < 0 ? "negativ" : "positiv"}`;

    document.getElementById("detail-senderIBAN").textContent = daten.SenderIBAN ?? "";

    // Labels laden (erwarte Array von { LabelID, Name })
    Labels = await ladeLabelsAusDatenbank(umsatzID);

    renderLabels();
  } catch (error) {
    console.error("Fehler beim Laden der Details:", error);
  }
}

// ===== Labels aus DB laden =====
async function ladeLabelsAusDatenbank(umsatzID) {
  try {
    const response = await fetch(`http://localhost:3000/api/labels/${umsatzID}`);
    if (!response.ok) throw new Error("Labels-API nicht erreichbar");
    const labels = await response.json();
    return Array.isArray(labels) ? labels : [];
  } catch (error) {
    console.error("Fehler beim Laden der Labels:", error);
    return [];
  }
}

// ===== Labels rendern =====
function renderLabels() {
  const list = document.getElementById("labelList");
  list.innerHTML = "";

  Labels.forEach(label => {
    const item = document.createElement("div");
    item.className = "label-item";

    const text = document.createElement("span");
    text.textContent = label.Name;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "delete-btn";
    btn.dataset.labelID= label.LabelID;
    btn.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path d="M3 6h18M9 6V4h6v2m-7 4v10m4-10v10m4-10v10"
                stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
        </svg>
      </span>
    `;

    console.log("renderLabels: Button für", label.LabelID);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      console.log("Button click für", label.LabelID);
      deleteLabel(labels.LabelID);
    });

    item.appendChild(text);
    item.appendChild(btn);
    list.appendChild(item);
  });
}
// ===== Neues Label hinzufügen =====
async function addLabel() {
  const input = document.getElementById("newLabelInput");
  if (!input) return;
  const newLabel = input.value.trim();
  if (!newLabel) return;

  // Duplikatprüfung (case-insensitive)
  if (Labels.some(x => x.Name.toLowerCase() === newLabel.toLowerCase())) {
    alert("Label bereits vorhanden");
    return;
  }

  try {
    const response = await fetch("http://localhost:3000/api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ umsatzID, name: newLabel })
    });

    if (!response.ok) throw new Error("Fehler beim Anlegen des Labels");

    const result = await response.json();
    const created = result.label ?? (result.labelID ? { LabelID: result.labelID, Name: newLabel } : null);

    if (created && created.LabelID) {
      Labels.push({ LabelID: created.LabelID, Name: created.Name ?? newLabel });
    } else {
      Labels = await ladeLabelsAusDatenbank(umsatzID);
    }

    renderLabels();
    input.value = "";
  } catch (error) {
    console.error("Fehler beim Einfügen des Labels:", error);
    alert("Fehler beim Einfügen des Labels");
  }
}

// ===== Label löschen =====
async function deleteLabel(labelID) {
  if (labelID === null || labelID === undefined) return;
  if (!confirm("Label wirklich löschen?")) return;

  try {
    const response = await fetch("http://localhost:3000/api/labels", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ umsatzID, labelID })
    });

    let result = {};
    try {
      result = await response.json();
    } catch (e) {
      // keine JSON-Antwort erhalten — bleibt leer
    }

    if (response.ok && result.success === true) {
      // Entfernen im lokalen Array und neu rendern
      Labels = Labels.filter(l => l.LabelID !== labelID);
      renderLabels();
    } else {
      // aussagekräftige Fehlermeldung, falls vorhanden
      const msg = result.error ?? result.message ?? "Fehler beim Löschen des Labels";
      alert(msg);
    }

  } catch (error) {
    console.error("Fehler beim Löschen:", error);
    alert("Fehler beim Löschen des Labels");
  }
}

// ===== Sonstiges =====
function zurueckZurUebersicht() {
  window.history.back();
}

function drucken() {
  window.print();
}

// Event Listener
document.getElementById("printDetailBtn")?.addEventListener("click", drucken);
document.getElementById("newLabelInput")?.addEventListener("keypress", function (e) {
  if (e.key === "Enter") addLabel();
});

// Darkmode initialisierung (wie gehabt)
document.addEventListener("DOMContentLoaded", () => {
  const checkbox = document.querySelector(".toggle-switch .checkbox");
  if (checkbox) {
    if (localStorage.getItem("darkMode") === "enabled") {
      document.body.classList.add("dark-mode");
      checkbox.checked = true;
    }
    checkbox.addEventListener("change", () => {
      document.body.classList.toggle("dark-mode", checkbox.checked);
      localStorage.setItem("darkMode", checkbox.checked ? "enabled" : "disabled");
    });
  }
});
// Start
document.addEventListener("DOMContentLoaded", ladeDetails);