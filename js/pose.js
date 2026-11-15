// On-device vision with MediaPipe Tasks (nothing is uploaded):
//  - Pose Landmarker: body tracking, up to 4 people
//  - Object Detector (EfficientDet-Lite0): finds "sports ball", used by the AI ball finder
const VER = '0.10.14';
const LIB = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/wasm`;
const MODELS = {
  fast: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  accurate: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};
const DETECTOR = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';

export const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [28, 30], [27, 31], [28, 32], [29, 31], [30, 32]];

let lib = null, files = null;
async function base() {
  if (!lib) { lib = await import(LIB); files = await lib.FilesetResolver.forVisionTasks(WASM); }
  return lib;
}
async function withDelegate(make) {
  try { return { task: await make('GPU'), gpu: true }; } catch (e) { console.info('Vision: GPU not available, using CPU', e?.message); return { task: await make('CPU'), gpu: false }; }
}

const poseCache = {};
export async function createPose(quality = 'fast', numPoses = 1) {
  const key = quality + numPoses;
  if (poseCache[key]) return poseCache[key];
  const { PoseLandmarker } = await base();
  const { task, gpu } = await withDelegate((delegate) => PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: MODELS[quality] || MODELS.fast, delegate },
    runningMode: 'VIDEO', numPoses,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  }));
  let lastTs = 0;
  const api = {
    gpu, numPoses,
    // all people found: [landmarks33, ...]
    detectAll(video, ms) {
      const ts = Math.max(ms, lastTs + 1); lastTs = ts;
      return task.detectForVideo(video, ts)?.landmarks || [];
    },
  };
  poseCache[key] = api;
  return api;
}

let detCache = null;
export async function createBallDetector() {
  if (detCache) return detCache;
  const { ObjectDetector } = await base();
  const { task, gpu } = await withDelegate((delegate) => ObjectDetector.createFromOptions(files, {
    baseOptions: { modelAssetPath: DETECTOR, delegate },
    runningMode: 'VIDEO', scoreThreshold: 0.22, maxResults: 4, categoryAllowlist: ['sports ball'],
  }));
  const cv = document.createElement('canvas'); cv.width = cv.height = 384;
  const cx = cv.getContext('2d');
  let lastTs = 0;
  detCache = {
    gpu,
    // -> [{x, y, r, score}] normalised to the full frame (r in frame-height units)
    detect(video, ms, crop) {
      const ts = Math.max(ms, lastTs + 1); lastTs = ts;
      const vw = video.videoWidth, vh = video.videoHeight;
      let src = video, sx = 0, sy = 0, sw = vw, sh = vh;
      if (crop) { cx.drawImage(video, crop.sx, crop.sy, crop.side, crop.side, 0, 0, cv.width, cv.height); src = cv; sx = crop.sx; sy = crop.sy; sw = sh = crop.side; }
      const r = task.detectForVideo(src, ts);
      const kx = sw / (crop ? cv.width : vw), ky = sh / (crop ? cv.height : vh);
      return (r?.detections || []).map((d) => {
        const b = d.boundingBox;
        const w = b.width * kx, h = b.height * ky;
        return { x: (sx + (b.originX + b.width / 2) * kx) / vw, y: (sy + (b.originY + b.height / 2) * ky) / vh, r: Math.max(w, h) / 2 / vh, score: d.categories?.[0]?.score || 0 };
      }).filter((d) => d.r > 0.004);
    },
  };
  return detCache;
}
