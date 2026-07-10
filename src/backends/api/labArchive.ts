import * as fs from "fs";
import * as path from "path";
import { compose, Readable } from "stream";
import { createGzip } from "zlib";

const TAR_BLOCK_SIZE = 512;
const FILE_READ_CHUNK_BYTES = 64 * 1024;
export const MAX_ARCHIVE_INPUT_BYTES = 256 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRY_COUNT = 10_000;
export const LAB_ARCHIVE_EXCLUDED_DIRECTORY_NAMES = [
  ".git",
  "node_modules",
  "dist",
  "out"
] as const;
const EXCLUDED_DIRECTORY_NAMES = new Set<string>(LAB_ARCHIVE_EXCLUDED_DIRECTORY_NAMES);

interface ArchiveEntry {
  absolute: string;
  relative: string;
  stat: fs.Stats;
}

export interface LabArchiveInventory {
  root: string;
  rootRealPath: string;
  topologyPath: string;
  entries: ArchiveEntry[];
  includedFiles: string[];
  totalBytes: number;
}

interface CollectionTotals {
  bytes: number;
  entries: number;
}

function writeString(buffer: Buffer, offset: number, length: number, value: string): void {
  buffer.write(value, offset, Math.min(length, Buffer.byteLength(value)), "utf8");
}

function writeOctal(buffer: Buffer, offset: number, length: number, value: number): void {
  const encoded = Math.max(0, value)
    .toString(8)
    .padStart(length - 1, "0")
    .slice(-(length - 1));
  writeString(buffer, offset, length, `${encoded}\0`);
}

function splitTarPath(relativePath: string): { name: string; prefix: string } {
  const normalized = relativePath.split(path.sep).join("/");
  if (Buffer.byteLength(normalized) <= 100) {
    return { name: normalized, prefix: "" };
  }
  const parts = normalized.split("/");
  for (let index = parts.length - 1; index > 0; index--) {
    const prefix = parts.slice(0, index).join("/");
    const name = parts.slice(index).join("/");
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix };
    }
  }
  throw new Error(`Path is too long for the lab archive: ${relativePath}`);
}

function tarHeader(relativePath: string, stat: fs.Stats, type: "file" | "directory"): Buffer {
  const header = Buffer.alloc(TAR_BLOCK_SIZE, 0);
  const { name, prefix } = splitTarPath(relativePath);
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, stat.mode & 0o777);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, type === "file" ? stat.size : 0);
  writeOctal(header, 136, 12, Math.floor(stat.mtimeMs / 1000));
  header.fill(0x20, 148, 156);
  header[156] = type === "file" ? 0x30 : 0x35;
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  writeString(header, 345, 155, prefix);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const encodedChecksum = checksum.toString(8).padStart(6, "0").slice(-6);
  writeString(header, 148, 8, `${encodedChecksum}\0 `);
  return header;
}

