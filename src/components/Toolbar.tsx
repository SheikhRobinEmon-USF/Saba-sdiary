import { useEffect, useRef, useState } from 'react';
import type { SaveStatus } from '../hooks/useJournalStorage';
import { INKS, INK_NAMES, type InkName } from '../lib/preferences';
import { IconExport, IconImport, IconInstant, IconNewPage, IconPrint, IconQuill, IconScroll, IconText } from './Icons';

interface Props {
  status: SaveStatus;
  ink: InkName;
  instant: boolean;
  onInk(ink: InkName): void;
  onToggleInstant(): void;
  onPrint(): void;
  onExportText(): void;
  onExportJson(): void;
  onImportFile(file: File): void;
  onNew(): void;
}

function statusText(s: SaveStatus): { text: string; tone: 'ok' | 'busy' | 'warn' } {
  switch (s.kind) {
    case 'saved':
      return {
        text: s.at ? `Kept in this browser · ${s.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Kept in this browser',
        tone: 'ok',
      };
    case 'pending':
      return { text: 'Saving…', tone: 'busy' };
    case 'error':
      return {
        text: s.reason === 'quota' ? 'Not saved — browser storage is full' : s.reason === 'unavailable' ? 'Not saved — this browser blocks storage' : 'Not saved — storage error',
        tone: 'warn',
      };
    case 'paused':
      return { text: s.reason === 'conflict' ? 'Paused — changed in another tab' : 'Not saving — earlier data unreadable', tone: 'warn' };
  }
}

export default function Toolbar(p: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const st = statusText(p.status);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('.menu-panel button') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        if (items.length) {
          e.preventDefault();
          items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
        }
      }
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuRef.current?.querySelector<HTMLButtonElement>('.menu-trigger')?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    menuRef.current?.querySelector<HTMLButtonElement>('.menu-panel button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const choose = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  return (
    <footer className="toolbar" aria-label="Diary tools">
      <div className={`save-status tone-${st.tone}`} role="status" aria-live="polite">
        <span className="save-dot" aria-hidden="true" />
        <span className="save-text">{st.text}</span>
        {st.tone === 'warn' && (
          <button type="button" className="link-btn" onClick={p.onExportJson}>
            Download a backup
          </button>
        )}
      </div>

      <div className="tool-group" role="radiogroup" aria-label="Ink colour">
        {INK_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={p.ink === name}
            className={`ink-swatch ink-${name}`}
            onClick={() => p.onInk(name)}
            title={`${INKS[name].label} ink`}
            aria-label={`${INKS[name].label} ink`}
          >
            <span style={{ background: INKS[name].dry }} />
          </button>
        ))}
      </div>

      <div className="tool-group">
        <button
          type="button"
          className="tool-btn"
          aria-pressed={p.instant}
          onClick={p.onToggleInstant}
          title={p.instant ? 'Instant ink is on — the quill rests' : 'The quill writes each letter'}
        >
          {p.instant ? <IconInstant /> : <IconQuill />}
          <span className="tool-label">{p.instant ? 'Instant ink' : 'Quill writing'}</span>
        </button>

        <div className="menu" ref={menuRef}>
          <button
            type="button"
            className="tool-btn menu-trigger"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-controls="export-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <IconExport />
            <span className="tool-label">Export</span>
          </button>
          {menuOpen && (
            <div className="menu-panel" id="export-menu" role="group" aria-label="Export options">
              <button type="button" onClick={choose(p.onPrint)}>
                <IconPrint size={18} /> Save as PDF <small>print dialog</small>
              </button>
              <button type="button" onClick={choose(p.onExportText)}>
                <IconText size={18} /> Plain text <small>.txt</small>
              </button>
              <button type="button" onClick={choose(p.onExportJson)}>
                <IconScroll size={18} /> Backup <small>.json</small>
              </button>
            </div>
          )}
        </div>

        <button type="button" className="tool-btn" onClick={() => fileRef.current?.click()}>
          <IconImport />
          <span className="tool-label">Import</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Choose a diary backup file to import"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) p.onImportFile(f);
          }}
        />

        <button type="button" className="tool-btn" onClick={p.onNew}>
          <IconNewPage />
          <span className="tool-label">New page</span>
        </button>
      </div>
    </footer>
  );
}
