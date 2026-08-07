import s from './effects.module.css';

export interface MistProps {
  readonly opacity: number;
}

/** หมอกบางลอยขวางช่วงบนของฉากตอนฝนตก */
export function Mist({ opacity }: MistProps) {
  return <div className={s.mist} aria-hidden="true" style={{ opacity }} />;
}
