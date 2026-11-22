import { useEffect, useRef } from "react";
import { useInView, useReducedMotion, type MotionValue } from "motion/react";

type WaveProps = {
  mode?: "hero" | "tracks" | "wall" | "dub" | "mini";
  bed?: number | MotionValue<number>;
  phase?: number;
  tone?: "female" | "male";
  playing?: boolean;
};
// Draw both voices from the same clock. Offscreen canvases keep their last frame.
export default function AcousticWaveCanvas({
  mode = "tracks",
  bed = 0.15,
  phase = 0,
  tone = "female",
  playing = false,
}: WaveProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const visible = useInView(ref);
  const reduced = useReducedMotion();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0,
      width = 0,
      height = 0;
    function size() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(performance.now());
    }
    function draw(now: number) {
      if (!ctx || !width || !height) return;
      ctx.clearRect(0, 0, width, height);
      const hero = mode === "hero",
        mini = mode === "mini",
        wall = mode === "wall",
        dub = mode === "dub";
      const level = typeof bed === "number" ? bed : bed.get();
      const time = (reduced ? 0 : now * (playing ? 0.0014 : 0.00032)) + phase;
      const strands = hero ? 36 : mini ? 6 : 18;
      for (let track = 0; track < 2; track++) {
        const warm = track === 0;
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, warm ? "#E86F51" : "#1772B8");
        grad.addColorStop(1, warm ? "#F4B04F" : "#12AE9A");
        ctx.strokeStyle = dub && warm ? "#909ba5" : grad;
        for (let i = 0; i < strands; i++) {
          const strand = i / (strands - 1) - 0.5;
          ctx.lineWidth = hero ? 1.15 : mini ? 1 : 1.25;
          ctx.globalAlpha = hero ? 0.68 : mini ? 0.7 : 0.64;
          ctx.beginPath();
          const start = hero || wall ? (warm ? 0 : 0.5) : 0;
          const end = hero || wall ? (warm ? 0.5 : 1) : 1;
          const samples = Math.ceil((width * (end - start)) / (hero ? 5 : 4));
          for (let p = 0; p <= samples; p++) {
            const x = p / samples;
            const u = warm || (!hero && !wall) ? x : 1 - x;
            const xx = (start + (end - start) * x) * width;
            const envelope = hero
              ? Math.pow(1 - u, 1.2)
              : Math.sin(Math.PI * x);
            let yy: number;
            if (hero) {
              const angle =
                u * 9.6 + (warm ? 0.4 : 1.4) + 0.16 * Math.sin(time);
              yy =
                height *
                (0.51 +
                  envelope *
                    (0.24 * Math.sin(angle + strand * 1.75) +
                      strand * 0.45 * Math.cos(angle * 0.71 - time * 0.12)));
            } else {
              const center = mini || wall ? 0.5 : warm ? 0.76 : 0.32;
              const amp = dub
                ? 0
                : mini || wall
                  ? 0.35
                  : warm
                    ? level * 0.93
                    : 0.21;
              const frequency = tone === "female" ? 5.6 : 3.8;
              yy =
                height *
                (center +
                  amp *
                    envelope *
                    (Math.sin(
                      u * frequency * Math.PI + time + strand * 1.9 + track,
                    ) *
                      0.68 +
                      strand * 0.65 * Math.cos(u * 9 - time)));
              if (dub && !warm) yy += height * strand * 0.045;
            }
            if (p === 0) ctx.moveTo(xx, yy);
            else ctx.lineTo(xx, yy);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    function tick(now: number) {
      draw(now);
      frame = requestAnimationFrame(tick);
    }
    size();
    const observer = new ResizeObserver(size);
    observer.observe(canvas);
    if (visible && !reduced) frame = requestAnimationFrame(tick);
    const unsubscribe =
      typeof bed !== "number" && reduced
        ? bed.on("change", () => draw(0))
        : undefined;
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe?.();
    };
  }, [mode, bed, phase, tone, playing, visible, reduced]);
  return <canvas aria-hidden="true" ref={ref} className="acoustic-canvas" />;
}
