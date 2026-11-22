import { useCallback, useEffect, useRef, useState } from 'react';
import { journalConfig } from '../config/journalConfig';
import { emptyDocument, validateDocument, type JournalDocument } from '../lib/journalDocument';

export type SaveStatus =
  | { kind: 'saved'; at: Date | null }
  | { kind: 'pending' }
  | { kind: 'error'; reason: 'quota' | 'unavailable' | 'unknown' }
  | { kind: 'paused'; reason: 'conflict' | 'corrupt' };

const KEY = journalConfig.storageKey;
const DEBOUNCE_MS = 300;

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__scribe_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

interface Loaded {
  doc: JournalDocument;
  corruptRaw: string | null;
  available: boolean;
  lastWritten: string | null;
}

function load(): Loaded {
  const s = storage();
  if (!s) return { doc: emptyDocument(), corruptRaw: null, available: false, lastWritten: null };
  let raw: string | null = null;
  try {
    raw = s.getItem(KEY);
  } catch {
    return { doc: emptyDocument(), corruptRaw: null, available: false, lastWritten: null };
  }
  if (raw === null) return { doc: emptyDocument(), corruptRaw: null, available: true, lastWritten: null };
  try {
    const v = validateDocument(JSON.parse(raw));
    if (v.ok) return { doc: v.doc, corruptRaw: null, available: true, lastWritten: raw };
  } catch {
    /* fall through */
  }
  return { doc: emptyDocument(), corruptRaw: raw, available: true, lastWritten: raw };
}

/**
 * One versioned LocalStorage document. Saves are debounced (~300 ms) and
 * flushed on blur / page hide. Errors are surfaced honestly; corrupt data is
 * never silently replaced; a change from another tab pauses saving until the
 * writer chooses which version to keep.
 */
export function useJournalStorage() {
  const [initial] = useState(load);
  const docRef = useRef<JournalDocument>(initial.doc);
  const lastWritten = useRef<string | null>(initial.lastWritten);
  const timer = useRef(0);
  const blocked = useRef<'conflict' | 'corrupt' | null>(initial.corruptRaw ? 'corrupt' : null);
  const [corruptRaw, setCorruptRaw] = useState<string | null>(initial.corruptRaw);
  const [conflict, setConflict] = useState<JournalDocument | null>(null);
  const [status, setStatus] = useState<SaveStatus>(
    initial.corruptRaw
      ? { kind: 'paused', reason: 'corrupt' }
      : initial.available
        ? { kind: 'saved', at: initial.lastWritten ? new Date(initial.doc.updatedAt) : null }
        : { kind: 'error', reason: 'unavailable' },
  );

  const write = useCallback((): boolean => {
    clearTimeout(timer.current);
    timer.current = 0;
    if (blocked.current) return false;
    const s = storage();
    if (!s) {
      setStatus({ kind: 'error', reason: 'unavailable' });
      return false;
    }
    const json = JSON.stringify(docRef.current);
    if (json === lastWritten.current) {
      setStatus((st) => (st.kind === 'saved' ? st : { kind: 'saved', at: new Date() }));
      return true;
    }
    try {
      s.setItem(KEY, json);
      lastWritten.current = json;
      setStatus({ kind: 'saved', at: new Date() });
      return true;
    } catch (e) {
      const name = (e as DOMException)?.name ?? '';
      setStatus({ kind: 'error', reason: /quota/i.test(name) || (e as DOMException)?.code === 22 ? 'quota' : 'unknown' });
      return false;
    }
  }, []);

  const flush = useCallback(() => {
    if (timer.current) write();
  }, [write]);

  const update = useCallback(
    (patch: Partial<Omit<JournalDocument, 'schemaVersion'>>) => {
      docRef.current = { ...docRef.current, ...patch, updatedAt: new Date().toISOString() };
      if (blocked.current) return;
      setStatus((st) => (st.kind === 'pending' ? st : { kind: 'pending' }));
      clearTimeout(timer.current);
      timer.current = window.setTimeout(write, DEBOUNCE_MS);
    },
    [write],
  );

  /** Replace the whole document (import, clear) and save immediately. */
  const replace = useCallback(
    (doc: JournalDocument) => {
      docRef.current = { ...doc, updatedAt: new Date().toISOString() };
      return write();
    },
    [write],
  );

  const resolveConflict = useCallback(
    (keep: 'mine' | 'theirs'): JournalDocument | null => {
      const theirs = conflict;
      blocked.current = null;
      setConflict(null);
      if (keep === 'theirs' && theirs) {
        docRef.current = theirs;
        lastWritten.current = JSON.stringify(theirs);
        setStatus({ kind: 'saved', at: new Date() });
        return theirs;
      }
      lastWritten.current = null;
      write();
      return null;
    },
    [conflict, write],
  );

  /** After the user explicitly chose to reset unreadable data. */
  const resetCorrupt = useCallback(() => {
    blocked.current = null;
    setCorruptRaw(null);
    lastWritten.current = null;
    write();
  }, [write]);

  /** Keep the unreadable data untouched; this session will not save. */
  const keepCorruptUntouched = useCallback(() => {
    setCorruptRaw(null);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || e.newValue === lastWritten.current) return;
      if (e.newValue === null) {
        // Cleared elsewhere: our copy is still here; save it again so nothing is lost.
        lastWritten.current = null;
        if (!blocked.current) write();
        return;
      }
      let theirs: JournalDocument | null = null;
      try {
        const v = validateDocument(JSON.parse(e.newValue));
        if (v.ok) theirs = v.doc;
      } catch {
        /* ignore */
      }
      if (!theirs) return;
      const mine = docRef.current;
      if (theirs.text === mine.text && theirs.title === mine.title) {
        lastWritten.current = e.newValue;
        return;
      }
      clearTimeout(timer.current);
      timer.current = 0;
      blocked.current = 'conflict';
      setConflict(theirs);
      setStatus({ kind: 'paused', reason: 'conflict' });
    };
    const onHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush, write]);

  return {
    initialDoc: initial.doc,
    docRef,
    status,
    corruptRaw,
    conflict,
    update,
    flush,
    replace,
    resolveConflict,
    resetCorrupt,
    keepCorruptUntouched,
  };
}
