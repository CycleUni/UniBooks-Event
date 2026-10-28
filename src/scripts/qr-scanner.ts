/**
 * The camera view that reads member passes, used by the draw screen and the
 * scan-to-add dialog. It follows the main site's barcode scanner
 * (client/src/app/shared/ui/barcode-scanner.component.ts):
 *
 * - The camera is opened with no resolution or frame-rate constraints, so the
 *   browser picks its default; only the rear camera is asked for.
 * - Every frame shown is decoded at the camera's own resolution, the whole
 *   visible part, not a shrunken box in the middle (html5-qrcode, used before,
 *   scaled a 230x230 box down to that many pixels before decoding).
 * - At most 10 decodes a second, and a decode starts only after the last one
 *   finished, so a slow device skips frames instead of queueing them.
 * - Continuous focus and a slight zoom where the camera reports them. No torch:
 *   a pass is shown on a lit phone screen, where a light only adds glare.
 *
 * Unlike the main site's EAN-13 reader it does not wait for a code to hold
 * across frames: a QR code's error correction makes a misread negligible, and
 * a wrong code fails the main site's signature check anyway.
 */
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

const PREFERRED_ZOOM = 1.5;
const MAX_DECODES_PER_SECOND = 10;

export interface Camera {
  id: string;
  label: string;
}

export interface QrScanner {
  /** The video cameras, readable once permission was granted. */
  cameras: Camera[];
  /** The camera in use. */
  deviceId: string | undefined;
  stop(): void;
}

/**
 * Makes sure a BarcodeDetector that reads QR codes exists: the browser's own
 * where it has one (Android and desktop Chrome), else ZXing-C++ as WebAssembly
 * (iOS Safari, Firefox), served from this site rather than the polyfill's CDN.
 */
async function qrDetector(): Promise<any> {
  const native = (globalThis as any).BarcodeDetector;
  if (native) {
    try {
      const formats: string[] = await native.getSupportedFormats();
      if (formats.includes('qr_code')) return new native({ formats: ['qr_code'] });
    } catch {
      // Treat a detector that can't list its formats like a missing one.
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    },
  });
  return new BarcodeDetector({ formats: ['qr_code'] });
}

/**
 * The main rear lens, only when the labels say so with confidence (multi-lens
 * phones label their ultra-wide and telephoto lenses); otherwise null, and the
 * browser's own choice for facingMode "environment" stands. As the main site.
 */
function bestRearCamera(devices: Camera[]): string | null {
  const back = devices.filter((d) => !/front|user|前置|前相機|前鏡頭|facetime|selfie/i.test(d.label));
  if (back.length <= 1) return null;
  const special = (d: Camera) => /ultra[\s-]?wide|0\.5x|超廣角|telephoto|望遠|長焦|[2-9]x/i.test(d.label);
  if (!back.some(special)) return null;
  const normal = back.filter((d) => !special(d));
  if (normal.length === 0) return null;
  return (normal.find((d) => /back camera|main|廣角|後置|後相機/i.test(d.label)) ?? normal[0]).id;
}

/** The part of the video an `object-fit: cover` box shows, in the video's pixels. */
function visibleRegion(vw: number, vh: number, bw: number, bh: number) {
  const scale = Math.max(bw / vw, bh / vh);
  const width = Math.min(vw, Math.round(bw / scale));
  const height = Math.min(vh, Math.round(bh / scale));
  return { x: Math.round((vw - width) / 2), y: Math.round((vh - height) / 2), width, height };
}

async function listCameras(): Promise<Camera[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  } catch {
    return [];
  }
}

async function applyCameraTuning(track: MediaStreamTrack | undefined) {
  if (!track || typeof track.getCapabilities !== 'function') return;
  const caps = track.getCapabilities() as any;
  const advanced: any[] = [];
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) advanced.push({ focusMode: 'continuous' });
  if (caps.zoom && caps.zoom.min <= PREFERRED_ZOOM && caps.zoom.max >= PREFERRED_ZOOM) advanced.push({ zoom: PREFERRED_ZOOM });
  // One at a time, so a setting the camera rejects doesn't take the others with it.
  for (const constraint of advanced) {
    try {
      await track.applyConstraints({ advanced: [constraint] });
    } catch {
      // Not supported after all.
    }
  }
}

/**
 * Starts the camera in `host` (which it fills with a video) and calls `onCode`
 * with each decoded text. `deviceId` picks a camera, else the rear one.
 * Throws when the camera cannot be opened (no camera, permission denied).
 */
export async function startQrScanner(
  host: HTMLElement,
  onCode: (text: string) => void,
  deviceId?: string,
): Promise<QrScanner> {
  const detector = await qrDetector();
  let stream = await navigator.mediaDevices.getUserMedia({
    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' },
    audio: false,
  });

  // Camera labels are only readable once permission is granted.
  const cameras = await listCameras();
  if (!deviceId) {
    const best = bestRearCamera(cameras);
    if (best && best !== stream.getVideoTracks()[0]?.getSettings().deviceId) {
      stream.getTracks().forEach((t) => t.stop());
      stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: best } }, audio: false });
    }
  }
  const track = stream.getVideoTracks()[0];
  await applyCameraTuning(track);

  const video = document.createElement('video');
  video.className = 'qr-video';
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;
  host.replaceChildren(video);

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    video.remove();
  };

  try {
    await video.play();
  } catch (err) {
    stop();
    throw err;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const minInterval = 1000 / MAX_DECODES_PER_SECOND;
  const tick = async () => {
    if (stopped) return;
    const startedAt = performance.now();
    if (context && video.videoWidth && host.clientWidth && host.clientHeight) {
      const r = visibleRegion(video.videoWidth, video.videoHeight, host.clientWidth, host.clientHeight);
      if (canvas.width !== r.width) canvas.width = r.width;
      if (canvas.height !== r.height) canvas.height = r.height;
      context.drawImage(video, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
      try {
        const codes: { rawValue: string }[] = await detector.detect(canvas);
        if (!stopped && codes.length > 0 && codes[0].rawValue) onCode(codes[0].rawValue);
      } catch {
        // One frame that failed to decode; try the next.
      }
    }
    if (stopped) return;
    timer = setTimeout(tick, Math.max(0, minInterval - (performance.now() - startedAt)));
  };
  tick();

  return { cameras, deviceId: track?.getSettings().deviceId, stop };
}

/** Fills a camera picker, shown only when there is more than one camera. */
export function fillCameraSelect(select: HTMLSelectElement | null, scanner: QrScanner) {
  if (!select) return;
  if (scanner.cameras.length <= 1) {
    select.style.display = 'none';
    return;
  }
  select.replaceChildren(
    ...scanner.cameras.map((cam) => {
      const opt = document.createElement('option');
      opt.value = cam.id;
      opt.textContent = cam.label;
      opt.selected = cam.id === scanner.deviceId;
      return opt;
    }),
  );
  select.style.display = 'block';
}
