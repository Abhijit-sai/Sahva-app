import { DEFAULT_CALL_MIX, type AudioMixSettings } from "../types";

export interface AudioMeterLevels {
  micLevel: number;
  originalInLevel: number;
  translatedInLevel: number;
  isDuckingActive: boolean;
}

function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16000) return input;
  const ratio = fromRate / 16000;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const next = idx + 1 < input.length ? idx + 1 : idx;
    out[i] = input[idx] * (1 - frac) + input[next] * frac;
  }
  return out;
}

function float32ToInt16Base64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      i * 2,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true
    );
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength)) as unknown as number[]
    );
  }
  return btoa(binary);
}

function base64Int16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const numSamples = Math.floor(len / 2);
  const buf = new ArrayBuffer(numSamples * 2);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < numSamples * 2; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(buf);
  const out = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

function computeRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / Math.max(1, samples.length));
}

/**
 * Full-duplex Web Audio engine with two strictly isolated pipelines:
 * 1. Outbound mic capture (16kHz PCM) — NEVER routed to local speakers (zero self-echo).
 * 2. Inbound dual-track stacked playback mixer (24kHz AudioContext):
 *    - Track 1: Translated voice (24kHz PCM, default 100% gain)
 *    - Track 2: Partner's original voice (16kHz PCM, muted until enabled)
 */
export class CallAudioEngine {
  private captureCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micProcessor: ScriptProcessorNode | null = null;
  private silentSink: GainNode | null = null;

  private playbackCtx: AudioContext | null = null;
  private originalGain: GainNode | null = null;
  private translatedGain: GainNode | null = null;
  private originalAnalyser: AnalyserNode | null = null;
  private translatedAnalyser: AnalyserNode | null = null;

  private nextOriginalStart = 0;
  private nextTranslatedStart = 0;
  private activeOriginalSources: AudioBufferSourceNode[] = [];
  private activeTranslatedSources: AudioBufferSourceNode[] = [];

  private pending16kChunks: Float32Array[] = [];
  private pending16kLength = 0;
  private muted = false;
  private micRms = 0;

  private mix = DEFAULT_CALL_MIX;

  private meterRafId: number | null = null;
  private onMicChunk: ((pcm16kBase64: string, rms: number) => void) | null = null;
  private onLevels: ((levels: AudioMeterLevels) => void) | null = null;

