/** Where in the sentence a match was, start inclusive and end exclusive. */
export const spanOf = (m: RegExpExecArray): [number, number] => [m.index, m.index + m[0].length];
