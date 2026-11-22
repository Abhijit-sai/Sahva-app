import { useEffect, useState } from "react";
import { motion, useScroll } from "motion/react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { acts } from "./keynote";

const stops = [...acts, ["finale", "Finale"]] as const;

export default function KeynoteRail() {
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll();
  useEffect(() => {
    const sections = stops.map(([id]) => document.getElementById(id));
    const track = () => {
      let current = 0;
      sections.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= innerHeight * 0.5)
          current = i;
      });
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2)
        current = stops.length - 1;
      setActive(current);
    };
    track();
    const observer = new ResizeObserver(track);
    sections.forEach((el) => el && observer.observe(el));
    window.addEventListener("scroll", track, { passive: true });
    window.addEventListener("resize", track);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", track);
      window.removeEventListener("resize", track);
    };
  }, []);
  const atEnd = active === stops.length - 1;
  const [nextId, nextName] = stops[(active + 1) % stops.length];
  const label = atEnd ? "Restart presentation" : "Next section: " + nextName;
  return (
    <>
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
            aria-current={
              Math.min(active, acts.length - 1) === i ? "step" : undefined
            }
          >
            <span>
              <b>{name} </b>
              {String(i + 1).padStart(2, "0")}
            </span>
            <i />
          </a>
        ))}
      </nav>
      <a
        className="kn-advance"
        data-finale={atEnd}
        href={"#" + nextId}
        aria-label={label}
        title={label}
        onClick={(event) => {
          if (
            event.detail !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          const section = document.getElementById(nextId);
          if (!section) return;
          event.preventDefault();
          history.pushState(history.state, "", "#" + nextId);
          section.scrollIntoView({ block: "start" });
        }}
      >
        {atEnd ? <RotateCcw size={15} /> : <ChevronDown size={18} />}
      </a>
    </>
  );
}