  public setMixSettings(next: AudioMixSettings) {
    this.mix = { ...next };
    this.applyGainTargets();
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.mediaStream) {
      for (const track of this.mediaStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
    if (muted) {
      this.micRms = 0;
      this.pending16kChunks = [];
      this.pending16kLength = 0;
    }
  }

  public async start(
    onMicChunk: (pcm16kBase64: string, rms: number) => void,
    onLevels: (levels: AudioMeterLevels) => void,
    requestMicrophone = (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints),
  ): Promise<void> {
    this.onMicChunk = onMicChunk;
    this.onLevels = onLevels;

    // 1. Initialize 24kHz dual-track stacked playback mixer inside user gesture
    if (!this.playbackCtx || this.playbackCtx.state === "closed") {
      this.playbackCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)({
        sampleRate: 24000,
      });

      this.originalGain = this.playbackCtx.createGain();
      this.originalGain.gain.value = 0;
      this.translatedGain = this.playbackCtx.createGain();
      this.originalAnalyser = this.playbackCtx.createAnalyser();
      this.translatedAnalyser = this.playbackCtx.createAnalyser();
      this.originalAnalyser.fftSize = 256;
      this.translatedAnalyser.fftSize = 256;

      this.originalGain.connect(this.originalAnalyser);
      this.originalAnalyser.connect(this.playbackCtx.destination);

      this.translatedGain.connect(this.translatedAnalyser);
      this.translatedAnalyser.connect(this.playbackCtx.destination);
    }

    const playback = this.playbackCtx;
    await Promise.all([
      requestMicrophone({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }).then(stream => {
        if (this.playbackCtx !== playback) {
          stream.getTracks().forEach(track => track.stop());
          throw new DOMException("Call ended.", "AbortError");
        }
        this.mediaStream = stream;
      }),
      playback.state === "suspended" ? playback.resume() : Promise.resolve(),
    ]);
    if (!this.mediaStream || this.playbackCtx !== playback) throw new DOMException("Call ended.", "AbortError");
    this.nextOriginalStart = playback.currentTime;
    this.nextTranslatedStart = playback.currentTime;
    this.applyGainTargets();

    this.captureCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
    if (this.captureCtx.state === "suspended") {
      await this.captureCtx.resume();
    }

    this.micSource = this.captureCtx.createMediaStreamSource(this.mediaStream);
    this.micProcessor = this.captureCtx.createScriptProcessor(2048, 1, 1);

    // Connect processor to a zero-gain sink so Web Audio pulls frames WITHOUT ever echoing mic to speakers!
    this.silentSink = this.captureCtx.createGain();
    this.silentSink.gain.value = 0;

    this.micSource.connect(this.micProcessor);
    this.micProcessor.connect(this.silentSink);
    this.silentSink.connect(this.captureCtx.destination);

    this.pending16kChunks = [];
    this.pending16kLength = 0;

    this.micProcessor.onaudioprocess = (event) => {
      if (this.muted) {
        this.micRms = 0;
        return;
      }

      const raw = event.inputBuffer.getChannelData(0);
      const resampled = resampleTo16k(raw, event.inputBuffer.sampleRate);
      const rms = computeRms(resampled);
      this.micRms = Math.min(1, rms * 4.5);

      this.pending16kChunks.push(resampled);
      this.pending16kLength += resampled.length;

      // Flush every ~160ms (2560 samples @ 16kHz) for snappy full-duplex streaming
      if (this.pending16kLength >= 2560) {
        const merged = new Float32Array(this.pending16kLength);
        let offset = 0;
        for (const chunk of this.pending16kChunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        this.pending16kChunks = [];
        this.pending16kLength = 0;

        const chunkRms = computeRms(merged);
        const base64 = float32ToInt16Base64(merged);
        this.onMicChunk?.(base64, chunkRms);
      }
    };

    this.startMeterLoop();
  }

  /**
   * Play incoming partner original voice through the listener's Track 2 gain.
   */
  public enqueuePartnerOriginalAudio(pcm16kBase64: string) {
    if (!this.playbackCtx || !this.originalGain) return;
    if (this.playbackCtx.state === "suspended") {
      this.playbackCtx.resume().catch(() => {});
    }

    try {
      const float32 = base64Int16ToFloat32(pcm16kBase64);
      if (float32.length === 0) return;

      const buffer = this.playbackCtx.createBuffer(1, float32.length, 16000);
      buffer.getChannelData(0).set(float32);

      const source = this.playbackCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.originalGain);

      const now = this.playbackCtx.currentTime;
      // Keep original voice bed tightly synced without runaway drift
      if (this.nextOriginalStart < now || this.nextOriginalStart - now > 0.45) {
        this.nextOriginalStart = now + 0.02;
      }

      source.start(this.nextOriginalStart);
      this.nextOriginalStart += buffer.duration;

      this.activeOriginalSources.push(source);
      source.onended = () => {
        this.activeOriginalSources = this.activeOriginalSources.filter(
          (s) => s !== source
        );
      };
    } catch (err) {
      console.warn("[CallAudioEngine] Original audio playback error:", err);
    }
  }

  /**
   * Play the partner's translation on Track 1 at the selected translated volume.
   */
  public enqueuePartnerTranslatedAudio(pcm24kBase64: string) {
    if (!this.playbackCtx || !this.translatedGain) return;
    if (this.playbackCtx.state === "suspended") {
      this.playbackCtx.resume().catch(() => {});
    }

    try {
      const float32 = base64Int16ToFloat32(pcm24kBase64);
      if (float32.length === 0) return;

      const buffer = this.playbackCtx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);

      const source = this.playbackCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.translatedGain);

      const now = this.playbackCtx.currentTime;
      if (this.nextTranslatedStart < now) {
        this.nextTranslatedStart = now + 0.015;
      }

      source.start(this.nextTranslatedStart);
      this.nextTranslatedStart += buffer.duration;

