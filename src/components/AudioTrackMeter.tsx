interface AudioTrackMeterProps {
  level: number; // 0 to 1
  active: boolean;
  tone: "blue" | "emerald" | "slate";
  barCount?: number;
}

const WEIGHTS = [0.42, 0.72, 0.95, 0.65, 1.0, 0.82, 0.55, 0.9, 0.68, 0.48, 0.78, 0.6];

export default function AudioTrackMeter({
  level,
  active,
  tone,
  barCount = 12,
}: AudioTrackMeterProps) {
  const barColor =
    tone === "blue"
      ? "bg-blue-600 dark:bg-blue-400"
      : tone === "emerald"
      ? "bg-emerald-600 dark:bg-emerald-400"
      : "bg-slate-500 dark:bg-slate-400";

  const clamped = Math.max(0, Math.min(1, level));

  return (
    <div
      className="flex items-end gap-1 h-7"
      aria-hidden="true"
    >
      {Array.from({ length: barCount }).map((_, idx) => {
        const weight = WEIGHTS[idx % WEIGHTS.length];
        const scale = active
          ? Math.max(0.14, Math.min(1, 0.14 + clamped * weight * 1.1))
          : 0.14;
        return (
          <span
            key={idx}
            className={`w-1 h-full rounded-full origin-bottom transition-transform duration-100 ease-out ${barColor} ${
              active ? "opacity-100" : "opacity-30"
            }`}
            style={{ transform: `scaleY(${scale.toFixed(3)})` }}
          />
        );
      })}
    </div>
  );
}
