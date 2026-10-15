// assets/audio-engine.js — Real-Time Web Audio SFX Synthesizer
export class ThreatTrackAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.cues = [];
    this.firedCues = new Set();
    this.lastBeatIndex = -1;
  }

  async init(cuesUrl = "./audio/cues.json") {
    const captionEl = document.getElementById("vo-caption-bar");
    if (captionEl) captionEl.style.display = "none";

    try {
      const cuesRes = await fetch(cuesUrl);
      if (cuesRes && cuesRes.ok) {
        const data = await cuesRes.json();
        this.cues = data.cues || [];
      }
    } catch (e) {
      console.warn("Audio cues init warning:", e);
    }
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  reset(seekTime = 0) {
    this.firedCues.clear();
    this.cues.forEach((c, idx) => {
      if (c.time < seekTime - 0.05) this.firedCues.add(idx);
    });
    this.lastBeatIndex = Math.floor(seekTime * 4) - 1;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  update(currentTime, isPlaying = true) {
    if (!isPlaying) return;

    // 1. Upbeat 120 BPM SaaS Tech Groove (4 sixteenth-steps per second = 0.25s pulse)
    const beatIndex = Math.floor(currentTime * 4);
    if (beatIndex > this.lastBeatIndex) {
      this.lastBeatIndex = beatIndex;
      this.triggerGrooveStep(beatIndex, currentTime);
    }

    // 2. Trigger timecoded SFX cues (whoosh, taps, snaps, risers, pings, chimes, drops)
    this.cues.forEach((cue, idx) => {
      if (!this.firedCues.has(idx) && currentTime >= cue.time && currentTime - cue.time < 0.12) {
        this.firedCues.add(idx);
        this.triggerCue(cue);
      }
    });
  }

  triggerGrooveStep(step, currentTime) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const scale = [293.66, 349.23, 440.0, 523.25, 659.25, 523.25, 440.0, 349.23];
    const noteFreq = scale[step % scale.length];
    const grooveLevel = currentTime > 55.4 && currentTime < 57.5 ? 0.03 : 0.075;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(noteFreq, now);
    g.gain.setValueAtTime(grooveLevel, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.18);
    osc.connect(g).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.19);

    if (step % 2 === 0) {
      const kick = this.ctx.createOscillator();
      const kg = this.ctx.createGain();
      kick.type = "sine";
      kick.frequency.setValueAtTime(95, now);
      kick.frequency.exponentialRampToValueAtTime(36, now + 0.11);
      kg.gain.setValueAtTime(grooveLevel * 1.35, now);
      kg.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      kick.connect(kg).connect(this.sfxGain);
      kick.start(now);
      kick.stop(now + 0.13);
    }
  }

  triggerCue(cue) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const gainVal = (cue.gain ?? 0.6) * 0.45;

    switch (cue.type) {
      case "sub_drop": {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(cue.freq || 55, now);
        osc.frequency.exponentialRampToValueAtTime(24, now + (cue.duration || 0.9));
        g.gain.setValueAtTime(gainVal, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + (cue.duration || 0.9));
        osc.connect(g).connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + (cue.duration || 0.9));
        break;
      }
      case "kinetic_snap":
      case "tactile_tap": {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = cue.type === "tactile_tap" ? "triangle" : "sine";
        osc.frequency.setValueAtTime(cue.freq || 1200, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.065);
        g.gain.setValueAtTime(gainVal, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
        osc.connect(g).connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.07);
        break;
      }
      case "whoosh_3d": {
        const dur = cue.duration || 0.45;
        const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.Q.value = 2.2;
        filter.frequency.setValueAtTime(160, now);
        filter.frequency.exponentialRampToValueAtTime(cue.freq || 480, now + dur * 0.5);
        filter.frequency.exponentialRampToValueAtTime(120, now + dur);

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.01, now);
        g.gain.linearRampToValueAtTime(gainVal, now + dur * 0.45);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);

        noise.connect(filter).connect(g).connect(this.sfxGain);
        noise.start(now);
        break;
      }
      case "sos_riser": {
        const dur = cue.duration || 1.8;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(cue.freq || 200, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + dur);
        g.gain.setValueAtTime(0.01, now);
        g.gain.linearRampToValueAtTime(gainVal * 0.6, now + dur * 0.9);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(g).connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + dur);
        break;
      }
      case "radar_ping":
      case "emerald_chime":
      case "emergency_alert": {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = cue.type === "emergency_alert" ? "square" : "sine";
        osc.frequency.setValueAtTime(cue.freq || 880, now);
        if (cue.type === "emerald_chime") {
          osc.frequency.setValueAtTime((cue.freq || 880) * 1.25, now + 0.08);
        }
        g.gain.setValueAtTime(gainVal * 0.7, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(g).connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }
    }
  }
}

if (typeof window !== "undefined") {
  window.ThreatTrackAudioEngine = ThreatTrackAudioEngine;
}
