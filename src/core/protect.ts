// Protection of the saved file: a password to open it, a password for changing the permissions,
// and what people may do with it. The options are given to the engine as one text, so values must
// not contain the characters that text is built from.

export interface Permissions {
  print: boolean;
  copy: boolean;
  edit: boolean;
  annotate: boolean;
}

export interface Protection {
  /** Needed to open the file; empty for none. */
  userPassword: string;
  /** Needed to change the protection; when empty, the open password is used. */
  ownerPassword: string;
  allow: Permissions;
}

export const ALL_ALLOWED: Permissions = { print: true, copy: true, edit: true, annotate: true };

export const noProtection = (): Protection => ({ userPassword: '', ownerPassword: '', allow: { ...ALL_ALLOWED } });

/** True when saving would protect the file in some way. */
export const isProtected = (p: Protection | null): p is Protection =>
  !!p && (p.userPassword !== '' || p.ownerPassword !== '' || Object.values(p.allow).some((v) => !v));

/** Passwords may not contain a comma (it separates the engine's options) or line breaks. */
export const passwordProblem = (password: string): boolean => /[,\r\n]/.test(password);

// Permission bits of the PDF standard (bit 3, 4, 5, 6, 9, 10, 11, 12).
const PRINT = 1 << 2;
const EDIT = 1 << 3;
const COPY = 1 << 4;
const ANNOTATE = 1 << 5;
const FORM = 1 << 8;
const ACCESSIBILITY = 1 << 9;
const ASSEMBLE = 1 << 10;
const PRINT_HQ = 1 << 11;

/** The permission number of the file: reserved bits set, and the bits of what is allowed. */
export function permissionBits(a: Permissions): number {
  let bits = 0xfffff0c0 | ACCESSIBILITY; // reading aloud stays possible
  if (a.print) bits |= PRINT | PRINT_HQ;
  if (a.edit) bits |= EDIT | ASSEMBLE;
  if (a.copy) bits |= COPY;
  if (a.annotate) bits |= ANNOTATE | FORM;
  return bits | 0;
}

/** The engine's save options for a protection (or none). */
export function encryptionOptions(p: Protection | null): string {
  if (!isProtected(p)) return 'encrypt=none';
  // Without an owner password the open password serves; without either, a random-looking one is
  // needed so that the permissions cannot be lifted by simply opening the file.
  const owner = p.ownerPassword || p.userPassword || crypto.randomUUID();
  return `encrypt=aes-256,user-password=${p.userPassword},owner-password=${owner},permissions=${permissionBits(p.allow)}`;
}

/** What to take out of the file before it is given away. */
export interface Cleaning {
  metadata: boolean;
  attachments: boolean;
  comments: boolean;
  thumbnails: boolean;
  scripts: boolean;
}

export const noCleaning = (): Cleaning => ({ metadata: false, attachments: false, comments: false, thumbnails: false, scripts: false });
export const isCleaning = (c: Cleaning) => Object.values(c).some(Boolean);
