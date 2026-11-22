import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import AcousticWaveCanvas from "./AcousticWaveCanvas";
import { ease, useChapterSteps } from "./keynote";

const beats = [
  [
    "The language wall",
    "Translation tools break the rhythm of human speech.",
    "A pause to translate becomes a pause in the conversation.",
  ],
  [
    "Pure dubbing",
    "Erase the original voice, and you erase the human.",
    "Laughter, warmth, hesitation, emphasis — gone the moment you mute the speaker.",
  ],
  [
    "The Sahva stack",
    "Two tracks. One familiar voice.",
    "Crisp translated speech carries the words. The speaker’s own voice carries the feeling.",
  ],
] as const;
export default function Act2ScrollStory() {
  const { ref, step, select, pinned } = useChapterSteps(3),
    reduce = useReducedMotion();
  return (
    <section
      ref={ref}
      id="idea"
      className={"kn-section kn-story " + (pinned ? "is-pinned" : "")}
    >
      <div className="kn-stage">
        <div className="kn-wrap story-grid">
          <div>
            <div className="kn-kicker">02 / The shift</div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, y: reduce ? 0 : 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.18, ease }}
              >
                <h2>{beats[step][1]}</h2>
                <p>{beats[step][2]}</p>
              </motion.div>
            </AnimatePresence>
            <div className="kn-pills">
              {beats.map(([name], i) => (
                <button
                  key={name}
                  aria-label={"Beat " + (i + 1) + ": " + name}
                  aria-pressed={step === i}
                  onClick={() => select(i)}
                >
                  0{i + 1}
                </button>
              ))}
            </div>
          </div>
          <div className="scope-panel">
            <div className="scope-top">
              <span>Signal study</span>
              <b>0{step + 1} / 03</b>
            </div>
            <div className={"story-wave mode-" + step}>
              <AcousticWaveCanvas
                mode={step === 0 ? "wall" : step === 1 ? "dub" : "tracks"}
              />
              {step === 0 && (
                <>
                  <i className="fracture" />
                  <span className="fragment">Wait… can you repeat that?</span>
                </>
              )}
            </div>
            <div className="scope-legend">
              {(step === 0
                ? ["Original voice", "Translation paused"]
                : step === 1
                  ? ["100% Synthetic Dub", "0% Human Voice"]
                  : [
                      "100% Translated Clarity",
                      "15% Original Emotion",
                      "Zero Self-Echo",
                    ]
              ).map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
