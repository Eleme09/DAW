"use client";

/** BandLab's centred dark dialog: title, one line, stacked pill buttons. */
export function ConfirmDialog({
  title,
  message,
  actions,
}: {
  title: string;
  message: string;
  actions: { label: string; onClick: () => void; danger?: boolean }[];
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-8" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-[300px] rounded-3xl bg-[#232326] p-5 shadow-2xl">
        <h3 className="text-[15px] font-semibold text-bone">{title}</h3>
        <p className="mt-1 text-[13px] text-bone-2">{message}</p>
        <div className="mt-4 flex flex-col gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`h-11 rounded-full bg-[#333337] text-[15px] font-medium ${a.danger ? "text-[#ff6b6b]" : "text-bone"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
