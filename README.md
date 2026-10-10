# PDFgoat 🐐

**Eats your PDFs. Never your data.**

Kostenloser PDF-Editor, der komplett im Browser läuft. Dateien werden nie hochgeladen:
PDF.js zeigt die Seiten an, pdf-lib schreibt die neue PDF, alles lokal auf deinem Gerät.

## Was der Prototyp kann

- PDFs öffnen (Dateiauswahl oder Drag & Drop, mehrere auf einmal) mit Seitenvorschau
- Große Vorschau per Doppelklick, mit ← → blättern
- Seiten sortieren (Drag & Drop oder Pfeiltasten auf der Karte), drehen, löschen
- Mehrfachauswahl (Klick, Shift+Klick, Strg+A), Entf löscht, Strg+Z macht rückgängig
- Zusammenfügen: mehrere PDFs öffnen, ordnen, als eine PDF speichern
- Aufteilen: Auswahl als PDF, nach Bereichen (`1-3, 4, 5-`) oder alle N Seiten (mehrere Dateien als ZIP)

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

Vor dem ersten `test:e2e` einmalig den Testbrowser installieren: `npx playwright install chromium`.

Wie das Projekt aufgebaut ist und warum, steht in [PLAN.md](PLAN.md).

## Veröffentlichen

Die Seite ist rein statisch (`dist/`), jeder Gratis-Hoster reicht:

- **Cloudflare Pages / Netlify:** Repo verbinden, Build-Befehl `npm run build`, Ausgabeordner `dist`.
- **GitHub Pages:** Der Workflow in `.github/workflows/deploy.yml` testet und baut bei jedem Push auf `main`.
  `.github/workflows/ci.yml` lässt bei jedem Push und Pull Request alle Prüfungen laufen.
  Einmalig unter *Settings → Pages → Source* „GitHub Actions“ wählen.

## Technik

React 19 + TypeScript + Vite, [PDF.js](https://mozilla.github.io/pdf.js/) (Apache 2.0, Legacy-Build für ältere Browser),
[pdf-lib](https://pdf-lib.js.org/) (MIT), [fflate](https://github.com/101arrowz/fflate) (MIT) für ZIP.
pdf-lib und fflate werden erst beim Speichern nachgeladen.

- `src/lib/`: reine Logik (Seitenliste/Undo, Bereiche, PDF bauen) und die Browser-Grenze zu PDF.js
- `src/hooks/`: Vorschaubilder, Dateien aufs Fenster ziehen, Tastenkürzel
- `src/components/`: Werkzeugleiste, Seitenraster, große Vorschau, Aufteilen-Dialog
- `tests/`: Unit-Tests, `e2e/`: Browser-Tests

## Grenzen

- Passwortgeschützte PDFs werden noch nicht unterstützt.
- Formularfelder und Lesezeichen gehen beim Neuaufbau der PDF teilweise verloren.
