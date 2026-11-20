// Noms de notes. Convention française : la3 = 440 Hz (do3 = do central).
// Convention internationale : A4 = 440 Hz.
const FR = ['do', 'do♯', 'ré', 'ré♯', 'mi', 'fa', 'fa♯', 'sol', 'sol♯', 'la', 'la♯', 'si'];
const EN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const NATURAL = new Set([0, 2, 4, 5, 7, 9, 11]);

export const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function pitchClass(midi) {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function noteName(midi, notation = 'fr') {
  const n = Math.round(midi);
  const pc = pitchClass(n);
  const sciOct = Math.floor(n / 12) - 1;
  return notation === 'fr' ? FR[pc] + (sciOct - 1) : EN[pc] + sciOct;
}

export function centsOff(midi) {
  return Math.round((midi - Math.round(midi)) * 100);
}

export function isNatural(midi) {
  return NATURAL.has(pitchClass(midi));
}
