export function drawWaveform(canvas: HTMLCanvasElement, data: Uint8Array<ArrayBuffer>) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const { width, height } = canvas;

  clearCanvas(ctx, width, height);
  drawGrid(ctx, width, height);

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#f3b27b";
  ctx.beginPath();

  const sliceWidth = width / data.length;

  for (let i = 0; i < data.length; i += 1) {
    const x = i * sliceWidth;
    const y = (data[i] / 255) * height;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

export function drawWaveformOverlay(
  canvas: HTMLCanvasElement,
  cleanData: Uint8Array<ArrayBuffer>,
  processedData: Uint8Array<ArrayBuffer>,
) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const { width, height } = canvas;

  clearCanvas(ctx, width, height);
  drawGrid(ctx, width, height);
  drawWaveformLine(ctx, cleanData, width, height, "rgba(126, 168, 146, 0.86)", 1.5);
  drawWaveformLine(ctx, processedData, width, height, "#f3b27b", 2);
}

export function drawCycleWaveform(
  canvas: HTMLCanvasElement,
  cleanData: Uint8Array<ArrayBuffer>,
  processedData: Uint8Array<ArrayBuffer>,
  frequency: number,
  sampleRate: number,
) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const { width, height } = canvas;
  clearCanvas(ctx, width, height);
  drawGrid(ctx, width, height);

  ctx.strokeStyle = "rgba(198, 210, 203, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  if (frequency <= 0 || sampleRate <= 0) {
    return;
  }

  const samplesPerCycle = Math.max(8, Math.min(processedData.length, Math.round(sampleRate / frequency)));
  const processedStart = findCycleStart(processedData, samplesPerCycle);
  const cleanStart = findCycleStart(cleanData, samplesPerCycle);

  drawCycleLine(ctx, cleanData, cleanStart, samplesPerCycle, width, height, "rgba(126, 168, 146, 0.9)", 1.5);
  drawCycleLine(ctx, processedData, processedStart, samplesPerCycle, width, height, "#f3b27b", 2);
}

export function drawSpectrum(canvas: HTMLCanvasElement, data: Uint8Array<ArrayBuffer>) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const { width, height } = canvas;
  const barWidth = width / data.length;

  clearCanvas(ctx, width, height);
  drawGrid(ctx, width, height);

  for (let i = 0; i < data.length; i += 1) {
    const value = data[i] / 255;
    const barHeight = value * height;
    const hue = 26 + value * 120;

    ctx.fillStyle = `hsl(${hue}, 68%, 62%)`;
    ctx.fillRect(i * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight);
  }
}

export function drawSpectrumOverlay(
  canvas: HTMLCanvasElement,
  cleanData: Uint8Array<ArrayBuffer>,
  processedData: Uint8Array<ArrayBuffer>,
  markers: SpectrumMarker[] = [],
  displayMaxFrequency = 6000,
  analyserMaxFrequency = 24000,
) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const { width, height } = canvas;
  const visibleBinCount = Math.max(
    1,
    Math.min(processedData.length, Math.floor((displayMaxFrequency / analyserMaxFrequency) * processedData.length)),
  );
  const barWidth = width / visibleBinCount;

  clearCanvas(ctx, width, height);
  drawGrid(ctx, width, height);

  for (let i = 0; i < visibleBinCount; i += 1) {
    const cleanValue = cleanData[i] / 255;
    const processedValue = processedData[i] / 255;
    const cleanHeight = cleanValue * height;
    const processedHeight = processedValue * height;
    const x = i * barWidth;
    const widthForBar = Math.max(1, barWidth - 1);

    ctx.fillStyle = "rgba(126, 168, 146, 0.42)";
    ctx.fillRect(x, height - cleanHeight, widthForBar, cleanHeight);

    ctx.fillStyle = "rgba(243, 178, 123, 0.82)";
    ctx.fillRect(x, height - processedHeight, widthForBar, processedHeight);
  }

  drawSpectrumMarkers(ctx, markers, width, height, displayMaxFrequency);
}

export type SpectrumMarker = {
  frequency: number;
  label: string;
  kind: "fundamental" | "harmonic";
};

export function calculateRms(data: Uint8Array<ArrayBuffer>) {
  let sum = 0;

  for (let i = 0; i < data.length; i += 1) {
    const centered = (data[i] - 128) / 128;
    sum += centered * centered;
  }

  return Math.sqrt(sum / data.length);
}

