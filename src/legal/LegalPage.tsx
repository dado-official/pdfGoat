import type { ReactNode } from 'react';
import GoatMark from '../ui/GoatMark';
import { useI18n } from '../i18n/context';
import { COMPONENTS } from './licenses';
import { missingDetails, OPERATOR, type Operator } from './operator';
import { ROUTE_HASH, type LegalRoute } from './useRoute';

type Lang = 'de' | 'en';

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section>
    <h2>{title}</h2>
    {children}
  </section>
);

/** A reminder shown for as long as details of the operator are missing. */
function Missing({ lang }: { lang: Lang }) {
  const missing = missingDetails();
  if (!missing.length) return null;
  const names: Record<string, Record<Lang, string>> = {
    name: { de: 'Name', en: 'name' },
    street: { de: 'Straße', en: 'street' },
    city: { de: 'Postleitzahl und Ort', en: 'postal code and town' },
    country: { de: 'Land', en: 'country' },
    email: { de: 'E-Mail-Adresse', en: 'email address' },
    sourceUrl: { de: 'Adresse des Quellcodes', en: 'address of the source code' },
  };
  return (
    <p className="legal-missing" role="alert">
      {lang === 'de' ? 'Diese Angaben des Betreibers fehlen noch und müssen vor der Veröffentlichung in src/legal/operator.ts eingetragen werden: ' : 'These details of the operator are still missing and must be entered in src/legal/operator.ts before the site is published: '}
      {missing.map((k) => names[k][lang]).join(', ')}.
    </p>
  );
}

const Address = ({ o, lang }: { o: Operator; lang: Lang }) => (
  <address>
    {o.name || <em>{lang === 'de' ? 'Name fehlt' : 'name missing'}</em>}
    <br />
    {o.street || <em>{lang === 'de' ? 'Straße fehlt' : 'street missing'}</em>}
    <br />
    {o.city || <em>{lang === 'de' ? 'Ort fehlt' : 'town missing'}</em>}
    {o.country && (
      <>
        <br />
        {o.country}
      </>
    )}
    <br />
    {o.email ? <a href={`mailto:${o.email}`}>{o.email}</a> : <em>{lang === 'de' ? 'E-Mail fehlt' : 'email missing'}</em>}
    {o.phone && (
      <>
        <br />
        {o.phone}
      </>
    )}
  </address>
);

