import s from './effects.module.css';

export interface RainLayersProps {
  readonly raining: boolean;
}

/** ความทึบของฝนแต่ละชั้น — ชั้นหน้าเข้มสุด ชั้นหลังจางลง */
const OPACITIES = [0.45, 0.32, 0.26] as const;

/** ชั้นหน้าสุดเบลอและเร็วมาก จึงต้องจางกว่าชั้นอื่นไม่ให้บังฉาก */
const NEAR_OPACITY = 0.2;

/**
 * ฝน 4 ชั้นซ้อนคนละความเร็ว/มุม/ความคม ให้เห็นความลึก
 * ทุกชั้นอยู่ในกรอบเดียวกันที่เอียงตามลมกระโชกช้าๆ (`rainGust`)
 * ฝนอยู่ "นอก" โรงเรือน จึงไม่เกี่ยวกับการรดน้ำ (สเปกข้อ 7.8)
 */
export function RainLayers({ raining }: RainLayersProps) {
  return (
    <div className={`${s.rainGust} ${raining ? s.rainGustOn : ''}`} aria-hidden="true">
      <div
        className={`${s.rainLayer} ${s.rainLayerNear}`}
        style={{ opacity: raining ? NEAR_OPACITY : 0 }}
      >
        <div className={`${s.rainSheet} ${s.rainSheetNear}`} />
      </div>
      <div
        className={`${s.rainLayer} ${s.rainLayerA}`}
        style={{ opacity: raining ? OPACITIES[0] : 0 }}
      >
        <div className={`${s.rainSheet} ${s.rainSheetA}`} />
      </div>
      <div
        className={`${s.rainLayer} ${s.rainLayerB}`}
        style={{ opacity: raining ? OPACITIES[1] : 0 }}
      >
        <div className={`${s.rainSheet} ${s.rainSheetB}`} />
      </div>
      <div
        className={`${s.rainLayer} ${s.rainLayerC}`}
        style={{ opacity: raining ? OPACITIES[2] : 0 }}
      >
        <div className={`${s.rainSheet} ${s.rainSheetC}`} />
      </div>
    </div>
  );
}
