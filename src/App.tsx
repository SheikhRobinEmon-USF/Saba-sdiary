import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { journalConfig } from './config/journalConfig';
import { useJournalStorage } from './hooks/useJournalStorage';
import { emptyDocument, parseBackup, MAX_BACKUP_BYTES, type JournalDocument } from './lib/journalDocument';
import { exportJsonBackup, exportPlainText, exportRaw, printJournal } from './lib/exportJournal';
import { INKS, prefersReducedMotion, type InkName, type Preferences } from './lib/preferences';
import { sound } from './lib/sound';
import type { QuillPose } from './handwriting/handwritingEngine';
import NotebookEditor, { type NotebookEditorHandle } from './components/NotebookEditor';
import DeskScene from './components/DeskScene';
import Quill, { type QuillHandle } from './components/Quill';
import type { InkpotHandle } from './components/Inkpot';
import Toolbar from './components/Toolbar';
import CatsLayer from './components/CatsLayer';
import Modal from './components/Modal';
import Dedication from './components/Dedication';
import PrintSheet from './components/PrintSheet';
import { IconSettings, IconSoundOff, IconSoundOn } from './components/Icons';

type DialogName = null | 'settings' | 'note' | 'new' | 'import';

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function quillScaleFor(width: number): number {
  return Math.max(0.46, Math.min(0.74, width / 1900 + 0.0));
}

