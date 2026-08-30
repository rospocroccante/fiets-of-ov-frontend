/**
 * Extract ligature names (e.g. "location_on") from a WOFF2 font, using only
 * Node built-ins. No fontTools, no npm dependencies.
 *
 * The approach: decode the WOFF2 container far enough to locate `cmap` and
 * `GSUB` in the Brotli-decompressed table stream, build a glyph -> character
 * map from the cmap, then walk the GSUB ligature substitutions and spell each
 * ligature back out as the characters of its input glyph sequence.
 *
 * Limitations are documented at the bottom of this file.
 */

import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";

/** The 63 tags a WOFF2 table directory entry can reference by 6-bit index. */
const KNOWN_TAGS: readonly string[] = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post",
  "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT",
  "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea",
  "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH",
  "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop",
  "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];

const WOFF2_SIGNATURE = 0x774f4632; // "wOF2"
const WOFF2_HEADER_SIZE = 48;
const CUSTOM_TAG_ESCAPE = 0x3f;

/** A cursor over a buffer, big-endian, as every OpenType structure is. */
class Reader {
  private readonly view: DataView;

  public pos: number;

  constructor(private readonly buf: Uint8Array, start = 0) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this.pos = start;
  }

  get length(): number {
    return this.buf.byteLength;
  }

  u8(): number {
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }

  u16(): number {
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }

  i16(): number {
    const v = this.view.getInt16(this.pos);
    this.pos += 2;
    return v;
  }

  u32(): number {
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }

  tag(): string {
    let s = "";
    for (let i = 0; i < 4; i += 1) s += String.fromCharCode(this.u8());
    return s;
  }

  /** Variable-length unsigned integer, 7 bits per byte, MSB = continuation. */
  uintBase128(): number {
    let value = 0;
    for (let i = 0; i < 5; i += 1) {
      const b = this.u8();
      // Leading zeroes are not permitted and the value must fit in 32 bits.
      if (i === 0 && b === 0x80) throw new Error("UIntBase128: leading zero");
      if (value > 0x01ffffff) throw new Error("UIntBase128: overflow");
      value = value * 128 + (b & 0x7f);
      if ((b & 0x80) === 0) return value;
    }
    throw new Error("UIntBase128: too long");
  }
}

interface Woff2Table {
  tag: string;
  offset: number;
  length: number;
}

/** Read the WOFF2 header and directory, then Brotli-decompress the payload. */
function decodeWoff2(raw: Uint8Array): { data: Uint8Array; tables: Map<string, Woff2Table> } {
  const r = new Reader(raw);
  if (r.u32() !== WOFF2_SIGNATURE) throw new Error("not a WOFF2 file");
  const flavor = r.u32();
  r.u32(); // length
  const numTables = r.u16();
  r.u16(); // reserved
  r.u32(); // totalSfntSize
  const totalCompressedSize = r.u32();
  r.pos = WOFF2_HEADER_SIZE;

  if (flavor === 0x74746366) throw new Error("WOFF2 font collections are not supported");

  const tables = new Map<string, Woff2Table>();
  const entries: { tag: string; length: number }[] = [];

  for (let i = 0; i < numTables; i += 1) {
    const flags = r.u8();
    const tagIndex = flags & 0x3f;
    const transformVersion = (flags >> 6) & 0x03;
    const tag = tagIndex === CUSTOM_TAG_ESCAPE ? r.tag() : KNOWN_TAGS[tagIndex];
    if (tag === undefined) throw new Error(`unknown table tag index ${tagIndex}`);

    const origLength = r.uintBase128();

    // glyf/loca invert the convention: for them version 3 is the null
    // transform, so the default version 0 means TRANSFORMED. Every other
    // table treats version 0 as "no transform".
    const nullTransform = tag === "glyf" || tag === "loca"
      ? transformVersion === 3
      : transformVersion === 0;

    // The transformed length is only present when a transform applies, and it
    // is that length which the table occupies in the decompressed stream.
    const length = nullTransform ? origLength : r.uintBase128();
    entries.push({ tag, length });
  }

  // Tables follow the directory in order, packed with no padding between them.
  const compressed = raw.subarray(r.pos, r.pos + totalCompressedSize);
  const data = new Uint8Array(brotliDecompressSync(compressed));

  let offset = 0;
  for (const entry of entries) {
    tables.set(entry.tag, { tag: entry.tag, offset, length: entry.length });
    offset += entry.length;
  }
  return { data, tables };
}

function sliceTable(
  data: Uint8Array,
  tables: Map<string, Woff2Table>,
  tag: string,
): Uint8Array | undefined {
  const entry = tables.get(tag);
  if (entry === undefined) return undefined;
  const end = entry.offset + entry.length;
  if (end > data.byteLength) throw new Error(`table ${tag} runs past the decompressed stream`);
  return data.subarray(entry.offset, end);
}

