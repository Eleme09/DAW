"use client";

import { useRef, useState } from "react";
import type { FxChainPreset, FxCover } from "@/types/fxPresets";
import { COVER_CHOICES, CoverArt } from "./art";
import { ConfirmDialog } from "./ConfirmDialog";
import { CloseIcon } from "../icons";

const MAX_DESC = 50;

/** "Detalles del preajuste": name, a short description and a cover (one of
 * the colour patterns or a photo), as in BandLab. */
export function PresetDetails({
  initial,
  suggestedName,
  suggestedCover,
  onCancel,
  onSave,
}: {
  initial: FxChainPreset | null;
  suggestedName: string;
  /** Cover to start from when there is no `initial` (e.g. the factory
   * preset the chain came from). */
  suggestedCover?: FxCover | null;
  onCancel: () => void;
  onSave: (d: Pick<FxChainPreset, "name" | "description" | "cover">) => void;
}) {
  const [name, setName] = useState(initial?.name ?? suggestedName);
  const [description, setDescription] = useState(initial?.description ?? "");
  const wanted = initial?.cover ?? suggestedCover ?? COVER_CHOICES[0];
  // same colours and pattern as a stock choice -> use that one, so it is the one ringed
  const startCover = COVER_CHOICES.find((c) => JSON.stringify(c) === JSON.stringify(wanted)) ?? wanted;
  const [cover, setCover] = useState<FxCover>(startCover);
  const choices = COVER_CHOICES.includes(startCover) ? COVER_CHOICES : [startCover, ...COVER_CHOICES];
  const [leaving, setLeaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const changed = name !== (initial?.name ?? suggestedName) || description !== (initial?.description ?? "") || cover !== startCover;

  async function pickPhoto(f: File) {
    const url = URL.createObjectURL(f);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const side = 320;
      const c = document.createElement("canvas");
      c.width = side;
      c.height = side;
      const g = c.getContext("2d");
      if (!g) return;
      const s = Math.min(img.width, img.height);
      g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, side, side);
      setCover({ kind: "image", dataUrl: c.toDataURL("image/jpeg", 0.82) });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center px-2">
        <button onClick={() => (changed ? setLeaving(true) : onCancel())} aria-label="Cerrar" className="flex h-10 w-10 items-center justify-center text-bone">
          <CloseIcon className="h-5 w-5" />
        </button>
        <span className="flex-1 text-center text-[16px] font-semibold text-bone">Detalles del preajuste</span>
        <button onClick={() => onSave({ name, description, cover })} aria-label="Guardar" className="flex h-10 w-10 items-center justify-center text-xl text-bone">
          ✓
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        <div className="mx-auto mt-2 w-36">
          <CoverArt cover={cover} className="aspect-square w-full" />
        </div>

        <label htmlFor="fx-preset-name" className="mt-5 block text-[12px] text-bone-2">Nombre</label>
        <input id="fx-preset-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="mt-1 h-11 w-full rounded-xl bg-surf-2 px-3 text-[15px] text-bone outline-none" />

        <div className="mt-4 flex justify-between text-[12px] text-bone-2">
          <label htmlFor="fx-preset-desc">Descripción</label>
          <span>
            {description.length}/{MAX_DESC}
          </span>
        </div>
        <textarea
          id="fx-preset-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
          placeholder="Describe el preajuste en unas palabras…"
          rows={3}
          className="mt-1 w-full resize-none rounded-xl bg-surf-2 p-3 text-[14px] text-bone outline-none placeholder:text-bone-3"
        />

        <div className="mt-4 text-[12px] text-bone-2">Portada</div>
        <div className="mt-2 flex flex-wrap gap-2.5">
          <button onClick={() => file.current?.click()} aria-label="Usar una foto" className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/30 text-bone">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </button>
          {choices.map((c, i) => (
            <button key={i} onClick={() => setCover(c)} aria-label={`Portada ${i + 1}`} className={`rounded-xl ${cover === c ? "ring-2 ring-bone ring-offset-2 ring-offset-ink" : ""}`}>
              <CoverArt cover={c} size={56} />
            </button>
          ))}
        </div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickPhoto(f);
            e.target.value = "";
          }}
        />
      </div>

      {leaving && (
        <ConfirmDialog
          title="Cambios sin guardar"
          message="Cualquier cambio sin guardar se perderá cuando abandones esta página."
          actions={[
            { label: "Guardar", onClick: () => onSave({ name, description, cover }) },
            { label: "Descartar", danger: true, onClick: onCancel },
          ]}
        />
      )}
    </div>
  );
}
