/** The PDFgoat mark: two horns, drawn as plain strokes. */
export default function GoatMark({ size = 34 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M13 27C13 16 10 9 3 5" />
      <path d="M19 27C19 16 22 9 29 5" />
    </svg>
  );
}
