import s from './effects.module.css';

/** ขอบมืดรอบภาพ ช่วยดึงสายตาเข้ากลางฉาก */
export function Vignette() {
  return <div className={s.vignette} aria-hidden="true" />;
}
