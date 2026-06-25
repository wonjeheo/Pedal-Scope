import { midiToNote, type Note } from "./notes";

export type ChordQuality = "power" | "major" | "minor" | "major7" | "minor7" | "dominant7";
export type VoicingType = "close" | "open";

export const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  power: [0, 7],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant7: [0, 4, 7, 10],
};

export function buildChord(rootMidi: number, quality: ChordQuality, voicing: VoicingType): Note[] {
  const intervals = applyVoicing(CHORD_INTERVALS[quality], voicing);
  return intervals.map((interval) => midiToNote(rootMidi + interval));
}

function applyVoicing(intervals: number[], voicing: VoicingType) {
  if (voicing === "close" || intervals.length < 3) {
    return intervals;
  }

  const [root, ...rest] = intervals;
  return [root, ...rest.map((interval, index) => (index % 2 === 0 ? interval + 12 : interval))].sort(
    (a, b) => a - b,
  );
}
