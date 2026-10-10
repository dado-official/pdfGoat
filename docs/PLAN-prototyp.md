# PDFgoat – Plan des Prototyps (historisch)

> Dieses Dokument beschreibt den ersten Prototyp. Ordnerstruktur und Details sind seit M0/M1 überholt, der aktuelle Plan steht in [PLAN.md](PLAN.md).

Arbeitsweise: erst planen, dann umsetzen, dann testen. Dieses Dokument wird vor jedem neuen Feature ergänzt.

**Stand 10.10.2026:** Schritte 1–3 umgesetzt und getestet (32 Unit-Tests, 9 Browser-Tests, alle grün).

## Ziel und Leitplanken

- Kostenloser PDF-Editor als statische Website. **Keine Datei verlässt den Browser**: kein Backend, kein Upload, keine Tracker, keine externen Requests zur Laufzeit.
- Läuft in aktuellen Browsern inkl. Safari und Firefox, auch am Handy (Drag & Drop am Desktop, Buttons als Ersatz auf Touch).
- Statischer Build (`dist/`), deploybar auf Cloudflare Pages, Netlify oder GitHub Pages (relative Pfade, `base: './'`).

## Stack

| Bereich | Wahl | Grund |
| --- | --- | --- |
| UI | React 19 + TypeScript (strict) | Daniels Wahl, großes Ökosystem |
| Build | Vite | schnell, statischer Output |
| Anzeige | PDF.js (`pdfjs-dist`, **Legacy-Build**) | Der Standard-Build von v6 nutzt `Map.getOrInsertComputed`, das viele Browser noch nicht haben |
| Bearbeiten | pdf-lib | Seiten kopieren, drehen, neue PDF schreiben |
| ZIP | fflate | klein, schnell, für „Aufteilen“ mit mehreren Dateien |
| Tests | Vitest (Unit), Playwright (E2E) | |
| Lint | oxlint | kommt mit der Vite-Vorlage |

pdf-lib und fflate werden erst beim Speichern per `import()` nachgeladen, damit die Startseite schnell lädt.

## Architektur

Die Logik ist in reine, testbare Module getrennt; React-Komponenten zeigen nur an und lösen Aktionen aus.

```
src/
  lib/
    editor.ts     Reiner Reducer: Seitenliste, Auswahl, Rückgängig (kein DOM, kein PDF)
    ranges.ts     Reine Funktionen: Bereiche parsen ("1-3, 5-"), in N-er-Gruppen teilen, Dateinamen
    build.ts      Neue PDF aus Seitenliste bauen (pdf-lib), ZIP bauen (fflate) – läuft auch in Node
    pdf.ts        Browser-Grenze: PDF öffnen + Seiten rendern (PDF.js), Download auslösen
    types.ts      Gemeinsame Typen (PageRef)
  hooks/
    useThumbnails.ts   Vorschaubilder im Hintergrund rendern, Object-URLs aufräumen
    useWindowEvents.ts Dateien aufs Fenster ziehen, Tastenkürzel
  components/
    Toolbar, PageGrid/PageCard, Preview, SplitDialog, DropZone
  App.tsx         Verdrahtet State, Hooks und Komponenten
tests/            Vitest: editor, ranges, build (+ fixtures.ts erzeugt Test-PDFs)
e2e/              Playwright: echte Abläufe im gebauten Produkt
```

### Datenmodell

- `SourceDoc`: eine geöffnete Datei (`id`, `name`, `bytes`, PDF.js-Dokument, gecachtes pdf-lib-Dokument). Wird nie verändert.
- `PageRef`: ein Eintrag in der Arbeitsliste (`id`, `docId`, `srcIndex`, `rotation` zusätzlich zur Originaldrehung).
- Die Arbeitsliste ist die einzige Wahrheit über Reihenfolge, Drehung und gelöschte Seiten. Zusammenfügen = Seiten aus mehreren `SourceDoc`s in einer Liste.

### State (`editor.ts`)

`EditorState = { pages, selected, history }`, Aktionen:
`add`, `rotate(ids, delta)`, `remove(ids)`, `move(id, step)`, `moveTo(ids, targetId, side)`, `reverse`,
`toggleSelect(id, shift)`, `selectAll`, `clearSelection`, `undo`, `reset`.

Regeln: jede Änderung an der Seitenliste legt einen Undo-Schritt an (max. 50); Auswahländerungen nicht. Nach `remove` und `undo` enthält die Auswahl nur noch existierende Seiten.

### PDF-Verarbeitung

- **Öffnen**: Bytes einmal lesen; PDF.js bekommt eine Kopie (es überträgt den Buffer an seinen Worker). Passwortgeschützte Dateien werden mit klarer Meldung abgelehnt.
- **Vorschau**: PDF.js rendert jede Seite einmal in ~180 px Breite als Blob-URL; Drehen passiert per CSS, ohne neu zu rendern. Große Vorschau rendert bei Bedarf mit Drehung.
- **Speichern**: pdf-lib kopiert pro Quelldatei alle benötigten Seiten in einem Aufruf (geteilte Ressourcen wie Schriften nur einmal), setzt `Rotate = Original + Zusatz` und schreibt die neue PDF.
- **Aufteilen**: Gruppen von Positionen → je eine PDF → bei mehr als einer Datei ein ZIP.

## Tests

| Ebene | Werkzeug | Was |
| --- | --- | --- |
| Unit | Vitest | `editor.ts` (alle Aktionen, Undo, Auswahl), `ranges.ts` (gültige und ungültige Eingaben), `build.ts` (echte PDFs mit pdf-lib erzeugen, zusammenfügen, drehen, Reihenfolge und Drehung prüfen) |
| E2E | Playwright (Chromium) | Echter Ablauf im gebauten Produkt: zwei PDFs öffnen, Vorschaubilder, drehen, löschen, per Drag & Drop sortieren, rückgängig, speichern, aufteilen als ZIP, Auswahl speichern, große Vorschau. Ergebnisdateien werden mit pdf-lib geprüft. **Kein einziger Request außer an den lokalen Server.** |
| Statisch | `tsc`, oxlint | im Build bzw. `npm run lint` |

Testdateien werden im Test selbst mit pdf-lib erzeugt; jede Seite hat eine eindeutige Breite, so lässt sich jede Seite in der Ausgabe eindeutig wiedererkennen.

Befehle: `npm test` (Unit), `npm run test:e2e` (E2E, baut vorher), `npm run check` (alles). Eine GitHub-Action führt `check` bei jedem Push und Pull Request aus.

## Bekannte Grenzen und nächste Schritte

- Passwortgeschützte PDFs: noch nicht unterstützt.
- Lesezeichen und Formularfelder gehen beim Neuaufbau teilweise verloren (pdf-lib kopiert nur Seiten).
- Sehr große PDFs (mehrere hundert Seiten): Vorschaubilder werden alle nacheinander gerendert. Nächster Schritt: nur sichtbare Seiten rendern (IntersectionObserver).
- Touch: Sortieren per Drag & Drop nur am Desktop, am Handy über die Pfeil-Buttons.
- Danach laut Roadmap: 4 Text/Bilder/Unterschrift, 5 Formulare, 6 Komprimieren/OCR/Bild↔PDF, 7 PWA.
