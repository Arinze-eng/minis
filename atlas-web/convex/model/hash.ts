/** Hamming distance between two 16-hex-char dHashes; 64 when either is missing or malformed. */
export function hammingHex(a?: string, b?: string): number {
  if (!a || !b || a.length !== 16 || b.length !== 16) return 64;
  let distance = 0;
  for (let i = 0; i < 16; i += 1) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

/** Near-duplicate threshold for 64-bit dHash (≤ 6 differing bits ≈ same photo/garment). */
export const DUPLICATE_DISTANCE = 6;
