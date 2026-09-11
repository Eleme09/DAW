"use client";

import dynamic from "next/dynamic";

// The DAW is inherently browser-only (Web Audio API, IndexedDB, localStorage),
// so it's pointless to server-render it — doing so also causes hydration
// mismatches whenever a returning user already has local data.
const DawShell = dynamic(() => import("@/components/daw/DawShell").then((m) => m.DawShell), {
  ssr: false,
});

export default function Home() {
  return <DawShell />;
}
