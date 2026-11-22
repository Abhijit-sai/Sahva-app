import { AnimatePresence, motion } from "motion/react";
import {
  AudioLines,
  Bell,
  Captions,
  FlaskConical,
  HeartPulse,
  MapPin,
  Ship,
} from "lucide-react";
import farmer from "../../assets/images/keynote/vizag-farmer.webp";
import buyer from "../../assets/images/keynote/seoul-buyer.webp";
import father from "../../assets/images/keynote/assam-father.webp";
import doctor from "../../assets/images/keynote/chennai-doctor.webp";
import presenter from "../../assets/images/keynote/beijing-presenter.webp";
import american from "../../assets/images/keynote/sf-researcher.webp";
import indian from "../../assets/images/keynote/bengaluru-researcher.webp";
import korean from "../../assets/images/keynote/seoul-researcher.webp";
import { useChapterSteps } from "./keynote";

type Feed = {
  photo: string;
  alt: string;
  place: string;
  language: string;
  lang: string;
  caption: string;
};

const stories = [
  {
    title: "Global agri-trade",
    icon: Ship,
    route: "Vizag Port ↔ Seoul & Shanghai",
    copy: "A farmer near Vizag Port negotiates 20 tons of Guntur chillies directly with a Korean buyer. They agree on grade, tonnage, loading date, and price without losing 30% to translation middlemen.",
    label: "Loading confirmation · English",
    translation: "20 tons ready for Thursday loading at Vizag Port.",
    feeds: [
      {
        photo: farmer,
        alt: "A smiling spice farmer takes the call beside his sacks of Guntur chillies.",
        place: "Vizag Port",
        language: "Farmer · Telugu",
        lang: "te",
        caption: "Vizag పోర్ట్‌లో గురువారం 20 టన్నులు సిద్ధం.",
      },
      {
        photo: buyer,
        alt: "A Korean businessman listens on his phone at his office in Seoul.",
        place: "Seoul",
        language: "Buyer · Korean",
        lang: "ko",
        caption: "비자그항에서 목요일에 20톤을 선적할 수 있습니다.",
      },
    ],
  },
  {
    title: "Life-saving healthcare",
    icon: HeartPulse,
    route: "Assam ↔ Chennai",
    copy: "A father in the Northeast describes his child’s symptoms in Hindi. A specialist in Chennai listens in Tamil. He thanks her as the follow-up notes and medication reminder arrive in his own language.",
    label: "Specialist’s follow-up · English",
    translation: "Please keep a record of the symptoms for our next call.",
    reminder: "दवा की निर्धारित खुराक देखें · Review prescribed dose",
    feeds: [
      {
        photo: father,
        alt: "A smiling father holds a phone to his ear as his daughter leans beside him.",
        place: "Assam",
        language: "Father · Hindi",
        lang: "hi",
        caption: "कल से मेरी बेटी को बुखार है।",
      },
      {
        photo: doctor,
        alt: "A pediatric specialist in Chennai listens to the father by phone.",
        place: "Chennai",
        language: "Specialist hears · Tamil",
        lang: "ta",
        caption: "நேற்று முதல் என் மகளுக்குக் காய்ச்சல் இருக்கிறது.",
      },
    ],
  },
  {
    title: "Global research & teams",
    icon: FlaskConical,
    route: "Beijing · San Francisco · Bengaluru · Seoul",
    copy: "A researcher in Beijing shares her results with teammates in three cities. As she speaks Mandarin, each colleague follows the same thought in their own language.",
    label: "Three listener streams",
    translation:
      "One speaker in Mandarin. Simultaneous captions in English, Telugu, and Korean.",
    feeds: [
      {
        photo: presenter,
        alt: "The presenter addresses her webcam from a Beijing research lab.",
        place: "Beijing",
        language: "Speaking · Mandarin",
        lang: "zh-CN",
        caption: "我们来比较一下结果。",
      },
      {
        photo: american,
        alt: "A teammate with headphones listens from a sunlit San Francisco office.",
        place: "San Francisco",
        language: "Captions · English",
        lang: "en",
        caption: "Let’s compare the results.",
      },
      {
        photo: indian,
        alt: "A researcher looks into her webcam from her workspace in Bengaluru.",
        place: "Bengaluru",
        language: "Captions · Telugu",
        lang: "te",
        caption: "ఫలితాలను పోల్చి చూద్దాం.",
      },
      {
        photo: korean,
        alt: "A colleague in Seoul joins the discussion from his own office.",
        place: "Seoul",
        language: "Captions · Korean",
        lang: "ko",
        caption: "결과를 비교해 봅시다.",
      },
    ],
  },
];

function Participant({ feed, speaking }: { feed: Feed; speaking: boolean }) {
  const Icon = speaking ? AudioLines : Captions;
  return (
    <figure className={"participant" + (speaking ? " speaking" : "")}>
      <div className="participant-photo">
        <img src={feed.photo} alt={feed.alt} loading="lazy" />
        <span className="participant-place">
          <MapPin size={11} aria-hidden="true" />
          {feed.place}
        </span>
      </div>
      <figcaption>
        <small>
          <Icon size={13} aria-hidden="true" />
          {feed.language}
        </small>
        <span lang={feed.lang}>{feed.caption}</span>
      </figcaption>
    </figure>
  );
}

export default function Act2RealWorldWalls() {
  const { ref, step, select, pinned } = useChapterSteps(stories.length);
  const story = stories[step];
  const meeting = story.feeds.length > 2;
  const narrative = (
    <div className="story-text">
      <div className="connection-line" aria-hidden="true">
        <i />
        <AudioLines size={18} />
        <i />
      </div>
      <small className="story-route">{story.route}</small>
      <h3>{story.title}</h3>
      <p>{story.copy}</p>
      <div className="conversation-strip">
        <small>{story.label}</small>
        <strong>{story.translation}</strong>
        {story.reminder && (
          <span className="note-chip">
            <Bell size={13} />
            {story.reminder}
          </span>
        )}
      </div>
    </div>
  );
  return (
    <section
      id="impact"
      ref={ref}
      className={"kn-section impact " + (pinned ? "is-pinned" : "")}
    >
      <div className="kn-stage">
        <div className="kn-wrap">
          <div className="kn-kicker">
            <span className="kicker-line" />
            Same purpose. Different language.
          </div>
          <h2>
            Speak, listen, and understand <em>in your own language.</em>
          </h2>
          <div className="story-tabs" aria-label="Impact stories">
            {stories.map(({ title, icon: Icon }, i) => (
              <button
                key={title}
                aria-pressed={step === i}
                onClick={() => select(i)}
              >
                <Icon size={16} />
                {title}
                {step === i && <motion.i layoutId="impact-tab" />}
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.article
              key={story.title}
              className={
                "story-card " + (meeting ? "story-meeting" : "story-pair")
              }
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {meeting ? (
                <>
                  <div
                    className="meeting-feeds"
                    role="group"
                    aria-label="Four participants in the research meeting"
                  >
                    {story.feeds.map((feed, i) => (
                      <Participant
                        key={feed.place}
                        feed={feed}
                        speaking={i === 0}
                      />
                    ))}
                  </div>
                  {narrative}
                </>
              ) : (
                <>
                  <Participant feed={story.feeds[0]} speaking />
                  {narrative}
                  <Participant feed={story.feeds[1]} speaking={false} />
                </>
              )}
            </motion.article>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
