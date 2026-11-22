import { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";

export const ease = [0.22, 1, 0.36, 1] as const;
export const spring = { stiffness: 180, damping: 28, mass: 0.9 };
export const acts = [
  ["intro", "Intro"],
  ["idea", "The Shift"],
  ["mix-lab", "Mix Lab"],
  ["walkthrough", "Lifecycle"],
  ["languages", "Languages"],
  ["platforms", "Launch"],
] as const;
export const pairs = [
  {
    from: "Telugu",
    to: "English",
    src: "te-IN",
    dst: "en-US",
    codes: "TE ↔ EN",
    speaker: "Arjun",
    listener: "Maya",
    original: "అవి ఐదు స్లైడ్స్ ఉండాలి, మాయ.",
    translated: "They were supposed to be five slides, Maya.",
  },
  {
    from: "Japanese",
    to: "Spanish",
    src: "ja-JP",
    dst: "es-ES",
    codes: "JA ↔ ES",
    speaker: "Kenji",
    listener: "Elena",
    original: "明日、一緒に確認しましょう。",
    translated: "Revisémoslo juntos mañana.",
  },
  {
    from: "Hindi",
    to: "English",
    src: "hi-IN",
    dst: "en-US",
    codes: "HI ↔ EN",
    speaker: "Asha",
    listener: "Maya",
    original: "मैं आपको बैठक के नोट्स भेज दूँगी।",
    translated: "I’ll send you the meeting notes.",
  },
] as const;

export function useChapterSteps(count: number) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [pinned, setPinned] = useState(false);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  useEffect(() => {
    const query = matchMedia("(min-width: 1024px) and (min-height: 620px)");
    const sync = () => setPinned(query.matches && !reduced);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [reduced]);
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (pinned)
      setStep(Math.min(count - 1, Math.max(0, Math.floor(value * count))));
  });
  function select(index: number) {
    if (pinned && ref.current) {
      const node = ref.current;
      const top = scrollY + node.getBoundingClientRect().top;
      window.scrollTo({
        top: top + ((node.offsetHeight - innerHeight) * (index + 0.32)) / count,
        behavior: "instant",
      });
    }
    setStep(index);
  }
  return { ref, step, select, pinned, scrollYProgress };
}
