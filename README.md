# PDFgoat 🐐

**Eats your PDFs. Never your data.**

Kostenloser PDF-Editor, der komplett im Browser läuft. Dateien werden nie hochgeladen:
MuPDF zeigt die Seiten an und schreibt die neue PDF, alles lokal auf deinem Gerät.

## Was PDFgoat kann

- **Lesen:** fortlaufende Ansicht mit Zoom, Suche, Text markieren und kopieren, Seitenleiste mit Miniaturen und Lesezeichen, Links, Drucken; mehrere Dokumente als Reiter, Befehlssuche (Strg+K)
- **Seiten:** sortieren, drehen, löschen, zusammenfügen, aufteilen, leere Seite einfügen, zuschneiden, auf ein Papierformat bringen, Kopf- und Fußzeile, Seitenzahlen, Wasserzeichen
- **Kommentieren:** markieren, unterstreichen, durchstreichen, Notiz, Textfeld, Zeichnen, Formen, Pfeile, Stempel, Kommentarliste; als echte PDF-Kommentare gespeichert
- **Ausfüllen und unterschreiben:** Formularfelder ausfüllen, Formular glätten, Unterschrift zeichnen, tippen oder als Bild, Datum, Häkchen, Kürzel; Formularfelder anlegen
- **Inhalt bearbeiten:** Text und Bilder einfügen, Links, bestehenden Text zeilenweise ändern, Bilder verschieben, ersetzen und löschen, Lesezeichen bearbeiten
- **Schützen:** echtes Schwärzen, Passwort und Berechtigungen, Prüfen und Bereinigen vor dem Weitergeben
- **Umwandeln:** Bilder als Seiten öffnen, Seiten als PNG, Text, Markdown oder einfaches Word exportieren, Texterkennung (Deutsch und Englisch), Komprimieren, zwei Dokumente vergleichen
- **Abläufe:** eine Folge von Schritten speichern und auf viele Dateien anwenden
- **Offline:** installierbar, läuft ohne Netz; wo der Browser es erlaubt, wird die Datei direkt überschrieben
- Oberfläche auf Deutsch und Englisch (folgt der Browsersprache, umschaltbar)

Alles läuft im Browser, nichts wird hochgeladen. Grenzen und Entscheidungen stehen in [docs/PLAN.md](docs/PLAN.md).

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
- Die Engine (WebAssembly) kommt vom eigenen Server, nie von einem CDN.

## Technik

React 19 + TypeScript + Vite, [MuPDF.js](https://mupdf.com/) (AGPL, als WebAssembly) für alles an der PDF-Datei, [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0) für die Texterkennung, [fflate](https://github.com/101arrowz/fflate) (MIT) für ZIP.
MuPDF läuft in zwei Workern (Anzeigen, Speichern). Die Dateien der Texterkennung werden erst bei Gebrauch geladen. pdf-lib (MIT) dient nur in den Tests als zweiter,
unabhängiger Leser, der die gespeicherten Dateien prüft.

- `src/core/`: reine Logik ohne React und DOM (Seitenbereiche, Größenlimits, Fehlercodes, Typen)
- `src/state/`: Seitenliste, Auswahl, Rückgängig und Wiederholen als Reducer
- `src/pdf/`: Anbindung an MuPDF: öffnen und rendern (`view.ts`), neue PDF schreiben (`engine.ts`, `build.ts`), Formulare, Links und Lesezeichen mitnehmen
- `src/features/`: Oberfläche je Funktion (`open`, `organize`, `merge-split`)
- `src/i18n/`: Texte auf Deutsch und Englisch, `src/ui/`: gemeinsame Bausteine
- Unit-Tests liegen neben dem Modul (`*.test.ts`), Browser-Tests in `tests/e2e/`

## Vor der Veröffentlichung

- Die Angaben des Betreibers in `src/legal/operator.ts` ausfüllen (Name, Anschrift, E-Mail, Adresse des Quellcodes). Solange etwas fehlt, zeigen Impressum, Datenschutz und Lizenzen eine rote Warnung.
- Das Repository öffentlich schalten, damit der angegebene Quellcode erreichbar ist (Pflicht aus der AGPL).
- Beim Hinzufügen einer Abhängigkeit sie in `src/legal/licenses.ts` eintragen (ein Test erinnert daran).

## Lizenz

PDFgoat ist freie Software unter der [GNU AGPL, Version 3 oder später](LICENSE). Wer eine veränderte
Fassung als Website anbietet, muss deren Quelltext ebenfalls offenlegen.

## Grenzen

- Passwortgeschützte und verschlüsselte PDFs werden noch nicht unterstützt und mit einer Meldung abgelehnt.
- Beim Zusammenfügen mehrerer Dateien werden gleichnamige Formularfelder umbenannt (`name`, `name_2`).
