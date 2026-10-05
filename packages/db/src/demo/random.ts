import { v7 as uuidv7 } from 'uuid';

/** Générateur pseudo-aléatoire déterministe (mulberry32) : même graine, mêmes données. */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(items.length)];
    if (item === undefined) throw new Error('Liste vide');
    return item;
  }

  /** UUID v7 déterministe : horodatage fixe, bits aléatoires tirés de la graine. */
  uuid(timestamp: Date): string {
    const random = new Uint8Array(16);
    for (let i = 0; i < 16; i++) random[i] = this.int(256);
    return uuidv7({ msecs: timestamp.getTime(), random });
  }
}