export function drawEnvelope(canvas: HTMLCanvasElement, values: number[]) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const { width, height } = canvas;

  clearCanvas(ctx, width, height);
  drawGrid(ctx, width, height);

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#7ea892";
  ctx.beginPath();

  const maxValue = 0.75;
  const sliceWidth = values.length > 1 ? width / (values.length - 1) : width;

  values.forEach((value, index) => {
    const normalized = Math.min(value / maxValue, 1);
    const x = index * sliceWidth;
    const y = height - normalized * height;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  const latest = values.at(-1) ?? 0;
  ctx.fillStyle = "rgba(126, 168, 146, 0.16)";
  ctx.fillRect(0, height - Math.min(latest / maxValue, 1) * height, width, height);
}

export function drawEnvelopeOverlay(canvas: HTMLCanvasElement, values: number[]) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const { width, height } = canvas;

  clearCanvas(ctx, width, height);
  drawGrid(ctx, width, height);

  drawEnvelopeLine(ctx, values, width, height, "#7ea892");

  const latest = values.at(-1) ?? 0;
  const maxValue = 0.75;
  ctx.fillStyle = "rgba(126, 168, 146, 0.16)";
  ctx.fillRect(0, height - Math.min(latest / maxValue, 1) * height, width, height);
}

export function drawTransferCurve(canvas: HTMLCanvasElement, amount: number, mode: "soft" | "hard", bias = 0) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const { width, height } = canvas;
  clearCanvas(ctx, width, height);
  drawGrid(ctx, width, height);

  ctx.strokeStyle = "rgba(198, 210, 203, 0.22)";
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.stroke();

  const drive = mode === "hard" ? 1 + amount * 160 : 1 + amount * 70;
  const clampedBias = Math.max(-1, Math.min(1, bias));
  const positiveLimit = 1 - Math.max(clampedBias, 0) * 0.55;
  const negativeLimit = -1 + Math.max(-clampedBias, 0) * 0.55;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#f3b27b";
  ctx.beginPath();

  for (let i = 0; i <= width; i += 1) {
    const x = (i / width) * 2 - 1;
    const shaped = Math.tanh(drive * x);
    const yValue =
      mode === "hard"
        ? Math.max(negativeLimit, Math.min(positiveLimit, shaped))
        : ((1 + drive) * x) / (1 + drive * Math.abs(x));
    const y = height / 2 - (yValue * height) / 2;

    if (i === 0) {
      ctx.moveTo(i, y);
    } else {
      ctx.lineTo(i, y);
    }
  }

  ctx.stroke();
}

export function drawFilterResponse(canvas: HTMLCanvasElement, cutoff: number, resonance: number, maxFrequency = 12000) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const { width, height } = canvas;
  clearCanvas(ctx, width, height);
  drawGrid(ctx, width, height);

  const cutoffX = Math.min(cutoff / maxFrequency, 1) * width;

  ctx.fillStyle = "rgba(126, 168, 146, 0.18)";
  ctx.fillRect(0, 0, cutoffX, height);
  ctx.strokeStyle = "#7ea892";
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let i = 0; i <= width; i += 1) {
    const frequency = (i / width) * maxFrequency;
    const rolloff = 1 / (1 + Math.max(frequency - cutoff, 0) / Math.max(cutoff * 0.18, 1));
    const bump = Math.exp(-((frequency - cutoff) ** 2) / (2 * (cutoff * 0.06) ** 2)) * Math.min(resonance / 16, 0.7);
    const value = Math.min(rolloff + bump, 1);
    const y = height - value * height;

    if (i === 0) {
      ctx.moveTo(i, y);
    } else {
      ctx.lineTo(i, y);
    }
  }

  ctx.stroke();
}

export function drawCombFilterResponse(canvas: HTMLCanvasElement, delayMs: number, mix: number, maxFrequency = 12000) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const { width, height } = canvas;
  clearCanvas(ctx, width, height);
  drawGrid(ctx, width, height);

  const delaySeconds = delayMs / 1000;
  ctx.strokeStyle = "#f3b27b";
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let i = 0; i <= width; i += 1) {
    const frequency = (i / width) * maxFrequency;
    const phase = 2 * Math.PI * frequency * delaySeconds;
    const real = 1 - mix + mix * Math.cos(phase);
    const imaginary = mix * Math.sin(phase);
    const magnitude = Math.min(Math.sqrt(real * real + imaginary * imaginary), 1.2) / 1.2;
    const y = height - magnitude * height;

    if (i === 0) {
      ctx.moveTo(i, y);
    } else {
      ctx.lineTo(i, y);
    }
  }

  ctx.stroke();
}

