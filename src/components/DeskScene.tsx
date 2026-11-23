import type { ReactNode, Ref } from 'react';
import deskUrl from '../assets/art/desk.svg';
import roseUrl from '../assets/art/rose.svg';
import petalsUrl from '../assets/art/petals.svg';
import botanicalUrl from '../assets/art/botanical-corner.svg';
import Inkpot, { type InkpotHandle } from './Inkpot';
import WaxSeal from './WaxSeal';

interface Props {
  children: ReactNode;
  inkpotRef: Ref<InkpotHandle>;
  onSeal?(): void;
  ambience: boolean;
}

/**
 * The illustrated desk: library wall and wooden desk behind, the parchment
 * sheet in the centre, the inkpot to the right and the cat curled up beside
 * the paper (the cats live in CatsLayer). Everything decorative is aria-hidden and ignores the pointer,
 * except the cat and the wax seal, which are real buttons.
 */
export default function DeskScene({ children, inkpotRef, onSeal, ambience }: Props) {
  return (
    <main className="scene" id="main">
      <div className="desk-bg" aria-hidden="true">
        <img src={deskUrl} alt="" draggable={false} />
      </div>
      {ambience && (
        <div className="ambience" aria-hidden="true">
          <div className="light-beam" />
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className="mote" style={{ ['--i' as string]: i }} />
          ))}
        </div>
      )}

      <div className="desk-left" aria-hidden="true">
        <img className="desk-rose" src={roseUrl} alt="" draggable={false} />
        <img className="desk-petals" src={petalsUrl} alt="" draggable={false} />
      </div>

      <div className="sheet">
        <div className="sheet-shadow" aria-hidden="true" />
        <div className="sheet-paper" aria-hidden="true" />
        <div className="sheet-decor" aria-hidden="true">
          <img className="corner corner-tl" src={botanicalUrl} alt="" draggable={false} />
          <img className="corner corner-br" src={botanicalUrl} alt="" draggable={false} />
          <div className="margin-line" />
          <svg className="margin-paw" viewBox="0 0 40 40" width="22" height="22">
            <ellipse cx="20" cy="26" rx="9" ry="7.5" />
            <ellipse cx="9" cy="15" rx="3.6" ry="4.6" transform="rotate(-20 9 15)" />
            <ellipse cx="16.5" cy="9.5" rx="3.6" ry="4.8" />
            <ellipse cx="24.5" cy="9.5" rx="3.6" ry="4.8" />
            <ellipse cx="31.5" cy="15" rx="3.6" ry="4.6" transform="rotate(20 31.5 15)" />
          </svg>
          <svg className="margin-heart" viewBox="0 0 20 18" width="14" height="13">
            <path d="M10 17 C4 12 1 9 1 5.5 C1 3 3 1 5.5 1 C7.5 1 9 2.3 10 4 C11 2.3 12.5 1 14.5 1 C17 1 19 3 19 5.5 C19 9 16 12 10 17 Z" />
          </svg>
        </div>
        {children}
        {onSeal && (
          <div className="seal-wrap">
            <WaxSeal onOpen={onSeal} />
          </div>
        )}
      </div>

      <div className="desk-right">
        <Inkpot ref={inkpotRef} />
        <img className="desk-petals desk-petals-r" src={petalsUrl} alt="" aria-hidden="true" draggable={false} />
      </div>
    </main>
  );
}
