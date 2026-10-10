import { describe, expect, it } from 'vitest';
import { STAMPS } from '../features/comment/stamps';
import { EDIT_TOOLS, FIELD_TOOLS, FILL_TOOLS, INSERT_TOOLS, PROTECT_TOOLS, TOOLS } from '../features/comment/tools';
import { STEP_TYPES } from '../core/workflow';
import { PAPER_NAMES } from '../core/paper';
import { MARK_PLACES } from '../core/marks';
import { COMMENT_COLORS } from '../core/annotations';
import { de } from './de';
import { en } from './en';

// Many texts are looked up by a name that is put together in the code ("comment.tool." + tool).
// The type system cannot see those, a missing one would only show as a broken screen.
const wanted: Record<string, readonly string[]> = {
  'comment.tool.': [...TOOLS, ...FILL_TOOLS, ...INSERT_TOOLS, ...EDIT_TOOLS, ...PROTECT_TOOLS, ...FIELD_TOOLS],
  'comment.kind.': ['highlight', 'underline', 'strikeout', 'note', 'text', 'ink', 'square', 'circle', 'line', 'arrow', 'stamp', 'link', 'redact', 'signature', 'initials', 'check', 'date', 'embedText', 'embedImage', 'editText', 'editImage', 'file', 'other', 'formField', 'field.text', 'field.check', 'field.radio', 'field.choice'],
  'stamp.': STAMPS,
  'mark.preset.': ['number', 'header', 'footer', 'watermark'],
  'mark.place.': MARK_PLACES,
  'mark.color.': COMMENT_COLORS.map((c) => c.slice(1)),
  'resize.paper.': PAPER_NAMES,
  'resize.orientation.': ['keep', 'portrait', 'landscape'],
  'crop.': ['top', 'right', 'bottom', 'left'],
  'export.format.': ['png', 'txt', 'md', 'docx'],
  'ocr.lang.': ['deu', 'eng', 'deu+eng'],
  'compress.level.': ['light', 'medium', 'strong'],
  'step.': STEP_TYPES,
  'step.rotate.': ['90', '180', '270'],
  'batch.state.': ['waiting', 'working', 'done', 'failed'],
  'protect.tab.': ['password', 'check'],
  'protect.allow.': ['print', 'copy', 'edit', 'annotate'],
  'protect.clean.': ['metadata', 'attachments', 'comments', 'thumbnails', 'scripts'],
  'protect.info.': ['title', 'author', 'subject', 'keywords', 'creator', 'layers', 'fields', 'attachments'],
  'sign.mode.': ['saved', 'draw', 'type', 'image'],
  'field.base.': ['text', 'check', 'radio', 'choice'],
  'view.': ['read', 'pages'],
};

describe.each([['de', de], ['en', en]] as const)('texts looked up by a built name (%s)', (_lang, texts) => {
  const keys = new Set(Object.keys(texts));
  for (const [prefix, names] of Object.entries(wanted)) {
    it(prefix, () => {
      for (const name of names) expect(keys.has(`${prefix}${name}`), `${prefix}${name}`).toBe(true);
    });
  }
});
