import { useReducedMotion } from "../components/landing/keynote";
import { MotionConfig } from "motion/react";
import LandingNavbar from "../components/landing/LandingNavbar";
import KeynoteRail from "../components/landing/KeynoteRail";
import Act1MissionHero from "../components/landing/Act1MissionHero";
import Act2RealWorldWalls from "../components/landing/Act2RealWorldWalls";
import Act3ArchitectureEngine from "../components/landing/Act3ArchitectureEngine";
import Act4ProductLifecycle from "../components/landing/Act4ProductLifecycle";
import Act5LanguagesGrid from "../components/landing/Act5LanguagesGrid";
import Act6PlatformsAndFinale from "../components/landing/Act6PlatformsAndFinale";
import { ease } from "../components/landing/keynote";
import "./landing.css";
export default function LandingPage({ signedIn }: { signedIn: boolean }) {
  const reduced = useReducedMotion();
  return (
    <MotionConfig
      reducedMotion={reduced ? "always" : "never"}
      transition={{ duration: reduced ? 0 : 0.3, ease }}
    >
      <div className="keynote">
        <a href="#presentation" className="kn-skip">
          Skip navigation
        </a>
        <LandingNavbar signedIn={signedIn} />
        <KeynoteRail />
        <main id="presentation">
          <Act1MissionHero signedIn={signedIn} />
          <Act2RealWorldWalls />
          <Act3ArchitectureEngine />
          <Act4ProductLifecycle />
          <Act5LanguagesGrid />
          <Act6PlatformsAndFinale signedIn={signedIn} />
        </main>
      </div>
    </MotionConfig>
  );
}
