import s from './effects.module.css';

export interface BirdsProps {
  readonly show: boolean;
}

/** นก 2 ตัวบินผ่านด้านบนเฉพาะตอนกลางวัน */
export function Birds({ show }: BirdsProps) {
  if (!show) return null;
  return (
    <div className={s.birdBand} aria-hidden="true" data-effect="birds">
      <span className={`${s.bird} ${s.birdA}`} />
      <span className={`${s.bird} ${s.birdB}`} />
    </div>
  );
}