export default function App() {
  const store = useJournalStorage();
  const [prefs, setPrefs] = useState<Preferences>(store.initialDoc.preferences);
  const [title, setTitle] = useState(store.initialDoc.title);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [pendingImport, setPendingImport] = useState<JournalDocument | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [printDoc, setPrintDoc] = useState<{ title: string; text: string } | null>(null);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [quillScale, setQuillScale] = useState(() => quillScaleFor(window.innerWidth));
  const [ready, setReady] = useState(false);

  const editorRef = useRef<NotebookEditorHandle>(null);
  const quillRef = useRef<QuillHandle>(null);
  const inkpotRef = useRef<InkpotHandle>(null);
  const lastPose = useRef<QuillPose | null>(null);
  const quillClient = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const lastTyped = useRef(-1e9);

  const instant = prefs.motion === 'instant' || (prefs.motion === 'auto' && reduced);
  const today = useMemo(() => formatDate(new Date()), []);

  // ------------------------------------------------------------ environment
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  useEffect(() => {
    document.title = journalConfig.appName;
    const root = document.documentElement;
    const vv = window.visualViewport;
    const sync = () => {
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty('--app-h', `${Math.round(h)}px`);
      root.style.setProperty('--vv-top', `${Math.round(vv ? vv.offsetTop : 0)}px`);
      setQuillScale(quillScaleFor(window.innerWidth));
    };
    sync();
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  // ink colour as CSS variables (existing writing recolours, nothing is redrawn)
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--ink', INKS[prefs.ink].dry);
    root.style.setProperty('--ink-wet', INKS[prefs.ink].wet);
    root.dataset.ink = prefs.ink;
  }, [prefs.ink]);

  // Sound is only ever started from a user gesture.
  useEffect(() => {
    if (!prefs.sound) {
      sound.setEnabled(false);
      return;
    }
    const arm = () => sound.setEnabled(true);
    window.addEventListener('pointerdown', arm, { once: true });
    window.addEventListener('keydown', arm, { once: true });
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, [prefs.sound]);

  // ------------------------------------------------------------------ quill
  const placeQuill = useCallback((pose: QuillPose | null) => {
    const q = quillRef.current;
    const ed = editorRef.current;
    if (!q || !pose) return;
    const content = ed?.contentElement();
    const scroller = ed?.scrollerElement();
    if (!content || !scroller || !pose.placed) {
      q.place(pose, -9999, -9999, false);
      return;
    }
    const cr = content.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    const x = cr.left + pose.x;
    const y = cr.top + pose.y;
    const inside = y > sr.top - 6 && y < sr.bottom + 6 && x > sr.left - 30 && x < sr.right + 60;
    q.place(pose, x, y, inside || pose.state === 'dipping');
    quillClient.current = { x, y, active: pose.state !== 'resting' && inside };
    inkpotRef.current?.setDipping(pose.state === 'dipping' && pose.lift < 0.3);
  }, []);

  const onPose = useCallback(
    (pose: QuillPose) => {
      lastPose.current = pose;
      placeQuill(pose);
    },
    [placeQuill],
  );

  useEffect(() => {
    const re = () => placeQuill(lastPose.current);
    const scroller = editorRef.current?.scrollerElement();
    scroller?.addEventListener('scroll', re, { passive: true });
    window.addEventListener('resize', re);
    return () => {
      scroller?.removeEventListener('scroll', re);
      window.removeEventListener('resize', re);
    };
  }, [placeQuill, ready]);

  const getInkpotPoint = useCallback(() => {
    const mouth = inkpotRef.current?.mouthClientPoint();
    const content = editorRef.current?.contentElement();
    if (!mouth || !content) return null;
    const cr = content.getBoundingClientRect();
    return { x: mouth.x - cr.left, y: mouth.y - cr.top };
  }, []);

  // ------------------------------------------------------------ preferences
  const setPref = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      setPrefs((p) => {
        const next = { ...p, [key]: value };
        store.update({ preferences: next });
        return next;
      });
    },
    [store],
  );

  const toggleSound = () => {
    const on = !prefs.sound;
    sound.setEnabled(on); // inside the click: allowed to start audio
    setPref('sound', on);
  };

  // ----------------------------------------------------------- doc helpers
  const currentDoc = useCallback((): JournalDocument => {
    return { ...store.docRef.current, text: editorRef.current?.getText() ?? store.docRef.current.text, title, preferences: prefs };
  }, [store, title, prefs]);

  const loadDoc = (doc: JournalDocument) => {
    editorRef.current?.replaceText(doc.text);
    setTitle(doc.title);
    setPrefs(doc.preferences);
  };

  const handlePrint = async () => {
    editorRef.current?.finalize();
    const doc = currentDoc();
    flushSync(() => setPrintDoc({ title: doc.title, text: doc.text }));
    await printJournal();
  };

  // Ctrl/Cmd+P and the browser menu print the diary too, never the scene.
  useEffect(() => {
    const before = () => {
      editorRef.current?.finalize();
      const doc = currentDoc();
      flushSync(() => setPrintDoc({ title: doc.title, text: doc.text }));
    };
    window.addEventListener('beforeprint', before);
    return () => window.removeEventListener('beforeprint', before);
  }, [currentDoc]);

  const handleImportFile = async (file: File) => {
    setPendingImport(null);
    setImportError(null);
    if (file.size > MAX_BACKUP_BYTES) {
      setImportError('That file is too large to be a diary backup.');
    } else {
      const res = parseBackup(await file.text());
      if (res.ok) setPendingImport(res.doc);
      else setImportError(res.error);
    }
    setDialog('import');
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    const doc = pendingImport;
    store.replace(doc);
    loadDoc(doc);
    setPendingImport(null);
    setDialog(null);
  };

  const confirmNew = () => {
    const doc = { ...emptyDocument(), preferences: prefs };
    store.replace(doc);
    loadDoc(doc);
    setDialog(null);
    setBackedUp(false);
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  const backupNow = () => {
    exportJsonBackup(currentDoc());
    setBackedUp(true);
  };

  // skip the opening reveal on the first interaction
  const [revealDone, setRevealDone] = useState(false);
  useEffect(() => {
    const done = () => setRevealDone(true);
    const t = window.setTimeout(done, 1700);
    window.addEventListener('pointerdown', done, { once: true });
    window.addEventListener('keydown', done, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', done);
      window.removeEventListener('keydown', done);
    };
  }, []);

  const charCount = (s: string) => [...s].length.toLocaleString();

  return (
    <>
      <div className="app" data-reveal={revealDone || reduced ? 'done' : 'playing'} data-ready={ready ? 'true' : 'false'}>
        <a
          className="skip-link"
          href="#diary-text"
          onClick={(e) => {
            e.preventDefault();
            editorRef.current?.focus();
          }}
        >
          Skip to the diary page
        </a>
        <header className="masthead">
          <div className="brand">
            <h1 className="app-name">{journalConfig.appName}</h1>
            <Dedication />
          </div>
          <div className="masthead-actions">
            <button
              type="button"
              className="icon-btn"
              aria-pressed={prefs.sound}
              aria-label={prefs.sound ? 'Sound on — mute' : 'Sound off — turn on quill sounds'}
              title={prefs.sound ? 'Mute' : 'Turn on soft quill sounds'}
              onClick={toggleSound}
            >
              {prefs.sound ? <IconSoundOn /> : <IconSoundOff />}
            </button>
            <button type="button" className="icon-btn" aria-label="Settings" title="Settings" onClick={() => setDialog('settings')}>
              <IconSettings />
            </button>
          </div>
        </header>

        {store.conflict && (
          <div className="banner" role="alert">
            <span>This diary was changed in another tab or window. Saving here is paused so nothing is overwritten.</span>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                const theirs = store.resolveConflict('theirs');
                if (theirs) loadDoc(theirs);
              }}
            >
              Load the other version
            </button>
            <button type="button" className="btn" onClick={() => store.resolveConflict('mine')}>
              Keep this page
            </button>
          </div>
        )}

        <DeskScene
          inkpotRef={inkpotRef}
          ambience={prefs.ambience && !reduced}
          onSeal={journalConfig.loveNote.enabled ? () => setDialog('note') : undefined}
        >
          <NotebookEditor
            ref={editorRef}
            initialText={store.initialDoc.text}
            title={title}
            onTitleChange={(t) => {
              setTitle(t);
              store.update({ title: t });
            }}
            onTextChange={(text) => {
              lastTyped.current = performance.now();
              store.update({ text });
            }}
            onBlur={store.flush}
            instant={instant}
            dipping={!instant}
            onPose={onPose}
            onInkEvent={(e) => (e === 'stroke' ? sound.scratch() : sound.dip())}
            getInkpotPoint={getInkpotPoint}
            onReady={() => setReady(true)}
            dateLine={today}
          />
        </DeskScene>

        <Toolbar
          status={store.status}
          ink={prefs.ink}
          instant={instant}
          onInk={(ink: InkName) => setPref('ink', ink)}
          onToggleInstant={() => setPref('motion', instant ? 'animated' : 'instant')}
          onPrint={handlePrint}
          onExportText={() => exportPlainText(currentDoc())}
          onExportJson={() => exportJsonBackup(currentDoc())}
          onImportFile={handleImportFile}
          onNew={() => {
            setBackedUp(false);
            setDialog('new');
          }}
        />

        <CatsLayer
          reducedMotion={reduced}
          lastTyped={() => lastTyped.current}
          quill={() => quillClient.current}
          onSound={(k) => (k === 'purr' ? sound.purr() : sound.chirp())}
        />

        <div className="quill-layer" aria-hidden="true">
          <Quill ref={quillRef} scale={quillScale} />
        </div>
      </div>

      {/* ------------------------------------------------------------ dialogs */}
      <Modal open={dialog === 'settings'} title="Settings" onClose={() => setDialog(null)}>
        <fieldset className="field">
          <legend>Ink</legend>
          <div className="choice-row">
            {(Object.keys(INKS) as InkName[]).map((name) => (
              <label key={name} className="choice">
                <input type="radio" name="ink" checked={prefs.ink === name} onChange={() => setPref('ink', name)} />
                <span className="swatch" style={{ background: INKS[name].dry }} aria-hidden="true" />
                {INKS[name].label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>Writing</legend>
          <div className="choice-row">
            {(
              [
                ['auto', 'Follow my device', 'quill writes unless reduced motion is on'],
                ['animated', 'Quill writing', 'letters are drawn stroke by stroke'],
                ['instant', 'Instant ink', 'text appears at once, no motion'],
              ] as const
            ).map(([v, label, hint]) => (
              <label key={v} className="choice">
                <input type="radio" name="motion" checked={prefs.motion === v} onChange={() => setPref('motion', v)} />
                <span>
                  {label} <small>{hint}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>Atmosphere</legend>
          <label className="choice">
            <input type="checkbox" checked={prefs.sound} onChange={toggleSound} />
            <span>
              Soft quill sounds <small>off by default</small>
            </span>
          </label>
          <label className="choice">
            <input type="checkbox" checked={prefs.ambience} onChange={(e) => setPref('ambience', e.target.checked)} />
            <span>
              Drifting dust in the lamplight <small>hidden when reduced motion is on</small>
            </span>
          </label>
        </fieldset>
        <div className="note-box">
          <strong>Where your writing lives.</strong> Everything stays in this browser on this device — nothing is sent anywhere, and
          there is no account or cloud copy. Browsers can clear site data, and private windows forget it, so download a backup now and
          then (Export → Backup).
        </div>
      </Modal>

      <Modal open={dialog === 'note'} title={journalConfig.loveNote.heading} onClose={() => setDialog(null)} variant="letter">
        {journalConfig.recipientName && <p className="letter-greeting">Dear {journalConfig.recipientName},</p>}
        {journalConfig.loveNote.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <p className="letter-sign">— {journalConfig.loveNote.signature}</p>
      </Modal>

      <Modal
        open={dialog === 'new'}
        title="Start a fresh page?"
        onClose={() => setDialog(null)}
        actions={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setDialog(null)}>
              Keep writing
            </button>
            <button type="button" className="btn" onClick={backupNow}>
              {backedUp ? 'Backup downloaded ✓' : 'Download a backup first'}
            </button>
            <button type="button" className="btn btn-danger" onClick={confirmNew}>
              Erase &amp; start fresh
            </button>
          </>
        }
      >
        <p>
          This removes the current page ({charCount(editorRef.current?.getText() ?? '')} characters) from this browser. It cannot be undone,
          so you may want to keep a backup file first.
        </p>
      </Modal>

      <Modal
        open={dialog === 'import'}
        title={importError ? 'That backup could not be used' : 'Replace this page with the backup?'}
        onClose={() => {
          setDialog(null);
          setPendingImport(null);
        }}
        actions={
          importError ? (
            <button type="button" className="btn" onClick={() => setDialog(null)}>
              Close
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={backupNow}>
                {backedUp ? 'Current page saved ✓' : 'Back up the current page'}
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmImport}>
                Replace with backup
              </button>
            </>
          )
        }
      >
        {importError ? (
          <p>{importError} Your current diary has not been changed.</p>
        ) : pendingImport ? (
          <p>
            The backup{pendingImport.title ? ` “${pendingImport.title}”` : ''} has {charCount(pendingImport.text)} characters, last changed{' '}
            {new Date(pendingImport.updatedAt).toLocaleString()}. Your current page has {charCount(editorRef.current?.getText() ?? '')} characters
            and will be replaced.
          </p>
        ) : null}
      </Modal>

      <Modal
        open={store.corruptRaw !== null}
        title="The saved diary could not be read"
        required
        onClose={() => undefined}
        actions={
          <>
            <button type="button" className="btn" onClick={() => exportRaw(store.corruptRaw ?? '')}>
              Download the saved data
            </button>
            <button type="button" className="btn btn-quiet" onClick={store.keepCorruptUntouched}>
              Leave it untouched
            </button>
            <button type="button" className="btn btn-danger" onClick={store.resetCorrupt}>
              Reset to an empty diary
            </button>
          </>
        }
      >
        <p>
          Something in this browser’s saved copy is damaged, so it was not loaded and nothing has been overwritten. Download it to keep it
          safe, then choose whether to reset. If you leave it untouched, new writing will not be saved here until you reset.
        </p>
      </Modal>

      {printDoc && <PrintSheet title={printDoc.title} text={printDoc.text} dateLine={today} />}
    </>
  );
}
