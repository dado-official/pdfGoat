interface Props {
  pageCount: number;
  docCount: number;
  selectedCount: number;
  canUndo: boolean;
  busy: boolean;
  onAdd: () => void;
  onUndo: () => void;
  onCloseAll: () => void;
  onToggleAll: () => void;
  onRotate: (delta: number) => void;
  onDelete: () => void;
  onReverse: () => void;
  onSplit: () => void;
  onSave: () => void;
}

export default function Toolbar(p: Props) {
  const allSelected = p.pageCount > 0 && p.selectedCount === p.pageCount;
  const none = p.selectedCount === 0;
  return (
    <div className="toolbar" role="toolbar" aria-label="Werkzeuge">
      <div className="group">
        <button onClick={p.onAdd}>＋ PDF hinzufügen</button>
        <button onClick={p.onUndo} disabled={!p.canUndo} title="Strg+Z">↶ Rückgängig</button>
        <button onClick={p.onCloseAll}>Alles schließen</button>
      </div>
      <div className="group">
        <button onClick={p.onToggleAll}>{allSelected ? 'Keine auswählen' : 'Alle auswählen'}</button>
        <button onClick={() => p.onRotate(-90)} disabled={none}>↺ Links drehen</button>
        <button onClick={() => p.onRotate(90)} disabled={none}>↻ Rechts drehen</button>
        <button onClick={p.onDelete} disabled={none} className="danger">Löschen</button>
        <button onClick={p.onReverse} disabled={p.pageCount < 2}>Reihenfolge umkehren</button>
      </div>
      <div className="group end">
        <button onClick={p.onSplit} disabled={!p.pageCount}>✂ Aufteilen</button>
        <button className="primary" onClick={p.onSave} disabled={!p.pageCount || p.busy}>
          ⬇ {p.docCount > 1 ? 'Zusammengefügt speichern' : 'PDF speichern'}
        </button>
      </div>
    </div>
  );
}
