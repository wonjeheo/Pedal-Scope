# PedalScope Architecture v2

> Web-based signal-chain visualizer for notes, chords, harmony, and guitar-pedal-like audio effects.

## 1. Project Summary

**PedalScope** is a lightweight web application that helps users understand how musical signals change when they pass through a pedal-style signal chain.

The app starts from simple generated tones, then expands toward chord input, harmony-aware analysis, and eventually real instrument samples.

The core goal is not to perfectly emulate commercial guitar pedals.  
The goal is to visually connect:

```text
musical input
→ signal processing
→ waveform / spectrum / harmonic change
→ perceived sound
```

In other words, PedalScope is closer to an **interactive DSP and music theory lab** than a full DAW or production-grade pedal simulator.

---

## 2. Core Idea

When musicians connect pedals such as drive, distortion, compression, EQ, or filter pedals, it is often difficult to predict how the sound will change.

PedalScope makes this process visible by showing:

- time-domain waveform
- frequency spectrum
- harmonic components
- before / after comparison
- effect-stage-by-stage signal change
- chord and harmony-related frequency relationships

The user can choose a note or chord, build a signal chain, adjust parameters, and immediately see how the signal changes.

---

## 3. Target Scope

### 3.1 MVP Scope

The first version should support:

- 2-octave note selection
- single-note tone generation
- sine / square / sawtooth / triangle source
- gain effect
- drive / distortion effect
- waveform view
- spectrum view
- play / stop
- effect parameter sliders

### 3.2 Chord-Aware Scope

The next major extension should support:

- chord mode
- root note selection
- chord type selection
- major / minor / power chord
- major 7 / minor 7 / dominant 7
- close / open voicing
- per-note frequency display
- chord spectrum markers
- harmonic markers
- visual comparison between single note and chord input

### 3.3 Harmony-Aware Scope

A later version should connect signal processing with basic harmony theory:

- scale selection
- diatonic chord generation
- chord progression input
- Roman numeral analysis
- interval visualization
- consonance / dissonance explanation
- distortion-induced intermodulation visualization
- chord quality vs spectral density comparison

---

## 4. Why Chord Mode Matters

Single-note input is useful for understanding basic DSP behavior.

For example:

```text
A3 = 220 Hz
drive applied
→ 220 Hz, 440 Hz, 660 Hz, 880 Hz ...
```

This clearly shows harmonic distortion.

However, real musical input often contains multiple notes at once.

For example:

```text
A minor chord = A3 + C4 + E4

A3 = 220.00 Hz
C4 = 261.63 Hz
E4 = 329.63 Hz
```

When distortion is applied to a chord, the result is not just the sum of each note's harmonics.  
Nonlinear effects can produce additional frequency components through interaction between notes.

This is important because it explains why:

- simple power chords work well with heavy distortion
- dense jazz chords can sound muddy under high gain
- triads and seventh chords produce different spectral densities
- the same pedal setting can feel clear or messy depending on the harmony

PedalScope should make this visible.

---

## 5. Conceptual Audio Architecture

The internal audio model should be polyphonic from the beginning.

Even if the first UI only exposes single-note mode, the engine should treat every source as a list of voices.

```text
Voice[]
  ↓
Voice Mixer
  ↓
Effect Chain
  ↓
Analyzer Taps
  ↓
Visualizer
  ↓
Audio Output
```

Single-note mode is simply:

```text
voices.length = 1
```

Chord mode is:

```text
voices.length >= 2
```

This avoids redesigning the audio engine later.

---

## 6. Main Data Flow

```text
[Source Config]
      ↓
[Voice Generator]
      ↓
[Voice Mixer]
      ↓
[Effect Chain Builder]
      ↓
[Audio Engine]
      ↓
[Analyzer Taps]
      ↓
[Visualization Layer]
      ↓
[Audio Output]
```

More detailed flow:

```text
Root / Chord / Voicing / Waveform
      ↓
Harmony Engine calculates notes and frequencies
      ↓
Audio Engine creates oscillator voices
      ↓
Mixer sums the voices with gain normalization
      ↓
Effect Chain processes the mixed signal
      ↓
Analyzers capture before/after signal data
      ↓
UI renders waveform, spectrum, harmonic, and chord markers
```

