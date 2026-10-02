/**
 * Detector YOLOX en el celular con ONNX Runtime Web (WebGPU si está disponible, si no WASM).
 * El runtime se carga desde /ort/ (copiado del paquete onnxruntime-web en el build) y el modelo
 * desde /models/; ambos quedan en caché del service worker para escanear sin señal.
 */
import type * as Ort from 'onnxruntime-web';
import type { Box } from './tracker';
import { decodeYolox, letterboxGeometry, rgbaToBgrTensor } from './yolox';

export const SCANNER_MODEL = {
  name: 'yolox_nano',
  version: '0.1.1rc0',
  url: '/models/yolox_nano.onnx',
};
export const INPUT_SIZE = 416;
/** Umbral de detección del celular (el tracker separa luego altas/bajas como en el servidor). */
export const DEVICE_SCORE_THRESHOLD = 0.15;

export type InferenceBackend = 'webgpu' | 'wasm';

type OrtModule = typeof Ort;

/**
 * Archivos del motor según el dispositivo. En iPhone/iPad se usa el paquete solo-WASM (motor de
 * ~14 MB): el de WebGPU trae un WASM "asyncify" de ~27 MB que, compilado, ocupa mucha más
 * memoria y contribuía a que iOS cerrara la página.
 */
export function ortBundle(): { module: string; files: string[] } {
  return prefersWasm()
    ? {
        module: '/ort/ort.wasm.min.mjs',
        files: ['/ort/ort-wasm-simd-threaded.mjs', '/ort/ort-wasm-simd-threaded.wasm'],
      }
    : {
        module: '/ort/ort.webgpu.min.mjs',
        files: [
          '/ort/ort-wasm-simd-threaded.asyncify.mjs',
          '/ort/ort-wasm-simd-threaded.asyncify.wasm',
        ],
      };
}

let ortPromise: Promise<OrtModule> | null = null;
function loadOrt(): Promise<OrtModule> {
  // Import en tiempo de ejecución, fuera del bundler (archivo estático en /ort/).
  ortPromise ??= import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ ortBundle().module
  ) as Promise<OrtModule>;
  return ortPromise;
}

/**
 * iPhone/iPad: todos los navegadores usan WebKit, y ONNX Runtime con WebGPU en WebKit hace que
 * iOS cierre la página por memoria a los pocos segundos de escanear ("Ocurrió un problema varias
 * veces"). Ahí se usa WASM, más lento pero estable. `?ia=webgpu` en la URL fuerza WebGPU para
 * probar.
 */
export function prefersWasm(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('ia') === 'webgpu'
  )
    return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export class OrtYoloxDetector {
  /** Buffer de entrada reutilizado entre cuadros (evita 2 MB de basura por inferencia). */
  private readonly input = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);

  private constructor(
    private readonly ort: OrtModule,
    private readonly session: Ort.InferenceSession,
    readonly backend: InferenceBackend,
    private readonly canvas: OffscreenCanvas | HTMLCanvasElement,
  ) {}

  static async create(onProgress?: (message: string) => void): Promise<OrtYoloxDetector> {
    onProgress?.('Cargando motor de IA…');
    const ort = await loadOrt();
    ort.env.wasm.wasmPaths = '/ort/';
    // Sin aislamiento cross-origin no hay SharedArrayBuffer: un hilo.
    ort.env.wasm.numThreads = globalThis.crossOriginIsolated
      ? Math.min(4, navigator.hardwareConcurrency || 1)
      : 1;
    onProgress?.('Cargando modelo YOLOX-Nano…');
    const response = await fetch(SCANNER_MODEL.url);
    if (!response.ok) throw new Error(`No se pudo cargar el modelo (${response.status})`);
    const model = new Uint8Array(await response.arrayBuffer());
    let session: Ort.InferenceSession | null = null;
    let backend: InferenceBackend = 'wasm';
    if ('gpu' in navigator && !prefersWasm()) {
      try {
        session = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'] });
        backend = 'webgpu';
      } catch {
        session = null;
      }
    }
    session ??= await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE)
        : Object.assign(document.createElement('canvas'), {
            width: INPUT_SIZE,
            height: INPUT_SIZE,
          });
    return new OrtYoloxDetector(ort, session, backend, canvas);
  }

  /** Detecta bovinos en el cuadro actual; cajas en píxeles del cuadro de origen. */
  async detect(source: CanvasImageSource, width: number, height: number): Promise<Box[]> {
    const lb = letterboxGeometry(width, height, INPUT_SIZE);
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true }) as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D;
    ctx.fillStyle = 'rgb(114,114,114)';
    ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
    ctx.drawImage(source, 0, 0, lb.width, lb.height);
    const pixels = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
    const tensor = new this.ort.Tensor('float32', rgbaToBgrTensor(pixels, INPUT_SIZE, this.input), [
      1,
      3,
      INPUT_SIZE,
      INPUT_SIZE,
    ]);
    const inputName = this.session.inputNames[0]!;
    const outputs = await this.session.run({ [inputName]: tensor });
    const output = outputs[this.session.outputNames[0]!]!;
    const dims = output.dims;
    const raw = (await output.getData()) as Float32Array;
    tensor.dispose();
    output.dispose();
    return decodeYolox(raw, INPUT_SIZE, Number(dims[2]) - 5, DEVICE_SCORE_THRESHOLD, lb, {
      width,
      height,
    });
  }
}