function Privacy({ lang }: { lang: Lang }) {
  const o = OPERATOR;
  return lang === 'de' ? (
    <>
      <Section title="Kurz gesagt">
        <p>Deine PDF-Dateien verlassen deinen Browser nicht. PDFgoat öffnet, ändert und speichert sie ausschließlich auf deinem Gerät. Es gibt kein Konto, keine Cookies, keine Statistik und keine Werbung. Die Seite lädt nichts von anderen Servern nach, und der Browser selbst verbietet ihr, Daten an andere Adressen zu senden.</p>
      </Section>
      <Section title="Verantwortlicher">
        <Address o={o} lang={lang} />
      </Section>
      <Section title="Was mit deinen Dateien geschieht">
        <p>Geöffnete Dateien werden im Arbeitsspeicher deines Browsers verarbeitet und beim Schließen der Seite verworfen. Die Verarbeitung (Anzeigen, Bearbeiten, Texterkennung, Komprimieren, Verschlüsseln) findet auf deinem Gerät statt. Niemand außer dir bekommt den Inhalt zu sehen, auch nicht der Betreiber dieser Seite.</p>
      </Section>
      <Section title="Was dein Browser für PDFgoat speichert">
        <p>PDFgoat legt Daten nur auf deinem Gerät ab, nie auf einem Server:</p>
        <ul>
          <li>die gewählte Sprache,</li>
          <li>Abläufe, die du speicherst (ohne Passwörter),</li>
          <li>Unterschrift und Kürzel, aber nur, wenn du „In diesem Browser merken“ wählst,</li>
          <li>einen Zwischenspeicher mit den Programmdateien, damit PDFgoat auch ohne Netz läuft, und mit den Sprachdaten der Texterkennung, sobald du sie zum ersten Mal benutzt.</li>
        </ul>
        <p>Du kannst das jederzeit in den Einstellungen deines Browsers unter „Websitedaten“ oder „Cookies und Websitedaten“ löschen. Cookies setzt PDFgoat nicht.</p>
      </Section>
      <Section title="Was beim Aufruf der Seite geschieht">
        <p>Die Dateien der Seite werden von {o.host} ausgeliefert. Dabei verarbeitet der Anbieter technisch notwendige Daten in Server-Protokollen, etwa die IP-Adresse, Datum und Uhrzeit, die angeforderte Datei und Angaben zu deinem Browser. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren und stabilen Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Der Anbieter kann Daten auch außerhalb der EU verarbeiten; Näheres steht in seinen eigenen Datenschutzhinweisen. Der Betreiber dieser Seite wertet diese Protokolle nicht aus und führt sie nicht mit anderen Daten zusammen.</p>
      </Section>
      <Section title="Deine Rechte">
        <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren; in Italien ist das der Garante per la protezione dei dati personali (garanteprivacy.it). Schreib bei Fragen an {o.email ? <a href={`mailto:${o.email}`}>{o.email}</a> : <em>E-Mail fehlt</em>}.</p>
      </Section>
    </>
  ) : (
    <>
      <Section title="In short">
        <p>Your PDF files never leave your browser. PDFgoat opens, changes and saves them only on your device. There is no account, no cookies, no statistics and no advertising. The page loads nothing from other servers, and the browser itself forbids it to send data to other addresses.</p>
      </Section>
      <Section title="Controller">
        <Address o={o} lang={lang} />
      </Section>
      <Section title="What happens to your files">
        <p>Opened files are processed in the memory of your browser and discarded when you close the page. The processing (viewing, editing, text recognition, compressing, encrypting) takes place on your device. Nobody but you gets to see the content, not even the operator of this site.</p>
      </Section>
      <Section title="What your browser stores for PDFgoat">
        <p>PDFgoat keeps data on your device only, never on a server:</p>
        <ul>
          <li>the language you chose,</li>
          <li>workflows that you save (without passwords),</li>
          <li>a signature and initials, but only if you choose “Remember in this browser”,</li>
          <li>a cache with the program files, so that PDFgoat also works without a network, and with the language data of the text recognition once you use it for the first time.</li>
        </ul>
        <p>You can delete all of it at any time in your browser’s settings under “site data” or “cookies and site data”. PDFgoat sets no cookies.</p>
      </Section>
      <Section title="What happens when the page is opened">
        <p>The files of the page are delivered by {o.host}. In doing so the provider processes technically necessary data in server logs, such as the IP address, date and time, the file requested and details about your browser. The legal basis is our legitimate interest in secure and stable operation (Art. 6(1)(f) GDPR). The provider may also process data outside the EU; details are in its own privacy notices. The operator of this site does not evaluate these logs and does not combine them with other data.</p>
      </Section>
      <Section title="Your rights">
        <p>You have the right of access, rectification, erasure, restriction of processing, data portability and objection. You can also lodge a complaint with a data protection authority; in Italy that is the Garante per la protezione dei dati personali (garanteprivacy.it). For questions write to {o.email ? <a href={`mailto:${o.email}`}>{o.email}</a> : <em>email missing</em>}.</p>
      </Section>
    </>
  );
}