---

## 7. Frontend Stack

Recommended stack:

```text
React
TypeScript
Vite
Web Audio API
Canvas API
Zustand or React state
```

Optional later additions:

```text
Tone.js        # optional musical abstraction layer
d3.js          # advanced visualizations
WASM DSP       # advanced future processing
AudioWorklet   # custom low-latency DSP
```

Initial implementation should avoid unnecessary dependencies.

---

## 8. Folder Structure

```text
src/
  audio/
    AudioEngine.ts
    VoiceManager.ts
    VoiceMixer.ts
    EffectChain.ts
    AnalyzerManager.ts
    nodeFactory.ts

  harmony/
    notes.ts
    intervals.ts
    chords.ts
    scales.ts
    voicings.ts
    progressions.ts
    romanNumerals.ts

  effects/
    types.ts
    GainEffect.ts
    DriveEffect.ts
    DistortionEffect.ts
    CompressorEffect.ts
    FilterEffect.ts
    EqualizerEffect.ts

  dsp/
    waveshapers.ts
    clipping.ts
    compressorModels.ts
    fftUtils.ts
    envelope.ts
    peakDetection.ts
    intermodulation.ts

  visualizers/
    WaveformView.tsx
    SpectrumView.tsx
    HarmonicView.tsx
    ChordSpectrumView.tsx
    TransferCurveView.tsx
    EnvelopeView.tsx

  components/
    SourceSelector.tsx
    ChordSelector.tsx
    ScaleSelector.tsx
    PedalBoard.tsx
    EffectCard.tsx
    ParameterKnob.tsx
    ParameterSlider.tsx
    AnalyzerPanel.tsx
    TransportControls.tsx

  store/
    sourceStore.ts
    chainStore.ts
    uiStore.ts

  presets/
    defaultChains.ts
    defaultChords.ts
```

---

## 9. Core Data Models

### 9.1 Note

```ts
export type NoteName =
  | "C" | "C#" | "D" | "D#" | "E" | "F"
  | "F#" | "G" | "G#" | "A" | "A#" | "B";

export type Note = {
  name: NoteName;
  octave: number;
  midi: number;
  frequency: number;
};
```

Frequency can be calculated using equal temperament:

```text
frequency = 440 * 2^((midi - 69) / 12)
```

---

### 9.2 Voice

```ts
export type WaveformType =
  | "sine"
  | "square"
  | "sawtooth"
  | "triangle";

export type VoiceConfig = {
  id: string;
  note: Note;
  gain: number;
  pan?: number;
  waveform: WaveformType;
  phase?: number;
};
```

---

### 9.3 Source Config

```ts
export type SourceMode =
  | "single-note"
  | "chord"
  | "progression"
  | "sample";

export type SourceConfig = {
  mode: SourceMode;
  voices: VoiceConfig[];
  masterGain: number;
};
```

---

### 9.4 Chord Config

```ts
export type ChordQuality =
  | "power"
  | "major"
  | "minor"
  | "diminished"
  | "augmented"
  | "major7"
  | "minor7"
  | "dominant7"
  | "sus2"
  | "sus4";

export type VoicingType =
  | "close"
  | "open"
  | "drop2"
  | "guitar-like";

export type ChordConfig = {
  root: NoteName;
  octave: number;
  quality: ChordQuality;
  voicing: VoicingType;
  inversion: number;
};
```

---

### 9.5 Effect Module

```ts
export type EffectType =
  | "gain"
  | "drive"
  | "distortion"
  | "compressor"
  | "filter"
  | "eq";

export type EffectModule = {
  id: string;
  type: EffectType;
  name: string;
  enabled: boolean;
  params: Record<string, number>;
};
```

---

### 9.6 Pedal Chain Preset

```ts
export type PedalScopePreset = {
  name: string;
  source: SourceConfig;
  chord?: ChordConfig;
  chain: EffectModule[];
  visualization: {
    showWaveform: boolean;
    showSpectrum: boolean;
    showHarmonics: boolean;
    showChordMarkers: boolean;
    showIntermodulationMarkers: boolean;
  };
};
```

