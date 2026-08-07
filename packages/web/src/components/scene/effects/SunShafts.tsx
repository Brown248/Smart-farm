import s from './effects.module.css';

export interface SunShaftsProps {
  /** ความเข้มแสงรวม — ผูกกับ opacity ของภาพกลางวัน */
  readonly dayOpacity: number;
  /** ความทึบของลำแสง คำนวณจากค่า lux (0 = ปิด) */
  readonly shaftOpacity: number;
}

/** แสงแดดรวม + ลำแสง 2 ลำที่ส่องผ่านหลังคากระจก — ความเข้มผูกกับ lux */
export function SunShafts({ dayOpacity, shaftOpacity }: SunShaftsProps) {
  return (
    <>
      <div className={s.rays} aria-hidden="true" style={{ opacity: dayOpacity }} />
      <div className={s.shaftWrap} aria-hidden="true" style={{ opacity: shaftOpacity }}>
        <div className={`${s.shaft} ${s.shaftA}`} />
        <div className={`${s.shaft} ${s.shaftB}`} />
      </div>
    </>
  );
}
