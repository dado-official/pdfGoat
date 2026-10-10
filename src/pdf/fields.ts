// Making and removing form fields. A field is a widget annotation that is also entered in the
// AcroForm of the document; MuPDF draws the look of it when the widget is updated.
import type { PDFDocument, PDFObject, PDFPage, PDFWidget } from 'mupdf';
import { fieldFlags, type FieldSpec } from '../core/formfields';
import type { Box } from '../core/textLayer';
import type { Mupdf } from './mupdf';

export interface NewField {
  box: Box;
  spec: FieldSpec;
  /** The name written into the file (made unique by the caller). */
  name: string;
}

const real = (doc: PDFDocument, values: number[]) => {
  const list = doc.newArray();
  for (const v of values) list.push(doc.newReal(v));
  return list;
};

/** The AcroForm of the document with its list of fields, made if there is none. */
function acroForm(engine: Mupdf, doc: PDFDocument): { form: PDFObject; fields: PDFObject } {
  const root = doc.getTrailer().get('Root');
  let form = root.get('AcroForm');
  if (!form.isDictionary()) {
    form = doc.addObject(doc.newDictionary());
    root.put('AcroForm', form);
  }
  let fields = form.get('Fields');
  if (!fields.isArray()) {
    fields = doc.newArray();
    form.put('Fields', fields);
  }
  if (!form.get('DA').isString()) form.put('DA', doc.newString('/Helv 0 Tf 0 g'));
  if (!form.get('DR').isDictionary()) {
    const resources = doc.newDictionary();
    const fonts = doc.newDictionary();
    fonts.put('Helv', doc.addSimpleFont(new engine.Font('Helvetica'), 'Latin'));
    resources.put('Font', fonts);
    form.put('DR', resources);
  }
  return { form, fields };
}

/** Adds the fields to a page. Radio buttons with the same name become one group. */
export function addFormFields(engine: Mupdf, doc: PDFDocument, page: PDFPage, list: NewField[]) {
  if (!list.length) return;
  const { fields } = acroForm(engine, doc);
  const groups = new Map<string, PDFObject>();
  const made: PDFObject[] = [];
  // The state of a radio button when it is chosen, by the number of its widget object.
  const states = new Map<number, string>();
  const usedStates = new Map<string, Set<string>>();

  for (const { box, spec, name } of list) {
    const widget = page.createAnnotation('Widget' as never);
    widget.setRect(box);
    const o = widget.getObject();
    const kind = spec.type === 'text' ? 'Tx' : spec.type === 'choice' ? 'Ch' : 'Btn';
    const look = doc.newDictionary();
    look.put('BC', real(doc, [0.2, 0.2, 0.2]));
    look.put('BG', real(doc, [0.95, 0.96, 1]));
    if (spec.type === 'check') look.put('CA', doc.newString('4'));
    if (spec.type === 'radio') look.put('CA', doc.newString('l'));
    o.put('MK', look);
    const size = spec.type === 'text' && spec.multiline ? 11 : 0; // 0: as large as fits
    o.put('DA', doc.newString(spec.type === 'check' || spec.type === 'radio' ? '/ZaDb 0 Tf 0 g' : `/Helv ${size} Tf 0 g`));

    if (spec.type === 'radio') {
      let group = groups.get(name);
      if (!group) {
        group = doc.addObject(doc.newDictionary());
        group.put('FT', doc.newName('Btn'));
        group.put('T', doc.newString(name));
        group.put('Ff', fieldFlags(spec));
        group.put('Kids', doc.newArray());
        fields.push(group);
        groups.set(name, group);
      }
      o.put('Parent', group);
      group.get('Kids').push(o);
      o.put('F', 4);
      // Every button of a group needs a state of its own, named after its value.
      const taken = usedStates.get(name) ?? new Set<string>();
      usedStates.set(name, taken);
      const wanted = (spec.exportValue || 'Ja').replace(/[^\w-]/g, '_');
      let state = wanted;
      for (let n = 2; taken.has(state); n++) state = `${wanted}_${n}`;
      taken.add(state);
      states.set(o.asIndirect(), state);
    } else {
      o.put('FT', doc.newName(kind));
      o.put('T', doc.newString(name));
      const flags = fieldFlags(spec);
      if (flags) o.put('Ff', flags);
      if (spec.type === 'choice') {
        const opt = doc.newArray();
        for (const entry of spec.options) opt.push(doc.newString(entry));
        o.put('Opt', opt);
      }
      fields.push(o);
    }
    made.push(o);
  }

  // The look of the fields.
  const mine = new Set(made.map((o) => o.asIndirect()));
  for (const w of page.getWidgets()) {
    try {
      const id = w.getObject().asIndirect();
      if (!mine.has(id)) continue;
      w.update();
      const state = states.get(id);
      if (state) {
        // The engine names the chosen state "Yes"; the group needs the button's own name.
        const normal = w.getObject().get('AP').get('N');
        normal.put(state, normal.get('Yes'));
        normal.delete('Yes');
      }
    } catch {
      // A field whose look cannot be made is still a field; viewers draw it themselves.
    }
  }
}

/** Removes form fields of a page by their position among its widgets. */
export function deleteFormFields(doc: PDFDocument, page: PDFPage, positions: readonly number[]) {
  const widgets: PDFWidget[] = page.getWidgets();
  const root = doc.getTrailer().get('Root');
  const top = root.get('AcroForm').get('Fields');
  const removeFrom = (list: PDFObject, target: number) => {
    if (!list.isArray()) return;
    for (let i = list.length - 1; i >= 0; i--) if (list.get(i).asIndirect() === target) list.delete(i);
  };
  for (const i of positions) {
    const w = widgets[i];
    if (!w) continue;
    const o = w.getObject();
    const id = o.asIndirect();
    const parent = o.get('Parent');
    if (parent.isDictionary()) removeFrom(parent.get('Kids'), id);
    else removeFrom(top, id);
    page.deleteAnnotation(w);
  }
}
