import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  useMotionValueEvent,
  useReducedMotion as useMotionPreference,
  useScroll,
} from "motion/react";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotionPreference(update: () => void) {
  const query = matchMedia(motionQuery);
  query.addEventListener("change", update);
  return () => query.removeEventListener("change", update);
}
// Also follow preference changes made while a presentation is open.
export function useReducedMotion() {
  const initial = useMotionPreference();
  return useSyncExternalStore(
    subscribeMotionPreference,
    () => matchMedia(motionQuery).matches,
    () => Boolean(initial),
  );
}
export const ease = [0.22, 1, 0.36, 1] as const;
export const spring = { stiffness: 180, damping: 28, mass: 0.9 };
export const acts = [
  ["mission", "Mission"],
  ["impact", "Impact"],
  ["architecture", "Architecture"],
  ["product", "Product"],
  ["languages", "Languages"],
  ["platforms", "Launch"],
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
