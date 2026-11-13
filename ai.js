/* Fotoğraftan hasar tespiti (çatlak, kopma, korozyon, tuzlanma): model telefonda/tarayıcıda çalışır (ONNX Runtime Web).
   Model dosyası: model_hasar.onnx (dört sınıflı YOLOv8, best_hasar.pt dosyasından dışa aktarılır). */

const ORT_BASE = window.__ORT_BASE || 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
const AI = { sess: null, busy: null };
/* Modelin sınıf sırası (best_hasar.pt eğitimi): 0 crack, 1 spalling, 2 corrosion, 3 efflorescence.
   Skora yalnızca SKORA_GIREN sınıflar girer. Tuzlanma bilgi olarak gösterilir, skoru etkilemez. */
const SINIF_AD = ['Çatlak', 'Beton kopması', 'Korozyon', 'Tuzlanma'];
const SINIF_RENK = ['#ff3b3b', '#ff9f1c', '#b5651d', '#2ec4ff'];
const SKORA_GIREN = [0, 1, 2];

function betikYukle(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.crossOrigin = 'anonymous';
    s.onload = res; s.onerror = () => rej(new Error('BETIK: ' + src));
    document.head.appendChild(s);
  });
}

async function aiYukle() {
  if (AI.sess) return AI.sess;
  if (!AI.busy) {
    AI.busy = (async () => {
      const res = await fetch('model_hasar.onnx').catch(() => null);
      if (!res || !res.ok) throw new Error('MODEL_YOK');
      const buf = await res.arrayBuffer();
      if (!window.ort) await betikYukle(ORT_BASE + 'ort.min.js');
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;
      AI.sess = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
      return AI.sess;
    })();
    AI.busy.catch(() => { AI.busy = null; });
  }
  return AI.busy;
}

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1), x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const u = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return u > 0 ? inter / u : 0;
}

/* img: yüklenmiş <img> veya canvas. Dönüş: orijinal görüntü pikselinde kutular. */
async function aiTespit(img, conf = 0.25, iouEsik = 0.45) {
  const sess = await aiYukle(), S = 640;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const r = Math.min(S / iw, S / ih), nw = Math.round(iw * r), nh = Math.round(ih * r);
  const dx = Math.floor((S - nw) / 2), dy = Math.floor((S - nh) / 2);
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = 'rgb(114,114,114)'; cx.fillRect(0, 0, S, S);
  cx.drawImage(img, dx, dy, nw, nh);
  const d = cx.getImageData(0, 0, S, S).data, N = S * S, f = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) { f[i] = d[i * 4] / 255; f[N + i] = d[i * 4 + 1] / 255; f[2 * N + i] = d[i * 4 + 2] / 255; }
  const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, S, S]) });
  const o = out[sess.outputNames[0]], dims = o.dims, data = o.data;
  let nb, nc, get;
  if (dims[1] < dims[2]) { nc = dims[1] - 4; nb = dims[2]; get = (c, i) => data[c * nb + i]; }
  else { nc = dims[2] - 4; nb = dims[1]; get = (c, i) => data[i * (nc + 4) + c]; }
  let boxes = [];
  for (let i = 0; i < nb; i++) {
    let sc = 0, cls = 0; for (let c = 0; c < nc; c++) { const v = get(4 + c, i); if (v > sc) { sc = v; cls = c; } }
    if (sc < conf) continue;
    const bx = get(0, i), by = get(1, i), bw = get(2, i), bh = get(3, i);
    boxes.push({
      x1: Math.max(0, (bx - bw / 2 - dx) / r), y1: Math.max(0, (by - bh / 2 - dy) / r),
      x2: Math.min(iw, (bx + bw / 2 - dx) / r), y2: Math.min(ih, (by + bh / 2 - dy) / r), score: sc, cls
    });
  }
  boxes.sort((a, b) => b.score - a.score);
  const keep = [];
  for (const b of boxes) if (keep.every(k => k.cls !== b.cls || iou(k, b) < iouEsik)) keep.push(b);   // aynı sınıfta üst üste binenler elenir
  return { boxes: keep, w: iw, h: ih };
}

/* Tespitlerden uygulamanın kullandığı değerler (risk_skor.py ile aynı mantık).
   cov, n: skora giren sınıfların (çatlak, kopma, korozyon) kapsaması ve sayısı. sinif: her sınıfın sayısı. */
function tespitOzeti(res) {
  const alan = res.w * res.h;
  const girenler = res.boxes.filter(b => b.cls == null || SKORA_GIREN.includes(b.cls));
  const kapsama = girenler.reduce((s, b) => s + (b.x2 - b.x1) * (b.y2 - b.y1) * b.score, 0) / alan;
  const sinif = [0, 0, 0, 0];
  res.boxes.forEach(b => { sinif[b.cls || 0]++; });
  return { cov: Math.round(kapsama * 10000) / 100, n: girenler.length, sinif };
}