      this.activeTranslatedSources.push(source);
      this.applyGainTargets();

      source.onended = () => {
        this.activeTranslatedSources = this.activeTranslatedSources.filter(
          (s) => s !== source
        );
        this.applyGainTargets();
      };
    } catch (err) {
      console.warn("[CallAudioEngine] Translated audio playback error:", err);
    }
  }

  private applyGainTargets() {
    if (!this.playbackCtx || !this.originalGain || !this.translatedGain) return;
    const now = this.playbackCtx.currentTime;
    const hasActiveTranslation = this.activeTranslatedSources.length > 0;

    this.translatedGain.gain.setTargetAtTime(
      Math.max(0, Math.min(1.25, this.mix.translatedVolume)),
      now,
      0.04
    );

    if (this.mix.muteOriginal) {
      this.originalGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    // With ducking enabled, restore the idle level during pauses in translation.
    const targetOriginalGain = !this.mix.autoDuck
      ? this.mix.duckLevel
      : hasActiveTranslation
      ? this.mix.duckLevel
      : this.mix.originalIdleLevel;

    const timeConstant = hasActiveTranslation ? 0.05 : 0.25;
    this.originalGain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, targetOriginalGain)),
      now,
      timeConstant
    );
  }

  private startMeterLoop() {
    if (this.meterRafId !== null) cancelAnimationFrame(this.meterRafId);
    const origBins = new Uint8Array(128);
    const transBins = new Uint8Array(128);

    const tick = () => {
      let originalInLevel = 0;
      let translatedInLevel = 0;

      if (this.originalAnalyser && this.activeOriginalSources.length > 0) {
        this.originalAnalyser.getByteTimeDomainData(origBins);
        let peak = 0;
        for (let i = 0; i < origBins.length; i++) {
          peak = Math.max(peak, Math.abs(origBins[i] - 128) / 128);
        }
        originalInLevel = Math.min(1, peak * 3.5);
      }

      if (this.translatedAnalyser && this.activeTranslatedSources.length > 0) {
        this.translatedAnalyser.getByteTimeDomainData(transBins);
        let peak = 0;
        for (let i = 0; i < transBins.length; i++) {
          peak = Math.max(peak, Math.abs(transBins[i] - 128) / 128);
        }
        translatedInLevel = Math.min(1, peak * 2.5);
      }

      this.onLevels?.({
        micLevel: this.muted ? 0 : this.micRms,
        originalInLevel,
        translatedInLevel,
        isDuckingActive: this.activeTranslatedSources.length > 0,
      });

      this.meterRafId = requestAnimationFrame(tick);
    };

    this.meterRafId = requestAnimationFrame(tick);
  }

  public stop() {
    if (this.meterRafId !== null) {
      cancelAnimationFrame(this.meterRafId);
      this.meterRafId = null;
    }

    for (const s of this.activeOriginalSources) {
      try {
        s.stop();
      } catch {}
    }
    this.activeOriginalSources = [];

    for (const s of this.activeTranslatedSources) {
      try {
        s.stop();
      } catch {}
    }
    this.activeTranslatedSources = [];

    if (this.micProcessor) {
      this.micProcessor.onaudioprocess = null;
      try {
        this.micProcessor.disconnect();
      } catch {}
      this.micProcessor = null;
    }

    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {}
      this.micSource = null;
    }

    if (this.silentSink) {
      try {
        this.silentSink.disconnect();
      } catch {}
      this.silentSink = null;
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    if (this.captureCtx && this.captureCtx.state !== "closed") {
      this.captureCtx.close().catch(() => {});
    }
    this.captureCtx = null;

    if (this.playbackCtx && this.playbackCtx.state !== "closed") {
      this.playbackCtx.close().catch(() => {});
    }
    this.playbackCtx = null;
    this.originalGain = null;
    this.translatedGain = null;
    this.originalAnalyser = null;
    this.translatedAnalyser = null;

    this.pending16kChunks = [];
    this.pending16kLength = 0;
    this.micRms = 0;
    this.onLevels?.({
      micLevel: 0,
      originalInLevel: 0,
      translatedInLevel: 0,
      isDuckingActive: false,
    });
  }
}
