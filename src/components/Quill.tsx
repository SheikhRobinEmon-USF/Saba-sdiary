import { forwardRef, useImperativeHandle, useRef } from 'react';
import quillUrl from '../assets/art/quill.svg';
import meta from '../assets/art/artMeta.json';
import type { QuillPose } from '../handwriting/handwritingEngine';

export interface QuillHandle {
  /** Draw the quill with its nib tip at a point in layer coordinates. */
  place(pose: QuillPose, x: number, y: number, visible: boolean): void;
}

const { width: W, height: H, tipX, tipY } = meta.quill;

/**
 * The feather quill. Its artwork is anchored so that the wrapper's origin is
 * the exact nib tip; rotation (tilt) happens around the tip, and the lift is
 * shown by raising the feather and pushing its shadow away.
 */
const Quill = forwardRef<QuillHandle, { scale: number }>(function Quill({ scale }, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    place(pose, x, y, visible) {
      const root = rootRef.current;
      const body = bodyRef.current;
      const shadow = shadowRef.current;
      if (!root || !body || !shadow) return;
      const lift = pose.lift;
      const raise = lift * 7 * scale;
      const lower = lift < 0 ? -lift * 14 * scale : 0;
      body.style.transform = `translate3d(${x.toFixed(2)}px, ${(y - Math.max(raise, 0) + lower).toFixed(2)}px, 0) rotate(${pose.tilt.toFixed(2)}deg) scale(${scale})`;
      const so = 5 + Math.max(lift, 0) * 13;
      shadow.style.transform = `translate3d(${(x + so * 0.9 * scale).toFixed(2)}px, ${(y + so * scale).toFixed(2)}px, 0) rotate(${pose.tilt.toFixed(2)}deg) scale(${scale})`;
      shadow.style.opacity = String(Math.max(0.12, 0.3 - Math.max(lift, 0) * 0.12));
      root.dataset.state = pose.state;
      root.dataset.visible = visible ? 'true' : 'false';
    },
  }));

  const art = (
    <img
      src={quillUrl}
      width={W}
      height={H}
      alt=""
      draggable={false}
      style={{ position: 'absolute', left: -tipX, top: -tipY, width: W, height: H }}
    />
  );

  return (
    <div className="quill" ref={rootRef} data-visible="false" aria-hidden="true">
      <div className="quill-shadow" ref={shadowRef}>
        {art}
      </div>
      <div className="quill-body" ref={bodyRef}>
        <div className="quill-sway">{art}</div>
      </div>
    </div>
  );
});

export default Quill;