/** Map codepoint -> glyph id for one cmap subtable (format 4 or format 12). */
function parseCmapSubtable(cmap: Uint8Array, subOffset: number): Map<number, number> {
  const map = new Map<number, number>();
  const r = new Reader(cmap, subOffset);
  const format = r.u16();

  if (format === 4) {
    r.u16(); // length
    r.u16(); // language
    const segCountX2 = r.u16();
    const segCount = segCountX2 / 2;
    r.u16(); // searchRange
    r.u16(); // entrySelector
    r.u16(); // rangeShift

    const endCodes: number[] = [];
    for (let i = 0; i < segCount; i += 1) endCodes.push(r.u16());
    r.u16(); // reservedPad
    const startCodes: number[] = [];
    for (let i = 0; i < segCount; i += 1) startCodes.push(r.u16());
    const idDeltas: number[] = [];
    for (let i = 0; i < segCount; i += 1) idDeltas.push(r.i16());
    const rangeOffsetBase = r.pos;
    const idRangeOffsets: number[] = [];
    for (let i = 0; i < segCount; i += 1) idRangeOffsets.push(r.u16());

    for (let seg = 0; seg < segCount; seg += 1) {
      const start = startCodes[seg];
      const end = endCodes[seg];
      if (start === undefined || end === undefined || start === 0xffff) continue;
      const delta = idDeltas[seg] ?? 0;
      const rangeOffset = idRangeOffsets[seg] ?? 0;
      for (let cp = start; cp <= end && cp !== 0x10000; cp += 1) {
        let gid: number;
        if (rangeOffset === 0) {
          gid = (cp + delta) & 0xffff;
        } else {
          // glyphIdArray is addressed relative to the idRangeOffset slot.
          const at = rangeOffsetBase + seg * 2 + rangeOffset + (cp - start) * 2;
          if (at + 1 >= cmap.byteLength) continue;
          const g = new Reader(cmap, at).u16();
          if (g === 0) continue;
          gid = (g + delta) & 0xffff;
        }
        if (gid !== 0) map.set(cp, gid);
      }
    }
    return map;
  }

  if (format === 12) {
    r.u16(); // reserved
    r.u32(); // length
    r.u32(); // language
    const nGroups = r.u32();
    for (let i = 0; i < nGroups; i += 1) {
      const startChar = r.u32();
      const endChar = r.u32();
      const startGlyph = r.u32();
      for (let cp = startChar; cp <= endChar; cp += 1) {
        map.set(cp, startGlyph + (cp - startChar));
      }
    }
    return map;
  }

  throw new Error(`unsupported cmap subtable format ${format}`);
}

/** Build glyph id -> character from the best available Unicode cmap subtable. */
function parseCmap(cmap: Uint8Array): { byGlyph: Map<number, string>; codepoints: number } {
  const r = new Reader(cmap);
  r.u16(); // version
  const numTables = r.u16();

  interface Candidate { score: number; offset: number }
  const candidates: Candidate[] = [];

  for (let i = 0; i < numTables; i += 1) {
    const platformId = r.u16();
    const encodingId = r.u16();
    const offset = r.u32();
    // Prefer full-repertoire Unicode, then BMP Unicode, then the Windows pair.
    let score = -1;
    if (platformId === 3 && encodingId === 10) score = 5;
    else if (platformId === 0 && (encodingId === 4 || encodingId === 6)) score = 4;
    else if (platformId === 3 && encodingId === 1) score = 3;
    else if (platformId === 0) score = 2;
    if (score >= 0) candidates.push({ score, offset });
  }
  if (candidates.length === 0) throw new Error("no Unicode cmap subtable found");
  candidates.sort((a, b) => b.score - a.score);

  let chosen: Map<number, number> | undefined;
  for (const candidate of candidates) {
    try {
      chosen = parseCmapSubtable(cmap, candidate.offset);
      break;
    } catch {
      // Fall through to the next candidate if the format is unsupported.
    }
  }
  if (chosen === undefined) throw new Error("no usable cmap subtable (formats 4 and 12 only)");

  const byGlyph = new Map<number, string>();
  for (const [cp, gid] of chosen) {
    // First codepoint wins, so the mapping stays deterministic when several
    // codepoints share a glyph.
    if (!byGlyph.has(gid)) byGlyph.set(gid, String.fromCodePoint(cp));
  }
  return { byGlyph, codepoints: chosen.size };
}

/** Glyph ids covered by a Coverage table, in coverage-index order. */
function parseCoverage(gsub: Uint8Array, offset: number): number[] {
  const r = new Reader(gsub, offset);
  const format = r.u16();
  const glyphs: number[] = [];

  if (format === 1) {
    const count = r.u16();
    for (let i = 0; i < count; i += 1) glyphs.push(r.u16());
    return glyphs;
  }
  if (format === 2) {
    const rangeCount = r.u16();
    for (let i = 0; i < rangeCount; i += 1) {
      const start = r.u16();
      const end = r.u16();
      const startIndex = r.u16();
      for (let g = start; g <= end; g += 1) glyphs[startIndex + (g - start)] = g;
    }
    return glyphs;
  }
  throw new Error(`unsupported Coverage format ${format}`);
}

