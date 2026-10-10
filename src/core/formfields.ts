// Form fields that the user adds to a page. They are written as real form fields (AcroForm), so
// they can be filled in here, in a browser or in any PDF program.

export type FieldType = 'text' | 'check' | 'radio' | 'choice';

export interface FieldSpec {
  type: FieldType;
  /** The name of the field. Radio buttons with the same name form one group. */
  name: string;
  /** Text field: several lines. */
  multiline: boolean;
  /** Choice field: the entries. */
  options: string[];
  /** Choice field: a drop-down list instead of a list box. */
  combo: boolean;
  /** Radio button: what the group's value is when this one is chosen. */
  exportValue: string;
  required: boolean;
  readOnly: boolean;
}

export const FIELD_TYPES: readonly FieldType[] = ['text', 'check', 'radio', 'choice'];

/** Size of a new field in points. */
export const FIELD_SIZES: Record<FieldType, [number, number]> = { text: [160, 22], check: [16, 16], radio: [16, 16], choice: [160, 22] };

export const newField = (type: FieldType, name: string, exportValue = ''): FieldSpec => ({
  type,
  name,
  multiline: false,
  options: type === 'choice' ? ['Option 1', 'Option 2'] : [],
  combo: true,
  exportValue,
  required: false,
  readOnly: false,
});

/** A name for a new field that no other field has: "Textfeld 3". `taken` are the names in use. */
export function freeName(base: string, taken: ReadonlySet<string>): string {
  for (let n = 1; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** Field names made unique: a second field with a name in use gets "-2". Radio buttons of one group keep the name. */
export function uniqueNames<T extends { name: string; radio: boolean }>(fields: readonly T[], taken: ReadonlySet<string> = new Set()): string[] {
  const used = new Set(taken);
  const groups = new Map<string, string>();
  return fields.map((f) => {
    const wanted = f.name.trim() || 'Feld';
    if (f.radio && groups.has(wanted)) return groups.get(wanted)!;
    let name = wanted;
    for (let n = 2; used.has(name); n++) name = `${wanted}-${n}`;
    used.add(name);
    if (f.radio) groups.set(wanted, name);
    return name;
  });
}

// Field flags of the PDF standard.
export const FF_READONLY = 1 << 0;
export const FF_REQUIRED = 1 << 1;
export const FF_MULTILINE = 1 << 12;
export const FF_NO_TOGGLE_OFF = 1 << 14;
export const FF_RADIO = 1 << 15;
export const FF_COMBO = 1 << 17;

export function fieldFlags(f: FieldSpec): number {
  let flags = 0;
  if (f.readOnly) flags |= FF_READONLY;
  if (f.required) flags |= FF_REQUIRED;
  if (f.type === 'text' && f.multiline) flags |= FF_MULTILINE;
  if (f.type === 'radio') flags |= FF_RADIO | FF_NO_TOGGLE_OFF;
  if (f.type === 'choice' && f.combo) flags |= FF_COMBO;
  return flags;
}
