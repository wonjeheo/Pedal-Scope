import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "./audio/AudioEngine";
import { buildChord, type ChordQuality, type VoicingType } from "./harmony/chords";
import { createTwoOctaveNoteList, midiToNote, type Note } from "./harmony/notes";
import type { EffectModule, EffectParam, WaveformType } from "./types";
import {
  calculateRms,
  drawCombFilterResponse,
  drawCompressorCurve,
  drawCycleWaveform,
  drawEnvelopeOverlay,
  drawFilterResponse,
  drawSpectrumOverlay,
  drawTransferCurve,
  drawWaveformOverlay,
  type SpectrumMarker,
} from "./visualizers/canvas";

const cleanTimeData = new Uint8Array(8192);
const processedTimeData = new Uint8Array(8192);
const cleanFrequencyData = new Uint8Array(4096);
const processedFrequencyData = new Uint8Array(4096);
const envelopeHistoryLength = 180;
const spectrumDisplayMaxFrequency = 6000;
type SourceMode = "single" | "chord";
type SourceInstrument = "keyboard" | "guitar" | "bass";

const EFFECT_PARAM_DEFS: Record<EffectModule["type"], EffectParam[]> = {
  gain: [{ key: "level", label: "Level", min: 0, max: 2, step: 0.01 }],
  drive: [
    { key: "drive", label: "Drive", min: 0, max: 1, step: 0.01 },
    { key: "level", label: "Level", min: 0, max: 1.2, step: 0.01 },
  ],
  distortion: [
    { key: "amount", label: "Amount", min: 0, max: 1, step: 0.01 },
    { key: "bias", label: "Bias", min: -1, max: 1, step: 0.01 },
    { key: "level", label: "Level", min: 0, max: 1.2, step: 0.01 },
  ],
  compressor: [
    { key: "threshold", label: "Thresh", min: -60, max: 0, step: 1, unit: "dB" },
    { key: "ratio", label: "Ratio", min: 1, max: 20, step: 0.1 },
    { key: "attack", label: "Attack", min: 0.001, max: 0.2, step: 0.001, unit: "s" },
    { key: "release", label: "Release", min: 0.03, max: 1, step: 0.01, unit: "s" },
    { key: "makeup", label: "Makeup", min: 0, max: 2, step: 0.01 },
  ],
  filter: [
    { key: "cutoff", label: "Cutoff", min: 600, max: 9000, step: 10, unit: "Hz" },
    { key: "resonance", label: "Res", min: 0.1, max: 12, step: 0.1 },
  ],
  phaseDelay: [
    { key: "delayMs", label: "Delay", min: 1, max: 20, step: 0.1, unit: "ms" },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01 },
  ],
};

const DEFAULT_CHAIN: EffectModule[] = [
  {
    id: "boost",
    type: "gain",
    name: "Input Boost",
    enabled: true,
    params: { level: 1 },
  },
  {
    id: "drive",
    type: "drive",
    name: "Warm Drive",
    enabled: true,
    params: { drive: 0.35, level: 0.75 },
  },
  {
    id: "distortion",
    type: "distortion",
    name: "Clip Dist",
    enabled: false,
    params: { amount: 0.25, bias: 0, level: 0.55 },
  },
  {
    id: "compressor",
    type: "compressor",
    name: "Studio Comp",
    enabled: false,
    params: { threshold: -24, ratio: 4, attack: 0.012, release: 0.25, knee: 18, makeup: 1 },
  },
  {
    id: "tone",
    type: "filter",
    name: "Tone Filter",
    enabled: true,
    params: { cutoff: 4200, resonance: 0.7 },
  },
  {
    id: "phaseDelay",
    type: "phaseDelay",
    name: "Phase Delay",
    enabled: false,
    params: { delayMs: 6, mix: 0.45 },
  },
];

