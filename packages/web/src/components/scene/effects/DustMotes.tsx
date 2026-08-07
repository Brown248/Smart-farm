import type { Mote } from '@/lib/particles';
import s from './effects.module.css';

export interface DustMotesProps {
  readonly motes: readonly Mote[];
}

/** ฝุ่นลอยในลำแสงกลางวัน */
export function DustMotes({ motes }: DustMotesProps) {
  return (
    <>
      {motes.map((m) => (
        <span
          key={`mote-${m.left}-${m.top}`}
          aria-hidden="true"
          data-effect="mote"
          className={s.mote}
          style={{
            left: m.left,
            top: m.top,
            width: m.size,
            height: m.size,
            animation: `fsMote ${m.dur} linear ${m.delay} infinite`,
          }}
        />
      ))}
    </>
  );
}