function pathIsWithinRoot(rootRealPath: string, candidateRealPath: string): boolean {
  const relative = path.relative(rootRealPath, candidateRealPath);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

async function assertRealPathWithinRoot(rootRealPath: string, absolutePath: string): Promise<void> {
  const realPath = await fs.promises.realpath(absolutePath);
  if (!pathIsWithinRoot(rootRealPath, realPath)) {
    throw new Error(`Archive entry escaped the topology directory: ${absolutePath}`);
  }
}

function sameFilesystemObject(expected: fs.Stats, actual: fs.Stats): boolean {
  if (expected.dev !== 0 || expected.ino !== 0 || actual.dev !== 0 || actual.ino !== 0) {
    return expected.dev === actual.dev && expected.ino === actual.ino;
  }
  return expected.birthtimeMs === actual.birthtimeMs;
}

function assertEntryTypeAndIdentity(entry: ArchiveEntry, actual: fs.Stats): void {
  const expectedDirectory = entry.stat.isDirectory();
  if (
    actual.isSymbolicLink() ||
    (expectedDirectory ? !actual.isDirectory() : !actual.isFile()) ||
    !sameFilesystemObject(entry.stat, actual)
  ) {
    throw new Error(`Archive entry changed after confirmation: ${entry.relative}`);
  }
  if (
    !expectedDirectory &&
    (actual.size !== entry.stat.size || actual.mtimeMs !== entry.stat.mtimeMs)
  ) {
    throw new Error(`Archive file changed after confirmation: ${entry.relative}`);
  }
}

export function assertLabArchiveLimits(entryCount: number, totalBytes: number): void {
  if (entryCount > MAX_ARCHIVE_ENTRY_COUNT) {
    throw new Error(
      `The topology directory has too many archive entries (maximum ${MAX_ARCHIVE_ENTRY_COUNT}).`
    );
  }
  if (totalBytes > MAX_ARCHIVE_INPUT_BYTES) {
    throw new Error("The topology directory is too large to upload (maximum 256 MiB).");
  }
}

async function collectEntries(
  root: string,
  rootRealPath: string,
  current: string,
  entries: ArchiveEntry[],
  totals: CollectionTotals
): Promise<void> {
  await assertRealPathWithinRoot(rootRealPath, current);
  const dirents = await fs.promises.readdir(current, { withFileTypes: true });
  dirents.sort((left, right) => left.name.localeCompare(right.name));
  for (const dirent of dirents) {
    if (dirent.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(dirent.name)) continue;
    const absolute = path.join(current, dirent.name);
    const stat = await fs.promises.lstat(absolute);
    if (stat.isSymbolicLink()) continue;
    const relative = path.relative(root, absolute);
    if (stat.isDirectory()) {
      entries.push({ absolute, relative, stat });
      totals.entries++;
      assertLabArchiveLimits(totals.entries, totals.bytes);
      await collectEntries(root, rootRealPath, absolute, entries, totals);
    } else if (stat.isFile()) {
      entries.push({ absolute, relative, stat });
      totals.entries++;
      totals.bytes += stat.size;
      assertLabArchiveLimits(totals.entries, totals.bytes);
    }
  }
}

export async function inspectLabArchive(topologyPath: string): Promise<LabArchiveInventory> {
  const resolvedTopology = path.resolve(topologyPath);
  const topologyStat = await fs.promises.lstat(resolvedTopology);
  if (topologyStat.isSymbolicLink() || !topologyStat.isFile()) {
    throw new Error(`Topology source is not a file: ${topologyPath}`);
  }
  const root = path.dirname(resolvedTopology);
  const rootRealPath = await fs.promises.realpath(root);
  await assertRealPathWithinRoot(rootRealPath, resolvedTopology);
  const entries: ArchiveEntry[] = [];
  const totals: CollectionTotals = { bytes: 0, entries: 0 };
  await collectEntries(root, rootRealPath, root, entries, totals);
  const collectedTopology = entries.find(
    (entry) => path.resolve(entry.absolute) === resolvedTopology
  );
  if (collectedTopology === undefined) {
    throw new Error("The topology source changed while preparing the archive.");
  }
  assertEntryTypeAndIdentity(collectedTopology, topologyStat);
  return {
    root,
    rootRealPath,
    topologyPath: resolvedTopology,
    entries,
    includedFiles: entries.filter((entry) => entry.stat.isFile()).map((entry) => entry.relative),
    totalBytes: totals.bytes
  };
}

export function hasBundledLabFiles(inventory: LabArchiveInventory): boolean {
  const annotationsPath = `${inventory.topologyPath}.annotations.json`;
  return inventory.entries.some(
    (entry) =>
      entry.stat.isFile() &&
      path.resolve(entry.absolute) !== inventory.topologyPath &&
      path.resolve(entry.absolute) !== annotationsPath
  );
}

async function assertEntryStillSafe(
  inventory: LabArchiveInventory,
  entry: ArchiveEntry
): Promise<fs.Stats> {
  const current = await fs.promises.lstat(entry.absolute);
  assertEntryTypeAndIdentity(entry, current);
  await assertRealPathWithinRoot(inventory.rootRealPath, entry.absolute);
  return current;
}

async function openArchiveFile(
  inventory: LabArchiveInventory,
  entry: ArchiveEntry
): Promise<fs.promises.FileHandle> {
  const noFollow = (fs.constants as typeof fs.constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  const handle = await fs.promises.open(entry.absolute, fs.constants.O_RDONLY | noFollow);
  try {
    const [openedStat] = await Promise.all([handle.stat(), assertEntryStillSafe(inventory, entry)]);
    assertEntryTypeAndIdentity(entry, openedStat);
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function* readFileHandleExactly(
  handle: fs.promises.FileHandle,
  entry: ArchiveEntry
): AsyncGenerator<Buffer> {
  let offset = 0;
  while (offset < entry.stat.size) {
    const chunk = Buffer.allocUnsafe(Math.min(FILE_READ_CHUNK_BYTES, entry.stat.size - offset));
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset);
    if (bytesRead === 0) {
      throw new Error(`Archive file was truncated while reading: ${entry.relative}`);
    }
    offset += bytesRead;
    yield bytesRead === chunk.length ? chunk : chunk.subarray(0, bytesRead);
  }
}

async function* createTarChunks(inventory: LabArchiveInventory): AsyncGenerator<Buffer> {
  for (const entry of inventory.entries) {
    const isDirectory = entry.stat.isDirectory();
    await assertEntryStillSafe(inventory, entry);
    yield tarHeader(entry.relative, entry.stat, isDirectory ? "directory" : "file");
    if (!isDirectory) {
      const handle = await openArchiveFile(inventory, entry);
      try {
        yield* readFileHandleExactly(handle, entry);
        const finalStat = await handle.stat();
        assertEntryTypeAndIdentity(entry, finalStat);
      } finally {
        await handle.close();
      }
      const padding = (TAR_BLOCK_SIZE - (entry.stat.size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
      if (padding > 0) yield Buffer.alloc(padding);
    }
  }
  yield Buffer.alloc(TAR_BLOCK_SIZE * 2);
}

export async function createLabArchiveStream(
  topologyPath: string,
  existingInventory?: LabArchiveInventory
): Promise<Readable> {
  const inventory = existingInventory ?? (await inspectLabArchive(topologyPath));
  return compose(Readable.from(createTarChunks(inventory)), createGzip());
}

export async function createLabArchiveMultipartBody(
  topologyPath: string,
  boundary: string,
  existingInventory?: LabArchiveInventory
): Promise<Readable> {
  const archive = await createLabArchiveStream(topologyPath, existingInventory);
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="labArchive"; filename="lab-archive.tar.gz"\r\nContent-Type: application/gzip\r\n\r\n`
  );
  const ending = Buffer.from(`\r\n--${boundary}--\r\n`);
  async function* multipartChunks(): AsyncGenerator<Buffer> {
    yield preamble;
    for await (const chunk of archive) {
      yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    }
    yield ending;
  }
  return Readable.from(multipartChunks());
}
