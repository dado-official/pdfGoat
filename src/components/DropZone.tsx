export default function DropZone({ onOpen }: { onOpen: () => void }) {
  return (
    <>
      <button className="drop" onClick={onOpen}>
        <span className="big" aria-hidden="true">📄</span>
        <strong>PDF hier ablegen oder klicken zum Öffnen</strong>
        <span>Mehrere Dateien auf einmal werden zusammengefügt. Deine Dateien bleiben auf deinem Gerät.</span>
      </button>
      <ul className="features">
        <li><strong>Sortieren</strong> per Drag & Drop</li>
        <li><strong>Drehen & löschen</strong> einzeln oder gesammelt</li>
        <li><strong>Zusammenfügen</strong> beliebig vieler PDFs</li>
        <li><strong>Aufteilen</strong> nach Bereichen oder Seiten</li>
      </ul>
    </>
  );
}
