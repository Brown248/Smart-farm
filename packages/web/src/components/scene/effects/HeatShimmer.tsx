import s from './effects.module.css';

export interface HeatShimmerProps {
  /** โชว์เมื่ออุณหภูมิเกิน 34°C และเป็นกลางวันเท่านั้น */
  readonly show: boolean;
  readonly src: string;
}

/** ไอร้อนสั่นไหวเหนือพื้น — ใช้สำเนาภาพฉากที่ crop เฉพาะส่วนล่างแล้ว skew เบาๆ */
export function HeatShimmer({ show, src }: HeatShimmerProps) {
  if (!show) return null;
  return (
    <div className={s.heatClip} aria-hidden="true" data-effect="heat">
      <img className={s.heatImg} src={src} alt="" />
    </div>
  );
}
