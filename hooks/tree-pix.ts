// Tiny pixel tree in the colours of the user's picture: 5x4 pixels, two text rows.
// "" = empty (snow falls there).
const S = '#faf3e3' // snow
const B = '#a9cfdc' // snow shadow
const T = '#3a7370' // teal needles
const G = '#5f9a55' // green needles
const K = '#b5532b' // trunk

export const TREE_PIX: readonly (readonly string[])[] = [
  ['', '', S, '', ''],
  ['', S, T, B, ''],
  [S, T, G, T, B],
  ['', '', K, '', ''],
]
