/** Where in the sentence a match was, start inclusive and end exclusive. */
export const spanOf = (m: RegExpExecArray): [number, number] => [m.index, m.index + m[0].length];

/** Capture group `i` of a match, or '' when that group took no part in it. */
export const group = (m: RegExpExecArray, i: number): string => m[i] ?? '';
