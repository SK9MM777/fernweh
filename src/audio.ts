import type { WeatherKind } from "./types";
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private surf: GainNode | null = null;
  private rain: GainNode | null = null;
  private fire: GainNode | null = null;
  private muted = false;
  private paused = true;
  private lastAmbience = -1;
  private lastBird = -1;
  async unlock() {
    try {
      if (!this.context) {
        const ctx = new AudioContext();
        this.context = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = 0.6;
        this.master.connect(ctx.destination);
        const noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
        const data = noise.getChannelData(0);
        let n = 0,
          seed = 7123;
        for (let i = 0; i < data.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          n = (n + (seed / 4294967296 - 0.5) * 0.1) * 0.97;
          data[i] = n;
        }
        const channel = (frequency: number, kind: BiquadFilterType) => {
          const src = ctx.createBufferSource();
          src.buffer = noise;
          src.loop = true;
          const filter = ctx.createBiquadFilter();
          filter.type = kind;
          filter.frequency.value = frequency;
          const gain = ctx.createGain();
          gain.gain.value = 0;
          src.connect(filter).connect(gain).connect(this.master!);
          src.start();
          return gain;
        };
        this.surf = channel(600, "lowpass");
        this.rain = channel(1900, "highpass");
        this.fire = channel(1400, "bandpass");
      }
      await this.context.resume();
    } catch {
      /* Browsers may defer autoplay until the next user gesture. */
    }
  }
  setMuted(value: boolean) {
    this.muted = value;
    this.sync();
  }
  setPaused(value: boolean) {
    if (this.paused === value) return;
    this.paused = value;
    this.sync();
  }
  private sync() {
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(
        this.muted || this.paused ? 0 : 0.6,
        this.context.currentTime,
        0.08,
      );
  }
  update(weather: WeatherKind, nearFire: boolean, time: number, region = "beach") {
    const ctx = this.context;
    if (!ctx || this.paused || ctx.currentTime-this.lastAmbience<0.2) return;
    this.lastAmbience=ctx.currentTime;
    const bird=Math.floor(time/13);
    if (bird!==this.lastBird && !this.muted && weather!=="storm" && (region==="jungle" || region==="swamp")) {this.lastBird=bird;this.play("bird");}
    this.surf?.gain.setTargetAtTime(
      (region === "sea" ? 0.19 : region === "beach" || region === "north" ? 0.10 : 0.035) + Math.sin(time * 0.12) * 0.025,
      ctx.currentTime,
      0.7,
    );
    this.rain?.gain.setTargetAtTime(
      weather === "storm" ? 0.55 : weather === "rain" ? 0.3 : 0,
      ctx.currentTime,
      0.8,
    );
    this.fire?.gain.setTargetAtTime(nearFire ? 0.23 : 0, ctx.currentTime, 0.2);
  }
  play(id: string) {
    const ctx = this.context;
    if (!ctx || this.muted || !this.master) return;
    const profiles: Record<string, [number, OscillatorType, number]> = {
      wood: [155, "triangle", 0.15],
      stone: [920, "square", 0.08],
      craft: [660, "triangle", 0.3],
      eat: [400, "sine", 0.12],
      hit: [90, "sawtooth", 0.18],
      animal: [70, "sawtooth", 0.35],
      fire: [180, "triangle", 0.2],
      rain: [480, "sine", 0.12],
      success: [880, "triangle", 0.85],
      fish: [730, "sine", 0.24],
      water: [1100, "sine", 0.15],
      discovery: [750, "triangle", 0.45],
      discover: [750, "triangle", 0.45],
      swing: [220, "sawtooth", 0.16],
      bird: [1900, "sine", 0.14],
    };
    const key = id.startsWith("gather")
      ? id.includes("stone") || id.includes("ore")
        ? "stone"
        : "wood"
      : id;
    const [frequency, type, duration] = profiles[key] ?? profiles.craft;
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(frequency, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      id === "success" ? frequency * 1.5 : frequency * 0.55,
      ctx.currentTime + duration,
    );
    g.gain.setValueAtTime(0.09, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + duration);
  }
}
