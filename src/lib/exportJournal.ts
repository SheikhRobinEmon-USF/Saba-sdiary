import { journalConfig } from '../config/journalConfig';
import { toBackup, type JournalDocument } from './journalDocument';

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Plain text: exactly the canonical diary text, nothing added. */
export function exportPlainText(doc: JournalDocument): void {
  downloadBlob(new Blob([doc.text], { type: 'text/plain;charset=utf-8' }), `${journalConfig.exportFileStem}-${stamp()}.txt`);
}

/** Versioned JSON backup that can be imported again. */
export function exportJsonBackup(doc: JournalDocument): void {
  const json = JSON.stringify(toBackup(doc), null, 2);
  downloadBlob(new Blob([json], { type: 'application/json' }), `${journalConfig.exportFileStem}-backup-${stamp()}.json`);
}

/** Raw (possibly corrupt) stored data, offered before any reset. */
export function exportRaw(raw: string): void {
  downloadBlob(new Blob([raw], { type: 'application/octet-stream' }), `${journalConfig.exportFileStem}-recovered-${stamp()}.txt`);
}

/**
 * Print / "Save as PDF". The print stylesheet shows only the print sheet,
 * typeset with the same handwriting outline font. Callers must finalise the
 * ink first; we wait for fonts so nothing prints in a fallback face.
 */
export async function printJournal(): Promise<void> {
  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
  window.print();
}
