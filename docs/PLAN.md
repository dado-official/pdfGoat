# PDFgoat – Entwicklungsplan

Stand: 10.10.2026. M0 und M1 sind umgesetzt (siehe [Umsetzungsstand](#umsetzungsstand)).

## Ziel

Kostenloser PDF-Editor als Website, der vollständig im Browser läuft. Dateien verlassen nie das Gerät. Slogan: „Eats your PDFs. Never your data.“

## Getroffene Entscheidungen

| Thema | Entscheidung |
| --- | --- |
| Framework | React + TypeScript + Vite |
| PDF-Bibliotheken | PDF.js (Anzeige), pdf-lib (Bearbeiten), später Tesseract.js (OCR) |
| Meilenstein 1 | Cloud-Prototyp für Funktionen 1 bis 3 übernehmen |
| Hosting | Cloudflare Pages |
| Sprache | Deutsch und Englisch von Anfang an |
| Arbeitsweise | Erst planen, dann umsetzen, dann testen |

## Grundprinzipien

1. **Kein Upload, nachweisbar.** Nach dem Laden der Seite gibt es keine Anfragen an fremde Server und keine Anfragen, die Dateiinhalte enthalten. Ein automatischer Test prüft das bei jedem Build (siehe Tests).
2. **Alles selbst gehostet.** Keine CDNs, keine externen Schriften, kein Analytics. Der PDF.js-Worker, dessen Schrift- und Zeichentabellen und später die OCR-Sprachdaten liegen auf der eigenen Domain.
3. **Original bleibt unangetastet.** Die geöffnete Datei wird im Speicher nie verändert. Bearbeitungen sind eine Liste von Änderungen, aus der erst beim Export ein neues PDF gebaut wird. Das macht Rückgängig/Wiederholen einfach und verhindert Datenverlust.
4. **Kleine Startseite.** Jede Funktion wird erst bei Bedarf nachgeladen (Code-Splitting), damit die Seite schnell startet.
5. **Eigenes Gesicht, kein PDF24-Klon.** PDFgoat darf PDF24 nicht zu ähnlich sein: weder im Aussehen (Layout, Farben, Icons, Kachelraster der Werkzeuge) noch in den Formulierungen. Bei jeder Arbeit an Oberfläche, Startseite und Texten wird das geprüft.

## Architektur

Vier Schichten, Abhängigkeiten zeigen nur nach unten:

```
features/   Oberfläche je Funktion (React)
state/      Dokumentzustand (Reducer + Context, Undo/Redo)
pdf/        Adapter zu PDF.js und pdf-lib, Web Worker
core/       Reine Logik ohne React und ohne DOM
```

**Dokumentmodell (Kern der App):**

- `sources`: die geöffneten Dateien als unveränderte Bytes, jede mit einer ID.
- `pages`: geordnete Liste von Seiten, jede mit `id`, `sourceId`, `sourceIndex`, `rotation`.
- `overlays` (ab Meilenstein 3): eingefügte Texte, Bilder und Unterschriften je Seite, in PDF-Koordinaten.
- `formValues` (ab Meilenstein 4): ausgefüllte Formularfelder.

Sortieren, Drehen, Löschen und Zusammenfügen ändern nur die Liste `pages`. Der Export liest dieses Modell und baut das PDF mit pdf-lib (`copyPages`, Rotation, danach Overlays). Dieselbe Exportfunktion bedient auch das Aufteilen, nur mit Seitenbereichen.

**Web Worker:** Export, Komprimieren und OCR laufen im Worker, damit die Oberfläche nicht einfriert. PDF.js bringt seinen eigenen Worker mit.

**Vorschau:** Miniaturen werden nur für sichtbare Seiten gerendert (virtualisierte Liste), damit auch PDFs mit mehreren hundert Seiten bedienbar bleiben.

## Ordnerstruktur

```
pdfGoat/
├─ public/
│  └─ pdfjs/                Laufzeitdateien von PDF.js (beim Build kopiert, nicht im Repo)
├─ src/
│  ├─ core/                 ranges, limits, errors, types (rein, gut testbar)
│  ├─ pdf/                  pdfjs.ts (öffnen, rendern), build.ts (pdf-lib)
│  ├─ state/                editor.ts: Reducer mit Undo/Redo
│  ├─ features/
│  │  ├─ open/              Datei öffnen, Drag & Drop
│  │  ├─ organize/          Sortieren, Drehen, Löschen
│  │  ├─ merge-split/       Zusammenfügen, Aufteilen
│  │  ├─ annotate/          Text, Bilder, Unterschrift
│  │  ├─ forms/             Formulare ausfüllen
│  │  └─ tools/             Komprimieren, OCR, Bild ↔ PDF
│  ├─ ui/                   gemeinsame Bausteine (Buttons, Dialoge, Layout)
│  ├─ i18n/                 de.ts, en.ts, translate.ts, I18nProvider
│  ├─ pages/                Start, Offenlegung, Datenschutz, Lizenzen
│  └─ main.tsx
├─ tests/
│  ├─ e2e/                  Playwright-Tests
│  ├─ fixtures.ts           erzeugt Test-PDFs im Code
│  └─ files/                fertige Test-PDFs (z. B. verschlüsselt)
├─ scripts/                 copy-pdfjs-assets.mjs
├─ docs/PLAN.md
└─ .github/workflows/ci.yml
```

Unit-Tests liegen direkt neben dem Modul (`pageRanges.test.ts`).

## Meilensteine

Jeder Meilenstein läuft nach demselben Muster: planen, umsetzen, testen, Review, dann veröffentlichen.

### M0 – Fundament

- Vite + React + TypeScript, ESLint, Prettier
- Vitest und Playwright eingerichtet, inklusive No-Network-Test
- CI mit GitHub Actions
- Cloudflare Pages mit Vorschau je Pull Request, `_headers` mit strenger CSP
- i18n-Grundgerüst (Deutsch, Englisch)

Fertig, wenn eine leere App automatisch gebaut, getestet und veröffentlicht wird.

### M1 – Funktionen 1 bis 3 (Prototyp übernehmen)

- PDF öffnen und Seitenvorschau
- Seiten sortieren, drehen, löschen
- Zusammenfügen und Aufteilen, Export als Download
- Vorgehen: Cloud-Prototyp in die Struktur oben einsortieren (Reducer nach `state/`, reine Module nach `core/`), seine 32 Unit- und 9 Playwright-Tests mitnehmen, Texte in i18n überführen
- Fehlerfälle: verschlüsselte PDFs, defekte Dateien, sehr große Dateien (klare Meldung statt Absturz)

### M2 – Rechtliches und erste Veröffentlichung

- Offenlegung nach § 25 MedienG (Name, Wohnort)
- Datenschutzerklärung: keine Cookies, kein Tracking, Dateien bleiben lokal. Cloudflare als Hoster nennen, weil dort technisch bedingt IP-Adressen verarbeitet werden
- Lizenzseite, automatisch aus den Abhängigkeiten erzeugt (pdf-lib MIT, PDF.js Apache 2.0, React MIT)
- Startseite mit Slogan, Domain verbinden
- Version 0.1 öffentlich

Früh veröffentlichen ist Absicht: Die Funktionen 1 bis 3 sind allein schon nützlich.

### M3 – Funktion 4: Text, Bilder, Unterschrift

- Overlay-Modell und Bearbeitungsebene über der Seitenansicht
- Text einfügen (eingebettete Schrift, damit Umlaute und Sonderzeichen sicher funktionieren)
- Bilder einfügen (PNG, JPEG), verschieben und skalieren
- Unterschrift: zeichnen, tippen oder als Bild laden. Optional lokal im Browser merken
- Undo/Redo für alle Overlays

### M4 – Funktion 5: Formulare

- Felder über PDF.js anzeigen, Werte über pdf-lib schreiben
- Textfelder, Checkboxen, Radiobuttons, Auswahllisten
- Option „Formular glätten“ (Felder fest ins PDF schreiben)
- Nicht im Umfang: XFA-Formulare

### M5 – Funktion 6: Komprimieren, OCR, Bild ↔ PDF

Reihenfolge nach Aufwand:

1. Bild → PDF und PDF → Bild (einfach, rein über Canvas)
2. Komprimieren: eingebettete Bilder neu kodieren und verkleinern. Die Wirkung ist begrenzt, das wird in der Oberfläche ehrlich angezeigt (Größe vorher/nachher)
3. OCR mit Tesseract.js: Sprachdaten Deutsch und Englisch selbst gehostet und erst bei Nutzung geladen, Ergebnis als durchsuchbare Textebene

### M6 – Funktion 7: Offline als PWA

- `vite-plugin-pwa`, App-Dateien vorab im Cache
- OCR-Sprachdaten erst bei erster Nutzung in den Cache
- Installierbar auf Desktop und Handy

## Tests

| Ebene | Werkzeug | Was |
| --- | --- | --- |
| Unit | Vitest | `core/` vollständig: Seitenbereiche, Dokumentmodell, Reducer, PDF-Bau |
| Integration | Vitest | Exportiertes PDF wieder einlesen und Seitenzahl, Reihenfolge, Rotation prüfen |
| End-to-End | Playwright | Je Funktion ein Ablauf mit echten Test-PDFs, inklusive Download |
| Datenschutz | Playwright | No-Network-Test (siehe unten) |

**No-Network-Test:** Playwright zeichnet während eines kompletten Ablaufs (öffnen, bearbeiten, exportieren) alle Netzwerkanfragen auf. Der Test schlägt fehl, wenn eine Anfrage an eine fremde Domain geht oder wenn nach dem Laden irgendeine Anfrage mit Inhalt (POST, PUT) abgeschickt wird. Zusätzlich blockt die CSP (`connect-src 'self'`) solche Anfragen im Browser selbst.

## CI und Hosting

- **GitHub Actions bei jedem Pull Request:** Lint, Typprüfung, Unit-Tests, Build, Playwright-Tests.
- **Cloudflare Pages:** `main` wird automatisch veröffentlicht, jeder Pull Request bekommt eine Vorschau-Adresse.
- **Sicherheits-Header** in `dist/_headers` (vom Build erzeugt): strenge Content-Security-Policy, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.

## Risiken und Grenzen

- **Große PDFs:** Der Browser-Speicher ist begrenzt. Gegenmaßnahmen: virtualisierte Vorschau, Worker, Warnung ab einer Dateigröße.
- **Verschlüsselte PDFs:** pdf-lib kann sie nicht zuverlässig bearbeiten. Es gibt eine klare Fehlermeldung.
- **pdf-lib wird kaum noch gepflegt** (nach meinem Wissensstand, vor M1 prüfen). Falls Fehler blockieren, auf einen gepflegten Fork ausweichen. Der Adapter in `pdf/` hält diesen Wechsel klein.
- **Bestehenden Text umschreiben** wie in Acrobat ist nicht im Umfang, ebenso Word ↔ PDF.
- **Rechtliches:** Die Seiten in M2 sind sorgfältig, aber keine Rechtsberatung. Bei Spenden oder Sponsoring sind volles Impressum und Steuerfrage neu zu klären.

## Umsetzungsstand

**M0 und M1 umgesetzt (10.10.2026).** Abweichungen vom ursprünglichen Plan, jeweils mit Grund:

- **Texte als `de.ts`/`en.ts` statt JSON:** TypeScript prüft so beim Build, dass jeder Schlüssel existiert und beide Sprachen vollständig sind.
- **CSP in der Seite und in `dist/_headers`, beides aus `vite.config.ts` erzeugt:** Die Policy gilt damit auf jedem Hoster und in den Browser-Tests, und es gibt nur eine Quelle. Eine Datei `public/_headers` gibt es deshalb nicht.
- **Dateien unter 100 MB bleiben im Speicher,** damit das Speichern auch dann klappt, wenn die Datei auf der Festplatte inzwischen verschoben, überschrieben oder gelöscht wurde. Nur größere Dateien werden beim Speichern neu gelesen. Passt die Seitenzahl dann nicht mehr zur geöffneten Datei, bricht der Export mit einer Meldung ab.
- **Verschlüsselte PDFs werden abgelehnt,** auch solche, die sich ohne Passwort öffnen lassen. pdf-lib kann sie nicht entschlüsseln und würde leere Seiten speichern.
- **Größenlimits:** Warnung ab 100 MB, Ablehnung über 500 MB (`src/core/limits.ts`).
- **Test-PDFs** werden in `tests/fixtures.ts` im Code erzeugt, die echte verschlüsselte Datei liegt in `tests/files/`.

Noch nicht umgesetzt:

- **Export im Web Worker.** Bei den bisherigen Funktionen blockiert der Export nur kurz. Sinnvoll wird er mit Komprimieren und OCR (M5), spätestens dann kommt er.
- **Hinweis auf verlorene Formularfelder und Lesezeichen** beim Speichern. Gehört zu M4 (Formulare).
- **Automatischer Test der Größenlimits im Browser.** Die Logik ist per Unit-Test abgedeckt, eine 500-MB-Datei im Browser-Test wäre zu langsam.
- **Cloudflare Pages verbinden** (braucht dein Cloudflare-Konto, Schritte stehen im README).

## Offene Punkte

- Git-Anmeldung für GitHub auf diesem Rechner einrichten (derzeit kein Zugriff auf `origin`).
- Domain prüfen und sichern.
