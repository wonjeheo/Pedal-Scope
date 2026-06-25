import type { Note } from "./harmony/notes";

export type WaveformType = "sine" | "square" | "sawtooth" | "triangle";

export type VoiceConfig = {
  id: string;
  note: Note;
  gain: number;
  waveform: WaveformType;
};

export type SourceConfig = {
  mode: "single-note";
  voices: VoiceConfig[];
  masterGain: number;
};

export type EffectType = "gain" | "drive" | "distortion" | "compressor" | "filter" | "phaseDelay";

export type EffectParam = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
};

export type EffectModule = {
  id: string;
  type: EffectType;
  name: string;
  enabled: boolean;
  params: Record<string, number>;
};
