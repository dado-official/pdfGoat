# PDFgoat – Entwicklungsplan

Stand: 10.10.2026. M0 und M1 sind umgesetzt (siehe [Umsetzungsstand](#umsetzungsstand)). Am selben Tag wurde der Plan ab M2 neu ausgerichtet: weg von der Werkzeugsammlung, hin zu einem vollständigen PDF-Editor (siehe [Neuausrichtung](#neuausrichtung)).

## Ziel

Ein vollständiger PDF-Editor im Browser, im Umfang vergleichbar mit Acrobat: lesen, kommentieren, ausfüllen, unterschreiben, Inhalt bearbeiten, Seiten ordnen, schwärzen, schützen, scannen und umwandeln. Kostenlos, ohne Konto, und Dateien verlassen nie das Gerät. Slogan: „Eats your PDFs. Never your data.“

## Neuausrichtung

Der bisherige Plan reihte einzelne Funktionen aneinander (ordnen, zusammenfügen, aufteilen, komprimieren, OCR). Das ist dasselbe Muster wie bei PDF24: viele kleine Werkzeuge, jedes mit eigenem Ablauf. Neu gilt:

- **Ein Arbeitsraum statt vieler Werkzeuge.** Man öffnet ein Dokument und bleibt darin. Lesen, Kommentieren, Bearbeiten und Seiten ordnen sind Ansichten desselben geöffneten Dokuments, keine getrennten Seiten mit eigenem Öffnen und Herunterladen.
- **Das Dokument steht im Mittelpunkt, nicht die Seitenliste.** Die Startansicht nach dem Öffnen ist die lesbare Seite in voller Größe. Das heutige Seitenraster bleibt als Ansicht „Seiten“ erhalten.
- **Vollständiger Umfang.** Auch die Dinge, die der alte Plan ausgeschlossen hat, sind jetzt Ziel: bestehenden Text ändern, verschlüsselte PDFs öffnen und schützen, echtes Schwärzen, Lesezeichen und Formulare erhalten.

Das hat eine technische Folge, die den Rest des Plans bestimmt: pdf-lib reicht dafür nicht. Es kann Seiten kopieren und Neues daraufzeichnen, aber keine bestehenden Inhalte ändern, nicht schwärzen, nicht verschlüsseln, und es wird seit 2021 nicht mehr veröffentlicht. PDFgoat braucht eine echte PDF-Engine als WebAssembly. Gewählt ist MuPDF.js (siehe [PDF-Engine](#pdf-engine)).

## Getroffene Entscheidungen

| Thema | Entscheidung |
| --- | --- |
| Framework | React + TypeScript + Vite |
| Produktform | Ein Editor mit Ansichten, keine Werkzeugsammlung (neu, 10.10.2026) |
| PDF-Engine | MuPDF.js als WebAssembly im Worker, löst pdf-lib (M2) und PDF.js (M3) ab (neu, 10.10.2026) |
| Lizenz | Open Source unter AGPL-3.0, Quelltext öffentlich auf GitHub (neu, 10.10.2026) |
| Veröffentlichung | Erste öffentliche Version nach M3, nicht vorher (neu, 10.10.2026) |
| OCR | Tesseract.js, Sprachdaten selbst gehostet |
| Hosting | Cloudflare Pages |
| Sprache | Deutsch und Englisch von Anfang an |
| Arbeitsweise | Erst planen, dann umsetzen, dann testen |

## Grundprinzipien

1. **Kein Upload, nachweisbar.** Nach dem Laden der Seite gibt es keine Anfragen an fremde Server und keine Anfragen, die Dateiinhalte enthalten. Ein automatischer Test prüft das bei jedem Build (siehe Tests). Das gilt für jede Funktion, auch für OCR und Umwandeln. Was sich lokal nicht in brauchbarer Qualität machen lässt, wird nicht über einen Server gelöst, sondern weggelassen oder ehrlich als eingeschränkt gekennzeichnet.
2. **Alles selbst gehostet.** Keine CDNs, keine externen Schriften, kein Analytics. Engine, Schriften und OCR-Sprachdaten liegen auf der eigenen Domain.
3. **Original bleibt unangetastet.** Die geöffnete Datei wird nie verändert. Bearbeitungen sind eine Liste von Änderungen, aus der erst beim Speichern ein neues PDF entsteht. Das macht Rückgängig/Wiederholen einfach und verhindert Datenverlust.
4. **Kleine Startseite.** Engine und jede Ansicht werden erst bei Bedarf nachgeladen (Code-Splitting). Die Startseite lädt ohne Engine.
5. **Ein Editor, kein Werkzeugkasten, und ein eigenes Gesicht.** Keine Kachelübersicht mit „PDF zusammenfügen“, „PDF komprimieren“ und so weiter, weder als Startseite noch als Navigation. PDFgoat sieht weder wie PDF24 noch wie Acrobat aus (Layout, Farben, Icons, Formulierungen). Bei jeder Arbeit an Oberfläche und Texten wird das geprüft.
6. **Was drin ist, bleibt drin.** Speichern darf nichts stillschweigend verlieren. Lesezeichen, Formularfelder, Links, Kommentare und Metadaten überleben jede Bearbeitung, außer der Nutzer entfernt sie bewusst.

## Funktionsumfang

Der Maßstab ist Acrobat Pro. Die Tabelle zeigt, was wann kommt und wo die Grenzen im Browser liegen.

| Bereich | Funktionen | Meilenstein |
| --- | --- | --- |
| Lesen | Fortlaufende Ansicht, Zoom, Suche, Text markieren und kopieren, Lesezeichen, Links, Drucken | M3 |
| Seiten | Sortieren, drehen, löschen, zusammenfügen, aufteilen (vorhanden), dazu einfügen, leere Seite, zuschneiden, Seitengröße | M1, M6 |
| Kommentieren | Markieren, unterstreichen, durchstreichen, Notiz, Freihand, Formen, Textfeld, Stempel, Kommentarliste | M4 |
| Ausfüllen und Unterschreiben | Formularfelder ausfüllen, Formular glätten, Unterschrift zeichnen, tippen oder als Bild, Datum und Kürzel | M5 |
| Inhalt bearbeiten | Bestehenden Text ändern, Text und Bilder einfügen, Bilder verschieben, ersetzen, löschen, Links, Kopf- und Fußzeile, Seitenzahlen, Wasserzeichen | M6 |
| Schützen | Echtes Schwärzen, Passwort und Berechtigungen setzen und entfernen, Metadaten und versteckte Inhalte entfernen | M7 |
| Scannen und Umwandeln | OCR, Bild ↔ PDF, komprimieren, Export als Text und Bilder, PDF → Word, zwei PDFs vergleichen | M8 |
| Erstellen und Automatisieren | Formularfelder anlegen, Lesezeichen bearbeiten, Abläufe für viele Dateien | M9 |
| Offline | Installierbar als PWA, Datei direkt überschreiben, „Öffnen mit“ | M10 |
| Später | Signatur mit Zertifikat (PAdES), PDF/A, Barrierefreiheits-Tags | nach M10 |

Bewusst nicht im Umfang: XFA-Formulare, JavaScript in PDFs ausführen, Druckvorstufe (Preflight, Farbseparation), Word/Excel → PDF (dafür bräuchte es eine komplette Office-Engine im Browser).

## Design

Festgelegt am 10.10.2026, Arbeitsansicht am selben Tag an die Neuausrichtung angepasst. Vorgaben von Daniel: nicht nach PDF24 aussehen, auf den ersten Blick als PDF-Editor erkennbar sein, und ein vollständiger Editor sein statt einer Werkzeugsammlung.

- **Startseite:** große Überschrift „PDFs bearbeiten, ohne Upload.“, ein Button „PDF auswählen“, vier kurze Zeilen dazu, was man tun kann, und eine Zeichnung gestapelter PDF-Seiten. Keine Liste einzelner Werkzeuge.
- **Arbeitsansicht:** Das Dokument liegt groß in der Mitte auf einer hellgrauen Fläche. Links eine schmale Leiste mit den Ansichten (Lesen, Seiten, Kommentieren, Ausfüllen, Bearbeiten, Schützen). Rechts ein Bereich, der zum gerade Gewählten passt (Eigenschaften eines Textfelds, Kommentarliste, Lesezeichen) und sonst eingeklappt ist. Auf schmalen Bildschirmen rückt die Leiste nach unten, der rechte Bereich wird zum Blatt von unten.
- **Befehlssuche:** `Strg+K` öffnet ein Eingabefeld, das jede Funktion findet („schwärzen“, „Seite 3 drehen“, „Passwort“). Das ersetzt die Werkzeugübersicht und ist der schnellste Weg zu selten gebrauchten Funktionen.
- **Änderungsliste:** Jede Bearbeitung steht sichtbar in einer Liste und lässt sich dort zurücknehmen. Vor dem Speichern sieht man, was die neue Datei vom Original unterscheidet.
- **Farben:** Papierweiß `#f7f8f8`, Tinte `#1c2126`, Grau `#5d666d` für Nebentext und genau eine Signalfarbe, Gelbgrün `#d2e84a`, für die Hauptaktion und Markierungen. Nur helles Design.
- **Schrift:** Archivo (OFL, selbst gehostet). Schmal und fett für Überschriften, Zahlen und Werkzeuge, normal breit für Lesetext.
- **Abgrenzung:** zwei Hörner als Zeichen statt eines Maskottchens, eckige Kanten mit harten Schatten statt runder Kacheln, kein Werkzeug-Raster, keine gestrichelte Ablagebox. Gegenüber Acrobat: keine Menüleiste mit verschachtelten Menüs, kein Rot.

## Architektur

Vier Schichten, Abhängigkeiten zeigen nur nach unten:

```
features/   Oberfläche je Ansicht (React)
state/      Dokumentzustand (Reducer + Context, Änderungsliste, Undo/Redo)
pdf/        Engine-Schnittstelle, Worker, Adapter
core/       Reine Logik ohne React und ohne DOM
```

### PDF-Engine

Die Engine läuft als WebAssembly in einem Web Worker und hält das geöffnete Dokument. Sie rendert Seiten, liefert Text mit Positionen, liest und schreibt Kommentare, Formularfelder und Seiteninhalte und speichert das Ergebnis. Die Oberfläche spricht nur mit einer eigenen Schnittstelle (`pdf/engine.ts`), nie direkt mit der Bibliothek. So bleibt ein späterer Wechsel klein.

Gewählt ist **MuPDF.js**. Zur Einordnung der Vergleich mit der Alternative:

| | MuPDF.js | PDFium (WebAssembly) |
| --- | --- | --- |
| Lizenz | AGPL (oder kostenpflichtig) | BSD/Apache, frei verwendbar |
| Schwärzen | eingebaut | muss selbst gebaut werden |
| Verschlüsseln beim Speichern | eingebaut | nein, zusätzlich qpdf (Apache 2.0) nötig |
| Kommentare, Formulare | ja | ja |
| Bestehenden Text ändern | eingeschränkt | eingeschränkt |
| Herkunft | Artifex, offizielles npm-Paket | Engine aus Chrome, mehrere WebAssembly-Builds |

Der Grund für MuPDF.js: Es deckt Schwärzen, Verschlüsselung und Reparatur defekter Dateien ohne Eigenbau ab. Die AGPL verlangt dafür, dass der Quelltext von PDFgoat offenliegt. Das ist entschieden und passt zum Versprechen „kein Upload, nachweisbar“: Jeder kann nachlesen, was die Seite tut.

Die Angaben in der Tabelle stammen aus meinem Wissensstand. M2 beginnt deshalb mit einer kurzen Prüfung an echten Dateien. Fällt MuPDF.js dort durch (Größe, Geschwindigkeit, fehlende Funktion), ist PDFium mit qpdf der Ersatz. Die Schnittstelle `pdf/engine.ts` hält diesen Wechsel klein.

PDF.js bleibt bis M3 für die Anzeige. Sobald Inhalte bearbeitet werden, muss die Anzeige aus derselben Engine kommen wie die Bearbeitung, sonst zeigt die Seite etwas anderes als gespeichert wird. Ab M3 rendert daher die Engine, PDF.js entfällt.

### Dokumentmodell

- `sources`: die geöffneten Dateien als unveränderte Bytes, jede mit einer ID.
- `pages`: geordnete Liste von Seiten, jede mit `id`, `sourceId`, `sourceIndex`, `rotation` (wie heute).
- `changes`: die Änderungsliste. Jeder Eintrag ist ein Befehl mit Daten, zum Beispiel „Kommentar hinzufügen“, „Textzeile ändern“, „Bereich schwärzen“, „Formularfeld setzen“. Koordinaten immer in PDF-Einheiten der Seite.
- Arbeitskopie: Die Engine im Worker hält ein Dokument, auf das die Änderungsliste angewendet ist. Sie ist abgeleitet und kann jederzeit aus `sources` und `changes` neu aufgebaut werden.

Rückgängig entfernt den letzten Eintrag. Die Engine macht den Schritt entweder selbst rückgängig oder baut die Arbeitskopie vom letzten Zwischenstand neu auf. Welcher Weg schnell genug ist, klärt M2.

**Speichern** schreibt die Arbeitskopie vollständig neu, nie als angehängte Änderung. Nur so sind gelöschte Seiten und geschwärzte Inhalte wirklich aus der Datei verschwunden.

**Vorschau:** Seiten werden nur gerendert, wenn sie sichtbar sind, in der Auflösung des aktuellen Zooms und in Kacheln bei starker Vergrößerung.

## Ordnerstruktur

```
pdfGoat/
├─ public/
│  └─ engine/               WebAssembly, Schriften (beim Build kopiert, nicht im Repo)
├─ src/
│  ├─ core/                 ranges, limits, errors, types, changes (rein, gut testbar)
│  ├─ pdf/                  engine.ts (Schnittstelle), worker.ts, Adapter zur Engine
│  ├─ state/                editor.ts: Reducer mit Änderungsliste und Undo/Redo
│  ├─ features/
│  │  ├─ open/              Datei öffnen, Drag & Drop, Passwortabfrage
│  │  ├─ read/              Leseansicht, Zoom, Suche, Lesezeichen
│  │  ├─ organize/          Seiten sortieren, drehen, löschen
│  │  ├─ merge-split/       Zusammenfügen, Aufteilen
│  │  ├─ comment/           Markieren, Notizen, Zeichnen
│  │  ├─ fill-sign/         Formulare ausfüllen, Unterschrift
│  │  ├─ edit/              Text und Bilder bearbeiten
│  │  ├─ protect/           Schwärzen, Passwort, Bereinigen
│  │  ├─ convert/           OCR, Komprimieren, Export, Vergleichen
│  │  └─ command/           Befehlssuche
│  ├─ ui/                   gemeinsame Bausteine (Buttons, Dialoge, Layout)
│  ├─ i18n/                 de.ts, en.ts, translate.ts, I18nProvider
│  ├─ pages/                Start, Offenlegung, Datenschutz, Lizenzen
│  └─ main.tsx
├─ tests/
│  ├─ e2e/                  Playwright-Tests
│  ├─ fixtures.ts           erzeugt Test-PDFs im Code
│  └─ files/                echte Test-PDFs (verschlüsselt, Formulare, Scans, defekt)
├─ scripts/
├─ docs/PLAN.md
└─ .github/workflows/ci.yml
```

Unit-Tests liegen direkt neben dem Modul (`ranges.test.ts`).

## Meilensteine

Jeder Meilenstein läuft nach demselben Muster: planen, umsetzen, testen, Review, dann veröffentlichen. Nach jedem Meilenstein ist die App benutzbar und veröffentlichbar.

### M0 – Fundament (fertig)

Vite + React + TypeScript, Vitest und Playwright mit No-Network-Test, CI, strenge CSP, i18n.

### M1 – Seiten ordnen, zusammenfügen, aufteilen (fertig)

PDF öffnen mit Seitenvorschau, Seiten sortieren, drehen, löschen, zusammenfügen, aufteilen, Download. Fehlermeldungen für verschlüsselte, defekte und zu große Dateien.

### M2 – Engine und Dokumentmodell

Das Fundament für alles Weitere. Sichtbar ändert sich wenig, aber die bekannten Verluste verschwinden.

- Prüfung von MuPDF.js an echten Testdateien: Größe des Downloads, Startzeit, Renderzeit, Speicherbedarf bei 500 Seiten, Verhalten bei defekten Dateien. Dazu ein Probelauf für Schwärzen, Verschlüsseln und Textänderung, damit die Annahmen für M6 und M7 früh bestätigt sind.
- `LICENSE` (AGPL-3.0) ins Repo, Lizenzangabe in `package.json` und README
- `pdf/engine.ts` als Schnittstelle, Engine im Worker, Fortschritt und Abbruch für lange Aufgaben
- Änderungsliste im Dokumentmodell, Undo/Redo darüber
- Speichern, Zusammenfügen und Aufteilen laufen über die Engine. Lesezeichen, Formularfelder und Links bleiben erhalten. Beim Zusammenfügen mehrerer Dateien stehen die Lesezeichen jeder Datei unter einem Eintrag mit dem Dateinamen. Formularfelder mit gleichem Namen aus verschiedenen Dateien werden umbenannt, damit sie sich nicht gegenseitig überschreiben.
- Verschlüsselte PDFs mit Passwortabfrage öffnen
- pdf-lib wird entfernt

Fertig, wenn alle Tests aus M1 mit der neuen Engine grün sind und zusätzlich Tests belegen, dass Lesezeichen, Formularfelder und Links das Speichern überleben.

### M3 – Lesen

Stand: Schritt 1 (die Engine rendert, PDF.js ist entfernt) und Schritt 2 (fortlaufende Seitenansicht mit Zoom) Schritt 3 (Textebene, Suche, Kopieren) Schritt 4 (Seitenleiste, Lesezeichen, Links) und Schritt 5 (Drucken) und Schritt 6 (Arbeitsansicht mit Befehlssuche und Reitern) sind fertig. M3 ist damit abgeschlossen, offen sind nur die erste Veröffentlichung und die Punkte unter „Rechtliches“. Früher geplante Reihenfolge: Arbeitsansicht mit Befehlssuche, mehrere Dokumente als Reiter.

Ab hier fühlt sich PDFgoat wie ein Editor an und nicht wie ein Seitensortierer.

- Fortlaufende Seitenansicht, Zoom (Breite, ganze Seite, Prozent), Blättern per Tastatur
- Text markieren und kopieren, Suche mit Treffern im Dokument
- Seitenleiste mit Miniaturen und Lesezeichen, anklickbare Links
- Drucken
- Neue Arbeitsansicht mit Ansichtenleiste und Befehlssuche, das Seitenraster wird zur Ansicht „Seiten“
- Die Engine rendert, PDF.js wird entfernt
- Mehrere geöffnete Dokumente als Reiter (jede Datei ein Reiter, Zusammenfügen als eigener Schritt, entschieden am 10.10.2026)

### M4 – Kommentieren

Stand: umgesetzt (10.10.2026). Kommentare liegen als Daten an der Seite (`PageRef.annots`, Positionen in Seitenpunkten der unrotierten Seite) und ändern sich über die Änderung `annotate`, daher gehen Rückgängig, Wiederholen, Verschieben und Kopieren in neue Reiter von selbst. Beim Speichern schreibt `pdf/annotate.ts` sie als echte PDF-Annotationen (vor der zusätzlichen Drehung der Seite). Gelöschte Kommentare der Datei werden über ihre Position in `listComments` aus der Arbeitskopie entfernt und beim Zeichnen ausgeblendet. Drucken und Vorschau backen die neuen Kommentare über den View-Worker ins Bild. Bekannte Grenzen: vorhandene Kommentare lassen sich löschen, aber nicht bearbeiten oder verschieben; neue Kommentare lassen sich verschieben, aber nicht in der Größe ändern; Text im Textfeld ist auf die Zeichen der Standardschrift Helvetica beschränkt; die Miniaturen im Seitenraster zeigen keine Kommentare; die Stempel sind fest (fünf Texte, in der Sprache der Oberfläche beim Anlegen).

- Markieren, unterstreichen, durchstreichen auf markiertem Text
- Notiz, Textfeld, Freihand, Rechteck, Ellipse, Linie, Pfeil, Stempel
- Kommentarliste rechts, bearbeiten und löschen, vorhandene Kommentare aus anderen Programmen anzeigen
- Gespeichert als echte PDF-Kommentare, damit Acrobat und andere Programme sie lesen und weiterbearbeiten können

### M5 – Ausfüllen und Unterschreiben

Stand: umgesetzt (10.10.2026). Formularwerte liegen wie Kommentare an der Seite (`PageRef.fields`, Schlüssel ist die Position unter den Widgets der Seite) und ändern sich über die Änderung `fill`. Die Leseansicht zeichnet Seiten mit Feldern ohne die Felder und legt eigene Steuerelemente darüber (`features/form/FormLayer.tsx`). Beim Speichern schreibt `pdf/forms.ts` die Werte in die Arbeitskopie vor dem Zusammenfügen, MuPDF erzeugt die Darstellung. „Formular glätten“ ist eine Wahl in der Leiste und ruft `bake(false, true)` auf, Kommentare bleiben dabei Kommentare. Datum, Häkchen, Unterschrift und Kürzel sind Kommentare mit einem `tag` (Textfeld oder Bild), Unterschrift und Kürzel entstehen im Dialog durch Zeichnen, Tippen oder ein Bild und können im lokalen Speicher des Browsers gemerkt werden. Bekannte Grenzen: Auswahllisten mit Mehrfachauswahl werden als einfache Liste behandelt; Felder mit JavaScript-Berechnung werden nicht neu berechnet; Signaturfelder und Schaltflächen sind nicht ausfüllbar; die getippte Unterschrift nutzt eine Schreibschrift des Systems und sieht deshalb je nach Gerät anders aus; digitale Signaturen mit Zertifikat folgen nach M10.

- Formularfelder ausfüllen: Text, Checkbox, Radiobutton, Auswahlliste, Datum
- Option „Formular glätten“ (Felder fest ins PDF schreiben)
- Unterschrift zeichnen, tippen oder als Bild laden, optional lokal im Browser merken
- Text, Datum, Häkchen und Kürzel frei platzieren, für PDFs ohne echte Formularfelder

### M6 – Inhalt bearbeiten

Stand: beide Stufen umgesetzt (10.10.2026).

Stand Stufe 1: umgesetzt (10.10.2026). Eingefügter Text und Bilder sind Kommentare mit dem Merkmal `embed`; `pdf/embed.ts` schreibt sie beim Speichern als Seiteninhalt (Inhaltsstrom, eingebettete Schrift, Bild als XObject), Koordinaten in Seitenpunkten wie im Leseansicht, umgerechnet über die Seitenmatrix. Die Schrift ist ein eingebettetes Helvetica mit WinAnsi-Zeichensatz: deutsche und westeuropäische Zeichen, Euro und typografische Anführungszeichen. Andere Zeichen (Griechisch, Kyrillisch, CJK) kann sie nicht schreiben, sie werden durch ? ersetzt und die Oberfläche zeigt vorher an, welche. Links sind Kommentare der Art `link`; nur http, https, mailto und tel werden gespeichert. Kopf- und Fußzeile, Seitenzahlen und Wasserzeichen sind `Mark`s an den Seiten (Text mit {n}, {total}, {date}), die Nummer richtet sich nach der Stelle in der gespeicherten Datei. „Zuschneiden“ setzt MediaBox und CropBox (der Inhalt außerhalb bleibt in der Datei, nur ausgeblendet; Schwärzen ist für das endgültige Entfernen gedacht), „Seitengröße“ skaliert Inhalt, Kommentare, Links und Felder (`pdf/pagebox.ts`) und zentriert. Leere Seiten sind eine erzeugte Ein-Seiten-Datei (`generated`), die nicht als eigene Datei zählt. Seiten, deren Inhalt sich beim Speichern ändert, werden für Vorschau und Druck als fertige Seite gebaut (`pdf/render.ts`). Bekannte Grenzen: die Leseansicht zeigt Zuschnitt als abgedunkelten Rand und Kopf- und Fußzeilen als Vorschau, eine geänderte Seitengröße zeigt sie nicht; die Miniaturen im Seitenraster zeigen keine der Änderungen; Textfelder werden in der Leseansicht mit der Schrift des Browsers gezeigt und können leicht anders umbrechen als im PDF.

Stufe 2 (umgesetzt): Bestehender Text wird zeilenweise geändert, Bilder lassen sich entfernen, verschieben, verkleinern, vergrößern und ersetzen. Technik: MuPDF schneidet die alte Zeile oder das alte Bild aus der Seite (derselbe Schritt wie echtes Schwärzen, `pdf/edit.ts`, Redact-Annotationen ohne schwarze Fläche), danach wird der neue Text oder das neue Bild an die Stelle geschrieben. Die Zeile übernimmt Größe, Position und Farbe der alten; die Schrift ist die ähnlichste der 14 Standardschriften (Helvetica, Times, Courier, je fett und kursiv), die ursprüngliche Schrift wird nicht weiterverwendet und die Oberfläche sagt das. Die Nachbarzeilen bleiben unberührt (per Test belegt). Bekannte Grenzen: nur waagerechte Zeilen; Absätze werden nicht umbrochen, jede Zeile wird einzeln geändert; Ein Bild wird beim Verschieben so übernommen, wie es auf der Seite aussieht (gedreht, gespiegelt, mit Transparenz; per Test belegt), in der Auflösung der Datei; ein Bild wird nur an seinem Rahmen verschoben oder skaliert, nicht beschnitten; bereits in der Datei vorhandene Schwärzungsmarkierungen würden beim Speichern einer Seite mit Änderungen mit angewendet.

Der schwierigste Meilenstein, deshalb in zwei Stufen.

1. Einfügen: Text mit eingebetteter Schrift (Umlaute und Sonderzeichen sicher), Bilder (PNG, JPEG), Links, Kopf- und Fußzeile, Seitenzahlen, Wasserzeichen. Seiten zuschneiden, Seitengröße ändern, leere Seite einfügen.
2. Bestehendes ändern: Bilder verschieben, skalieren, ersetzen, löschen. Text zeilenweise ändern. Fehlt ein Zeichen in der eingebetteten Schrift, wird eine ähnliche Schrift eingesetzt und das angezeigt.

Grenze, die offen gesagt wird: Ein PDF kennt keine Absätze, nur einzeln platzierte Textstücke. Tippfehler korrigieren und Zeilen umformulieren geht gut. Ganze Absätze neu umbrechen wie in einer Textverarbeitung gelingt auch Acrobat nur teilweise und kommt, wenn überhaupt, später.

### M7 – Schützen

Stand: umgesetzt (10.10.2026). **Schwärzen** (`pdf/protect.ts`, `redactPage`): Bereiche sind Kommentare der Art `redact`, per Werkzeug gezogen oder mit „Treffer schwärzen“ aus der Suche übernommen. Beim Speichern, nachdem alles andere auf der Seite liegt, werden Text, Bildpunkte und Linien darunter aus dem Seiteninhalt entfernt (MuPDF-Redaktion), Kommentare, Links und Felder, die den Bereich berühren, gelöscht und der Bereich schwarz gefüllt. Der Text wird nur dort entfernt, wo er den Bereich ohne dessen oberen und unteren Rand trifft, weil die Rahmen von Suchtreffern in die Nachbarzeilen ragen (per Test belegt); Bilder und Linien werden am ganzen Rahmen geschnitten. Die Datei im Speicher bleibt unverändert, Rückgängig geht weiter. Die gesuchten Wörter stehen danach nirgends mehr in der Datei (per Test auf den Rohbytes geprüft). **Passwort und Berechtigungen:** AES-256 beim Speichern, Passwort zum Öffnen, Passwort für die Berechtigungen, Drucken, Kopieren, Ändern, Kommentieren einzeln erlaubbar; Passwörter dürfen kein Komma enthalten, weil die Optionen der Engine als kommagetrennter Text übergeben werden. Ohne Eingabe wird immer ohne Schutz gespeichert (das ist zugleich „Schutz entfernen“, geöffnet wird mit Passwort). Einschränkungen ohne Passwort zum Öffnen sind nur eine Bitte an das öffnende Programm, die Oberfläche sagt das. **Prüfen vor dem Weitergeben:** zeigt je Datei Titel, Autor, Thema, Stichwörter, Erstellprogramm, Ebenen, Formularfelder und Anhänge und zählt Kommentare, Vorschaubilder und Skripte; beim Speichern lassen sich Metadaten (auch XMP), Anhänge, alle Kommentare, Vorschaubilder und JavaScript entfernen. Ebenen lassen sich nicht entfernen, weil ausgeblendeter Inhalt sonst sichtbar würde; die Oberfläche rät dort zum Schwärzen. Die Einstellungen gelten für alle Speicherungen der Sitzung und werden nicht gemerkt, Passwörter bleiben nur im Arbeitsspeicher. Bekannte Grenzen: Bereits in der Datei vorhandene Schwärzungsmarkierungen werden beim Speichern einer Seite mit Bearbeitungen mit angewendet; das Erkennen von Skripten ist nur eine Stichprobe (Datei-Aktionen, Namensbaum, Seitenaktionen), nicht jede Stelle, an der ein PDF Code tragen kann.

- Schwärzen: Bereiche oder Suchtreffer markieren, dann anwenden. Text, Bildausschnitte und Kommentare unter der Fläche werden aus der Datei entfernt, nicht nur überdeckt.
- Passwort zum Öffnen und Berechtigungen setzen, Schutz entfernen (mit Passwort)
- „Vor dem Weitergeben prüfen“: Metadaten, Kommentare, versteckte Ebenen, Anhänge und eingebettete Miniaturen anzeigen und entfernen

### M8 – Scannen und Umwandeln

Stand: umgesetzt (10.10.2026), alle sechs Punkte. **Bild → PDF:** PNG, JPEG, WebP, GIF und BMP lassen sich wie PDFs öffnen (Auswahl und Ziehen); jedes Bild wird eine Seite in der Größe bei 150 dpi, gespeichert als JPEG mit hoher Qualität, Transparenz wird weiß (`core/imagePdf.ts`). **PDF → Bild:** PNG je Seite, mehrere als ZIP, mit 72, 150 oder 300 dpi; berücksichtigt alle Änderungen. **Text und Markdown:** Absätze und Überschriften werden aus Zeilenabständen und Schriftgrößen geraten (`core/textExport.ts`), getrennte Wörter am Zeilenende werden zusammengesetzt; der Text kommt aus den Seiten der Datei samt erkanntem Text, eigene Textänderungen sind darin nicht enthalten. **Texterkennung:** Tesseract.js, Engine und Sprachdaten (Deutsch, Englisch, `best_int`) liegen unter `/ocr` auf der Seite selbst (`scripts/copy-ocr.mjs`, vor `dev` und `build`) und werden erst beim Start der Erkennung geladen, rund 4 bis 13 MB je nach Prozessor und Sprache. Die erkannten Wörter sind an der Seite gemerkt und werden beim Speichern als unsichtbarer Text unter das Bild geschrieben (Darstellungsart 3, auf die Wortbreite gedehnt), im Leseansicht sind sie markierbar und kopierbar, die Suche im Dokument findet sie noch nicht (sie sucht in der Datei, nicht in der Änderungsliste). **Komprimieren:** Bilder werden auf höchstens 2400, 1600 oder 1000 Pixel Kantenlänge verkleinert und als JPEG neu gespeichert (nur Grau und Farbe, 8 Bit, ohne Maske, nur wenn es kleiner wird); die Oberfläche zeigt Größe vorher und nachher und speichert dann. **Vergleichen:** zwei geöffnete Dokumente Seite für Seite, Wörter entfernt und hinzugefügt nebeneinander, dazu ein Bildvergleich (Überlagerung mit Differenz, dunkel heißt anders). **PDF → Word:** eigener Versuch gemacht, bleibt als einfache Umwandlung drin (`core/docx.ts`: Text, Absätze, Überschriften, Seitenumbrüche), ausdrücklich nicht für Spalten, Tabellen und Bilder; die Datei ist nach dem Aufbau der .docx-Spezifikation gebaut und per Test auf wohlgeformtes XML geprüft, aber nicht in Word selbst geöffnet, weil dafür hier nichts installiert ist. Bekannte Grenzen: die Texterkennung hat nur Deutsch und Englisch; Seiten werden nicht automatisch gedreht; die Erkennung bricht erst zwischen zwei Seiten ab; Bilder mit Transparenz oder Masken werden beim Komprimieren nicht angefasst; die Dateien der Erkennung machen das Veröffentlichungspaket um etwa 20 MB größer.

1. Bild → PDF und PDF → Bild
2. OCR mit Tesseract.js: Sprachdaten Deutsch und Englisch erst bei Nutzung geladen, Ergebnis als durchsuchbare Textebene
3. Komprimieren: Bilder neu kodieren und verkleinern, ungenutzte Objekte entfernen. Größe vorher und nachher wird angezeigt.
4. Export als reiner Text und als Markdown
5. Zwei PDFs vergleichen (Textunterschiede nebeneinander)
6. PDF → Word: erst nach einem eigenen Versuch. Eine brauchbare Umwandlung muss Absätze, Spalten und Tabellen aus Positionen erraten. Ist das Ergebnis lokal nicht gut genug, bleibt es beim Textexport.

### M9 – Erstellen und Automatisieren

Stand: umgesetzt (10.10.2026). **Formularfelder anlegen:** Eingabefeld, Kästchen, Optionsfeld und Auswahlliste lassen sich auf die Seite setzen (`core/formfields.ts`, `pdf/fields.ts`). Beim Speichern entstehen echte Felder im AcroForm; MuPDF zeichnet ihr Aussehen. Optionsfelder mit gleichem Namen bilden eine Gruppe, jedes bekommt einen eigenen Zustand nach seinem Wert (die Engine nennt ihn sonst „Yes“, dann wären alle zugleich gewählt); gleiche Namen bei anderen Feldern werden mit „-2“ unterschieden. Name, Pflicht, nur lesen, mehrere Zeilen, Einträge und Wert lassen sich im Kommentarbereich ändern. Felder der Datei lassen sich dort löschen. Beim Prüfen fiel ein Fehler im Leser auf: Ein gewähltes Optionsfeld einer Gruppe galt bei allen Knöpfen als gewählt, weil der Wert der Gruppe für alle gleich ist; jetzt zählt der Zustand des einzelnen Knopfs. Grenzen: vorhandene Felder lassen sich löschen, aber nicht in ihren Eigenschaften ändern; Schaltflächen, Signaturfelder und Berechnungen sind nicht dabei. **Lesezeichen:** Umbenennen, Verschieben, Einrücken, Auf eine andere Seite zeigen lassen, Anlegen und Löschen (`core/bookmarks.ts`, `pdf/outline.ts`). Die Lesezeichen hängen an der Seiten-Kennung und folgen den Seiten; sie sind eine eigene Änderung (`outline`), also mit Rückgängig; „Die der Dateien wiederherstellen“ geht zurück zu den ursprünglichen. Ohne eigene Bearbeitung bleiben die der Dateien wie bisher. **Abläufe:** eine Liste von Schritten (Kopf-/Fußzeile oder Wasserzeichen, Drehen, Zuschneiden, Seitengröße, Komprimieren, Passwort, Bereinigen, Formular glätten) wird im Browser gemerkt (lokaler Speicher), als Datei gesichert und wieder geladen und auf viele PDFs angewendet; das Ergebnis kommt als ZIP (`core/workflow.ts`, `pdf/batch.ts`). Jeder Schritt ist dieselbe Änderung wie von Hand, ein Ablauf ist also eine aufgezeichnete Änderungsliste samt Speicheroptionen. Passwörter werden nie gemerkt oder gesichert, sie werden vor jeder Ausführung neu eingegeben. Grenzen: Dateien mit Passwort lassen sich im Stapel nicht öffnen und werden mit Meldung übersprungen; Texterkennung, Kommentare und Schwärzungen sind keine Schritte (sie brauchen eine Entscheidung je Seite).

- Formularfelder anlegen und bearbeiten
- Lesezeichen anlegen, umbenennen, verschieben
- Abläufe: eine Folge von Schritten (zum Beispiel „Wasserzeichen, komprimieren, Passwort“) speichern und auf viele Dateien anwenden. Die Änderungsliste aus M2 ist dafür die Grundlage.

### M10 – Offline als PWA

- `vite-plugin-pwa`, App-Dateien und Engine vorab im Cache, OCR-Sprachdaten erst bei erster Nutzung
- Installierbar auf Desktop und Handy, „Öffnen mit PDFgoat“ für PDF-Dateien
- Datei direkt überschreiben statt herunterladen, wo der Browser das erlaubt (File System Access API), sonst Download wie bisher

### Rechtliches und erste Veröffentlichung

Kein eigener Meilenstein in der Reihe, sondern mit dem Abschluss von M3 fällig. Die erste öffentliche Version erscheint nach M3, weil der erste Eindruck dann ein Editor ist und kein Seitensortierer. Bis dahin gibt es nur die Vorschau-Adressen von Cloudflare Pages.

- Offenlegung nach § 25 MedienG (Name, Wohnort)
- Datenschutzerklärung: keine Cookies, kein Tracking, Dateien bleiben lokal. Cloudflare als Hoster nennen, weil dort technisch bedingt IP-Adressen verarbeitet werden
- Lizenzseite, automatisch aus den Abhängigkeiten erzeugt, mit gut sichtbarem Link zum Quelltext (Pflicht aus der AGPL)
- GitHub-Repo öffentlich schalten
- Domain verbinden

## Tests

| Ebene | Werkzeug | Was |
| --- | --- | --- |
| Unit | Vitest | `core/` vollständig: Seitenbereiche, Änderungsliste, Reducer |
| Integration | Vitest | Gespeichertes PDF wieder einlesen und Seiten, Rotation, Lesezeichen, Felder, Kommentare prüfen |
| Sammlung echter PDFs | Vitest | Jede Datei aus `tests/files/` öffnen, speichern, wieder öffnen. Nichts darf abstürzen oder verloren gehen |
| End-to-End | Playwright | Je Ansicht ein Ablauf mit echten Test-PDFs, inklusive Download |
| Datenschutz | Playwright | No-Network-Test (siehe unten) |

**No-Network-Test:** Playwright zeichnet während eines kompletten Ablaufs (öffnen, bearbeiten, exportieren) alle Netzwerkanfragen auf. Der Test schlägt fehl, wenn eine Anfrage an eine fremde Domain geht oder wenn nach dem Laden irgendeine Anfrage mit Inhalt (POST, PUT) abgeschickt wird. Zusätzlich blockt die CSP (`connect-src 'self'`) solche Anfragen im Browser selbst.

**Schwärz-Test (ab M7):** Nach dem Schwärzen wird die gespeicherte Datei durchsucht, im extrahierten Text und in den rohen Bytes. Der geschwärzte Text darf nirgends mehr vorkommen.

**Fremdprüfung:** Gespeicherte Dateien werden in den Tests mit einem zweiten, unabhängigen PDF-Leser geöffnet. So fällt auf, wenn die eigene Engine etwas schreibt, das nur sie selbst lesen kann.

## CI und Hosting

- **GitHub Actions bei jedem Pull Request:** Lint, Typprüfung, Unit-Tests, Build, Playwright-Tests.
- **Cloudflare Pages:** `main` wird automatisch veröffentlicht, jeder Pull Request bekommt eine Vorschau-Adresse.
- **Sicherheits-Header** in `dist/_headers` (vom Build erzeugt): strenge Content-Security-Policy, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`. Für WebAssembly kommt `'wasm-unsafe-eval'` in `script-src` dazu.

## Risiken und Grenzen

- **Umfang.** Acrobat ist über Jahrzehnte von großen Teams gebaut worden. Der Plan ist so geschnitten, dass jeder Meilenstein für sich nützlich ist. M2 bis M5 ergeben bereits einen Editor, der die meisten Alltagsfälle abdeckt. M6 und M8 sind die Stellen, an denen der Aufwand am schwersten zu schätzen ist.
- **AGPL.** Der gesamte Quelltext von PDFgoat steht unter der AGPL, und jede weitere Abhängigkeit muss dazu passen (MIT, BSD, Apache 2.0 und OFL passen). Wer PDFgoat verändert und selbst als Website anbietet, muss seine Änderungen ebenfalls offenlegen. Ein späterer Wechsel zu geschlossenem Quelltext ginge nur mit anderer Engine oder bezahlter Lizenz.
- **Download-Größe.** Eine WebAssembly-Engine wiegt mehrere Megabyte. Sie wird erst beim Öffnen einer Datei geladen und danach vom Browser zwischengespeichert. Die Größe wird in M2 gemessen.
- **Große PDFs.** Der Speicher im Browser ist begrenzt. Gegenmaßnahmen: nur sichtbare Seiten rendern, Engine im Worker, Warnung ab 100 MB, Grenze bei 500 MB.
- **Bestehenden Text ändern** bleibt eingeschränkt (siehe M6). Das wird in der Oberfläche gesagt, bevor jemand Arbeit hineinsteckt.
- **PDF → Word** ist lokal nur begrenzt gut machbar (siehe M8).
- **Handy.** Lesen, Kommentieren, Ausfüllen und Unterschreiben müssen am Handy gut gehen. Inhalt bearbeiten und Formulare erstellen sind für den Desktop gedacht.
- **Rechtliches.** Die Rechtstexte sind sorgfältig, aber keine Rechtsberatung. Bei Spenden oder Sponsoring sind volles Impressum und Steuerfrage neu zu klären.

## Umsetzungsstand

**M0 und M1 umgesetzt (10.10.2026).** Abweichungen vom ursprünglichen Plan, jeweils mit Grund:

- **Texte als `de.ts`/`en.ts` statt JSON:** TypeScript prüft so beim Build, dass jeder Schlüssel existiert und beide Sprachen vollständig sind.
- **CSP in der Seite und in `dist/_headers`, beides aus `vite.config.ts` erzeugt:** Die Policy gilt damit auf jedem Hoster und in den Browser-Tests, und es gibt nur eine Quelle. Eine Datei `public/_headers` gibt es deshalb nicht.
- **Dateien unter 100 MB bleiben im Speicher,** damit das Speichern auch dann klappt, wenn die Datei auf der Festplatte inzwischen verschoben, überschrieben oder gelöscht wurde. Nur größere Dateien werden beim Speichern neu gelesen. Passt die Dateigröße dann nicht mehr zur geöffneten Datei, bricht der Export mit einer Meldung ab.
- **Größenlimits:** Warnung ab 100 MB, Ablehnung über 500 MB (`src/core/limits.ts`).
- **Test-PDFs** werden in `tests/fixtures.ts` im Code erzeugt, die echte verschlüsselte Datei liegt in `tests/files/`.

Was aus M0 und M1 bleibt: `core/` (Seitenbereiche, Limits, Fehlercodes), der Reducer in `state/` mit der Seitenliste, i18n, CSP, die Tests und das Seitenraster als Ansicht „Seiten“. Ersetzt werden `pdf/build.ts` (pdf-lib) in M2 und `pdf/pdfjs.ts` in M3. `App.tsx` wird in M3 in Arbeitsansicht und Ansichten aufgeteilt.

**M2 begonnen (10.10.2026): MuPDF.js geprüft, Ergebnis: geeignet.** Geprüft wurde Version 1.28.1 in Node mit erzeugten Testdateien und den beiden Dateien aus `tests/files/`.

| Punkt | Ergebnis |
| --- | --- |
| Größe | WebAssembly 10,4 MB, übertragen 3,6 MB (Brotli) oder 4,7 MB (gzip). Wird erst beim Öffnen einer Datei geladen |
| Seiten umordnen und löschen in einer Datei | Lesezeichen und interne Links zeigen danach auf die richtigen Seiten |
| Formularfelder | Ausfüllen mit Umlauten und € funktioniert. **Fehler in MuPDF:** `rearrangePages` entfernt das ganze Formularverzeichnis. Umgehung geprüft: Verzeichnis vorher merken, danach zurückschreiben und Felder ohne Seite streichen |
| Mehrere Dateien zusammenfügen | Seiten kommen an, aber Lesezeichen und Formularfelder der hinzugefügten Datei nicht. Das Zusammenführen muss PDFgoat selbst schreiben |
| Verschlüsselung | Mit Passwort öffnen, mit AES-256 speichern und Schutz entfernen funktionieren. `owner-encrypted.pdf` öffnet ohne Passwort und lässt sich korrekt speichern |
| Schwärzen | Text ist danach weder im extrahierten Text noch in den rohen Bytes der Datei zu finden, der Rest der Seite bleibt |
| Kommentare | Markierung mit Notiz wird als echter PDF-Kommentar gespeichert und wieder gelesen |
| Rückgängig | Das eingebaute Journal nimmt Schritte zurück und stellt sie wieder her |
| Text mit Positionen | Zeilen mit Schriftname, Größe und Rahmen, Grundlage für Suche, Markieren und Textänderung |
| Defekte Dateien | Eine abgeschnittene Datei wird repariert und geöffnet, eine Nicht-PDF sauber abgelehnt |

Nicht aussagekräftig geprüft: Geschwindigkeit und Speicher bei großen Dateien. Die erzeugte Testdatei mit 500 Seiten ist nur 0,1 MB groß und war in Millisekunden verarbeitet. Das muss mit echten großen PDFs (Scans, Kataloge) im Browser nachgeholt werden. Ebenfalls offen: bestehenden Text ändern. MuPDF hat dafür keine fertige Funktion, der Weg ist „Zeile entfernen, neue Zeile setzen“ und gehört zu M6.

Erledigt aus M2:

- `LICENSE` (AGPL-3.0), Lizenzangabe in `package.json` und README.
- **Speichern, Zusammenfügen und Aufteilen laufen über MuPDF** (`src/pdf/build.ts`, `src/pdf/merge.ts`). Lesezeichen, Links, Kommentare, Formularfelder und Dokumenteigenschaften bleiben erhalten. Gelöschte Seiten sind wirklich aus der Datei entfernt, auch wenn die Datei „beim Öffnen Seite N zeigen“ auf eine gelöschte Seite gesetzt hatte.
- Zusammenfügen mehrerer Dateien: Lesezeichen jeder Datei stehen unter einem Eintrag mit dem Dateinamen (nur wenn mindestens eine Datei Lesezeichen hat), gleichnamige Formularfelder werden umbenannt (`name`, `name_2`).
- **Verschlüsselte PDFs öffnen mit Passwortabfrage** (`PasswordDialog`, wiederholt bei falschem Passwort, „Überspringen“ öffnet nichts). Dateien mit nur Besitzer-Passwort öffnen direkt. Gespeichert wird immer ohne Schutz, ein Hinweis beim Öffnen sagt das. Grund: MuPDF behält den Schutz beim Speichern, beim Zusammenfügen würde aber nur der Schutz der ersten Datei gelten. Passwort setzen kommt mit M7.
- **Engine läuft im Web Worker** (`src/pdf/engine.ts` auf der Seite, `engine.worker.ts` im Worker, `build.ts` bleibt reine Logik und ist in Node testbar). Fortschritt wird angezeigt, „Abbrechen“ beendet den Worker. Nur Speichern und Aufteilen laufen bisher darüber, Rendern und Lesen folgen mit M3.
- **Änderungsliste** (`src/core/changes.ts`, `state/editor.ts`): Der Editor hält die Befehle (`add`, `rotate`, `remove`, `move`, `moveTo`, `reverse`), die Seitenliste wird daraus abgeleitet. Rückgängig nimmt den letzten Befehl weg und baut die Seitenliste neu auf, Wiederholen legt ihn zurück. Die Grenze von 50 Schritten entfällt. Neue Befehle für Kommentare, Formularwerte und Schwärzen kommen in M4 bis M7 als weitere Typen dazu. Die Engine bekommt sie noch nicht: Speichern nutzt weiter nur die Seitenliste, das ändert sich mit dem ersten Inhaltsbefehl.
- **M3, Schritt 1: Die Engine rendert, PDF.js ist entfernt.** Ein zweiter Worker (`view.worker.ts`, Seite: `view.ts`) hält die geöffneten Dateien, fragt Passwörter ab und rendert Seiten als PNG. Speichern läuft weiter im ersten Worker, damit lange Aufträge die Vorschau nicht anhalten. Die Dateien liegen damit zweimal im Speicher (einmal im Renderer, einmal als Rohbytes für das Speichern). Gründe für die Nebenwirkungen: MuPDF lädt per Top-Level-await und wird deshalb erst bei der ersten Anfrage importiert, und seine Hinweise zu reparierten Dateien gehen ins Debug-Log.
- **M3, Schritt 2: Leseansicht** (`features/read/`, Geometrie in `core/readerLayout.ts`). Umschalter „Seiten / Lesen“ über dem Dokument. Alle Seiten stehen in endgültiger Größe untereinander, gezeichnet wird nur, was nah am Bildschirm ist, entfernte Seiten geben ihr Bild wieder frei. Zoom: Breite anpassen, ganze Seite, Schritte von 25 bis 400 % (100 % ist Druckgröße), Strg+Plus/Minus/0. Blättern mit Bild auf/ab, Pfeil links/rechts, Pos1/Ende und Seitenzahl eintippen. Die Ansicht zeigt die bearbeitete Seitenliste (gelöscht, sortiert, gedreht). Grenze: Bilder sind höchstens 2400 Pixel breit und werden bei stärkerem Zoom gestreckt, Kacheln folgen später.
- **M3, Schritt 3: Textebene und Suche.** Der View-Worker liefert je Seite die Textzeilen mit Startpunkt, Richtung, Schriftgröße und Länge (`TextLine`) und die Treffer einer Suche als Rechtecke. Über jeder Seite liegt eine unsichtbare Schicht aus einer Zeile je Element, die auf die Länge der Zeile gestreckt wird. Sie wird in Seitenpunkten aufgebaut und als Ganzes per CSS skaliert und gedreht (`core/textLayer.ts`), deshalb kostet Zoomen und Drehen nichts. Damit funktionieren Markieren und Kopieren mit den Mitteln des Browsers. Die Suche (Feld in der Leseleiste, Strg+F, Enter und Shift+Enter) geht Seite für Seite durch die bearbeitete Seitenliste, ignoriert Groß-/Kleinschreibung und Akzente, zeigt Treffer sofort an und springt zum ersten. Grenzen: höchstens 2000 Treffer, 500 je Seite. Gescannte Seiten ohne Textebene haben nichts zum Markieren, das löst erst OCR in M8. Die Zeilen sind Näherungen der echten Schriftform, die Auswahl kann bei ungewöhnlichen Schriften um Bruchteile eines Buchstabens abweichen.
- **M3, Schritt 4: Seitenleiste, Lesezeichen, Links.** Der Knopf ☰ in der Leseleiste öffnet links die Miniaturen (die bestehenden Vorschaubilder, die aktuelle Seite ist hervorgehoben und bleibt im Blick) und die Lesezeichen (`core/outline.ts`). Lesezeichen werden auf die bearbeitete Seitenliste abgebildet: Sie springen dorthin, wo die Seite jetzt steht. Eine gelöschte Seite macht das Lesezeichen grau und nicht klickbar. Bei mehreren Dateien bekommt jede eine Überschrift mit dem Dateinamen. Links auf der Seite liegen als Anker über der Textebene: Sprünge in der Datei gehen zur aktuellen Position der Zielseite (gelöschte Ziele werden nicht angeboten), Webadressen öffnen in neuem Tab mit `noopener`. Nur `http`, `https`, `mailto` und `tel` werden geöffnet, alles andere (`javascript:`, `file:`) wird verworfen. Grenze: Sprünge zu einer Stelle auf der Seite landen am Seitenanfang, nicht an der genauen Stelle.
- **M3, Schritt 5: Drucken** (`features/print/`). Knopf „Drucken“ in der Leiste und Strg+P (statt des Browserdrucks der Oberfläche). Die bearbeitete Seitenliste wird mit 150 dpi als Bilder gezeichnet, in einem versteckten Blatt abgelegt und mit dem Druckdialog des Browsers gedruckt. Im Druck ist nur dieses Blatt sichtbar. Querformatseiten bekommen eine eigene Druckseite im Querformat, die Papiergröße bleibt die des Dialogs. Die Bilder werden freigegeben, sobald der Dialog schließt. Fortschritt und Abbrechen wie beim Speichern. Beschädigte Seiten werden übersprungen und gemeldet. Grenzen: Bei sehr vielen Seiten liegen alle Bilder gleichzeitig im Speicher (bei 150 dpi etwa 1 bis 2 MB je Seite), die Druckqualität ist die von 150 dpi, und der Test prüft nur, was auf der Seite steht, nicht den Dialog selbst.
- **M3, Schritt 6: Arbeitsansicht, Befehlssuche, Reiter.**
  - *Reiter* (`state/workspace.ts`, `features/workspace/`): Jede geöffnete Datei bekommt einen eigenen Reiter mit eigener Seitenliste, eigenem Rückgängig, eigener Auswahl, eigener Ansicht und eigener Lesestelle (Seite, Position und Zoom werden beim Verlassen gemerkt). Das Öffnen der Datei selbst lässt sich nicht rückgängig machen (`locked`). Mehrere Dateien auf einmal öffnen ergibt mehrere Reiter, nicht mehr eine gemeinsame Seitenliste. Dateien bleiben offen, solange irgendein Reiter sie braucht, auch über die Änderungsliste hinweg, damit Rückgängig Seiten zurückholen kann (`docsInUse`). Schließen mit ungespeicherten Änderungen fragt nach.
  - *Zusammenfügen* ist jetzt ein eigener Schritt: Dialog „Dokumente zusammenfügen“ wählt offene Dokumente und ihre Reihenfolge und legt daraus einen neuen Reiter „Zusammengefügt“ an. Die Quellreiter bleiben unverändert. Es werden die bearbeiteten Seitenlisten übernommen.
  - *Arbeitsansicht:* Die Leiste links zeigt oben die Befehlssuche und den Umschalter Lesen/Seiten, darunter die Werkzeuge. Weitere Ansichten (Kommentieren, Ausfüllen, Bearbeiten, Schützen) kommen mit M4 bis M7 dazu. Der rechte Bereich für Eigenschaften und Kommentare fehlt noch, er kommt mit M4.
  - *Befehlssuche* (Strg+K, auch bei Eingabe in einem Feld): findet jede Funktion über Teile von Wörtern, ohne Beachtung von Groß-/Kleinschreibung und Akzenten, mit Synonymen. Nur Befehle, die gerade ausführbar sind, werden angeboten. Pfeiltasten, Enter, Escape. Nicht enthalten: Befehle mit Parametern wie „Seite 3 drehen“.
  - Offen: Tastenkürzel zum Wechseln der Reiter (Strg+Tab gehört dem Browser) und Ziehen von Seiten zwischen Reitern.
- pdf-lib ist aus der App entfernt und dient nur noch in den Tests als zweiter, unabhängiger Leser.

Offen aus M2: nichts mehr. Die Prüfung mit echten großen PDFs (Speicher und Geschwindigkeit im Browser) wurde bewusst nicht gemacht und bleibt als Risiko bestehen.

Bekannte Lücke aus M2:

- Beim Zusammenfügen: Pop-up-Fenster von Kommentaren und Sprungziele in Schaltflächen der hinzugefügten Datei werden nicht übernommen, die Kommentare selbst schon.

Noch nicht umgesetzt:

- **Hinweis auf verlorene Formularfelder und Lesezeichen** beim Speichern. Wird nicht mehr gebaut, weil M2 den Verlust selbst behebt.
- **Automatischer Test der Größenlimits im Browser.** Die Logik ist per Unit-Test abgedeckt, eine 500-MB-Datei im Browser-Test wäre zu langsam.
- **Cloudflare Pages verbinden** (braucht dein Cloudflare-Konto, Schritte stehen im README). Vor der Veröffentlichung nach M3 nur für Vorschau-Adressen nötig.

## Offene Punkte

- Domain prüfen und sichern.
