import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  motion,
  useInView,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { Pause, Play } from "lucide-react";
import { useReducedMotion } from "./keynote";

const letters = [
  "అ",
  "வ",
  "क",
  "한",
  "あ",
  "ম",
  "م",
  "语",
  "ક",
  "Ж",
  "ನ",
  "Ω",
  "വ",
  "ע",
  "あ",
  "च",
  "Ñ",
  "ก",
  "한",
  "శ",
  "字",
  "ব",
  "م",
];
function WallColumn({
  index,
  progress,
  still,
}: {
  index: number;
  progress: MotionValue<number>;
  still: boolean;
}) {
  const speed = 17 + ((index * 7) % 24);
  const y = useTransform(progress, [0, 1], [0, -speed]);
  const sequence = Array.from(
    { length: 12 },
    (_, row) => letters[(index * 5 + row * 7) % letters.length],
  );
  const style = {
    "--period": 35 + speed + "s",
  } as CSSProperties;
  return (
    <div className="wall-column" style={style}>
      <motion.div style={{ y: still ? 0 : y }}>
        <div className="wall-belt">
          {[0, 1].map((copy) => (
            <div className="wall-sequence" key={copy}>
              {sequence.map((letter, row) => (
                <span className="wall-key" key={row}>
                  {letter}
                </span>
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default function LanguageWall() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return (
    <>
      <div
        ref={ref}
        className="language-wall"
        aria-hidden="true"
        data-moving={inView && !hidden && !reduced && !paused}
      >
        {Array.from({ length: 16 }, (_, index) => (
          <WallColumn
            key={index}
            index={index}
            progress={scrollYProgress}
            still={Boolean(reduced) || paused}
          />
        ))}
      </div>
      {!reduced && (
        <button
          type="button"
          className="wall-toggle"
          aria-label={
            paused
              ? "Resume language wall animation"
              : "Pause language wall animation"
          }
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
      )}
    </>
  );
}
