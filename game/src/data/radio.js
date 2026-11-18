// Radio station data for Solmar City.
// Two fully synthesized stations: no audio files are shipped. Each station
// carries a playlist of fictional songs plus the synth parameters the Audio
// system uses to generate its music live (tempo, scale, waveform).

export const RADIO_STATIONS = [
  {
    name: 'SOLMAR FM 88.5',
    tagline: 'Sunset Drive',
    frequency: 88.5,
    genre: 'Coastal synthwave',
    tempo: 112,
    waveform: 'sawtooth',
    bassWaveform: 'triangle',
    // A minor pentatonic, semitone offsets from the root (A2 = 110 Hz).
    scale: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24],
    rootHz: 110,
    songs: [
      { title: 'Neon Tide', artist: 'Marina Voss' },
      { title: 'Palms at Dusk', artist: 'The Breakers' },
      { title: 'Harbor Lights', artist: 'Cleo Marlowe' },
      { title: 'Chrome Sunset', artist: 'Night Ferry' },
      { title: 'Salt Air Radio', artist: 'Dario Fontaine' },
    ],
  },
  {
    name: 'COAST 92.1',
    tagline: 'Night Tide',
    frequency: 92.1,
    genre: 'Late-night coastal groove',
    tempo: 84,
    waveform: 'sine',
    bassWaveform: 'sine',
    // C major pentatonic, semitone offsets from the root (C3 = 130.81 Hz).
    scale: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24],
    rootHz: 130.81,
    songs: [
      { title: 'Low Tide Love', artist: 'June Abara' },
      { title: 'Boardwalk Slow', artist: 'The Pelicans' },
      { title: 'Glass Moon', artist: 'Sable Reyes' },
      { title: 'Driftwood', artist: 'Alto Mare' },
      { title: 'Last Ferry Home', artist: 'Iris Calder' },
    ],
  },
];

// Human-readable label used by the HUD radio widget, e.g.
// "SOLMAR FM 88.5 · Sunset Drive".
export function stationLabel(index) {
  const station = RADIO_STATIONS[index] || RADIO_STATIONS[0];
  return station.name + ' · ' + station.tagline;
}

// One track from a station's playlist, wrapping the song index.
export function trackAt(stationIndex, songIndex) {
  const station = RADIO_STATIONS[stationIndex] || RADIO_STATIONS[0];
  const song = station.songs[songIndex % station.songs.length];
  return { station: stationLabel(stationIndex), title: song.title, artist: song.artist };
}
