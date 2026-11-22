import { useEffect, useState } from "react";
import { motion, useScroll } from "motion/react";
import { acts } from "./keynote";
export default function KeynoteRail() {
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll();
  useEffect(() => {
    const track = () => {
      let current = 0;
      acts.forEach(([id], i) => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= innerHeight * 0.5)
          current = i;
      });
      setActive(current);
    };
    track();
    window.addEventListener("scroll", track, { passive: true });
    return () => window.removeEventListener("scroll", track);
  }, []);
  return (
    <nav className="kn-rail" aria-label="Keynote chapters">
      <div className="kn-rail-track">
        <motion.i style={{ scaleY: scrollYProgress }} />
      </div>
      {acts.map(([id, name], i) => (
        <a
          key={id}
          href={"#" + id}
          title={name}
          aria-label={String(i + 1).padStart(2, "0") + " " + name}
          aria-current={active === i ? "step" : undefined}
        >
          <span>{String(i + 1).padStart(2, "0")}</span>
          <i />
        </a>
      ))}
    </nav>
  );
}
