declare module "gifenc" {
  export type Palette = number[][];
  export function quantize(rgba: Uint8ClampedArray, maxColors: number, options?: Record<string, unknown>): Palette;
  export function applyPalette(rgba: Uint8ClampedArray, palette: Palette): Uint8Array;
  export function GIFEncoder(options?: { auto?: boolean }): {
    writeFrame(index: Uint8Array, width: number, height: number, options: { palette: Palette; delay?: number; repeat?: number; dispose?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
}