const KEYBOARD_LAYOUT = [
  { key: "a", midi: 60, color: "white" },
  { key: "w", midi: 61, color: "black" },
  { key: "s", midi: 62, color: "white" },
  { key: "e", midi: 63, color: "black" },
  { key: "d", midi: 64, color: "white" },
  { key: "f", midi: 65, color: "white" },
  { key: "t", midi: 66, color: "black" },
  { key: "g", midi: 67, color: "white" },
  { key: "y", midi: 68, color: "black" },
  { key: "h", midi: 69, color: "white" },
  { key: "u", midi: 70, color: "black" },
  { key: "j", midi: 71, color: "white" },
  { key: "k", midi: 72, color: "white" },
  { key: "o", midi: 73, color: "black" },
  { key: "l", midi: 74, color: "white" },
  { key: "p", midi: 75, color: "black" },
  { key: ";", midi: 76, color: "white" },
] as const;

const KEY_TO_MIDI: Map<string, number> = new Map(KEYBOARD_LAYOUT.map((item) => [item.key, item.midi]));

const SOURCE_INSTRUMENTS: SourceInstrument[] = ["keyboard", "guitar", "bass"];

const STRING_INSTRUMENTS: Record<Exclude<SourceInstrument, "keyboard">, { frets: number; strings: number[] }> = {
  guitar: {
    frets: 12,
    strings: [64, 59, 55, 50, 45, 40],
  },
  bass: {
    frets: 12,
    strings: [43, 38, 33, 28],
  },
};

