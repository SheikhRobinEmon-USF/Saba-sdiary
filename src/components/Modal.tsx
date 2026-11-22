import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconClose } from './Icons';

interface Props {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  actions?: ReactNode;
  variant?: 'card' | 'letter';
  /** Prevent closing with Escape / backdrop (for decisions that must be made). */
  required?: boolean;
}

/** Native <dialog> modal: focus trapping, Escape and inert background for free. */
export default function Modal({ open, title, onClose, children, actions, variant = 'card', required }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      try {
        d.showModal();
      } catch {
        d.setAttribute('open', '');
      }
    } else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal modal-${variant}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!required) onClose();
      }}
      onClick={(e) => {
        if (!required && e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal-inner">
          <header className="modal-head">
            <h2 id={titleId}>{title}</h2>
            {!required && (
              <button type="button" className="icon-btn modal-close" onClick={onClose} aria-label="Close">
                <IconClose size={18} />
              </button>
            )}
          </header>
          <div className="modal-body">{children}</div>
          {actions && <footer className="modal-actions">{actions}</footer>}
        </div>
      )}
    </dialog>
  );
}
