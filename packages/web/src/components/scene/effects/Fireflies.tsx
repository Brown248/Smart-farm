import type { Mote } from '@/lib/particles';
import s from './effects.module.css';

export interface FirefliesProps {
  readonly fireflies: readonly Mote[];
}

/** หิ่งห้อยกะพริบตอนกลางคืน */
export function Fireflies({ fireflies }: FirefliesProps) {
  return (
    <>
      {fireflies.map((m) => (
        <span
          key={`fly-${m.left}-${m.top}`}
          aria-hidden="true"
          data-effect="firefly"
          className={s.firefly}
          style={{
            left: m.left,
            top: m.top,
            width: m.size,
            height: m.size,
            animation: `fsFly ${m.dur} ease-in-out ${m.delay} infinite`,
          }}
        />
      ))}
    </>
  );
}
