import {
  openSync,
  writeSync,
  closeSync,
  createReadStream,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { uploadMedia } from "./s3";

// Input frames from all speakers use the same server clock. Only the current
// second and the tail of a frame crossing into the next second stay in RAM.
export class MixedRecording {
  private readonly path = join(tmpdir(), "sahva-" + randomUUID() + ".wav");
  private readonly fd = openSync(this.path, "wx", 0o600);
  private readonly rate = 16000;
  private readonly tiles = new Map<number, Int32Array>();
  private flushed = 0;
  private end = 0;
  private closed = false;

  append(offsetMs: number, frame: Buffer) {
    const start = Math.max(
      this.flushed,
      Math.floor((offsetMs * this.rate) / 1000),
    );
    const count = Math.floor(frame.length / 2);
    if (!count || count > this.rate) return;
    this.flush(Math.floor(start / this.rate) * this.rate);
    for (let i = 0; i < count; i++) {
      const pos = start + i,
        index = Math.floor(pos / this.rate);
      let tile = this.tiles.get(index);
      if (!tile) {
        tile = new Int32Array(this.rate);
        this.tiles.set(index, tile);
      }
      tile[pos % this.rate] += frame.readInt16LE(i * 2);
    }
    this.end = Math.max(this.end, start + count);
  }
  private flush(until: number) {
    while (this.flushed < until) {
      const size = Math.min(this.rate, until - this.flushed),
        index = Math.floor(this.flushed / this.rate);
      const tile = this.tiles.get(index);
      if (tile) {
        const out = Buffer.allocUnsafe(size * 2);
        for (let i = 0; i < size; i++)
          out.writeInt16LE(Math.max(-32768, Math.min(32767, tile[i])), 2 * i);
        writeSync(this.fd, out, 0, out.length, 44 + this.flushed * 2);
        this.tiles.delete(index);
      }
      this.flushed += size;
    }
  }
  async upload(id: string) {
    try {
      this.flush(this.end);
      const size = this.end * 2,
        header = Buffer.alloc(44);
      header.write("RIFF");
      header.writeUInt32LE(size + 36, 4);
      header.write("WAVEfmt ", 8);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22);
      header.writeUInt32LE(this.rate, 24);
      header.writeUInt32LE(this.rate * 2, 28);
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      header.write("data", 36);
      header.writeUInt32LE(size, 40);
      writeSync(this.fd, header, 0, 44, 0);
      closeSync(this.fd);
      this.closed = true;
      const key = "recordings/" + id + "/mixed.wav";
      for (let attempt = 0; ; attempt++) {
        const stream = createReadStream(this.path);
        try {
          return await uploadMedia(key, stream, "audio/wav", size + 44);
        } catch (error) {
          if (attempt === 2) throw error;
        } finally {
          stream.destroy();
        }
      }
    } finally {
      if (!this.closed) closeSync(this.fd);
      unlinkSync(this.path);
    }
  }
}
