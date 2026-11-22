import { forwardRef, useImperativeHandle, useRef } from 'react';
import inkpotUrl from '../assets/art/inkpot.svg';
import inkpotFrontUrl from '../assets/art/inkpot-front.svg';
import meta from '../assets/art/artMeta.json';

export interface InkpotHandle {
  /** The mouth of the inkpot in viewport coordinates, or null if hidden. */
  mouthClientPoint(): { x: number; y: number } | null;
  /** Show the front of the glass above the quill (while it dips). */
  setDipping(d: boolean): void;
}

const { width: W, height: H, mouthX, mouthY } = meta.inkpot;

const Inkpot = forwardRef<InkpotHandle, { className?: string }>(function Inkpot({ className }, ref) {
  const backRef = useRef<HTMLImageElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    mouthClientPoint() {
      const el = backRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.bottom < 0 || r.top > window.innerHeight) return null;
      return { x: r.left + (mouthX / W) * r.width, y: r.top + (mouthY / H) * r.height };
    },
    setDipping(d) {
      const back = backRef.current;
      const front = frontRef.current;
      if (!back || !front) return;
      if (d) {
        const r = back.getBoundingClientRect();
        Object.assign(front.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      }
      front.dataset.on = d ? 'true' : 'false';
    },
  }));

  return (
    <div className={`inkpot ${className ?? ''}`} aria-hidden="true">
      <img ref={backRef} src={inkpotUrl} alt="" width={W} height={H} draggable={false} />
      <div className="inkpot-front" ref={frontRef} data-on="false">
        <img src={inkpotFrontUrl} alt="" draggable={false} />
      </div>
    </div>
  );
});

export default Inkpot;
