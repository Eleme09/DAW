"use client";

interface LyricsSectionProps {
  lyrics: string;
  setLyrics: (text: string) => void;
}

/** Compact, editable - the place to write "lo que vas a cantar" before
 * hitting record. Shown whenever the track isn't actively recording; see
 * `LyricsTeleprompter` for the large read-only guide shown while it is. */
export function LyricsSection({ lyrics, setLyrics }: LyricsSectionProps) {
  return (
    <div className="shrink-0 border-b border-line px-3.5 py-2.5">
      <label className="mb-1 block font-mono text-[9.5px] uppercase tracking-[0.2em] text-bone-3">Letra</label>
      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        placeholder="Escribe lo que vas a cantar — se muestra grande en pantalla mientras grabas"
        rows={3}
        className="w-full resize-none rounded bg-surf px-2.5 py-2 text-xs text-bone outline-none placeholder:text-bone-3 focus:ring-1 focus:ring-bone"
      />
    </div>
  );
}

/** Large, read-only guide shown full-screen while a take is actively
 * recording - the real teleprompter the plan asked for, not the same small
 * textarea just left visible. No auto-scroll/line-timing (that needs the
 * user to have pre-timed every line to the beat first, a much bigger
 * feature nobody asked for) - just big, legible text the singer scrolls
 * themselves, the same manual-scroll teleprompter every karaoke app uses
 * when it doesn't have synced lyrics. */
export function LyricsTeleprompter({ lyrics }: { lyrics: string }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-ink px-5 py-6">
      {lyrics.trim() ? (
        <p className="whitespace-pre-wrap font-display text-2xl font-bold leading-relaxed text-bone">{lyrics}</p>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium text-bone-2">Sin letra escrita todavía</p>
          <p className="text-xs text-bone-3">Detén la grabación y escribí la letra para verla acá la próxima toma.</p>
        </div>
      )}
    </div>
  );
}