---

## 10. Harmony Engine

The harmony layer should be independent from the audio layer.

Its responsibility is to convert musical concepts into notes and frequencies.

```text
ChordConfig
  ↓
Harmony Engine
  ↓
Note[]
  ↓
VoiceConfig[]
  ↓
Audio Engine
```

Example:

```ts
const chord = {
  root: "A",
  octave: 3,
  quality: "minor",
  voicing: "close",
  inversion: 0,
};
```

Output:

```ts
[
  { name: "A", octave: 3, midi: 57, frequency: 220.00 },
  { name: "C", octave: 4, midi: 60, frequency: 261.63 },
  { name: "E", octave: 4, midi: 64, frequency: 329.63 }
]
```

---

## 11. Chord Formulas

Chord definitions can be represented as semitone intervals from the root.

```ts
export const CHORD_INTERVALS = {
  power: [0, 7],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant7: [0, 4, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};
```

This makes chord generation simple:

```text
root midi + interval
```

Example:

```text
A minor = A + 0, 3, 7 semitones
A3 = 57
C4 = 60
E4 = 64
```

---

## 12. Voicing Strategy

Different voicings should produce different spectral results.

### Close Voicing

Notes are placed as closely as possible.

```text
C major close:
C4 - E4 - G4
```

### Open Voicing

One or more notes are moved up an octave.

```text
C major open:
C3 - G3 - E4
```

### Power Chord

A reduced chord using root and fifth.

```text
A power chord:
A3 - E4
```

This is especially useful for distortion visualization because it stays clearer under high gain.

### Guitar-like Voicing

Later versions can approximate real guitar chord shapes.

Example:

```text
E major guitar-like:
E2 - B2 - E3 - G#3 - B3 - E4
```

This should be added after the basic harmony engine is stable.

---

## 13. Effect Chain Architecture

The effect chain should remain independent from the source type.

The same effect chain should work for:

- single note
- chord
- chord progression
- uploaded sample

```text
Source
  ↓
Mixer
  ↓
Effect 1
  ↓
Effect 2
  ↓
Effect 3
  ↓
Output
```

Each effect should expose:

- node creation
- parameter update
- bypass support
- default parameter values
- metadata for UI controls

Example:

```ts
export type EffectDefinition = {
  type: EffectType;
  label: string;
  createNode: (ctx: AudioContext, params: Record<string, number>) => AudioNode;
  updateParams: (node: AudioNode, params: Record<string, number>) => void;
  defaults: Record<string, number>;
};
```

---

## 14. Analyzer Tap Architecture

Analyzers should be attached between stages.

```text
Voice Mixer
  ↓ tap0: clean mixed source
Drive
  ↓ tap1: after drive
Compressor
  ↓ tap2: after compressor
EQ
  ↓ tap3: after EQ
Output
```

This allows PedalScope to show:

- clean vs processed signal
- before vs after selected pedal
- each stage of transformation
- how the signal becomes denser after nonlinear effects

---

## 15. Visualization Design

### 15.1 Waveform View

Shows time-domain waveform.

Useful for:

- amplitude change
- clipping shape
- compression envelope
- transient behavior

### 15.2 Spectrum View

Shows frequency-domain representation.

Useful for:

- fundamental frequencies
- harmonics
- EQ changes
- distortion-generated components

### 15.3 Harmonic View

Shows expected harmonics of selected note or chord tones.

For single note:

```text
A3:
220, 440, 660, 880 ...
```

For chord:

```text
A minor:
A3 harmonics
C4 harmonics
E4 harmonics
```

### 15.4 Chord Spectrum View

Shows chord-specific markers on the spectrum.

Markers:

- root
- third
- fifth
- seventh
- octave
- harmonic multiples
- possible intermodulation components

### 15.5 Intermodulation View

For nonlinear effects, additional frequency components may appear.

For two frequencies `f1` and `f2`, possible interaction components include:

```text
f1 + f2
|f1 - f2|
2f1 - f2
2f2 - f1
```

