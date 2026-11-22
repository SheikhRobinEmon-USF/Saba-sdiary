import { journalConfig } from '../config/journalConfig';
import Dedication from './Dedication';

interface Props {
  title: string;
  text: string;
  dateLine: string;
}

/**
 * Print-only document used by "Save as PDF". Typeset with the Scribe Hand
 * outline font (the same pen strokes as the on-screen ink), flowing across as
 * many pages as needed. No quill, caret or controls are ever printed.
 */
export default function PrintSheet({ title, text, dateLine }: Props) {
  return (
    <div className="print-root" aria-hidden="true">
      <div className="print-bg" />
      <header className="print-head">
        <p className="print-app">{journalConfig.appName}</p>
        {title && <h1 className="print-title">{title}</h1>}
        <p className="print-date">{dateLine}</p>
        {journalConfig.includeDedicationInPdf && <Dedication className="print-dedication" />}
        <div className="print-rule" />
      </header>
      <div className="print-text">{text || ' '}</div>
    </div>
  );
}
