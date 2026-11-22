import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { HandwritingEngine, type EditKind, type QuillPose } from '../handwriting/handwritingEngine';
import { journalConfig } from '../config/journalConfig';

export interface NotebookEditorHandle {
  getText(): string;
  /** Replace the whole text without animation (restore/import/clear). */
  replaceText(text: string): void;
  focus(): void;
  /** Complete all pending ink immediately. */
  finalize(): void;
  caretScenePoint(): { x: number; y: number } | null;
  contentElement(): HTMLElement | null;
  scrollerElement(): HTMLElement | null;
}

interface Props {
  initialText: string;
  title: string;
  onTitleChange(title: string): void;
  onTextChange(text: string): void;
  instant: boolean;
  dipping: boolean;
  onPose(pose: QuillPose): void;
  onInkEvent?(e: 'stroke' | 'dip'): void;
  getInkpotPoint?(): { x: number; y: number } | null;
  onReady?(): void;
  onBlur?(): void;
  dateLine: string;
}

function kindFor(inputType: string | undefined, insertedLen: number): EditKind {
  switch (inputType) {
    case 'insertText':
    case 'insertLineBreak':
    case 'insertParagraph':
    case 'insertCompositionText':
      return insertedLen > 40 ? 'paste' : 'type';
    case 'insertFromPaste':
    case 'insertFromDrop':
    case 'insertFromPasteAsQuotation':
    case 'insertReplacementText':
    case 'insertFromYank':
      return 'paste';
    default:
      // deletions, undo/redo, formatting, unknown → reconcile instantly
      return 'instant';
  }
}