function Imprint({ lang }: { lang: Lang }) {
  const o = OPERATOR;
  return lang === 'de' ? (
    <>
      <Section title="Anbieter">
        <p>PDFgoat wird von einer Privatperson betrieben, ohne Unternehmen. Die Seite ist kostenlos und verfolgt keinen Erwerbszweck. Die Angaben folgen den Informationspflichten für Anbieter von Diensten im Netz (in Anlehnung an Art. 7 des italienischen Gesetzesdekrets 70/2003).</p>
        <Address o={o} lang={lang} />
      </Section>
      <Section title="Kontakt">
        <p>Du erreichst den Betreiber schnell und direkt per E-Mail an {o.email ? <a href={`mailto:${o.email}`}>{o.email}</a> : <em>E-Mail fehlt</em>}.</p>
      </Section>
      <Section title="Quellcode">
        <p>PDFgoat ist freie Software. Der Quellcode steht unter der GNU Affero General Public License: {o.sourceUrl ? <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer">{o.sourceUrl}</a> : <em>Adresse fehlt</em>}.</p>
      </Section>
    </>
  ) : (
    <>
      <Section title="Provider">
        <p>PDFgoat is run by a private individual, not a business. The site is free and has no commercial purpose. The details follow the information duties for providers of online services (in line with Art. 7 of Italian Legislative Decree 70/2003).</p>
        <Address o={o} lang={lang} />
      </Section>
      <Section title="Contact">
        <p>You can reach the operator quickly and directly by email at {o.email ? <a href={`mailto:${o.email}`}>{o.email}</a> : <em>email missing</em>}.</p>
      </Section>
      <Section title="Source code">
        <p>PDFgoat is free software. The source code is available under the GNU Affero General Public License: {o.sourceUrl ? <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer">{o.sourceUrl}</a> : <em>address missing</em>}.</p>
      </Section>
    </>
  );
}

function Licenses({ lang }: { lang: Lang }) {
  const o = OPERATOR;
  return lang === 'de' ? (
    <>
      <Section title="PDFgoat">
        <p>PDFgoat steht unter der <strong>GNU Affero General Public License, Version 3 oder später</strong>. Du darfst es nutzen, ändern und weitergeben. Wer eine geänderte Fassung im Netz anbietet, muss auch deren Quellcode anbieten. Den Quellcode dieser Fassung findest du hier: {o.sourceUrl ? <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer">{o.sourceUrl}</a> : <em>Adresse fehlt</em>}. Den vollständigen Lizenztext gibt es <a href="./LICENSE.txt">hier</a>.</p>
      </Section>
      <Section title="Bausteine von anderen">
        <p>PDFgoat besteht zu großen Teilen aus Software anderer. Hier steht, was in der Seite steckt. Die Lizenztexte, einschließlich der Urheberrechtsvermerke, stehen <a href="./third-party-licenses.txt">in dieser Datei</a>.</p>
      </Section>
    </>
  ) : (
    <>
      <Section title="PDFgoat">
        <p>PDFgoat is available under the <strong>GNU Affero General Public License, version 3 or later</strong>. You may use, change and pass it on. Anyone who offers a changed version on the network must also offer its source code. The source code of this version is here: {o.sourceUrl ? <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer">{o.sourceUrl}</a> : <em>address missing</em>}. The full licence text is <a href="./LICENSE.txt">here</a>.</p>
      </Section>
      <Section title="Parts from others">
        <p>PDFgoat is largely made of software by others. This is what is in the page. The licence texts, including the copyright notices, are <a href="./third-party-licenses.txt">in this file</a>.</p>
      </Section>
    </>
  );
}

const TITLES: Record<LegalRoute, Record<Lang, string>> = {
  privacy: { de: 'Datenschutz', en: 'Privacy' },
  imprint: { de: 'Impressum', en: 'Imprint' },
  licenses: { de: 'Lizenzen', en: 'Licences' },
};

/** The legal links for the footer. */
export function LegalLinks() {
  const { lang } = useI18n();
  return (
    <nav className="legal-links" aria-label={lang === 'de' ? 'Rechtliches' : 'Legal'}>
      {(['privacy', 'imprint', 'licenses'] as const).map((r) => (
        <a key={r} href={ROUTE_HASH[r]}>{TITLES[r][lang]}</a>
      ))}
    </nav>
  );
}

/** One of the legal pages, as a page of its own with a way back to the app. */
export default function LegalPage({ route }: { route: LegalRoute }) {
  const { lang } = useI18n();
  return (
    <div className="legal">
      <header className="legal-top">
        <a className="brand" href="#/" aria-label="PDFgoat">
          <GoatMark size={32} />
          <h1>PDFgoat</h1>
        </a>
        <a href="#/" className="legal-back">{lang === 'de' ? 'Zurück zu PDFgoat' : 'Back to PDFgoat'}</a>
      </header>
      <main className="legal-body">
        <h2 className="legal-title">{TITLES[route][lang]}</h2>
        <Missing lang={lang} />
        {route === 'privacy' && <Privacy lang={lang} />}
        {route === 'imprint' && <Imprint lang={lang} />}
        {route === 'licenses' && (
          <>
            <Licenses lang={lang} />
            <ul className="legal-components">
              {COMPONENTS.map((c) => (
                <li key={c.name}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer">{c.name}</a>
                  <span>{c.what[lang]}</span>
                  <span className="count">{c.license}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <nav className="legal-links" aria-label={lang === 'de' ? 'Rechtliches' : 'Legal'}>
          {(['privacy', 'imprint', 'licenses'] as const).filter((r) => r !== route).map((r) => (
            <a key={r} href={ROUTE_HASH[r]}>{TITLES[r][lang]}</a>
          ))}
        </nav>
      </main>
    </div>
  );
}
