// Moteur micro : capture, analyse toutes les 20 ms, enregistrement.
import { PitchTracker } from './pitch.js';
import { floatToInt16 } from './wav.js';

const HOP_SEC = 0.02;

export class MicEngine extends EventTarget {
  constructor() {
    super();
    this.running = false;
    this.recording = null;
  }

  async start(deviceId) {
    if (this.running) await this.stop();
    const audio = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 1 },
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    // Le micro d'abord, le contexte audio ensuite : sur iPhone, l'ordre inverse
    // peut baisser le volume de lecture.
    this.stream = await navigator.mediaDevices.getUserMedia({ audio });
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.sr = this.ctx.sampleRate;
    this.tracker = new PitchTracker(this.sr);
    this.hop = Math.round(this.sr * HOP_SEC);
    this.ring = new Float32Array(1 << 17);
    this.mask = this.ring.length - 1;
    this.written = 0;
    this.nextAnalysis = this.tracker.rawLen;
    this.scratch = new Float32Array(this.tracker.rawLen);
    this.floor = NaN;
    this.peakDb = -120;
    this.clips = 0;
    this.lastDb = -120;

    this.src = this.ctx.createMediaStreamSource(this.stream);
    let node = null;
    if (this.ctx.audioWorklet && window.AudioWorkletNode) {
      try {
        await this.ctx.audioWorklet.addModule(new URL('./tap-worklet.js', import.meta.url).href);
        node = new AudioWorkletNode(this.ctx, 'tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        node.port.onmessage = (e) => this._push(e.data);
      } catch (err) {
        node = null;
      }
    }
    if (!node) {
      node = this.ctx.createScriptProcessor(1024, 2, 1);
      node.onaudioprocess = (e) => {
        const ib = e.inputBuffer;
        const n = ib.length;
        const chs = ib.numberOfChannels;
        const out = new Float32Array(n);
        for (let c = 0; c < chs; c++) {
          const d = ib.getChannelData(c);
          for (let i = 0; i < n; i++) out[i] += d[i] / chs;
        }
        this._push(out);
      };
    }
    this.node = node;
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.src.connect(node);
    node.connect(this.sink);
    this.sink.connect(this.ctx.destination);

    this.track = this.stream.getAudioTracks()[0];
    this.track.addEventListener('ended', () => this.stop('ended'));
    this.running = true;
    this.dispatchEvent(new Event('start'));
  }

  async stop(reason = 'user') {
    if (!this.running) return;
    this.running = false;
    const rec = this.recording ? this.stopRecording() : null;
    try { this.src.disconnect(); this.node.disconnect(); this.sink.disconnect(); } catch (e) { /* déjà déconnecté */ }
    if (this.node.port) this.node.port.onmessage = null;
    this.stream.getTracks().forEach((t) => t.stop());
    try { await this.ctx.close(); } catch (e) { /* déjà fermé */ }
    this.dispatchEvent(new CustomEvent('stop', { detail: { reason, recording: rec } }));
  }

  info() {
    if (!this.running) return null;
    const s = this.track.getSettings ? this.track.getSettings() : {};
    return {
      label: this.track.label || 'Micro',
      sampleRate: this.sr,
      echoCancellation: s.echoCancellation,
      noiseSuppression: s.noiseSuppression,
      autoGainControl: s.autoGainControl,
      channelCount: s.channelCount,
      deviceId: s.deviceId,
    };
  }

  _push(chunk) {
    const ring = this.ring;
    const mask = this.mask;
    let w = this.written;
    for (let i = 0; i < chunk.length; i++) {
      const v = chunk[i];
      ring[(w + i) & mask] = v;
      if (v >= 0.999 || v <= -0.999) this.clips++;
    }
    this.written = w + chunk.length;
    if (this.recording) this.recording.chunks.push(floatToInt16(chunk));
    while (this.written >= this.nextAnalysis) {
      this._analyze(this.nextAnalysis);
      this.nextAnalysis += this.hop;
    }
  }

  _analyze(end) {
    const L = this.tracker.rawLen;
    const start = end - L;
    for (let i = 0; i < L; i++) this.scratch[i] = this.ring[(start + i) & this.mask];
    const r = this.tracker.analyze(this.scratch);

    this.lastDb = r.db;
    if (r.db > this.peakDb) this.peakDb = r.db;
    // Bruit de fond : descend vite, remonte lentement (0,25 dB/s, plafonné à −50 dB),
    // pour qu'une note tenue ou un long discours ne soit pas pris pour du bruit.
    if (!Number.isFinite(this.floor)) this.floor = r.db;
    else if (r.db < this.floor) this.floor += (r.db - this.floor) * 0.2;
    else this.floor = Math.min(this.floor + 0.005, -50);

    const voiced = r.f0 > 0 && r.clarity >= 0.8 && r.db > Math.max(this.floor + 8, -75);
    const t = end / this.sr;
    const frame = { t, f0: voiced ? r.f0 : 0, clarity: r.clarity, db: r.db };
    if (this.recording) {
      const fr = this.recording.frames;
      fr.t.push(+(t - this.recording.t0).toFixed(3));
      fr.f0.push(+frame.f0.toFixed(2));
      fr.db.push(+r.db.toFixed(1));
      fr.c.push(+r.clarity.toFixed(3));
    }
    this.dispatchEvent(new CustomEvent('frame', { detail: frame }));
  }

  startRecording(meta = null) {
    if (!this.running || this.recording) return;
    this.recording = {
      meta,
      chunks: [],
      frames: { t: [], f0: [], db: [], c: [] },
      t0: this.written / this.sr,
      sr: this.sr,
      info: this.info(),
      startedAt: new Date(),
    };
  }

  stopRecording() {
    const rec = this.recording;
    if (!rec) return null;
    this.recording = null;
    let n = 0;
    for (const c of rec.chunks) n += c.length;
    rec.duration = n / rec.sr;
    return rec;
  }
}