export function drawCompressorCurve(canvas: HTMLCanvasElement, threshold: number, ratio: number) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const { width, height } = canvas;
  clearCanvas(ctx, width, height);
  drawGrid(ctx, width, height);

  ctx.strokeStyle = "rgba(126, 168, 146, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(width, 0);
  ctx.stroke();

  ctx.strokeStyle = "#f3b27b";
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let i = 0; i <= width; i += 1) {
    const inputDb = -60 + (i / width) * 60;
    const outputDb = inputDb <= threshold ? inputDb : threshold + (inputDb - threshold) / ratio;
    const y = height - ((outputDb + 60) / 60) * height;

    if (i === 0) {
      ctx.moveTo(i, y);
    } else {
      ctx.lineTo(i, y);
    }
  }

  ctx.stroke();
}

function clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0c0f10";
  ctx.fillRect(0, 0, width, height);
}

function drawSpectrumMarkers(
  ctx: CanvasRenderingContext2D,
  markers: SpectrumMarker[],
  width: number,
  height: number,
  maxFrequency: number,
) {
  markers.forEach((marker) => {
    if (marker.frequency <= 0 || marker.frequency > maxFrequency) {
      return;
    }

    const x = (marker.frequency / maxFrequency) * width;
    ctx.strokeStyle = marker.kind === "fundamental" ? "rgba(255, 255, 255, 0.9)" : "rgba(126, 168, 146, 0.58)";
    ctx.lineWidth = marker.kind === "fundamental" ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    if (marker.kind === "fundamental") {
      ctx.save();
      ctx.translate(Math.max(x + 4, 14), 12);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "rgba(244, 240, 232, 0.82)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(marker.label, 0, 0);
      ctx.restore();
    }
  });
}

function drawWaveformLine(
  ctx: CanvasRenderingContext2D,
  data: Uint8Array<ArrayBuffer>,
  width: number,
  height: number,
  color: string,
  lineWidth: number,
  dash: number[] = [],
) {
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.setLineDash(dash);
  ctx.beginPath();

  const sliceWidth = width / data.length;

  for (let i = 0; i < data.length; i += 1) {
    const x = i * sliceWidth;
    const y = (data[i] / 255) * height;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  ctx.setLineDash([]);
}

function findCycleStart(data: Uint8Array<ArrayBuffer>, samplesPerCycle: number) {
  const center = Math.floor(data.length / 2);
  const searchStart = Math.max(1, center - samplesPerCycle);
  const searchEnd = Math.min(data.length - samplesPerCycle - 1, center + samplesPerCycle);

  for (let i = searchStart; i < searchEnd; i += 1) {
    const previous = data[i - 1] - 128;
    const current = data[i] - 128;

    if (previous <= 0 && current > 0) {
      return i;
    }
  }

  return Math.max(0, Math.min(data.length - samplesPerCycle, center - Math.floor(samplesPerCycle / 2)));
}

function drawCycleLine(
  ctx: CanvasRenderingContext2D,
  data: Uint8Array<ArrayBuffer>,
  start: number,
  samplesPerCycle: number,
  width: number,
  height: number,
  color: string,
  lineWidth: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();

  for (let i = 0; i < samplesPerCycle; i += 1) {
    const sampleIndex = Math.min(start + i, data.length - 1);
    const x = samplesPerCycle > 1 ? (i / (samplesPerCycle - 1)) * width : 0;
    const centered = (data[sampleIndex] - 128) / 128;
    const y = height / 2 - centered * (height * 0.42);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

function drawEnvelopeLine(
  ctx: CanvasRenderingContext2D,
  values: number[],
  width: number,
  height: number,
  color: string,
  dash: number[] = [],
) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.setLineDash(dash);
  ctx.beginPath();

  const maxValue = 0.75;
  const sliceWidth = values.length > 1 ? width / (values.length - 1) : width;

  values.forEach((value, index) => {
    const normalized = Math.min(value / maxValue, 1);
    const x = index * sliceWidth;
    const y = height - normalized * height;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = "rgba(198, 210, 203, 0.1)";
  ctx.lineWidth = 1;

  for (let y = height / 4; y < height; y += height / 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}