/** One ligature: the glyph sequence that composes it. */
type GlyphSequence = number[];

function parseLigatureSubst(gsub: Uint8Array, offset: number, out: GlyphSequence[]): void {
  const r = new Reader(gsub, offset);
  const substFormat = r.u16();
  if (substFormat !== 1) return; // Only format 1 is defined for LigatureSubst.

  const coverageOffset = r.u16();
  const ligatureSetCount = r.u16();
  const setOffsets: number[] = [];
  for (let i = 0; i < ligatureSetCount; i += 1) setOffsets.push(r.u16());

  const coverage = parseCoverage(gsub, offset + coverageOffset);

  for (let i = 0; i < ligatureSetCount; i += 1) {
    const firstGlyph = coverage[i];
    const setOffset = setOffsets[i];
    if (firstGlyph === undefined || setOffset === undefined) continue;

    const setBase = offset + setOffset;
    const sr = new Reader(gsub, setBase);
    const ligatureCount = sr.u16();
    const ligOffsets: number[] = [];
    for (let j = 0; j < ligatureCount; j += 1) ligOffsets.push(sr.u16());

    for (const ligOffset of ligOffsets) {
      const lr = new Reader(gsub, setBase + ligOffset);
      lr.u16(); // ligatureGlyph, the composed result, not needed for the name
      const componentCount = lr.u16();
      const seq: GlyphSequence = [firstGlyph];
      for (let k = 1; k < componentCount; k += 1) seq.push(lr.u16());
      out.push(seq);
    }
  }
}

function collectLigatureSequences(gsub: Uint8Array): GlyphSequence[] {
  const r = new Reader(gsub);
  r.u16(); // majorVersion
  r.u16(); // minorVersion
  r.u16(); // scriptListOffset
  r.u16(); // featureListOffset
  const lookupListOffset = r.u16();

  const lr = new Reader(gsub, lookupListOffset);
  const lookupCount = lr.u16();
  const lookupOffsets: number[] = [];
  for (let i = 0; i < lookupCount; i += 1) lookupOffsets.push(lr.u16());

  const sequences: GlyphSequence[] = [];

  for (const lookupOffset of lookupOffsets) {
    const base = lookupListOffset + lookupOffset;
    const kr = new Reader(gsub, base);
    const lookupType = kr.u16();
    kr.u16(); // lookupFlag
    const subTableCount = kr.u16();
    const subOffsets: number[] = [];
    for (let i = 0; i < subTableCount; i += 1) subOffsets.push(kr.u16());

    for (const subOffset of subOffsets) {
      const subBase = base + subOffset;
      if (lookupType === 4) {
        parseLigatureSubst(gsub, subBase, sequences);
      } else if (lookupType === 7) {
        // Extension substitution: one level of indirection to the real type.
        const er = new Reader(gsub, subBase);
        const extFormat = er.u16();
        if (extFormat !== 1) continue;
        const extType = er.u16();
        const extOffset = er.u32();
        if (extType === 4) parseLigatureSubst(gsub, subBase + extOffset, sequences);
      }
    }
  }
  return sequences;
}

/**
 * Return the ligature names defined by a WOFF2 icon font.
 *
 * Sequences containing a glyph absent from the reverse cmap are skipped, since
 * their name cannot be spelled out.
 */
export function woff2Ligatures(file: string): Set<string> {
  const { data, tables } = decodeWoff2(readFileSync(file));

  const cmapTable = sliceTable(data, tables, "cmap");
  if (cmapTable === undefined) throw new Error("font has no cmap table");
  const gsubTable = sliceTable(data, tables, "GSUB");
  if (gsubTable === undefined) return new Set<string>();

  const { byGlyph } = parseCmap(cmapTable);
  const names = new Set<string>();

  for (const seq of collectLigatureSequences(gsubTable)) {
    let name = "";
    let complete = true;
    for (const gid of seq) {
      const ch = byGlyph.get(gid);
      if (ch === undefined) {
        complete = false;
        break;
      }
      name += ch;
    }
    if (complete && name.length > 0) names.add(name);
  }
  return names;
}

/*
 * Limitations
 * -----------
 * - Container: single fonts only; WOFF2 collections (`ttcf` flavor) are
 *   rejected. Uncompressed WOFF/OTF input is not accepted either.
 * - cmap: only subtable formats 4 and 12 are decoded. Formats 0, 2, 6, 13 and
 *   14 (Unicode variation sequences) are ignored; a font whose only Unicode
 *   subtable uses one of those will throw.
 * - GSUB: only LigatureSubst (lookup type 4), reached directly or through one
 *   Extension (type 7) hop. Contextual and chained-contextual ligature rules,
 *   and any ligature reachable only via type 5/6 lookups, are not followed.
 *   Feature and script filtering is skipped, so every ligature in the
 *   LookupList is reported regardless of which feature references it.
 * - Names are reconstructed from the cmap, so a ligature whose input glyphs
 *   have no codepoint is skipped rather than guessed.
 */
