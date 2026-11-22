import { useReducedMotion } from "./keynote";
import { useEffect, useRef } from "react";
import { useInView, type MotionValue } from "motion/react";

type Props = {
  energy: MotionValue<number>;
  paused: boolean;
  backdrop?: boolean;
};

export default function AcousticWaveCanvas({
  energy,
  paused,
  backdrop = false,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const phase = useRef(0);
  const visible = useInView(ref);
  const reduced = useReducedMotion();
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let width = 0,
      height = 0,
      frame = 0,
      lastTime = 0;
    let inks: CanvasGradient[] = [];
    function draw() {
      if (!ctx || !width || !height) return;
      ctx.clearRect(0, 0, width, height);
      const time = reduced ? 0 : phase.current;
      const energyScale = reduced ? 1 : 1 + energy.get() * 0.16;
      for (let voice = 0; voice < 2; voice++) {
        ctx.strokeStyle = inks[voice];
        ctx.lineWidth = 1.1;
        ctx.globalAlpha = 0.79;
        const strands = backdrop ? 11 : 58;
        for (let strand = 0; strand < strands; strand++) {
          const k = strand / (strands - 1) - 0.5;
          ctx.beginPath();
          const spacing = backdrop ? 10 : 3;
          for (let px = 0; px <= width + spacing; px += spacing) {
            const x = px / width;
            const amplitude = Math.pow(
              Math.max(0, Math.sin(x * Math.PI)),
              0.72,
            );
            const angle =
              x * 9.6 + (voice ? 1.38 : -0.8) + 0.22 * Math.sin(time);
            const center =
              Math.sin(angle + k * 1.3) * 0.28 +
              k * 0.42 * Math.cos(x * 7.5 + voice * 1.8 - time * 0.28);
            const y =
              height *
              (0.54 +
                amplitude * energyScale * center +
                (voice ? -0.035 : 0.035));
            if (!px) ctx.moveTo(px, y);
            else ctx.lineTo(px, y);
          }
          ctx.stroke();
        }
      }
    }
    function resize() {
      if (!canvas || !ctx) return;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      inks = [
        ["#e58852", "#eb6a42", "#f5b54c"],
        ["#2678ae", "#158fa5", "#12ae9a"],
      ].map((colors) => {
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        colors.forEach((color, i) => gradient.addColorStop(i / 2, color));
        return gradient;
      });
      draw();
    }
    function loop(now: number) {
      phase.current += lastTime ? Math.min(now - lastTime, 40) * 0.00075 : 0;
      lastTime = now;
      draw();
      frame = requestAnimationFrame(loop);
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    if (visible && !paused && !reduced) frame = requestAnimationFrame(loop);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [energy, paused, reduced, visible, backdrop]);
  return <canvas ref={ref} className="acoustic-canvas" aria-hidden="true" />;
}
