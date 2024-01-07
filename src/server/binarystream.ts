import * as fs from "fs/promises";
import { Buffer } from "buffer";

export class BufferedOutputStream {
    private filename: string;
    private bufferSize: number;
    private buffer: Buffer;
    private offset: number;
    private fileHandle: fs.FileHandle | null;

    constructor(filename: string, bufferSize: number = 1024 * 1024 * 10) {
        this.filename = filename;
        this.bufferSize = bufferSize;
        this.buffer = Buffer.alloc(bufferSize);
        this.offset = 0;
        this.fileHandle = null;
    }

    async open(): Promise<void> {
        this.fileHandle = await fs.open(this.filename, "w");
    }

    async close(): Promise<void> {
        if (this.offset > 0) {
            await this.writeBuffer();
        }
        if (this.fileHandle) {
            await this.fileHandle.close();
        }
    }

    async flush(): Promise<void> {
        if (this.offset > 0) {
            await this.writeBuffer();
            this.offset = 0;
        }
    }

    private async writeBuffer(): Promise<void> {
        if (this.offset > 0 && this.fileHandle) {
            await this.fileHandle.write(this.buffer, 0, this.offset);
            this.offset = 0;
        }
    }

    async write(data: Buffer): Promise<void> {
        if (this.offset + data.length > this.bufferSize) {
            await this.flush();
        }

        data.copy(this.buffer, this.offset);
        this.offset += data.length;
    }

    async writeInt32(value: number): Promise<void> {
        const data = Buffer.alloc(4);
        data.writeInt32BE(value, 0);
        await this.write(data);
    }

    async writeDouble(value: number): Promise<void> {
        const data = Buffer.alloc(8);
        data.writeDoubleBE(value, 0);
        await this.write(data);
    }

    async writeDoubleArray(array: number[]): Promise<void> {
        const data = Buffer.alloc(array.length * 8);
        for (let i = 0, o = 0; i < array.length; i++, o += 8) {
            data.writeDoubleBE(array[i], o);
        }
        await this.write(data);
    }

    async writeString(str: string): Promise<void> {
        const data = Buffer.from(str, "utf-8");
        await this.writeInt32(data.length);
        await this.write(data);
    }
}

export class BufferedInputStream {
    private fileHandle: fs.FileHandle | null = null;
    private buffer: Buffer;
    private pos: number;
    private count: number;
    private bufferSize: number;

    constructor(private filename: string, bufferSize: number = 1024 * 1024 * 1) {
        this.bufferSize = bufferSize;
        this.buffer = Buffer.alloc(bufferSize);
        this.pos = 0;
        this.count = 0; // No data read yet
    }

    async open(): Promise<void> {
        this.fileHandle = await fs.open(this.filename, "r");
    }

    async close(): Promise<void> {
        if (this.fileHandle) {
            await this.fileHandle.close();
        }
    }

    private async refill(): Promise<boolean> {
        if (!this.fileHandle) {
            throw new Error("File handle is not initialized");
        }

        if (this.pos >= this.count) {
            // Refill the buffer
            const { bytesRead } = await this.fileHandle.read(this.buffer, 0, this.bufferSize, null);
            if (bytesRead === 0) {
                return false; // EOF reached
            }
            this.count = bytesRead;
            this.pos = 0;
        }

        return true;
    }

    async read(size: number): Promise<Buffer> {
        let outputBuffer = Buffer.alloc(size);
        let bytesReadTotal = 0;

        while (bytesReadTotal < size) {
            if (this.pos >= this.count) {
                // Need to refill the buffer
                const refillSuccess = await this.refill();
                if (!refillSuccess) {
                    throw new Error("Reading past end of file");
                }
            }

            // Calculate how much to read: either the remainder of the buffer or the remainder of the requested size
            const bytesToRead = Math.min(this.count - this.pos, size - bytesReadTotal);
            const end = this.pos + bytesToRead;
            this.buffer.copy(outputBuffer, bytesReadTotal, this.pos, end);
            bytesReadTotal += bytesToRead;
            this.pos = end;
        }

        return outputBuffer;
    }

    async readInt32(): Promise<number> {
        const data = await this.read(4);
        return data.readInt32BE(0);
    }

    async readDouble(): Promise<number> {
        const data = await this.read(8);
        return data.readDoubleBE(0);
    }

    async readDoubleArray(n: number): Promise<number[]> {
        const data = await this.read(n * 8);
        const array = new Array<number>(n);
        for (let i = 0, o = 0; i < n; i++, o += 8) {
            array[i] = data.readDoubleBE(o);
        }
        return array;
    }

    async readString(): Promise<string> {
        const length = await this.readInt32();
        const data = await this.read(length);
        return data.toString("utf-8");
    }
}

export class MemoryBuffer {
    offset = 0;
    constructor(readonly buffer: Buffer) {}

    async readInt32() {
        const value = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return value;
    }

    async readString() {
        const length = await this.readInt32();
        const value = this.buffer.toString("utf-8", this.offset, this.offset + length);
        this.offset += length;
        return value;
    }

    async readDoubleArray(n: number) {
        const array = new Array(n);
        for (let i = 0; i < n; i++) {
            array[i] = this.buffer.readDoubleBE(this.offset);
            this.offset += 8;
        }
        return array;
    }
}
