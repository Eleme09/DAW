/**
 * DynamicsCompressorNode adds its own makeup gain (Web Audio spec, "makeup
 * gain"): (1 / output at 0 dBFS input) ^ 0.6, so a node that is NOT
 * compressing still turns the signal up - 13.5 dB at threshold -30 / ratio
 * 4. Measured in Chromium (sine at -60 dBFS): matches this function to
 * 0.01 dB, knee included (it reproduces Chromium's knee curve and its
 * k search, dynamics_compressor_kernel.cc).
 *
 * Effects that want the node to be unity below the threshold (a band of a
 * de-esser or multiband, a compressor whose "Ganancia" means what it says)
 * divide this back out.
 */
export function nativeCompressorMakeupDb(thresholdDb: number, ratio: number, kneeDb: number): number {
  const dbToLin = (db: number) => Math.pow(10, db / 20);
  const linToDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -1000);
  const linearThreshold = dbToLin(thresholdDb);
  const slope = 1 / Math.max(1, ratio);
  const kneeCurve = (x: number, k: number) => (x < linearThreshold ? x : linearThreshold + (1 - Math.exp(-k * (x - linearThreshold))) / k);
  const slopeAt = (x: number, k: number) => {
    if (x < linearThreshold) return 1;
    const x2 = x * 1.001;
    return (linToDb(kneeCurve(x2, k)) - linToDb(kneeCurve(x, k))) / (linToDb(x2) - linToDb(x));
  };
  const kneeThresholdDb = thresholdDb + kneeDb;
  const kneeThreshold = dbToLin(kneeThresholdDb);
  let minK = 0.1;
  let maxK = 10000;
  let k = 5;
  for (let i = 0; i < 15; i++) {
    if (slopeAt(kneeThreshold, k) < slope) maxK = k;
    else minK = k;
    k = Math.sqrt(minK * maxK);
  }
  const yKneeThresholdDb = linToDb(kneeCurve(kneeThreshold, k));
  const saturate = (x: number) => (x < kneeThreshold ? kneeCurve(x, k) : dbToLin(yKneeThresholdDb + slope * (linToDb(x) - kneeThresholdDb)));
  return -0.6 * linToDb(saturate(1));
}
