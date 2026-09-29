/**
 * Find and drop the provenance a generator writes into delivered art (#317):
 * C2PA content credentials (PNG `caBX`, JPEG APP11 / JUMBF), Exif and XMP
 * (JPEG APP1, where the prompt can sit), JPEG comments and PNG text chunks.
 * The repo is public, so none of it may ship.
 *
 * Nothing is ever re-encoded. A file is read as a list of segments (a JPEG's
 * header segments then its scan data, a PNG's chunks), and stripping copies the
 * kept segments byte for byte, so the pixels cannot move. `npm run art:strip`
 * (`scripts/strip-provenance.mjs`) does the writing; `npm run art:cut` and
 * `npm test` refuse a file that still carries any.
 *
 * Known limit: a JPEG is walked only up to its first scan (SOS). Segments
 * between the scans of a progressive JPEG are image data to this code, so
 * provenance placed there is neither found nor dropped.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** The PNG chunks that hold the pixels. */
const PNG_IMAGE_CHUNKS = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT']);
/**
 * An allow-list: the pixels, the colour, density and background information
 * that changes how they show or print (sRGB, gAMA, cHRM, iCCP, sBIT, cICP,
 * mDCV, cLLI, pHYs, bKGD) and the animation chunks of an APNG (acTL, fcTL,
 * fdAT). Everything else goes, including tIME, text and C2PA (`caBX`).
 */
const PNG_KEPT_CHUNKS = new Set([
  ...PNG_IMAGE_CHUNKS,
  'IEND',
  'sRGB',
  'gAMA',
  'cHRM',
  'iCCP',
  'pHYs',
  'sBIT',
  'bKGD',
  'cICP',
  'mDCV',
  'cLLI',
  'acTL',
  'fcTL',
  'fdAT',
]);

const isPng = (bytes) => bytes.subarray(0, 8).equals(PNG_SIGNATURE);
const isJpeg = (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8;

/** A readable name for an APPn segment, so a report says what was found. */
function appName(n, body) {
  const text = body.toString('latin1', 0, 20);
  if (n === 1 && text.startsWith('Exif')) return 'APP1 Exif';
  if (n === 1 && text.startsWith('http://ns.adobe.com/')) return 'APP1 XMP';
  if (n === 11 && text.startsWith('JP')) return 'APP11 JUMBF';
  return `APP${n}`;
}

/**
 * The JPEG as segments: SOI, each header segment up to the first SOS, then the
 * scan data from SOS through the final EOI as one segment, then any bytes after
 * that EOI. APP0, APP14 (Adobe colour
 * transform), an ICC profile in APP2 and every non-APP marker are kept; other
 * APPn and COM are not.
 */
function jpegSegments(bytes) {
  if (!isJpeg(bytes)) throw new Error('not a JPEG');
  const segments = [{ name: 'SOI', start: 0, end: 2, keep: true }];
  let i = 2;
  for (;;) {
    const start = i;
    while (bytes[i] === 0xff && bytes[i + 1] === 0xff) i++; // fill bytes
    if (i + 1 >= bytes.length) throw new Error('JPEG ends before a scan (SOS)');
    if (bytes[i] !== 0xff) throw new Error(`JPEG: expected a marker at byte ${i}`);
    const marker = bytes[i + 1];
    if (marker === 0xda) {
      const eoi = bytes.lastIndexOf(Buffer.from([0xff, 0xd9]));
      const end = eoi > i ? eoi + 2 : bytes.length;
      segments.push({ name: 'scan', start, end, keep: true });
      if (end < bytes.length)
        segments.push({ name: 'trailing data', start: end, end: bytes.length, keep: false });
      return segments;
    }
    if (marker === 0x00) throw new Error(`JPEG: bad marker at byte ${i}`);
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      segments.push({ name: `0x${marker.toString(16)}`, start, end: i + 2, keep: true });
      i += 2;
      continue;
    }
    if (i + 4 > bytes.length) throw new Error(`JPEG: segment at byte ${i} is cut short`);
    const length = bytes.readUInt16BE(i + 2);
    const end = i + 2 + length;
    if (length < 2) throw new Error(`JPEG: segment at byte ${i} has length ${length}`);
    if (end > bytes.length) throw new Error(`JPEG: segment at byte ${i} runs past the end`);
    const body = bytes.subarray(i + 4, end);
    const n = marker - 0xe0;
    let name = `0x${marker.toString(16)}`;
    let keep = true;
    if (marker === 0xfe) {
      name = 'COM';
      keep = false;
    } else if (n >= 0 && n <= 15) {
      name = appName(n, body);
      keep = n === 0 || n === 14 || (n === 2 && body.toString('latin1', 0, 12) === 'ICC_PROFILE\0');
    }
    segments.push({ name, start, end, keep });
    i = end;
  }
}

/**
 * The PNG as segments: the signature, then each chunk up to IEND, then any
 * bytes after IEND. Only the chunks in PNG_KEPT_CHUNKS are kept; an unknown
 * critical chunk (first letter uppercase) is an error, not something to drop.
 */
function pngSegments(bytes) {
  if (!isPng(bytes)) throw new Error('not a PNG');
  const segments = [{ name: 'signature', start: 0, end: 8, keep: true }];
  let i = 8;
  while (i < bytes.length) {
    if (i + 12 > bytes.length) throw new Error(`PNG: chunk at byte ${i} is cut short`);
    const end = i + 12 + bytes.readUInt32BE(i);
    if (end > bytes.length) throw new Error(`PNG: chunk at byte ${i} runs past the end`);
    const name = bytes.toString('latin1', i + 4, i + 8);
    const keep = PNG_KEPT_CHUNKS.has(name);
    if (!keep && /^[A-Z]/.test(name)) throw new Error(`PNG: unknown critical chunk ${name}`);
    segments.push({ name, start: i, end, keep });
    i = end;
    if (name === 'IEND') {
      if (i < bytes.length)
        segments.push({ name: 'trailing data', start: i, end: bytes.length, keep: false });
      return segments;
    }
  }
  throw new Error('PNG ends before IEND');
}

function segmentsOf(bytes) {
  if (isPng(bytes)) return pngSegments(bytes);
  if (isJpeg(bytes)) return jpegSegments(bytes);
  throw new Error('not a PNG or a JPEG');
}

/** The names of what `stripProvenance` would drop from `bytes`; empty when it is clean. */
export function findProvenance(bytes) {
  return [
    ...new Set(
      segmentsOf(bytes)
        .filter((s) => !s.keep)
        .map((s) => s.name),
    ),
  ];
}

/**
 * `bytes` without its provenance: the kept segments copied verbatim. Returns
 * `bytes` itself when there is nothing to drop.
 */
export function stripProvenance(bytes) {
  const segments = segmentsOf(bytes);
  if (segments.every((s) => s.keep)) return bytes;
  return Buffer.concat(segments.filter((s) => s.keep).map((s) => bytes.subarray(s.start, s.end)));
}

/**
 * The bytes a strip must leave untouched: a JPEG's scan data (SOS to the end),
 * a PNG's IHDR, PLTE, tRNS and IDAT chunks in order.
 */
export function scanData(bytes) {
  const segments = segmentsOf(bytes);
  const image = isPng(bytes)
    ? segments.filter((s) => PNG_IMAGE_CHUNKS.has(s.name))
    : segments.filter((s) => s.name === 'scan');
  return Buffer.concat(image.map((s) => bytes.subarray(s.start, s.end)));
}

/** The chunk types of a PNG file, in order. */
export function pngChunks(bytes) {
  return pngSegments(bytes)
    .slice(1)
    .map((s) => s.name);
}
