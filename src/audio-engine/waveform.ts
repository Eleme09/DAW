/** Downsamples an AudioBuffer into min/max peak pairs for fast canvas waveform drawing. */
export interface PeakData {
  min: Float32Array;
  max: Float32Array;
  bucketCount: number;
}

export function computePeaks(buffer: AudioBuffer, bucketCount: number): PeakData {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const samplesPerBucket = Math.max(1, Math.floor(length / bucketCount));
  const min = new Float32Array(bucketCount);
  const max = new Float32Array(bucketCount);

  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = bucket * samplesPerBucket;
    const end = Math.min(length, start + samplesPerBucket);
    let bucketMin = 0;
    let bucketMax = 0;
    for (let i = start; i < end; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += channelData[c][i];
      const v = sum / channels;
      if (v < bucketMin) bucketMin = v;
      if (v > bucketMax) bucketMax = v;
    }
    min[bucket] = bucketMin;
    max[bucket] = bucketMax;
  }

  return { min, max, bucketCount };
}