const NotebookEditor = forwardRef<NotebookEditorHandle, Props>(function NotebookEditor(props, ref) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const engine = useRef<HandwritingEngine | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // ----------------------------------------------------------- engine setup
  useEffect(() => {
    let cancelled = false;
    const ta = textareaRef.current!;
    ta.value = props.initialText;
    const start = async () => {
      try {
        await document.fonts.load(`40px "Scribe Hand"`, 'abc');
        await document.fonts.ready;
      } catch {
        /* fonts API unavailable: carry on with whatever is loaded */
      }
      if (cancelled) return;
      const e = new HandwritingEngine({
        container: contentRef.current!,
        mirror: mirrorRef.current!,
        svg: svgRef.current!,
        fallbackLayer: fallbackRef.current!,
        onPose: (p) => propsRef.current.onPose(p),
        onInkEvent: (ev) => propsRef.current.onInkEvent?.(ev),
        getInkpotPoint: () => propsRef.current.getInkpotPoint?.() ?? null,
      });
      e.setInstant(propsRef.current.instant);
      e.setDipping(propsRef.current.dipping);
      e.load(ta.value);
      e.restAtCaret(ta.value.length);
      engine.current = e;
      // read-only hooks for the automated browser tests (no data leaves the page)
      (window as unknown as { __scribe?: object }).__scribe = {
        audit: () => ({ ...e.audit(), textMatches: e.currentText === ta.value }),
        quillState: () => e.quillState,
        queue: () => e.queueLength,
      };
      contentRef.current!.dataset.ready = 'true';
      propsRef.current.onReady?.();
    };
    void start();
    return () => {
      cancelled = true;
      engine.current?.destroy();
      engine.current = null;
    };
    // initialText is only read on mount; later replacements go through replaceText
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => engine.current?.setInstant(props.instant), [props.instant]);
  useEffect(() => engine.current?.setDipping(props.dipping), [props.dipping]);

  // --------------------------------------------------------- input handling
  useEffect(() => {
    const ta = textareaRef.current!;
    let composing = false;
    let beforeComposition = '';

    const ensureCaretVisible = () => {
      const e = engine.current;
      const sc = scrollerRef.current;
      const content = contentRef.current;
      if (!e || !sc || !content || document.activeElement !== ta) return;
      const p = e.caretPoint(ta.selectionEnd);
      if (!p) return;
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 50;
      const top = content.offsetTop + p.y - lh;
      const bottom = content.offsetTop + p.y + lh * 0.6;
      if (top < sc.scrollTop) sc.scrollTop = top - 8;
      else if (bottom > sc.scrollTop + sc.clientHeight) sc.scrollTop = bottom - sc.clientHeight + 12;
    };

    const onInput = (ev: Event) => {
      const e = engine.current;
      const ie = ev as InputEvent;
      const value = ta.value;
      if (e) {
        if (composing || ie.isComposing) {
          e.setText(value, 'provisional', ta.selectionEnd);
        } else {
          const inserted = Math.max(0, value.length - e.currentText.length);
          e.setText(value, kindFor(ie.inputType, inserted), ta.selectionEnd);
        }
      }
      propsRef.current.onTextChange(value);
      requestAnimationFrame(ensureCaretVisible);
    };
    const onCompositionStart = () => {
      composing = true;
      beforeComposition = engine.current?.currentText ?? ta.value;
    };
    const onCompositionEnd = () => {
      composing = false;
      const e = engine.current;
      if (!e) return;
      const value = ta.value;
      // drop the provisional rendering, then write the committed text once
      e.setText(beforeComposition, 'instant');
      e.setText(value, 'type', ta.selectionEnd);
      propsRef.current.onTextChange(value);
    };
    let selRaf = 0;
    const onSelection = () => {
      if (document.activeElement !== ta) return;
      cancelAnimationFrame(selRaf);
      selRaf = requestAnimationFrame(() => {
        if (ta.selectionStart === ta.selectionEnd) engine.current?.restAtCaret(ta.selectionEnd);
      });
    };
    ta.addEventListener('input', onInput);
    ta.addEventListener('compositionstart', onCompositionStart);
    ta.addEventListener('compositionend', onCompositionEnd);
    document.addEventListener('selectionchange', onSelection);
    return () => {
      ta.removeEventListener('input', onInput);
      ta.removeEventListener('compositionstart', onCompositionStart);
      ta.removeEventListener('compositionend', onCompositionEnd);
      document.removeEventListener('selectionchange', onSelection);
    };
  }, []);

  // ------------------------------------------- geometry changes & lifecycle
  useEffect(() => {
    const content = contentRef.current!;
    let width = content.clientWidth;
    let fs = getComputedStyle(content).fontSize;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      const w = content.clientWidth;
      const f = getComputedStyle(content).fontSize;
      if (w === width && f === fs) return;
      width = w;
      fs = f;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => engine.current?.relayout());
    });
    ro.observe(content);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') engine.current?.finalizeAll();
    };
    const onFonts = () => engine.current?.relayout();
    document.addEventListener('visibilitychange', onVisibility);
    document.fonts?.addEventListener?.('loadingdone', onFonts);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      document.fonts?.removeEventListener?.('loadingdone', onFonts);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    getText: () => textareaRef.current?.value ?? '',
    replaceText: (text: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.value = text;
      engine.current?.load(text);
      engine.current?.restAtCaret(text.length);
    },
    focus: () => textareaRef.current?.focus(),
    finalize: () => engine.current?.finalizeAll(),
    caretScenePoint: () => {
      const ta = textareaRef.current;
      return ta && engine.current ? engine.current.caretPoint(ta.selectionEnd) : null;
    },
    contentElement: () => contentRef.current,
    scrollerElement: () => scrollerRef.current,
  }));

  return (
    <div className="sheet-scroll" ref={scrollerRef}>
      <div className="page">
        <p className="date-line">{props.dateLine}</p>
        <label className="visually-hidden" htmlFor="entry-title">
          Title of this page
        </label>
        <input
          id="entry-title"
          className="entry-title"
          type="text"
          maxLength={120}
          autoComplete="off"
          placeholder={journalConfig.titlePlaceholder}
          value={props.title}
          onChange={(e) => props.onTitleChange(e.target.value)}
          onBlur={props.onBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              textareaRef.current?.focus();
            }
          }}
        />
        <div className="editor" ref={contentRef}>
          <div className="editor-mirror" ref={mirrorRef} aria-hidden="true" />
          <svg className="ink-layer" ref={svgRef} aria-hidden="true" focusable="false" />
          <div className="fallback-layer" ref={fallbackRef} aria-hidden="true" />
          <label className="visually-hidden" htmlFor="diary-text">
            Diary page. Type to write; the quill writes your words in ink.
          </label>
          <textarea
            id="diary-text"
            ref={textareaRef}
            className="editor-input"
            spellCheck={false}
            autoCapitalize="sentences"
            autoCorrect="on"
            placeholder={journalConfig.bodyPlaceholder}
            onBlur={props.onBlur}
          />
        </div>
      </div>
    </div>
  );
});

export default NotebookEditor;
