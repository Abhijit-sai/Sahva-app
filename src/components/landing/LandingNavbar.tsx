import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useMotionValueEvent, useScroll } from "motion/react";
import BrandImage from "../BrandImage";
export const links = [
  ["Impact", "impact"],
  ["Architecture", "architecture"],
  ["Product", "product"],
  ["Languages", "languages"],
] as const;
export default function LandingNavbar({ signedIn }: { signedIn: boolean }) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(window.scrollY > 24);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));
  return (
    <header className={"kn-nav" + (scrolled ? " scrolled" : "")}>
      <div className="kn-navbar">
        <a href="#mission" aria-label="Sahva home">
          <BrandImage className="kn-logo" />
        </a>
        <nav aria-label="Presentation topics">
          {links.map(([label, id]) => (
            <a key={id} href={"#" + id}>
              {label}
            </a>
          ))}
        </nav>
        <div className="kn-nav-actions">
          {!signedIn && (
            <a href="/app" className="kn-sign">
              Sign in
            </a>
          )}
          <a href="/app" className="kn-btn kn-primary">
            {signedIn ? "Open Sahva" : "Launch Web App"}{" "}
            <ArrowUpRight size={15} />
          </a>
        </div>
      </div>
    </header>
  );
}
