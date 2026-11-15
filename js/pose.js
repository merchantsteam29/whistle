// Body tracking with MediaPipe Pose Landmarker (runs on the device, nothing is uploaded).
const VER = '0.10.14';
const LIB = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/wasm`;
const MODELS = {
  fast: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  accurate: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};

// skeleton lines for the overlay
export const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [28, 30], [27, 31], [28, 32], [29, 31], [30, 32]];

let cache = {};
export async function createPose(quality = 'fast') {
  if (cache[quality]) return cache[quality];
  const { PoseLandmarker, FilesetResolver } = await import(LIB);
  const files = await FilesetResolver.forVisionTasks(WASM);
  const make = (delegate) => PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: MODELS[quality] || MODELS.fast, delegate },
    runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  let lm;
  try { lm = await make('GPU'); } catch (e) { console.info('Pose: GPU not available, using CPU', e?.message); lm = await make('CPU'); }
  let lastTs = 0;
  const api = {
    detect(video, ms) {
      const ts = Math.max(ms, lastTs + 1); lastTs = ts; // timestamps must keep rising
      const r = lm.detectForVideo(video, ts);
      return r?.landmarks?.[0] || null;
    },
  };
  cache[quality] = api;
  return api;
}
