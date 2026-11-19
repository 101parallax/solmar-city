// Radio station definitions for Solmar City: two fictional synth stations.
// Each station carries its display name, a track list of fictional songs,
// and the synthesis parameters the audio engine uses to generate its music
// live (no audio files). Scales are semitone offsets from the station root.

export const RADIO_STATIONS = [
  {
    id: 'solmar-fm',
    name: 'SOLMAR FM 88.5',
    tagline: 'Sunset Drive',
    genre: 'Coastal synth-pop',
    // Synthesis parameters.
    tempo: 112,
    waveform: 'triangle',
    bassWaveform: 'sine',
    root: 220.0,
    scale: [0, 2, 4, 7, 9],
    brightness: 0.7,
    songs: [
      { title: 'Golden Hour Run', artist: 'Marina Vale', length: 214 },
      { title: 'Palms on Fire', artist: 'The Dune Riders', length: 187 },
      { title: 'Boardwalk Lights', artist: 'Celia Hart', length: 203 },
      { title: 'Salt and Neon', artist: 'Vesper Coast', length: 196 },
    ],
  },
  {
    id: 'coast',
    name: 'COAST 92.1',
    tagline: 'Night Tide',
    genre: 'Midnight synthwave',
    // Synthesis parameters.
    tempo: 96,
    waveform: 'sawtooth',
    bassWaveform: 'triangle',
    root: 196.0,
    scale: [0, 3, 5, 7, 10],
    brightness: 0.45,
    songs: [
      { title: 'Night Tide', artist: 'Harbor Ghosts', length: 231 },
      { title: 'Lighthouse Signal', artist: 'Ana Reyes', length: 198 },
      { title: 'Low Fog', artist: 'The Meridians', length: 222 },
      { title: 'After the Rain', artist: 'Juno Park', length: 176 },
    ],
  },
];

// Human-readable label for the HUD radio widget, e.g. "SOLMAR FM 88.5".
export function stationLabel(index) {
  const station = RADIO_STATIONS[index] || RADIO_STATIONS[0];
  return station.name + ' - ' + station.tagline;
}

// Current song for a station, rotating by in-game minutes so the widget
// text changes over time without any wall-clock dependence.
export function currentSong(index, timeOfDay) {
  const station = RADIO_STATIONS[index] || RADIO_STATIONS[0];
  const minutes = Math.floor(timeOfDay * 60);
  const song = station.songs[minutes % station.songs.length];
  return song.title + ' - ' + song.artist;
}
