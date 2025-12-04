const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Datenbank öffnen
const db = new sqlite3.Database("./db/Bank.db", (err) => {
  if (err) {
    console.error("Fehler beim Öffnen der DB:", err.message);
  } else {
    console.log("Datenbank verbunden.");
  }
});

// --- API Endpunkte ---

// Alle Konten abrufen
app.get("/api/konten", (req, res) => {
  db.all("SELECT accountID, IBAN, Vorname, Nachname FROM Account", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Einzelnes Konto abrufen
app.get("/api/konten/:id", (req, res) => {
  const id = req.params.id;
  db.get("SELECT accountID, IBAN, Vorname, Nachname FROM Account WHERE accountID = ?", [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(row || {});
    }
  });
});

// Umsätze für ein Konto abrufen
app.get("/api/umsatz/:accountID", (req, res) => {
  const accountID = req.params.accountID;
  db.all(
    "SELECT UmsatzID, Datum, Beschreibung, Betrag, SenderIBAN FROM Umsatz WHERE AccountID = ? ORDER BY Datum DESC",
    [accountID],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    }
  );
});

// Labels für einen Umsatz abrufen (liefert LabelID und Name)
app.get("/api/labels/:umsatzID", (req, res) => {
  const umsatzID = req.params.umsatzID;
  const sql = `
    SELECT Labels.LabelID, Labels.Name
    FROM Labels
    JOIN UmsatzLabels ON Labels.LabelID = UmsatzLabels.LabelID
    WHERE UmsatzLabels.UmsatzID = ?
  `;
  db.all(sql, [umsatzID], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Neues Label hinzufügen (wenn Name existiert: wiederverwenden, sonst neu anlegen)
// Erwartet JSON: { umsatzID, name }
app.post("/api/labels", (req, res) => {
  const { umsatzID, name } = req.body;
  if (!umsatzID || !name) {
    return res.status(400).json({ error: "umsatzID und name erforderlich" });
  }

  // 1) Prüfen, ob Label mit diesem Namen bereits existiert
  db.get("SELECT LabelID, Name FROM Labels WHERE Name = ?", [name], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });

    const useLabel = (labelID, labelName) => {
      // 2) Verknüpfung UmsatzLabels einfügen, falls noch nicht vorhanden
      db.get(
        "SELECT 1 FROM UmsatzLabels WHERE UmsatzID = ? AND LabelID = ?",
        [umsatzID, labelID],
        (err2, row2) => {
          if (err2) return res.status(500).json({ error: err2.message });

          if (row2) {
            // Verknüpfung existiert bereits
            return res.json({ success: true, label: { LabelID: labelID, Name: labelName }, message: "Label bereits verknüpft" });
          }

          db.run("INSERT INTO UmsatzLabels (UmsatzID, LabelID) VALUES (?, ?)", [umsatzID, labelID], function (err3) {
            if (err3) return res.status(500).json({ error: err3.message });
            return res.json({ success: true, label: { LabelID: labelID, Name: labelName } });
          });
        }
      );
    };

    if (existing) {
      // Label existiert bereits -> wiederverwenden
      useLabel(existing.LabelID, existing.Name);
    } else {
      // Label neu anlegen
      db.run("INSERT INTO Labels (Name) VALUES (?)", [name], function (err4) {
        if (err4) return res.status(500).json({ error: err4.message });
        const labelID = this.lastID;
        useLabel(labelID, name);
      });
    }
  });
});

// Löschen eines Labels für einen bestimmten Umsatz (JSON-Body)
// Erwartet JSON: { umsatzID, labelID }
// Verhalten:
//  - löscht die Verknüpfung UmsatzLabels WHERE UmsatzID = ? AND LabelID = ?
//  - prüft danach, ob das Label noch irgendwo referenziert wird; falls nicht, löscht es aus Labels
app.delete("/api/labels", (req, res) => {
  const { umsatzID, labelID } = req.body;

  if (!labelID) {
    return res.status(400).json({ error: "labelID erforderlich" });
  }

  // Wenn umsatzID angegeben: nur die Verknüpfung für diesen Umsatz löschen
  if (umsatzID) {
    db.run(
      "DELETE FROM UmsatzLabels WHERE UmsatzID = ? AND LabelID = ?",
      [umsatzID, labelID],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // Prüfen, ob Label noch referenziert wird
        db.get("SELECT COUNT(*) AS cnt FROM UmsatzLabels WHERE LabelID = ?", [labelID], (err2, row2) => {
          if (err2) return res.status(500).json({ error: err2.message });

          const remaining = row2 ? row2.cnt : 0;
          if (remaining === 0) {
            // kein Verweis mehr -> Label löschen
            db.run("DELETE FROM Labels WHERE LabelID = ?", [labelID], function (err3) {
              if (err3) return res.status(500).json({ error: err3.message });
              return res.json({ success: true, deletedLink: true, deletedLabel: true });
            });
          } else {
            // Label bleibt bestehen, nur Verknüpfung entfernt
            return res.json({ success: true, deletedLink: true, deletedLabel: false, remainingReferences: remaining });
          }
        });
      }
    );
  } else {
    // Kein umsatzID angegeben -> globales Löschen aller Verknüpfungen + Label (wie vorher)
    db.run("DELETE FROM UmsatzLabels WHERE LabelID = ?", [labelID], (err) => {
      if (err) return res.status(500).json({ error: err.message });

      db.run("DELETE FROM Labels WHERE LabelID = ?", [labelID], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true, deletedLink: true, deletedLabel: true });
      });
    });
  }
});

// Optional: bestehende Route DELETE /api/labels/:labelID beibehalten (globales Löschen)
app.delete("/api/labels/:labelID", (req, res) => {
  const labelID = req.params.labelID;

  db.run("DELETE FROM UmsatzLabels WHERE LabelID = ?", [labelID], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    db.run("DELETE FROM Labels WHERE LabelID = ?", [labelID], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ success: true });
    });
  });
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});