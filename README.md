# PedalScope

PedalScope is an interactive web application for visualizing how musical notes and chords change as they pass through a pedal-style audio signal chain.

It is closer to a small DSP and music-theory lab than a production audio tool. The goal is to make signal processing visible: waveform shape, spectrum changes, harmonic content, compression behavior, and the difference between clean and processed sound.

## Live Demo

https://wonjeheo.github.io/Pedal-Scope/

## Features

- Computer-keyboard instrument input
- Single-note and chord source modes
- Chord qualities: power, major, minor, major 7, minor 7, dominant 7
- Close and open chord voicings
- Pedal-style signal chain with drag-and-drop ordering
- Effects:
  - Input gain
  - Drive
  - Distortion
  - Compressor
  - Filter
  - Phase delay
- Real-time visualizers:
  - Clean vs processed waveform
  - Clean vs processed spectrum
  - Envelope view
  - Compressor gain reduction
  - Effect-specific helper view
- Spectrum markers for fundamentals and harmonics

## Keyboard Mapping

The app maps computer keys to a small piano-style keyboard:

```text
A  = C4
W  = C#4
S  = D4
E  = D#4
D  = E4
F  = F4
T  = F#4
G  = G4
Y  = G#4
H  = A4
U  = A#4
J  = B4
K  = C5
O  = C#5
L  = D5
P  = D#5
;  = E5
```

Hold a key to sustain a note. Release the key to hear the sound decay.

## What The Visualizers Show

### Waveform

Shows the time-domain signal. This is useful for seeing clipping, saturation, compression shape, and amplitude changes.

### Spectrum

Shows frequency energy. Green represents the clean signal before the effect chain, and orange represents the processed signal after the chain.

Vertical marker lines show theoretical musical frequencies:

- Fundamentals of the selected note or chord tones
- Harmonics such as 2x, 3x, 4x, and 5x

These markers are reference lines. The spectrum bars are the measured signal.

### Envelope

Shows the recent amplitude contour calculated from RMS values. This makes note attack and release easier to see.

### Effect View

The helper view changes based on the selected pedal:

```text
Drive        -> transfer curve
Distortion   -> clipping curve
Compressor   -> compression curve
Filter       -> frequency response
Phase Delay  -> comb filtering response
Gain         -> level helper
```

## Tech Stack

- React
- TypeScript
- Vite
- Web Audio API
- Canvas API
- GitHub Pages

## Local Development

Install dependencies:

```powershell
npm install
```

Start the development server:

```powershell
npm run dev -- --host 127.0.0.1
```

Build for production:

```powershell
npm run build
```

Preview the production build:

```powershell
npm run preview
```

## Project Structure

```text
src/
  audio/
    AudioEngine.ts
  harmony/
    notes.ts
    chords.ts
  visualizers/
    canvas.ts
  App.tsx
  main.tsx
  styles.css
```

## Core Audio Flow

```text
Keyboard input
  -> Note or chord generation
  -> Oscillator voices
  -> Voice mixer
  -> Clean analyzer tap
  -> Effect chain
  -> Master gain
  -> Processed analyzer tap
  -> Audio output
  -> Canvas visualizers
```

The source is internally polyphonic. Single-note mode is treated as one voice, and chord mode is treated as multiple voices.

## Why This Project Exists

PedalScope was built as a hands-on web application project and as an experiment in connecting:

```text
music theory
audio DSP
interactive UI
real-time visualization
```

It is not intended to be a DAW, amp simulator, or accurate commercial pedal model. It is a learning tool for exploring how musical signals behave as they move through effects.
