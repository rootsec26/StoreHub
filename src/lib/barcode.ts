/**
 * Minimal Code 128 (sets B/C) encoder used to render thermal waybill barcodes.
 *
 * Each symbol maps to a pattern of module widths that alternates bar / space
 * starting with a bar, so concatenating symbol patterns yields one continuous
 * alternating run the SVG renderer can walk directly.
 */

// Value 0-106. Every pattern except the stop symbol (106) is 6 modules wide.
const PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

const CODE_C = 99;
const CODE_B = 101;
const START_B = 104;
const START_C = 105;
const STOP = 106;

function checksum(codes: number[]): number {
  // Start symbol and first data symbol both sit in position 1:
  // checksum = start + Σ(value × position) mod 103.
  return (
    codes.reduce(
      (sum, code, index) => sum + code * (index === 0 ? 1 : index),
      0
    ) % 103
  );
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

/**
 * Encode a printable-ASCII string into Code 128 symbol values (0-106).
 * Uses Code C for long digit runs so tracking numbers stay compact.
 */
export function encodeCode128(raw: string): number[] {
  const text = raw.replace(/[^\x20-\x7E]/g, "?");
  if (!text) return [];

  const codes: number[] = [];
  const allDigits = /^[0-9]+$/.test(text);

  if (allDigits && text.length % 2 === 0) {
    codes.push(START_C);
    for (let i = 0; i < text.length; i += 2) {
      codes.push(Number(text.slice(i, i + 2)));
    }
    codes.push(checksum(codes));
    codes.push(STOP);
    return codes;
  }

  codes.push(START_B);
  let codeset: "B" | "C" = "B";
  let i = 0;

  while (i < text.length) {
    if (isDigit(text[i])) {
      let run = 0;
      while (i + run < text.length && isDigit(text[i + run])) run += 1;

      if (codeset === "C") {
        if (run % 2 === 0) {
          for (let k = 0; k < run; k += 2) {
            codes.push(Number(text.slice(i + k, i + k + 2)));
          }
          i += run;
          continue;
        }
        // Odd digit run: drop back to Code B and encode it there.
        codes.push(CODE_B);
        codeset = "B";
      }

      if (run >= 6 && run % 2 === 1) {
        // One digit in B, the remaining even pairs in C.
        codes.push(text.charCodeAt(i) - 32);
        codes.push(CODE_C);
        codeset = "C";
        for (let k = 1; k < run; k += 2) {
          codes.push(Number(text.slice(i + k, i + k + 2)));
        }
        i += run;
        continue;
      }

      if (run >= 4 && run % 2 === 0) {
        codes.push(CODE_C);
        codeset = "C";
        for (let k = 0; k < run; k += 2) {
          codes.push(Number(text.slice(i + k, i + k + 2)));
        }
        i += run;
        continue;
      }

      for (let k = 0; k < run; k += 1) {
        codes.push(text.charCodeAt(i + k) - 32);
      }
      i += run;
      continue;
    }

    if (codeset === "C") {
      codes.push(CODE_B);
      codeset = "B";
    }
    codes.push(text.charCodeAt(i) - 32);
    i += 1;
  }

  codes.push(checksum(codes));
  codes.push(STOP);
  return codes;
}

export interface Code128Bar {
  /** Module offset of the bar's left edge. */
  x: number;
  /** Bar width in modules. */
  width: number;
}

export interface Code128Barcode {
  bars: Code128Bar[];
  /** Total symbol width in modules (excluding quiet zones). */
  modules: number;
}

/** Resolve a value into drawable bar rectangles plus its module width. */
export function code128Bars(value: string): Code128Barcode {
  const codes = encodeCode128(value);
  const bars: Code128Bar[] = [];
  let x = 0;

  for (const code of codes) {
    const pattern = PATTERNS[code];
    if (!pattern) continue;
    for (let index = 0; index < pattern.length; index += 1) {
      const width = Number(pattern[index]);
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    }
  }

  return { bars, modules: x };
}
