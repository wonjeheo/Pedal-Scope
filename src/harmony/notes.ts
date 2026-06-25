export type NoteName =
  | "C"
  | "C#"
  | "D"
  | "D#"
  | "E"
  | "F"
  | "F#"
  | "G"
  | "G#"
  | "A"
  | "A#"
  | "B";

export type Note = {
  name: NoteName;
  octave: number;
  midi: number;
  frequency: number;
};

export const NOTE_NAMES: NoteName[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function midiToNote(midi: number): Note {
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;

  return {
    name,
    octave,
    midi,
    frequency: midiToFrequency(midi),
  };
}

export function createTwoOctaveNoteList(startMidi = 45, count = 24) {
  return Array.from({ length: count }, (_, index) => midiToNote(startMidi + index));
}
