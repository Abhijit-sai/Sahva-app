let context: AudioContext | undefined;

export function unlockAlerts() {
  try {
    context ??= new AudioContext();
    if (context.state !== "running") void context.resume().catch(() => {});
  } catch { /* Audio output is optional. */ }
}
export function releaseAlerts() {
  if (context) void context.close().catch(() => {});
  context = undefined;
}
function pulse(notes: number[], duration: number, gain: number, stagger = 0) {
  const c = context;
  if (c?.state !== "running") return () => {};
  const oscillators = notes.map((hz, index) => {
    const start = c.currentTime + index * stagger;
    const o = c.createOscillator(), envelope = c.createGain();
    o.frequency.value = hz;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    o.connect(envelope).connect(c.destination);
    o.start(start);
    o.stop(start + duration);
    o.onended = () => { o.disconnect(); envelope.disconnect(); };
    return o;
  });
  return () => oscillators.forEach(o => o.stop());
}
export function messagePing() {
  pulse([659, 880], 0.20, 0.085, 0.10);
  navigator.vibrate?.([45, 45, 65]);
}
export function incomingRingtone() {
  const play = () => {
    navigator.vibrate?.([300, 150, 300]);
    return pulse([440, 554], 0.8, 0.065);
  };
  let quiet = play();
  const timer = window.setInterval(() => { quiet = play(); }, 2300);
  return () => { clearInterval(timer); quiet(); navigator.vibrate?.(0); };
}
export function ringback() {
  const play = () => pulse([425, 450], 0.72, 0.035);
  let quiet = play();
  const timer = window.setInterval(() => { quiet = play(); }, 3100);
  return () => { clearInterval(timer); quiet(); };
}
