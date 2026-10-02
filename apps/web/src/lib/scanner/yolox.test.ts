import { decodeYolox, letterboxGeometry, nms, rgbaToBgrTensor } from './yolox';

const SIZE = 64; // grillas 8×8, 4×4, 2×2 → 84 anclas
const CLASSES = 80;
const ANCHORS = (SIZE / 8) ** 2 + (SIZE / 16) ** 2 + (SIZE / 32) ** 2;

function rawWith(entries: { anchor: number; values: number[]; cls: number; clsScore: number }[]) {
  const raw = new Float32Array(ANCHORS * (5 + CLASSES));
  for (const e of entries) {
    const o = e.anchor * (5 + CLASSES);
    raw.set(e.values, o);
    raw[o + 5 + e.cls] = e.clsScore;
  }
  return raw;
}

describe('YOLOX en el dispositivo', () => {
  it('letterbox conserva la proporción', () => {
    expect(letterboxGeometry(1280, 720, 416)).toEqual({ ratio: 0.325, width: 416, height: 234 });
  });

  it('convierte RGBA a tensor BGR planar', () => {
    const t = rgbaToBgrTensor(new Uint8ClampedArray([10, 20, 30, 255]), 1);
    expect([...t]).toEqual([30, 20, 10]);
  });

  it('decodifica grillas y escala a la imagen original, solo clases de ganado', () => {
    // Ancla (gx=2, gy=1) de stride 8: centro (2.5, 1.5)·8 = (20, 12), tamaño e^0·8 = 8.
    const raw = rawWith([
      { anchor: 1 * 8 + 2, values: [0.5, 0.5, 0, 0, 0.9], cls: 19, clsScore: 0.8 }, // vaca
      { anchor: 5 * 8 + 5, values: [0.5, 0.5, 0, 0, 0.9], cls: 0, clsScore: 0.9 }, // persona
    ]);
    const boxes = decodeYolox(
      raw,
      SIZE,
      CLASSES,
      0.15,
      { ratio: 0.5, width: 64, height: 32 },
      { width: 128, height: 64 },
    );
    expect(boxes).toHaveLength(1);
    const [x1, y1, x2, y2, score] = boxes[0]!;
    expect([x1, y1, x2, y2]).toEqual([32, 16, 48, 32]);
    expect(score).toBeCloseTo(0.72, 5);
  });

  it('NMS suprime solapamientos y conserva el de mayor score', () => {
    const kept = nms([
      [0, 0, 10, 10, 0.6],
      [1, 1, 11, 11, 0.9],
      [50, 50, 60, 60, 0.5],
    ]);
    expect(kept.map((b) => b[4])).toEqual([0.9, 0.5]);
  });
});
