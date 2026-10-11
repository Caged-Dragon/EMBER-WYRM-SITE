/**
 * Shared image loading + chroma-key helper used by dragon and food sprites.
 *
 * The AI-generated JPEGs come back with a solid black (food) or off-black
 * (dragon) background. We flood-fill from the borders inward, removing any
 * pixel connected to the border that's close to the sampled corner color.
 * Interior pixels of the same color are preserved.
 */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

export interface ChromaKeyOptions {
  /** Hard threshold — distances <= this become fully transparent */
  hard?: number;
  /** Soft threshold — distances between hard and soft get a gradient alpha */
  soft?: number;
}

export function chromaKeyToCanvas(
  img: HTMLImageElement,
  options: ChromaKeyOptions = {}
): HTMLCanvasElement {
  const HARD = (options.hard ?? 55) ** 2;
  const SOFT = (options.soft ?? 95) ** 2;

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return canvas;
  }
  const data = imageData.data;

  // Sample corners for background color
  const samples: [number, number][] = [
    [2, 2],
    [w - 3, 2],
    [2, h - 3],
    [w - 3, h - 3],
  ];
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (const [x, y] of samples) {
    const i = (y * w + x) * 4;
    sr += data[i];
    sg += data[i + 1];
    sb += data[i + 2];
  }
  sr /= samples.length;
  sg /= samples.length;
  sb /= samples.length;

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];

  // Seed BFS with every border pixel
  for (let x = 0; x < w; x++) {
    stack.push(x);
    stack.push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    stack.push(y * w);
    stack.push(y * w + (w - 1));
  }

  while (stack.length > 0) {
    const p = stack.pop()!;
    if (visited[p]) continue;
    visited[p] = 1;

    const i4 = p * 4;
    const dr = data[i4] - sr;
    const dg = data[i4 + 1] - sg;
    const db = data[i4 + 2] - sb;
    const distSq = dr * dr + dg * dg + db * db;
    if (distSq > SOFT) continue;

    if (distSq <= HARD) {
      data[i4 + 3] = 0;
    } else {
      const t = (distSq - HARD) / (SOFT - HARD);
      data[i4 + 3] = Math.floor(255 * t);
    }

    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function rotate180ToCanvas(
  src: CanvasImageSource,
  w: number,
  h: number
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d')!;
  cx.translate(w, h);
  cx.rotate(Math.PI);
  cx.drawImage(src, 0, 0);
  return c;
}

export function flipHorizontalToCanvas(
  src: CanvasImageSource,
  w: number,
  h: number
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d')!;
  cx.translate(w, 0);
  cx.scale(-1, 1);
  cx.drawImage(src, 0, 0);
  return c;
}
