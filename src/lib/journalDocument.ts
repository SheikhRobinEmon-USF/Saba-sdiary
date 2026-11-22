import { DEFAULT_PREFERENCES, sanitizePreferences, type Preferences } from './preferences';

export const SCHEMA_VERSION = 1;
export const BACKUP_FORMAT = 'sabas-diary-backup';
/** Generous limits so a corrupted or hostile file cannot exhaust memory. */
export const MAX_TEXT_LENGTH = 2_000_000;
export const MAX_TITLE_LENGTH = 120;
export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;

export interface JournalDocument {
  schemaVersion: 1;
  title: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  preferences: Preferences;
}

export interface BackupFile extends JournalDocument {
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
}

export function emptyDocument(now = new Date()): JournalDocument {
  const iso = now.toISOString();
  return { schemaVersion: 1, title: '', text: '', createdAt: iso, updatedAt: iso, preferences: { ...DEFAULT_PREFERENCES } };
}

/** Normalise text: Unix line breaks and no control characters except tab/newline. */
export function sanitizeText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
}

export type ValidationResult = { ok: true; doc: JournalDocument } | { ok: false; error: string };

/** Validate an unknown value (stored document or backup) into a clean document. */
export function validateDocument(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'The data is not a diary document.' };
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, error: `Unsupported version (${String(r.schemaVersion ?? 'missing')}). Expected version ${SCHEMA_VERSION}.` };
  }
  if (typeof r.text !== 'string') return { ok: false, error: 'The diary text is missing.' };
  if (r.text.length > MAX_TEXT_LENGTH) return { ok: false, error: 'The diary text is too long to import safely.' };
  if (r.title !== undefined && typeof r.title !== 'string') return { ok: false, error: 'The title is not text.' };
  const now = new Date().toISOString();
  return {
    ok: true,
    doc: {
      schemaVersion: 1,
      text: sanitizeText(r.text),
      title: sanitizeText(typeof r.title === 'string' ? r.title : '').replace(/\n/g, ' ').slice(0, MAX_TITLE_LENGTH),
      createdAt: isIsoDate(r.createdAt) ? r.createdAt : now,
      updatedAt: isIsoDate(r.updatedAt) ? r.updatedAt : now,
      preferences: sanitizePreferences(r.preferences),
    },
  };
}

export function parseBackup(json: string): ValidationResult {
  if (json.length > MAX_BACKUP_BYTES) return { ok: false, error: 'That file is too large to be a diary backup.' };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!raw || typeof raw !== 'object' || (raw as Record<string, unknown>).format !== BACKUP_FORMAT) {
    return { ok: false, error: "That file is not a backup from Saba's Personal Diary." };
  }
  return validateDocument(raw);
}

export function toBackup(doc: JournalDocument, now = new Date()): BackupFile {
  return { format: BACKUP_FORMAT, exportedAt: now.toISOString(), ...doc };
}
