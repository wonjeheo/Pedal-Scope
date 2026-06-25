import type { EffectModule, SourceConfig } from "../types";
import type { Note } from "../harmony/notes";
import type { WaveformType } from "../types";

type RuntimeVoice = {
  oscillator: OscillatorNode;
  gain: GainNode;
  baseGain: number;
  releaseTimer: number | null;
};

type EffectNodeResult = {
  nodes: AudioNode[];
  compressor?: DynamicsCompressorNode;
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private inputMixer: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private outputLimiter: DynamicsCompressorNode | null = null;
  private cleanAnalyser: AnalyserNode | null = null;
  private processedAnalyser: AnalyserNode | null = null;
  private voices = new Map<string, RuntimeVoice>();
  private chainNodes: AudioNode[] = [];
  private compressorNodes: DynamicsCompressorNode[] = [];
  private configureVersion = 0;

  async start(sourceConfig: SourceConfig, chain: EffectModule[]) {
    this.stopVoices();
    await this.configure(chain, sourceConfig.masterGain);

    await Promise.all(
      sourceConfig.voices.map((voice) =>
        this.noteOn(voice.id, voice.note, voice.waveform, voice.gain / sourceConfig.voices.length),
      ),
    );
  }

  async configure(chain: EffectModule[], masterGainValue: number) {
    await this.ensureContext();

    if (
      !this.context ||
      !this.inputMixer ||
      !this.masterGain ||
      !this.outputLimiter ||
      !this.cleanAnalyser ||
      !this.processedAnalyser
    ) {
      return;
    }

    const version = (this.configureVersion += 1);
    const now = this.context.currentTime;
    holdParamAtCurrentValue(this.masterGain.gain, now);
    this.masterGain.gain.setTargetAtTime(0.0001, now, 0.004);
    await sleep(12);

    if (version !== this.configureVersion) {
      return;
    }

    this.disconnectGraph();

    let previousNode: AudioNode = this.inputMixer;
    this.chainNodes = [];
    this.compressorNodes = [];

    chain.forEach((effect) => {
      if (!effect.enabled || !this.context) {
        return;
      }

      const { nodes: effectNodes, compressor } = createEffectNodes(this.context, effect);
      effectNodes.forEach((node) => this.chainNodes.push(node));

      if (compressor) {
        this.compressorNodes.push(compressor);
      }

      previousNode.connect(effectNodes[0]);
      previousNode = effectNodes[effectNodes.length - 1];
    });

    this.masterGain.gain.setValueAtTime(0.0001, this.context.currentTime);
    this.masterGain.gain.setTargetAtTime(masterGainValue, this.context.currentTime, 0.012);
    this.inputMixer.connect(this.cleanAnalyser);
    previousNode.connect(this.masterGain);
    this.masterGain.connect(this.outputLimiter);
    this.outputLimiter.connect(this.processedAnalyser);
    this.processedAnalyser.connect(this.context.destination);
  }

  async noteOn(id: string, note: Note, waveform: WaveformType, velocity = 1) {
    await this.ensureContext();

    if (!this.context || !this.inputMixer) {
      return;
    }

    this.disposeVoice(id);

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;

    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(note.frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.012);

    oscillator.connect(gain);
    gain.connect(this.inputMixer);
    oscillator.start(now);

    this.voices.set(id, { oscillator, gain, baseGain: velocity, releaseTimer: null });
    this.normalizeVoiceGains();
  }

  noteOff(id: string, releaseSeconds = 0.9) {
    if (!this.context) {
      return;
    }

    const voice = this.voices.get(id);

    if (!voice) {
      return;
    }

    const now = this.context.currentTime;
    const stopAt = now + releaseSeconds + 0.05;

    this.voices.delete(id);
    holdParamAtCurrentValue(voice.gain.gain, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + releaseSeconds);
    voice.oscillator.stop(stopAt);
    this.normalizeVoiceGains();

    voice.releaseTimer = window.setTimeout(() => {
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }, (releaseSeconds + 0.08) * 1000);
  }

  stop() {
    this.stopVoices();
  }

  stopAllVoices() {
    this.stopVoices();
  }

  getTimeDomainData(targetArray: Uint8Array<ArrayBuffer>) {
    this.getProcessedTimeDomainData(targetArray);
  }

  getFrequencyData(targetArray: Uint8Array<ArrayBuffer>) {
    this.getProcessedFrequencyData(targetArray);
  }

  getCleanTimeDomainData(targetArray: Uint8Array<ArrayBuffer>) {
    this.cleanAnalyser?.getByteTimeDomainData(targetArray);
  }

  getProcessedTimeDomainData(targetArray: Uint8Array<ArrayBuffer>) {
    this.processedAnalyser?.getByteTimeDomainData(targetArray);
  }

  getCleanFrequencyData(targetArray: Uint8Array<ArrayBuffer>) {
    this.cleanAnalyser?.getByteFrequencyData(targetArray);
  }

  getProcessedFrequencyData(targetArray: Uint8Array<ArrayBuffer>) {
    this.processedAnalyser?.getByteFrequencyData(targetArray);
  }

  getCompressorReduction() {
    if (this.compressorNodes.length === 0) {
      return 0;
    }

    return this.compressorNodes.reduce((total, compressor) => total + Math.abs(compressor.reduction), 0);
  }

  getSpectrumMaxFrequency() {
    return this.context ? this.context.sampleRate / 2 : 24000;
  }

  private async ensureContext() {
    if (!this.context) {
      this.context = new AudioContext();
      this.inputMixer = this.context.createGain();
      this.masterGain = this.context.createGain();
      this.outputLimiter = this.context.createDynamicsCompressor();
      this.cleanAnalyser = this.context.createAnalyser();
      this.processedAnalyser = this.context.createAnalyser();
      this.cleanAnalyser.fftSize = 8192;
      this.processedAnalyser.fftSize = 8192;
      this.masterGain.gain.value = 0.35;
      this.outputLimiter.threshold.value = -3;
      this.outputLimiter.knee.value = 0;
      this.outputLimiter.ratio.value = 20;
      this.outputLimiter.attack.value = 0.003;
      this.outputLimiter.release.value = 0.08;
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  private stopVoices() {
    Array.from(this.voices.keys()).forEach((id) => this.disposeVoice(id));
    this.voices.clear();
  }

  private disposeVoice(id: string) {
    const voice = this.voices.get(id);

    if (!voice) {
      return;
    }

    if (voice.releaseTimer !== null) {
      window.clearTimeout(voice.releaseTimer);
    }

    this.voices.delete(id);

    if (!this.context) {
      voice.oscillator.disconnect();
      voice.gain.disconnect();
      return;
    }

    const now = this.context.currentTime;
    holdParamAtCurrentValue(voice.gain.gain, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    try {
      voice.oscillator.stop(now + 0.04);
    } catch {
      // The browser may have already stopped this oscillator.
    }

    window.setTimeout(() => {
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }, 60);
  }

  private disconnectGraph() {
    this.inputMixer?.disconnect();
    this.chainNodes.forEach((node) => node.disconnect());
    this.chainNodes = [];
    this.compressorNodes = [];
    this.masterGain?.disconnect();
    this.outputLimiter?.disconnect();
    this.cleanAnalyser?.disconnect();
    this.processedAnalyser?.disconnect();
  }

  private normalizeVoiceGains() {
    if (!this.context) {
      return;
    }

    const activeVoices = Array.from(this.voices.values());
    const voiceCount = Math.max(activeVoices.length, 1);
    const scale = 1 / Math.sqrt(voiceCount);
    const now = this.context.currentTime;

    activeVoices.forEach((voice) => {
      holdParamAtCurrentValue(voice.gain.gain, now);
      voice.gain.gain.setTargetAtTime(Math.max(0.0001, voice.baseGain * scale), now, 0.018);
    });
  }
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function holdParamAtCurrentValue(param: AudioParam, time: number) {
  param.cancelAndHoldAtTime(time);
}

function createEffectNodes(context: AudioContext, effect: EffectModule): EffectNodeResult {
  if (effect.type === "gain") {
    const gain = context.createGain();
    gain.gain.value = effect.params.level ?? 1;
    return { nodes: [gain] };
  }

  if (effect.type === "drive") {
    const drive = context.createWaveShaper();
    const level = context.createGain();

    drive.oversample = "4x";
    drive.curve = createDriveCurve(effect.params.drive ?? 0.35, "soft");
    level.gain.value = effect.params.level ?? 0.75;
    drive.connect(level);

    return { nodes: [drive, level] };
  }

  if (effect.type === "distortion") {
    const distortion = context.createWaveShaper();
    const level = context.createGain();

    distortion.oversample = "4x";
    distortion.curve = createDriveCurve(effect.params.amount ?? 0.25, "hard", effect.params.bias ?? 0);
    level.gain.value = effect.params.level ?? 0.6;
    distortion.connect(level);

    return { nodes: [distortion, level] };
  }

  if (effect.type === "compressor") {
    const compressor = context.createDynamicsCompressor();
    const makeup = context.createGain();

    compressor.threshold.value = effect.params.threshold ?? -24;
    compressor.ratio.value = effect.params.ratio ?? 4;
    compressor.attack.value = effect.params.attack ?? 0.012;
    compressor.release.value = effect.params.release ?? 0.25;
    compressor.knee.value = effect.params.knee ?? 18;
    makeup.gain.value = effect.params.makeup ?? 1;
    compressor.connect(makeup);

    return { nodes: [compressor, makeup], compressor };
  }

  if (effect.type === "phaseDelay") {
    const input = context.createGain();
    const dry = context.createGain();
    const delay = context.createDelay(0.05);
    const wet = context.createGain();
    const output = context.createGain();

    const mix = effect.params.mix ?? 0.45;
    dry.gain.value = 1 - mix;
    wet.gain.value = mix;
    delay.delayTime.value = (effect.params.delayMs ?? 6) / 1000;

    input.connect(dry);
    input.connect(delay);
    delay.connect(wet);
    dry.connect(output);
    wet.connect(output);

    return { nodes: [input, output] };
  }

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = effect.params.cutoff ?? 4200;
  filter.Q.value = effect.params.resonance ?? 0.7;
  return { nodes: [filter] };
}

function createDriveCurve(amount: number, mode: "soft" | "hard", bias = 0) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const drive = mode === "hard" ? 1 + amount * 160 : 1 + amount * 70;
  const clampedBias = Math.max(-1, Math.min(1, bias));
  const positiveLimit = 1 - Math.max(clampedBias, 0) * 0.55;
  const negativeLimit = -1 + Math.max(-clampedBias, 0) * 0.55;

  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;

    if (mode === "hard") {
      const shaped = Math.tanh(drive * x);
      curve[i] = Math.max(negativeLimit, Math.min(positiveLimit, shaped));
    } else {
      curve[i] = ((1 + drive) * x) / (1 + drive * Math.abs(x));
    }
  }

  return curve;
}