This view should be optional because it can become visually crowded.

---

## 16. UI Layout

Recommended initial layout:

```text
┌──────────────────────────────────────────────┐
│ Source                                      │
│ Mode: Single Note / Chord                   │
│ Note: A3                                    │
│ Chord: A minor / Power / Major7             │
├──────────────────────────────────────────────┤
│ Signal Chain                                │
│ [Clean] → [Drive] → [Compressor] → [EQ]     │
├──────────────────────────────────────────────┤
│ Selected Effect Parameters                  │
│ Drive: 7.2                                  │
│ Tone: 4.5                                   │
│ Mix: 80%                                    │
├──────────────────────────────────────────────┤
│ Waveform: Before / After                    │
├──────────────────────────────────────────────┤
│ Spectrum + Note / Chord Markers             │
├──────────────────────────────────────────────┤
│ Harmony Info                                │
│ A minor = A, C, E = root, minor 3rd, fifth  │
└──────────────────────────────────────────────┘
```

---

## 17. Harmony Information Panel

Chord mode should include a small theory panel.

Example:

```text
Chord: A minor
Notes: A - C - E
Intervals: root - minor third - perfect fifth
Frequencies:
A3 = 220.00 Hz
C4 = 261.63 Hz
E4 = 329.63 Hz
```

For seventh chords:

```text
Chord: G7
Notes: G - B - D - F
Intervals: root - major third - perfect fifth - minor seventh
Function: dominant seventh
```

Later, with scale context:

```text
Key: C major
Chord: G7
Roman numeral: V7
Resolution tendency: G7 → C
```

---

## 18. Musical Theory Extensions

### 18.1 Scale Mode

User selects:

```text
Key: C
Scale: major
```

Then the app can generate diatonic chords:

```text
I    C major
ii   D minor
iii  E minor
IV   F major
V    G major
vi   A minor
vii° B diminished
```

### 18.2 Roman Numeral Analysis

Chord progression:

```text
C - G - Am - F
```

In C major:

```text
I - V - vi - IV
```

### 18.3 Chord Progression Mode

Instead of a static chord, the source can play a repeated progression.

```text
C → G → Am → F
```

This allows users to observe:

- how effects respond to changing harmony
- how compressor reacts to different chord densities
- how distortion behaves across chord qualities

### 18.4 Consonance / Dissonance View

The app can display interval relationships.

Example:

```text
Perfect fifth: stable / consonant
Minor second: tense / dissonant
Major third: defines major color
Minor third: defines minor color
Tritone: unstable / dominant tension
```

This should be presented as educational information, not as a strict rule.

---

## 19. Effect Behavior by Input Type

### 19.1 Single Note

Best for:

- harmonic distortion
- clipping shape
- transfer curve
- simple spectrum analysis

### 19.2 Power Chord

Best for:

- distortion comparison
- intermodulation introduction
- guitar-like use case

### 19.3 Major / Minor Triad

Best for:

- chord color comparison
- harmonic density
- distortion muddiness

### 19.4 Seventh Chord

Best for:

- dense harmony
- spectral crowding
- advanced harmony visualization

### 19.5 Chord Progression

Best for:

- musical context
- dynamic compressor response
- practical listening experience

---

## 20. Recommended Development Roadmap

### v0.1: Single Note DSP MVP

- Vite + React + TypeScript setup
- AudioContext initialization
- single sine oscillator
- note selector
- gain effect
- drive effect
- waveform visualizer
- spectrum visualizer

### v0.2: Modular Pedalboard

- effect chain array model
- add / remove / reorder effects
- bypass toggle
- parameter sliders
- selected effect panel
- analyzer taps between effects

### v0.3: Chord Mode

- internal `Voice[]` source model
- chord selector
- root + quality + octave
- power / major / minor chord
- voice mixer
- gain normalization
- chord frequency display
- spectrum markers for chord tones

### v0.4: Harmony Layer

- scale selector
- diatonic chord generator
- Roman numeral display
- major/minor/seventh chord support
- basic interval explanation panel

### v0.5: Advanced Visualization