export default function App() {
  const notes = useMemo(() => createTwoOctaveNoteList(48, 36), []);
  const engineRef = useRef(new AudioEngine());
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const envelopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const helperCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cycleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [isAudioArmed, setIsAudioArmed] = useState(false);
  const [selectedMidi, setSelectedMidi] = useState(57);
  const [sourceMode, setSourceMode] = useState<SourceMode>("single");
  const [sourceInstrument, setSourceInstrument] = useState<SourceInstrument>("keyboard");
  const [chordQuality, setChordQuality] = useState<ChordQuality>("minor");
  const [voicing, setVoicing] = useState<VoicingType>("close");
  const [waveform, setWaveform] = useState<WaveformType>("sine");
  const [masterGain, setMasterGain] = useState(0.35);
  const [chain, setChain] = useState<EffectModule[]>(DEFAULT_CHAIN);
  const [selectedEffectId, setSelectedEffectId] = useState(DEFAULT_CHAIN[1].id);
  const [activeVoiceIds, setActiveVoiceIds] = useState<Set<string>>(new Set());
  const [draggedEffectId, setDraggedEffectId] = useState<string | null>(null);
  const [compressorReduction, setCompressorReduction] = useState(0);

  const chainRef = useRef(chain);
  const masterGainRef = useRef(masterGain);
  const waveformRef = useRef(waveform);
  const sourceInstrumentRef = useRef(sourceInstrument);
  const sourceModeRef = useRef(sourceMode);
  const chordQualityRef = useRef(chordQuality);
  const voicingRef = useRef(voicing);
  const armedRef = useRef(isAudioArmed);
  const heldVoiceIdsRef = useRef(new Set<string>());
  const triggerVoiceIdsRef = useRef(new Map<string, string[]>());
  const compressorReductionRef = useRef(0);
  const envelopeHistoryRef = useRef<number[]>(Array(envelopeHistoryLength).fill(0));
  const spectrumMaxFrequencyRef = useRef(24000);

  const selectedNote = midiToNote(selectedMidi);
  const activeNotes = useMemo(
    () => (sourceMode === "chord" ? buildChord(selectedMidi, chordQuality, voicing) : [midiToNote(selectedMidi)]),
    [chordQuality, selectedMidi, sourceMode, voicing],
  );
  const spectrumMarkers = useMemo(() => buildSpectrumMarkers(activeNotes), [activeNotes]);
  const selectedEffect = chain.find((effect) => effect.id === selectedEffectId) ?? chain[0];
  const cycleFrequency = activeNotes[0]?.frequency ?? selectedNote.frequency;

  useEffect(() => {
    drawIdleVisualizers();
  }, []);

  useEffect(() => {
    chainRef.current = chain;
  }, [chain]);

  useEffect(() => {
    masterGainRef.current = masterGain;
  }, [masterGain]);

  useEffect(() => {
    waveformRef.current = waveform;
  }, [waveform]);

  useEffect(() => {
    sourceInstrumentRef.current = sourceInstrument;
  }, [sourceInstrument]);

  useEffect(() => {
    sourceModeRef.current = sourceMode;
  }, [sourceMode]);

  useEffect(() => {
    chordQualityRef.current = chordQuality;
  }, [chordQuality]);

  useEffect(() => {
    voicingRef.current = voicing;
  }, [voicing]);

  useEffect(() => {
    armedRef.current = isAudioArmed;
  }, [isAudioArmed]);

  useEffect(() => {
    if (isAudioArmed) {
      return;
    }

    drawIdleVisualizers();
  }, [cycleFrequency, isAudioArmed, selectedEffect, spectrumMarkers]);

  useEffect(() => {
    if (!isAudioArmed) {
      return;
    }

    if (heldVoiceIdsRef.current.size === 0) {
      engineRef.current.stopAllVoices();
    }

    engineRef.current.configure(chain, masterGain);
  }, [isAudioArmed, masterGain, chain]);

  useEffect(() => {
    if (!isAudioArmed) {
      return;
    }

    const render = () => {
      const waveformCanvas = waveformCanvasRef.current;
      const spectrumCanvas = spectrumCanvasRef.current;
      const envelopeCanvas = envelopeCanvasRef.current;
      const helperCanvas = helperCanvasRef.current;
      const cycleCanvas = cycleCanvasRef.current;

      if (!waveformCanvas || !spectrumCanvas || !envelopeCanvas || !helperCanvas || !cycleCanvas) {
        return;
      }

      engineRef.current.getCleanTimeDomainData(cleanTimeData);
      engineRef.current.getProcessedTimeDomainData(processedTimeData);
      engineRef.current.getCleanFrequencyData(cleanFrequencyData);
      engineRef.current.getProcessedFrequencyData(processedFrequencyData);
      spectrumMaxFrequencyRef.current = engineRef.current.getSpectrumMaxFrequency();
      drawWaveformOverlay(waveformCanvas, cleanTimeData, processedTimeData);
      drawCycleWaveform(cycleCanvas, cleanTimeData, processedTimeData, cycleFrequency, spectrumMaxFrequencyRef.current * 2);
      drawSpectrumOverlay(
        spectrumCanvas,
        cleanFrequencyData,
        processedFrequencyData,
        spectrumMarkers,
        spectrumDisplayMaxFrequency,
        spectrumMaxFrequencyRef.current,
      );

      const rms = calculateRms(processedTimeData);
      envelopeHistoryRef.current = [...envelopeHistoryRef.current.slice(1), rms];
      drawEnvelopeOverlay(envelopeCanvas, envelopeHistoryRef.current);

      const nextReduction = engineRef.current.getCompressorReduction();
      if (Math.abs(nextReduction - compressorReductionRef.current) > 0.15) {
        compressorReductionRef.current = nextReduction;
        setCompressorReduction(nextReduction);
      }

      drawEffectHelper(helperCanvas, selectedEffect, spectrumMaxFrequencyRef.current);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [cycleFrequency, isAudioArmed, selectedEffect, spectrumMarkers]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;

      if (event.repeat || target?.matches("input, select, textarea, button")) {
        return;
      }

      if (sourceInstrumentRef.current !== "keyboard") {
        return;
      }

      const key = event.key.toLowerCase();
      const midi = KEY_TO_MIDI.get(key);

      if (midi === undefined) {
        return;
      }

      event.preventDefault();
      void noteOn(`key-${key}`, midi);
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (sourceInstrumentRef.current !== "keyboard") {
        return;
      }

      const key = event.key.toLowerCase();

      if (!KEY_TO_MIDI.has(key)) {
        return;
      }

      event.preventDefault();
      noteOff(`key-${key}`);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  async function armAudio() {
    await engineRef.current.configure(chainRef.current, masterGainRef.current);
    armedRef.current = true;
    setIsAudioArmed(true);
  }

  function handleStop() {
    setIsAudioArmed(false);
    armedRef.current = false;
    engineRef.current.stop();
    heldVoiceIdsRef.current.clear();
    triggerVoiceIdsRef.current.clear();
    compressorReductionRef.current = 0;
    envelopeHistoryRef.current = Array(envelopeHistoryLength).fill(0);
    setCompressorReduction(0);
    setActiveVoiceIds(new Set());
    drawIdleVisualizers();
  }

  async function noteOn(id: string, midi: number) {
    if (!armedRef.current) {
      await armAudio();
    }

    setSelectedMidi(midi);
    const notesToPlay =
      sourceModeRef.current === "chord"
        ? buildChord(midi, chordQualityRef.current, voicingRef.current)
        : [midiToNote(midi)];
    const voiceGain = sourceModeRef.current === "chord" ? 0.85 / Math.sqrt(notesToPlay.length) : 0.85;
    const voiceIds = notesToPlay.map((_, index) => `${id}-${index}`);

    await Promise.all(
      notesToPlay.map((note, index) => engineRef.current.noteOn(voiceIds[index], note, waveformRef.current, voiceGain)),
    );

    triggerVoiceIdsRef.current.set(id, voiceIds);
    voiceIds.forEach((voiceId) => heldVoiceIdsRef.current.add(voiceId));
    setActiveVoiceIds((current) => new Set(current).add(id));
  }

  function noteOff(id: string) {
    const voiceIds = triggerVoiceIdsRef.current.get(id) ?? [`${id}-0`];
    voiceIds.forEach((voiceId) => {
      engineRef.current.noteOff(voiceId, 1.1);
      heldVoiceIdsRef.current.delete(voiceId);
    });
    triggerVoiceIdsRef.current.delete(id);
    setActiveVoiceIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function drawIdleVisualizers() {
    const waveformCanvas = waveformCanvasRef.current;
    const spectrumCanvas = spectrumCanvasRef.current;
    const envelopeCanvas = envelopeCanvasRef.current;
    const helperCanvas = helperCanvasRef.current;
    const cycleCanvas = cycleCanvasRef.current;

    if (!waveformCanvas || !spectrumCanvas || !envelopeCanvas || !helperCanvas || !cycleCanvas) {
      return;
    }

    cleanTimeData.fill(128);
    processedTimeData.fill(128);
    cleanFrequencyData.fill(0);
    processedFrequencyData.fill(0);
    envelopeHistoryRef.current = Array(envelopeHistoryLength).fill(0);
    drawWaveformOverlay(waveformCanvas, cleanTimeData, processedTimeData);
    drawCycleWaveform(cycleCanvas, cleanTimeData, processedTimeData, cycleFrequency, spectrumMaxFrequencyRef.current * 2);
    drawSpectrumOverlay(
      spectrumCanvas,
      cleanFrequencyData,
      processedFrequencyData,
      spectrumMarkers,
      spectrumDisplayMaxFrequency,
      spectrumMaxFrequencyRef.current,
    );
    drawEnvelopeOverlay(envelopeCanvas, envelopeHistoryRef.current);
    drawEffectHelper(helperCanvas, selectedEffect, spectrumMaxFrequencyRef.current);
  }

  function updateEffectParam(effectId: string, paramKey: string, value: number) {
    setChain((currentChain) =>
      currentChain.map((effect) =>
        effect.id === effectId
          ? {
              ...effect,
              params: {
                ...effect.params,
                [paramKey]: value,
              },
            }
          : effect,
      ),
    );
  }

  function toggleEffect(effectId: string) {
    setChain((currentChain) =>
      currentChain.map((effect) =>
        effect.id === effectId
          ? {
              ...effect,
              enabled: !effect.enabled,
            }
          : effect,
      ),
    );
  }

  function moveEffect(effectId: string, targetEffectId: string) {
    setChain((currentChain) => {
      const currentIndex = currentChain.findIndex((effect) => effect.id === effectId);
      const nextIndex = currentChain.findIndex((effect) => effect.id === targetEffectId);

      if (currentIndex < 0 || nextIndex < 0 || currentIndex === nextIndex) {
        return currentChain;
      }

      const nextChain = [...currentChain];
      const [movedEffect] = nextChain.splice(currentIndex, 1);
      nextChain.splice(nextIndex, 0, movedEffect);
      return nextChain;
    });
  }

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="PedalScope header">
        <div>
          <p className="eyebrow">PedalScope v0.2</p>
          <h1>Signal Chain Visualizer</h1>
        </div>
        <div className="transport">
          <button className="primary-button" type="button" onClick={armAudio} disabled={isAudioArmed}>
            Audio On
          </button>
          <button type="button" onClick={handleStop}>
            Stop
          </button>
        </div>
      </section>

      <section className="workspace">
        <aside className="control-panel" aria-label="Controls">
          <div className="panel-section">
            <h2>Source</h2>
            <label>
              Mode
              <select value={sourceMode} onChange={(event) => setSourceMode(event.target.value as SourceMode)}>
                <option value="single">Single Note</option>
                <option value="chord">Chord</option>
              </select>
            </label>
            <label>
              Note
              <select value={selectedMidi} onChange={(event) => setSelectedMidi(Number(event.target.value))}>
                {notes.map((note) => (
                  <option key={note.midi} value={note.midi}>
                    {note.name}
                    {note.octave}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Waveform
              <select value={waveform} onChange={(event) => setWaveform(event.target.value as WaveformType)}>
                <option value="sine">Sine</option>
                <option value="triangle">Triangle</option>
                <option value="sawtooth">Sawtooth</option>
                <option value="square">Square</option>
              </select>
            </label>
            {sourceMode === "chord" ? (
              <>
                <label>
                  Quality
                  <select value={chordQuality} onChange={(event) => setChordQuality(event.target.value as ChordQuality)}>
                    <option value="power">Power</option>
                    <option value="major">Major</option>
                    <option value="minor">Minor</option>
                    <option value="major7">Major 7</option>
                    <option value="minor7">Minor 7</option>
                    <option value="dominant7">Dominant 7</option>
                  </select>
                </label>
                <label>
                  Voicing
                  <select value={voicing} onChange={(event) => setVoicing(event.target.value as VoicingType)}>
                    <option value="close">Close</option>
                    <option value="open">Open</option>
                  </select>
                </label>
              </>
            ) : null}
          </div>

          <div className="panel-section">
            <h2>Output</h2>
            <label>
              Master Gain
              <span className="value-label">{masterGain.toFixed(2)}</span>
              <input
                type="range"
                min="0"
                max="0.8"
                step="0.01"
                value={masterGain}
                onChange={(event) => setMasterGain(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="panel-section readout">
            <h2>Voice</h2>
            <p id="voiceReadout">
              {activeNotes.map((note) => `${note.name}${note.octave}`).join(" - ")}
            </p>
            <p className="hint">{activeNotes.map((note) => `${note.frequency.toFixed(2)} Hz`).join(" / ")}</p>
          </div>

          <div className="panel-section cycle-readout">
            <div className="cycle-header">
              <h2>Cycle</h2>
              <span>{cycleFrequency.toFixed(1)} Hz</span>
            </div>
            <SignalLegend />
            <canvas ref={cycleCanvasRef} width="520" height="180" />
          </div>
        </aside>

        <section className="visual-area" aria-label="Visualizers">
          <section className="source-keyboard" aria-label="Instrument source">
            <div className="visualizer-header">
              <h2>{sourceInstrument === "keyboard" ? "Keyboard Source" : `${capitalize(sourceInstrument)} Source`}</h2>
              <div className="source-switch" role="group" aria-label="Source instrument">
                {SOURCE_INSTRUMENTS.map((instrument) => (
                  <button
                    key={instrument}
                    className={sourceInstrument === instrument ? "active" : ""}
                    type="button"
                    aria-pressed={sourceInstrument === instrument}
                    onClick={() => setSourceInstrument(instrument)}
                  >
                    {capitalize(instrument)}
                  </button>
                ))}
              </div>
            </div>
            {sourceInstrument === "keyboard" ? (
              <KeyboardSource activeVoiceIds={activeVoiceIds} noteOn={noteOn} noteOff={noteOff} />
            ) : (
              <StringSource
                activeVoiceIds={activeVoiceIds}
                instrument={sourceInstrument}
                noteOn={noteOn}
                noteOff={noteOff}
              />
            )}
          </section>

          <section className="pedalboard" aria-label="Effect chain">
            <div className="visualizer-header">
              <h2>Signal Chain</h2>
              <span>left to right</span>
            </div>
            <div className="pedal-row">
              {chain.map((effect, index) => (
                <PedalCard
                  key={effect.id}
                  effect={effect}
                  index={index}
                  selected={effect.id === selectedEffect.id}
                  dragging={effect.id === draggedEffectId}
                  onSelect={() => setSelectedEffectId(effect.id)}
                  onToggle={() => toggleEffect(effect.id)}
                  onDragStart={() => setDraggedEffectId(effect.id)}
                  onDragEnd={() => setDraggedEffectId(null)}
                  onDrop={() => {
                    if (draggedEffectId) {
                      moveEffect(draggedEffectId, effect.id);
                    }
                    setDraggedEffectId(null);
                  }}
                />
              ))}
            </div>
          </section>

          <section className="effect-editor" aria-label="Selected effect controls">
            <div className="visualizer-header">
              <h2>{selectedEffect.name}</h2>
              <span>{selectedEffect.enabled ? "active" : "bypassed"}</span>
            </div>
            <div className="effect-editor-body">
              <div className="knob-grid">
                {EFFECT_PARAM_DEFS[selectedEffect.type].map((param) => (
                  <Knob
                    key={param.key}
                    param={param}
                    value={selectedEffect.params[param.key]}
                    onChange={(value) => updateEffectParam(selectedEffect.id, param.key, value)}
                  />
                ))}
              </div>
              {selectedEffect.type === "compressor" ? (
                <GainReductionMeter reduction={compressorReduction} enabled={selectedEffect.enabled} />
              ) : null}
            </div>
          </section>

          <section className="analysis-grid" aria-label="Signal analysis views">
            <div className="visualizer">
              <div className="visualizer-header">
                <h2>Waveform</h2>
                <SignalLegend />
              </div>
              <canvas ref={waveformCanvasRef} width="900" height="260" />
            </div>

            <div className="visualizer">
              <div className="visualizer-header">
                <h2>Spectrum</h2>
                <SignalLegend />
              </div>
              <canvas ref={spectrumCanvasRef} width="900" height="260" />
            </div>

            <div className="visualizer">
              <div className="visualizer-header">
                <h2>Envelope</h2>
                <span>amplitude contour</span>
              </div>
              <canvas ref={envelopeCanvasRef} width="900" height="260" />
            </div>

            <div className="visualizer">
              <div className="visualizer-header">
                <h2>Effect View</h2>
                <span>{selectedEffect.type}</span>
              </div>
              <canvas ref={helperCanvasRef} width="900" height="260" />
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function buildSpectrumMarkers(notes: Note[]): SpectrumMarker[] {
  return notes.flatMap((note) => {
    const markers: SpectrumMarker[] = [
      {
        frequency: note.frequency,
        label: `${note.name}${note.octave}`,
        kind: "fundamental",
      },
    ];

    for (let harmonic = 2; harmonic <= 5; harmonic += 1) {
      markers.push({
        frequency: note.frequency * harmonic,
        label: `${harmonic}x`,
        kind: "harmonic",
      });
    }

    return markers;
  });
}

function drawEffectHelper(canvas: HTMLCanvasElement, effect: EffectModule, maxFrequency: number) {
  if (effect.type === "drive") {
    drawTransferCurve(canvas, effect.params.drive ?? 0.35, "soft");
    return;
  }

  if (effect.type === "distortion") {
    drawTransferCurve(canvas, effect.params.amount ?? 0.25, "hard", effect.params.bias ?? 0);
    return;
  }

  if (effect.type === "compressor") {
    drawCompressorCurve(canvas, effect.params.threshold ?? -24, effect.params.ratio ?? 4);
    return;
  }

  if (effect.type === "filter") {
    drawFilterResponse(canvas, effect.params.cutoff ?? 4200, effect.params.resonance ?? 0.7, maxFrequency);
    return;
  }

  if (effect.type === "phaseDelay") {
    drawCombFilterResponse(canvas, effect.params.delayMs ?? 6, effect.params.mix ?? 0.45, maxFrequency);
    return;
  }

  drawGainHelper(canvas, effect.params.level ?? 1);
}

function drawGainHelper(canvas: HTMLCanvasElement, level: number) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0c0f10";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(198, 210, 203, 0.1)";

  for (let y = height / 4; y < height; y += height / 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const y = height - Math.min(level / 2, 1) * height;
  ctx.fillStyle = "rgba(126, 168, 146, 0.3)";
  ctx.fillRect(0, y, width, height - y);
  ctx.strokeStyle = "#7ea892";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
}

type SourceViewProps = {
  activeVoiceIds: Set<string>;
  noteOn: (id: string, midi: number) => Promise<void>;
  noteOff: (id: string) => void;
};

function KeyboardSource({ activeVoiceIds, noteOn, noteOff }: SourceViewProps) {
  return (
    <div className="keyboard-bed">
      {KEYBOARD_LAYOUT.map((item) => {
        const note = midiToNote(item.midi);
        const voiceId = `key-${item.key}`;
        const pointerId = `pointer-${item.midi}`;
        const isActive = activeVoiceIds.has(voiceId) || activeVoiceIds.has(pointerId);

        return (
          <button
            key={`${item.key}-${item.midi}`}
            type="button"
            className={`piano-key ${item.color} ${isActive ? "active" : ""}`}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              void noteOn(pointerId, item.midi);
            }}
            onPointerUp={() => noteOff(pointerId)}
            onPointerCancel={() => noteOff(pointerId)}
            onPointerLeave={(event) => {
              if (event.buttons === 1) {
                noteOff(pointerId);
              }
            }}
          >
            <span className="computer-key">{item.key.toUpperCase()}</span>
            <span className="note-label">
              {note.name}
              {note.octave}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type StringSourceProps = SourceViewProps & {
  instrument: Exclude<SourceInstrument, "keyboard">;
};

function StringSource({ activeVoiceIds, instrument, noteOn, noteOff }: StringSourceProps) {
  const layout = STRING_INSTRUMENTS[instrument];
  const frets = Array.from({ length: layout.frets + 1 }, (_, index) => index);

  return (
    <div className={`fretboard ${instrument}`}>
      <div className="fret-numbers" aria-hidden="true">
        <span />
        {frets.map((fret) => (
          <span key={fret}>{fret}</span>
        ))}
      </div>
      {layout.strings.map((openMidi, stringIndex) => {
        const openNote = midiToNote(openMidi);

        return (
          <div className="string-row" key={`${instrument}-${openMidi}-${stringIndex}`}>
            <span className="string-label">
              {openNote.name}
              {openNote.octave}
            </span>
            {frets.map((fret) => {
              const midi = openMidi + fret;
              const note = midiToNote(midi);
              const pointerId = `${instrument}-${stringIndex}-${fret}`;
              const isActive = activeVoiceIds.has(pointerId);

              return (
                <button
                  key={`${pointerId}-${midi}`}
                  type="button"
                  className={`fret ${isActive ? "active" : ""}`}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    void noteOn(pointerId, midi);
                  }}
                  onPointerUp={() => noteOff(pointerId)}
                  onPointerCancel={() => noteOff(pointerId)}
                  onPointerLeave={(event) => {
                    if (event.buttons === 1) {
                      noteOff(pointerId);
                    }
                  }}
                >
                  <span>
                    {note.name}
                    {note.octave}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SignalLegend() {
  return (
    <span className="signal-legend" aria-label="Clean and processed signal legend">
      <span>
        <i className="legend-dot clean" />
        Clean
      </span>
      <span>
        <i className="legend-dot processed" />
        Processed
      </span>
    </span>
  );
}

type GainReductionMeterProps = {
  reduction: number;
  enabled: boolean;
};

function GainReductionMeter({ reduction, enabled }: GainReductionMeterProps) {
  const clampedReduction = enabled ? Math.min(reduction, 30) : 0;
  const fillPercent = (clampedReduction / 30) * 100;

  return (
    <aside className="gain-reduction-meter" aria-label="Compressor gain reduction">
      <div>
        <h3>Gain Reduction</h3>
        <p>{clampedReduction.toFixed(1)} dB</p>
      </div>
      <div className="gr-track">
        <span className="gr-fill" style={{ width: `${fillPercent}%` }} />
      </div>
      <div className="gr-scale">
        <span>0</span>
        <span>-15</span>
        <span>-30 dB</span>
      </div>
    </aside>
  );
}

type PedalCardProps = {
  effect: EffectModule;
  index: number;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
};

function PedalCard({
  effect,
  index,
  selected,
  dragging,
  onSelect,
  onToggle,
  onDragStart,
  onDragEnd,
  onDrop,
}: PedalCardProps) {
  return (
    <article
      className={`pedal-card ${selected ? "selected" : ""} ${effect.enabled ? "" : "bypassed"} ${dragging ? "dragging" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", effect.id);
        onDragStart();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDragEnd={onDragEnd}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <button className="pedal-select" type="button" onClick={onSelect}>
        <span className="pedal-order">{index + 1}</span>
        <strong>{effect.name}</strong>
        <span>{effect.type}</span>
      </button>
      <button className="footswitch" type="button" aria-pressed={effect.enabled} onClick={onToggle}>
        <span className="switch-light" />
        {effect.enabled ? "On" : "Bypass"}
      </button>
    </article>
  );
}

type KnobProps = {
  param: EffectParam;
  value: number;
  onChange: (value: number) => void;
};

function Knob({ param, value, onChange }: KnobProps) {
  const normalized = (value - param.min) / (param.max - param.min);
  const degrees = -135 + normalized * 270;
  const displayValue =
    param.unit === "Hz" ? Math.round(value).toLocaleString() : value.toFixed(param.step < 0.1 ? 2 : 1);

  return (
    <label className="knob-control">
      <span>{param.label}</span>
      <span className="knob-shell">
        <span className="knob-face" style={{ transform: `rotate(${degrees}deg)` }}>
          <span className="knob-indicator" />
        </span>
      </span>
      <span className="knob-value">
        {displayValue}
        {param.unit ? ` ${param.unit}` : ""}
      </span>
      <input
        aria-label={param.label}
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
