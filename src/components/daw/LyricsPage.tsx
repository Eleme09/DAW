"use client";

import { useProjectStore } from "@/state/projectStore";

/**
 * BandLab's lyrics/notes page (quill tab): the ruler stays on top, the rest
 * of the screen is one blank page - "Añade aquí letra/notas..." until you
 * type. Same project lyrics the recording teleprompter shows.
 */
export function LyricsPage() {
  const lyrics = useProjectStore((s) => s.project.lyrics);
  const setLyrics = useProjectStore((s) => s.setLyrics);
  return (
    <div className="relative flex min-h-0 flex-1">
      {!lyrics && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-xl text-bone-3">
          Añade aquí letra/notas...
        </p>
      )}
      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        aria-label="Letra y notas"
        spellCheck={false}
        className="min-h-0 flex-1 resize-none bg-transparent px-5 py-5 text-lg leading-relaxed text-bone outline-none"
      />
    </div>
  );
}