- harmonic marker overlay
- before/after spectrum difference
- intermodulation marker
- transfer curve view for distortion
- envelope view for compressor

### v0.6: Practical Music Input

- pluck-like synthetic source
- chord progression playback
- preset save/load
- JSON preset export/import

### v1.0: Portfolio Version

- polished UI
- demo presets
- documentation
- example use cases
- deployed web demo
- README with architecture diagrams

---

## 21. MVP Implementation Priority

The safest implementation order is:

```text
1. Build source engine as Voice[] from the beginning
2. Expose only single-note UI first
3. Add drive and waveform/spectrum visualization
4. Add chain architecture
5. Add chord mode UI
6. Add harmony theory panel
7. Add advanced chord/spectrum markers
```

Do not start with full harmony theory first.

The audio graph should be flexible from the beginning, but the UI should start simple.

---

## 22. Key Technical Risks

### 22.1 Audio Graph Complexity

Rebuilding the audio graph every time the user changes the chain can become messy.

Mitigation:

- separate React state from AudioNode graph
- use an `AudioEngine` class
- rebuild graph only when chain structure changes
- update AudioParams directly when only parameter values change

### 22.2 Gain Clipping in Chord Mode

Multiple voices can cause unintended clipping.

Mitigation:

```text
voiceGain = baseGain / sqrt(numberOfVoices)
```

or:

```text
voiceGain = baseGain / numberOfVoices
```

The first preserves more loudness; the second is safer.

### 22.3 Visual Clutter

Chord spectra can become crowded.

Mitigation:

- allow marker toggles
- show only fundamentals by default
- show harmonics/intermodulation as optional overlays

### 22.4 Distortion Interpretation

Nonlinear effects create many frequency components.

Mitigation:

- explain that markers are approximations
- distinguish expected note harmonics from newly appearing components
- provide simple educational labels

---

## 23. Example Presets

### Preset 1: Single Note Drive

```text
Source:
A3 sine

Chain:
Drive

View:
Waveform + Spectrum
```

Purpose:

```text
Shows harmonic distortion clearly.
```

### Preset 2: Power Chord Distortion

```text
Source:
A3 + E4

Chain:
Drive

View:
Spectrum with chord markers
```

Purpose:

```text
Shows why power chords remain clear under distortion.
```

### Preset 3: Minor Triad Distortion

```text
Source:
A minor = A3 + C4 + E4

Chain:
Drive

View:
Spectrum density comparison
```

Purpose:

```text
Shows how richer chords produce denser distorted spectra.
```

### Preset 4: Compressor on Chord Progression

```text
Source:
C - G - Am - F

Chain:
Compressor

View:
Envelope + gain reduction
```

Purpose:

```text
Shows how dynamics processing reacts to changing harmonic input.
```

---

## 24. Project Positioning

PedalScope should be positioned as:

```text
An interactive web-based signal-chain visualizer that connects
music theory, audio DSP, and pedal-style sound design.
```

Not:

```text
A production-grade DAW
A commercial guitar amp simulator
A physically accurate pedal emulator
```

This makes the project realistic as a side project while still technically meaningful.

---

## 25. Suggested README Pitch

```text
PedalScope is an interactive web application for visualizing how notes and chords change as they pass through a pedal-style audio signal chain.

Users can generate a single note or chord, apply effects such as gain, drive, distortion, compression, and EQ, and observe changes in waveform, spectrum, harmonic structure, and chord-related frequency components.

The project combines Web Audio API, real-time visualization, basic DSP, and harmony theory to make guitar-pedal-style signal processing easier to understand.
```

---

## 26. Final Architecture Summary

```text
React UI
  ↓
Source / Chord / Harmony State
  ↓
Harmony Engine
  ↓
Voice[]
  ↓
Web Audio Voice Mixer
  ↓
Effect Chain
  ↓
Analyzer Taps
  ↓
Waveform / Spectrum / Harmony Visualizers
  ↓
Audio Output
```

The most important design decision is:

```text
Represent all sources as Voice[] from the beginning.
```

This allows the project to grow naturally from:

```text
single note
→ chord
→ chord progression
→ real instrument sample
```

without rewriting the entire audio engine.
