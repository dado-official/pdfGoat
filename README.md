# PDFgoat 🐐

**Eats your PDFs. Never your data.**

Kostenloser PDF-Editor, der komplett im Browser läuft. Dateien werden nie hochgeladen:
PDF.js zeigt die Seiten an, MuPDF schreibt die neue PDF, alles lokal auf deinem Gerät.

## Was PDFgoat kann

- PDFs öffnen (Dateiauswahl oder Drag & Drop, mehrere auf einmal) mit Seitenvorschau
- Große Vorschau per Doppelklick, mit ← → blättern
- Seiten sortieren (Drag & Drop oder Pfeiltasten auf der Karte), drehen, löschen
- Mehrfachauswahl (Klick, Shift+Klick, Strg+A), Entf löscht, Strg+Z macht rückgängig, Strg+Y wiederholt
- Zusammenfügen: mehrere PDFs öffnen, ordnen, als eine PDF speichern
- Aufteilen: Auswahl als PDF, nach Bereichen (`1-3, 4, 5-`) oder alle N Seiten (mehrere Dateien als ZIP)
- Oberfläche auf Deutsch und Englisch (folgt der Browsersprache, umschaltbar)
- Klare Meldungen bei defekten, verschlüsselten und zu großen Dateien (Warnung ab 100 MB, Grenze 500 MB)

## Entwickeln

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # statische Seite in dist/
npm run preview  # dist/ lokal ansehen
npm run lint     # oxlint
npm test         # Unit-Tests (Vitest)
npm run test:e2e # Browser-Tests (Playwright, baut vorher)
npm run check    # alles zusammen, wie in der CI
```

Die Browser-Tests nutzen lokal das installierte Google Chrome, in der CI das Chromium von Playwright.
`dev` und `build` kopieren vorher die Laufzeitdateien von PDF.js nach `public/pdfjs/` (nicht im Repo).

Wie das Projekt aufgebaut ist und warum, steht in [docs/PLAN.md](docs/PLAN.md).

## Veröffentlichen

Die Seite ist rein statisch (`dist/`) und wird über **Cloudflare Pages** veröffentlicht:

1. Im Cloudflare-Dashboard unter *Workers & Pages* ein Pages-Projekt anlegen und das GitHub-Repo verbinden.
2. Build-Befehl `npm run build`, Ausgabeordner `dist`, Umgebungsvariable `NODE_VERSION=22`.
3. `main` wird danach bei jedem Push veröffentlicht, jeder Pull Request bekommt eine Vorschau-Adresse.

`.github/workflows/ci.yml` lässt bei jedem Push und Pull Request alle Prüfungen laufen.

## Datenschutz, technisch abgesichert

- Der Build schreibt eine strenge Content-Security-Policy in die Seite und in `dist/_headers`
  (beides aus `vite.config.ts`). `connect-src 'self'` lässt den Browser jede Verbindung zu fremden Servern ablehnen.
- Jeder Browser-Test bricht ab, sobald die Seite etwas anderes tut als Dateien vom eigenen Server zu laden (nur GET).
- PDF.js lädt Schriften, Zeichentabellen und Bilddecoder vom eigenen Server, nie von einem CDN.

## Technik

React 19 + TypeScript + Vite, [PDF.js](https://mozilla.github.io/pdf.js/) (Apache 2.0, Legacy-Build für ältere Browser),
[MuPDF.js](https://mupdf.com/) (AGPL, als WebAssembly), [fflate](https://github.com/101arrowz/fflate) (MIT) für ZIP.
MuPDF und fflate werden erst beim Speichern nachgeladen. pdf-lib (MIT) dient nur noch in den Tests als zweiter,
unabhängiger Leser, der die gespeicherten Dateien prüft.

- `src/core/`: reine Logik ohne React und DOM (Seitenbereiche, Größenlimits, Fehlercodes, Typen)
- `src/state/`: Seitenliste, Auswahl, Rückgängig und Wiederholen als Reducer
- `src/pdf/`: Anbindung an PDF.js (öffnen, rendern) und MuPDF (neue PDF schreiben, Formulare, Links und Lesezeichen mitnehmen)
- `src/features/`: Oberfläche je Funktion (`open`, `organize`, `merge-split`)
- `src/i18n/`: Texte auf Deutsch und Englisch, `src/ui/`: gemeinsame Bausteine
- Unit-Tests liegen neben dem Modul (`*.test.ts`), Browser-Tests in `tests/e2e/`

## Lizenz

PDFgoat ist freie Software unter der [GNU AGPL, Version 3 oder später](LICENSE). Wer eine veränderte
Fassung als Website anbietet, muss deren Quelltext ebenfalls offenlegen.

## Grenzen

- Passwortgeschützte und verschlüsselte PDFs werden noch nicht unterstützt und mit einer Meldung abgelehnt.
- Beim Zusammenfügen mehrerer Dateien werden gleichnamige Formularfelder umbenannt (`name`, `name_2`).
