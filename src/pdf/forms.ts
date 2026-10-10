// Form fields in MuPDF: listing them for the page and writing the values the user typed.
// No DOM here, so it runs in the workers and in Node tests.
import type { PDFPage, PDFWidget } from 'mupdf';

export type FieldKind = 'text' | 'check' | 'radio' | 'choice';

/** A form field on a page as the interface needs it. `index` is its position among the page's widgets. */
export interface FormField {
  index: number;
  kind: FieldKind;
  name: string;
  /** Text, or the chosen option. For check boxes and radio buttons: 'on' or 'off'. */
  value: string;
  options: string[];
  combo: boolean;
  multiline: boolean;
  maxLength: number;
  readOnly: boolean;
  box: [number, number, number, number];
}

const kindOf = (w: PDFWidget): FieldKind | null => {
  if (w.isCheckbox()) return 'check';
  if (w.isRadioButton()) return 'radio';
  if (w.isText()) return 'text';
  if (w.isChoice()) return 'choice';
  return null; // push buttons and signature fields cannot be filled in
};

/**
 * Whether a check box or radio button is chosen. The state of the button itself decides: the value
 * of a radio group is the same for all of its buttons, so it says nothing about a single one.
 */
const isOn = (w: PDFWidget) => {
  const state = w.getObject().get('AS');
  if (state.isName()) return state.asName() !== 'Off';
  const v = w.getValue();
  return v !== '' && v !== 'Off';
};

export function listFields(page: PDFPage): FormField[] {
  const fields: FormField[] = [];
  page.getWidgets().forEach((w, index) => {
    const kind = kindOf(w);
    if (!kind) return;
    const [x0, y0, x1, y1] = w.getBounds();
    fields.push({
      index,
      kind,
      name: w.getName(),
      value: kind === 'check' || kind === 'radio' ? (isOn(w) ? 'on' : 'off') : w.getValue(),
      options: kind === 'choice' ? w.getOptions() : [],
      combo: kind === 'choice' && w.isComboBox(),
      multiline: kind === 'text' && w.isMultiline(),
      maxLength: kind === 'text' ? w.getMaxLen() : 0,
      readOnly: w.isReadOnly(),
      box: [x0, y0, x1, y1],
    });
  });
  return fields;
}

/** Writes values into the widgets of a page. Returns a function that puts everything back. */
export function applyFields(page: PDFPage, values: Record<number, string>): () => void {
  const widgets = page.getWidgets();
  const before = widgets.map((w) => w.getValue());
  const wasOn = widgets.map((w) => (w.isCheckbox() || w.isRadioButton() ? isOn(w) : false));
  for (const [key, value] of Object.entries(values)) {
    const w = widgets[Number(key)];
    if (!w || w.isReadOnly()) continue;
    try {
      if (w.isCheckbox() || w.isRadioButton()) {
        if (isOn(w) !== (value === 'on')) w.toggle();
      } else if (w.isText()) w.setTextValue(value);
      else if (w.isChoice()) w.setChoiceValue(value);
    } catch {
      // A field that refuses the value stays as it was.
    }
  }
  return () => {
    widgets.forEach((w, i) => {
      try {
        if (w.isCheckbox() || w.isRadioButton()) {
          if (isOn(w) !== wasOn[i]) w.toggle();
        } else if (w.getValue() !== before[i]) {
          if (w.isText()) w.setTextValue(before[i]);
          else if (w.isChoice()) w.setChoiceValue(before[i]);
        }
      } catch {
        // Nothing more to do for this field.
      }
    });
  };
}

const HIDDEN = 2;

/** Hides every widget of a page, for drawing the page without its fields. Returns the undo. */
export function hideWidgets(page: PDFPage): () => void {
  const widgets = page.getWidgets();
  const flags = widgets.map((w) => w.getFlags());
  widgets.forEach((w, i) => w.setFlags(flags[i] | HIDDEN));
  return () => widgets.forEach((w, i) => w.setFlags(flags[i]));
}
