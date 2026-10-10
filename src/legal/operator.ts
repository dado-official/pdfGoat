// Who runs this site. These details go into the imprint and the privacy notice and MUST be filled
// in before the site is published: the law asks for them, and nobody but the operator knows them.
// Empty fields are shown on the pages as missing, so a forgotten one cannot go unnoticed.

export interface Operator {
  /** Full name of the person or company that runs the site. */
  name: string;
  /** Street and house number. */
  street: string;
  /** Postal code and town. */
  city: string;
  country: string;
  /** An address that is read: the law asks for a way to get in touch quickly. */
  email: string;
  /** Optional. */
  phone: string;
  /** Where the complete source code of the version that is online can be found (AGPL). */
  sourceUrl: string;
  /** The company that serves the files of the site. */
  host: string;
}

export const OPERATOR: Operator = {
  name: 'Daniel Nagler',
  street: 'Freines 2',
  city: '39030 La Valle (BZ)',
  country: 'Italien',
  email: 'danielnagler1507@gmail.com',
  phone: '',
  sourceUrl: '',
  host: 'Cloudflare, Inc. (Cloudflare Pages)',
};

/** The details that must not be missing; the phone number is optional. */
export const REQUIRED = ['name', 'street', 'city', 'country', 'email', 'sourceUrl'] as const;

export const missingDetails = (o: Operator = OPERATOR): string[] => REQUIRED.filter((k) => !o[k].trim());
