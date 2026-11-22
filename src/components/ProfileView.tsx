import {useUser} from "@clerk/react";
import { useState, useEffect } from "react";
import {
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Globe,
  Cpu,
  LogOut,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Avatar from "./Avatar";
import { SUPPORTED_LANGUAGES } from "../data/languages";
import type {
  AudioMixSettings,
  TranslationModelPreference,
  UserProfileSettings,
  VoiceTone,
} from "../types";

interface ProfileViewProps {
  profile: UserProfileSettings;
  avatar: string;
  mixSettings: AudioMixSettings;
  darkMode: boolean;
  onUpdateProfile: (next: Partial<UserProfileSettings>) => Promise<boolean>;
  onUpdateMix: (next: AudioMixSettings) => void;
  onToggleDarkMode: (dark: boolean) => void;
  onResetSession: () => void;
}

type AccordionSectionId = "language" | "audio" | "model" | "display";

const MODEL_OPTIONS: Array<{
  id: TranslationModelPreference;
  label: string;
  shortLabel: string;
  modeNote: string;
  description: string;
}> = [
  {
    id: "auto",
    label: "Auto (Recommended)",
    shortLabel: "Auto",
    modeNote: "Translation-first with failover",
    description:
      "Uses the dedicated Gemini 3.5 Live Translate model first, automatically failing over to Gemini 3.8 Live if busy.",
  },
  {
    id: "gemini-3.5-live-translate-preview",
    label: "Gemini 3.5 Live Translate",
    shortLabel: "3.5 Translate",
    modeNote: "Translation-only model",
    description:
      "Dedicated low-latency simultaneous speech-to-speech translation model built strictly for live translation.",
  },
  {
    id: "gemini-3.8-live",
    label: "Gemini 3.8 Live",
    shortLabel: "3.8 Live",
    modeNote: "Interpreter mode · Custom voice",
    description:
      "General native-audio model locked to strict simultaneous translation instructions with full Male/Female voice tone support.",
  },
];

export default function ProfileView({
  profile,
  avatar,
  mixSettings,
  darkMode,
  onUpdateProfile,
  onUpdateMix,
  onToggleDarkMode,
  onResetSession,
}: ProfileViewProps) {
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [openSection, setOpenSection] = useState<AccordionSectionId | null>(
    null
  );

  // Explicit Save state for Display Name & Email text fields
  const {user}=useUser();
  const [addressId,setAddressId]=useState(""),[code,setCode]=useState(""),[emailError,setEmailError]=useState(""),[saving,setSaving]=useState(false);
  const [draftName, setDraftName] = useState(profile.name);
  const [draftEmail, setDraftEmail] = useState(profile.email);
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    setDraftName(profile.name);
    setDraftEmail(profile.email);
  }, [profile.name, profile.email]);

  const isDirty =
    draftName.trim() !== profile.name || draftEmail.trim() !== profile.email;

  const handleSaveDetails = async () => {
    const cleanName = draftName.trim();
    const cleanEmail = draftEmail.trim();
    if (!cleanName) return;
    if(saving || !user)return;
    setSaving(true);setEmailError("");
    try{
      if(cleanEmail && cleanEmail.toLowerCase()!==profile.email.toLowerCase()){
        let address=user.emailAddresses.find(e=>e.emailAddress.toLowerCase()===cleanEmail.toLowerCase());
        address??=await user.createEmailAddress({email:cleanEmail});
        if(address.verification.status!=="verified"){
          if(addressId!==address.id){
            await address.prepareVerification({strategy:"email_code"});setAddressId(address.id);return;
          }
          address=await address.attemptVerification({code});
          if(address.verification.status!=="verified")throw Error("Enter the six-digit verification code.");
        }
        await user.update({primaryEmailAddressId:address.id});
      }
      const saved=await onUpdateProfile({name:cleanName,email:cleanEmail||profile.email});
      if(saved){setAddressId("");setCode("");setSavedFeedback(true);setTimeout(()=>setSavedFeedback(false),2200)}
    }catch(e:any){setEmailError(e.errors?.[0]?.longMessage||e.message)}finally{setSaving(false)}
  };

  const handleCancelDetails = () => {
    setAddressId("");setCode("");setEmailError("");
    setDraftName(profile.name);
    setDraftEmail(profile.email);
  };

  const toggleSection = (id: AccordionSectionId) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  const translatedPct = Math.round(mixSettings.translatedVolume * 100);
  const originalPct = mixSettings.muteOriginal
    ? 0
    : Math.round(mixSettings.duckLevel * 100);

  const selectedModelMeta =
    MODEL_OPTIONS.find((m) => m.id === profile.translationModel) ||
    MODEL_OPTIONS[0];
  const voiceToneLabel = profile.voiceTone === "male" ? "Male" : "Female";

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Compact Header */}
      <div className="px-5 sm:px-8 pt-5 pb-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="max-w-2xl mx-auto">
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-slate-50 tracking-tight">
            Account
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Profile &amp; call settings
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5">
        <div className="max-w-2xl mx-auto space-y-4 pb-6">
          {/* Account Info Card with Explicit Save State */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3.5">
              <Avatar src={avatar} name={profile.name} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {profile.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {profile.email}
                </p>
              </div>
              {savedFeedback && !isDirty && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label
                  htmlFor="profile-name"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Display name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-email"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Email address
                </label>
                <input
                  id="profile-email"
                  type="email"
                  value={draftEmail}
                  onChange={e=>{setDraftEmail(e.target.value);setAddressId("");setCode("")}}
                  className="w-full h-9 px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            {addressId&&<label className="block text-sm">Verification code for {draftEmail}<input className="w-full border rounded p-2" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value)}/></label>}
            {emailError&&<p role="alert" className="text-sm text-red-700">{emailError}</p>}
            {isDirty && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleCancelDetails}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveDetails}
                  disabled={!draftName.trim() || saving || Boolean(addressId&&code.length!==6)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </button>
              </div>
            )}
          </section>

          {/* Preferences Accordion Group (All Collapsed by Default) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {/* 1. Language & Voice Tone */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection("language")}
                aria-expanded={openSection === "language"}
                className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Globe className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    Language &amp; Voice Tone
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {profile.language} · {voiceToneLabel}
                  </span>
                  {openSection === "language" ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </button>

              {openSection === "language" && (
                <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="space-y-1.5 pt-2">
                    <label
                      htmlFor="profile-language"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Comfortable language
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Used for your spoken input recognition, live translations, voice notes, and meeting notes.
                    </p>
                    <select
                      id="profile-language"
                      value={profile.language}
                      onChange={(e) =>
                        onUpdateProfile({ language: e.target.value })
                      }
                      className="w-full h-10 px-3 text-sm font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {SUPPORTED_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.name}>
                          {l.name} ({l.nativeName})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Translated voice tone
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Select the voice tone others hear when your speech or voice notes are translated.
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {(
                        [
                          { id: "female", label: "Female voice", hint: "Kore" },
                          { id: "male", label: "Male voice", hint: "Charon" },
                        ] as Array<{ id: VoiceTone; label: string; hint: string }>
                      ).map((tone) => {
                        const active = profile.voiceTone === tone.id;
                        return (
                          <button
                            key={tone.id}
                            type="button"
                            onClick={() =>
                              onUpdateProfile({ voiceTone: tone.id })
                            }
                            className={`px-3.5 py-2.5 rounded-lg border text-left transition-colors flex items-center justify-between gap-2 ${
                              active
                                ? "bg-blue-50/70 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200"
                                : "bg-slate-50/60 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
                            }`}
                          >
                            <div>
                              <p className="text-xs font-semibold">
                                {tone.label}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Voice: {tone.hint}
                              </p>
                            </div>
                            {active && (
                              <Check className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Call Audio Mix */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection("audio")}
                aria-expanded={openSection === "audio"}
                className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Volume2 className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    Call Audio Mix
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {translatedPct}% / {originalPct}%
                  </span>
                  {openSection === "audio" ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </button>

              {openSection === "audio" && (
                <div className="px-5 pb-5 pt-3 space-y-4 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Balance translated speech over the speaker&apos;s original voice.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateMix({
                          ...mixSettings,
                          muteOriginal: !mixSettings.muteOriginal,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors shrink-0"
                    >
                      {mixSettings.muteOriginal ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {mixSettings.muteOriginal ? "Original off" : "Original on"}
                      </span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          Translated voice volume
                        </span>
                        <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {translatedPct}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={125}
                        step={5}
                        value={translatedPct}
                        onChange={(e) =>
                          onUpdateMix({
                            ...mixSettings,
                            translatedVolume: Number(e.target.value) / 100,
                          })
                        }
                        className="w-full mixer-slider"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          Original speaker voice bed
                        </span>
                        <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {originalPct}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={50}
                        step={1}
                        value={originalPct}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          onUpdateMix({
                            ...mixSettings,
                            muteOriginal: val === 0,
                            duckLevel: val / 100,
                          });
                        }}
                        className="w-full mixer-slider"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateMix({
                          autoDuck: false,
                          duckLevel: 0.15,
                          originalIdleLevel: 0.45,
                          translatedVolume: 1.0,
                          muteOriginal: false,
                        })
                      }
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        !mixSettings.muteOriginal
                          ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 font-medium"
                          : "text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      100% / 15% Stack
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateMix({
                          ...mixSettings,
                          autoDuck: false,
                          muteOriginal: true,
                          translatedVolume: 1.0,
                        })
                      }
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        mixSettings.muteOriginal
                          ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 font-medium"
                          : "text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      Translated Only
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Audio Translation Model */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection("model")}
                aria-expanded={openSection === "model"}
                className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Cpu className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    Audio Translation Model
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedModelMeta.shortLabel}
                  </span>
                  {openSection === "model" ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </button>

              {openSection === "model" && (
                <div className="px-5 pb-5 pt-3 space-y-2.5 border-t border-slate-100 dark:border-slate-800/80">
                  {MODEL_OPTIONS.map((opt) => {
                    const selected = profile.translationModel === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onUpdateProfile({ translationModel: opt.id })
                        }
                        className={`w-full text-left p-3 rounded-lg border transition-colors flex items-start justify-between gap-3 ${
                          selected
                            ? "bg-blue-50/70 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800"
                            : "bg-slate-50/50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {opt.label}
                            </p>
                            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                              {opt.modeNote}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                            {opt.description}
                          </p>
                        </div>
                        {selected && (
                          <Check className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Display Appearance */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection("display")}
                aria-expanded={openSection === "display"}
                className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {darkMode ? (
                    <Moon className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                  ) : (
                    <Sun className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                  )}
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    Display Appearance
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {darkMode ? "Dark" : "Light"}
                  </span>
                  {openSection === "display" ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </button>

              {openSection === "display" && (
                <div className="px-5 pb-5 pt-3 flex items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800/80">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Switch between light and dark interface themes.
                  </p>
                  <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleDarkMode(false)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        !darkMode
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      <span>Light</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleDarkMode(true)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        darkMode
                          ? "bg-slate-900 text-slate-100 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>Dark</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Subtle Sign Out */}
          <div className="pt-2 flex items-center justify-center">
            {!confirmLogout ? (
              <button
                type="button"
                onClick={() => setConfirmLogout(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
                <span>Reset local profile &amp; sign out?</span>
                <button
                  type="button"
                  onClick={() => {
                    onResetSession();
                    setConfirmLogout(false);
                  }}
                  className="font-medium text-red-600 dark:text-red-400 hover:underline"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmLogout(false)}
                  className="text-slate-500 hover:underline"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
