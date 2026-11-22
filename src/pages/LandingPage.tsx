import { MotionConfig, useReducedMotion } from "motion/react";
import LandingNavbar from "../components/landing/LandingNavbar";
import KeynoteRail from "../components/landing/KeynoteRail";
import Act1Hero from "../components/landing/Act1Hero";
import Act2ScrollStory from "../components/landing/Act2ScrollStory";
import Act3InteractiveMixLab from "../components/landing/Act3InteractiveMixLab";
import Act4LifecycleWalkthrough from "../components/landing/Act4LifecycleWalkthrough";
import Act5LanguageContinuum from "../components/landing/Act5LanguageContinuum";
import Act6PlatformAndFinale from "../components/landing/Act6PlatformAndFinale";
import { ease } from "../components/landing/keynote";
import "./landing.css";
export default function LandingPage({ signedIn }: { signedIn: boolean }) {
  const reduced = useReducedMotion();
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: reduced ? 0 : 0.3, ease }}
    >
      <div className="keynote">
        <a href="#presentation" className="kn-skip">
          Skip navigation
        </a>
        <LandingNavbar signedIn={signedIn} />
        <KeynoteRail />
        <main id="presentation">
          <Act1Hero signedIn={signedIn} />
          <Act2ScrollStory />
          <Act3InteractiveMixLab />
          <Act4LifecycleWalkthrough />
          <Act5LanguageContinuum />
          <Act6PlatformAndFinale signedIn={signedIn} />
        </main>
      </div>
    </MotionConfig>
  );
}
