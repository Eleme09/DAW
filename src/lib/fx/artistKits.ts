import type { AutoPitchPresetId } from "@/types/autoPitch";

/**
 * Kits by artist (user request): not just a chain "inspired by", but what is
 * documented about how each artist's vocals are made - who records them, how
 * many layers, how the ad-libs are treated - and a ready set of tracks to
 * record them that way. Every fact says whether it comes from the artist or
 * their engineer (`sure`) or from mix guides / our own reading of the sound,
 * and the sources are listed. Nobody's real settings are claimed unless an
 * engineer published them (only Future's, in Sound On Sound).
 */

export type KitLayerRole = "lead" | "double" | "adlib";

export interface KitLayer {
  /** Track name when it is created. */
  name: string;
  role: KitLayerRole;
  /** Fx chain (factory preset id). */
  presetId: string;
  nucleo: AutoPitchPresetId;
  nucleoLevel: number;
  pan: number;
  volumeDb: number;
  /** How to record it. */
  how: string;
}

export interface KitFact {
  text: string;
  /** From the artist or their engineer (true), or from mix guides / our
   * own reading of the sound (false). */
  sure: boolean;
}

export interface ArtistKit {
  id: string;
  artist: string;
  tagline: string;
  facts: KitFact[];
  layers: KitLayer[];
  sources: { label: string; url: string }[];
}

export const ARTIST_KITS: ArtistKit[] = [
  {
    id: "future",
    artist: "Future",
    tagline: "Trap melódico: el autotune como parte de la voz",
    facts: [
      {
        text: "Su ingeniero, Seth Firkins, tenía el autotune siempre encendido al grabar: Future canta escuchándose ya afinado. Nunca se lo pidió; era su sonido.",
        sure: true,
      },
      {
        text: "Future dice que lo usa para rapear porque le pone la voz más áspera.",
        sure: true,
      },
      {
        text: "Grababan de a dos líneas. Armonías y ad-libs van en tomas aparte, encima.",
        sure: true,
      },
      {
        text: "En «Draco» hay 6 pistas de voz (intro, 2 estribillos, ad-libs y 2 versos) que pasan por la misma cadena.",
        sure: true,
      },
      {
        text: "Esa cadena, publicada: EQ que quita graves y sube arriba de 5.2 kHz, de-esser a 5.5 kHz, compresor, sala corta (0.75 s, 15 ms antes de la cola, 15 %), un flanger casi imperceptible y limitador. Al grabar, eco a negras.",
        sure: true,
      },
    ],
    layers: [
      {
        name: "Voz",
        role: "lead",
        presetId: "factory.melodia-oscura",
        nucleo: "classic",
        nucleoLevel: 1,
        pan: 0,
        volumeDb: 0,
        how: "De a dos líneas, con Núcleo encendido mientras grabas.",
      },
      {
        name: "Estribillo doble",
        role: "double",
        presetId: "factory.melodia-oscura",
        nucleo: "classic",
        nucleoLevel: 1,
        pan: -0.2,
        volumeDb: -5,
        how: "Repite el estribillo igual, pegado a la primera toma.",
      },
      {
        name: "Ad-libs",
        role: "adlib",
        presetId: "factory.melodia-oscura",
        nucleo: "classic",
        nucleoLevel: 1,
        pan: 0.3,
        volumeDb: -4,
        how: "Toma aparte encima: respuestas cortas entre frases.",
      },
    ],
    sources: [
      {
        label: "Sound On Sound — Inside Track: Future «Draco»",
        url: "https://www.soundonsound.com/techniques/inside-track-future-draco",
      },
      {
        label: "Red Bull Music Academy — entrevista a Seth Firkins",
        url: "https://daily.redbullmusicacademy.com/2017/08/seth-firkins-interview/",
      },
      {
        label: "Wikipedia — Future (estilo)",
        url: "https://en.wikipedia.org/wiki/Future_(rapper)",
      },
    ],
  },
  {
    id: "travis",
    artist: "Travis Scott",
    tagline: "Psicodelia: la voz como instrumento, mucho espacio",
    facts: [
      {
        text: "Su ingeniero, Jimmy Ca$h, dice que a la voz le hace poco: «es tono… el compresor normal». El espacio lo pone la mezcla.",
        sure: true,
      },
      {
        text: "Las reseñas coinciden: autotune usado como instrumento, ecos y reverbs largas que estiran la voz, capas apiladas.",
        sure: true,
      },
      {
        text: "Guías de mezcla (no confirmado por él): voz principal más 2–3 dobles; ad-libs con afinación más rápida, más saturación y su propia reverb, más grande.",
        sure: false,
      },
    ],
    layers: [
      {
        name: "Voz",
        role: "lead",
        presetId: "factory.atmosfera",
        nucleo: "classic",
        nucleoLevel: 1,
        pan: 0,
        volumeDb: 0,
        how: "La toma con más actitud; el espacio lo pone la cadena.",
      },
      {
        name: "Doble izq.",
        role: "double",
        presetId: "factory.coros-anchos",
        nucleo: "classic",
        nucleoLevel: 1,
        pan: -0.35,
        volumeDb: -7,
        how: "Repite la voz lo más igual posible.",
      },
      {
        name: "Doble der.",
        role: "double",
        presetId: "factory.coros-anchos",
        nucleo: "classic",
        nucleoLevel: 1,
        pan: 0.35,
        volumeDb: -7,
        how: "Otra repetición, distinta toma.",
      },
      {
        name: "Ad-libs",
        role: "adlib",
        presetId: "factory.adlib-astro",
        nucleo: "hardTune",
        nucleoLevel: 1,
        pan: 0.45,
        volumeDb: -4,
        how: "Gritos y respuestas cortas, lejos del micrófono si quieres más aire.",
      },
    ],
    sources: [
      {
        label: "Billboard — CA$HPASSION, ingeniero de Travis Scott",
        url: "https://www.billboard.com/music/rb-hip-hop/cashpassion-travis-scott-interview-9341515/",
      },
      {
        label: "Rys Up Audio — guía de su cadena (no oficial)",
        url: "https://rysupaudio.com/blogs/news/how-to-sound-like-travis-scott",
      },
    ],
  },
  {
    id: "yeat",
    artist: "Yeat",
    tagline: "Rage melódico, improvisado",
    facts: [
      {
        text: "No escribe: improvisa sobre el beat («todo sale de la cabeza») y después no toca lo grabado.",
        sure: true,
      },
      {
        text: "Graba, hace de ingeniero y mezcla sus propias voces, solo.",
        sure: true,
      },
      {
        text: "Cuando un ad-lib le gusta, lo vuelve una línea de sintetizador: los ad-libs son parte de la melodía.",
        sure: true,
      },
      {
        text: "Guías de mezcla (no confirmado): autotune muy rápido; ad-libs en tomas aparte, afinados igual, abiertos a los lados y a veces subidos de tono.",
        sure: false,
      },
    ],
    layers: [
      {
        name: "Voz",
        role: "lead",
        presetId: "factory.rage-brillante",
        nucleo: "hardTune",
        nucleoLevel: 1,
        pan: 0,
        volumeDb: 0,
        how: "Improvisa la toma entera y quédate con la de más energía.",
      },
      {
        name: "Ad-libs izq.",
        role: "adlib",
        presetId: "factory.adlib-rage",
        nucleo: "hardTune",
        nucleoLevel: 1,
        pan: -0.45,
        volumeDb: -4,
        how: "Respuestas y frases cortas, como otro instrumento.",
      },
      {
        name: "Ad-libs der.",
        role: "adlib",
        presetId: "factory.adlib-rage",
        nucleo: "hardTune",
        nucleoLevel: 1,
        pan: 0.45,
        volumeDb: -4,
        how: "Otra pasada de ad-libs para el otro lado.",
      },
    ],
    sources: [
      {
        label: "The FADER — Yeat, Inc. (entrevista, 2024)",
        url: "https://www.thefader.com/2024/10/17/yeat-lyfestyle-album-synthetic-producer-interview",
      },
      {
        label: "Cedar Sound Studios — guía (no oficial)",
        url: "https://www.cedarsoundstudios.com/blogs/news/how-to-make-your-vocals-sound-like-yeat",
      },
    ],
  },
  {
    id: "ken-carson",
    artist: "Ken Carson",
    tagline: "Rage distorsionado",
    facts: [
      {
        text: "Reseñas de «A Great Chaos»: voces con mucho autotune en capas, distorsión y producción saturada; en temas como «Nightcore» rapea rápido, agudo y muy alterado.",
        sure: true,
      },
      {
        text: "Mezcla de «A Great Chaos»: Roark Bailey. Master: Colin Leonard.",
        sure: true,
      },
      {
        text: "Lo comparan con Playboi Carti («Whole Lotta Red») y Lil Uzi Vert en flow y actitud.",
        sure: true,
      },
      {
        text: "Su cadena no es pública: esta es nuestra lectura del sonido (saturación fuerte, medios al frente, poca reverb).",
        sure: false,
      },
    ],
    layers: [
      {
        name: "Voz",
        role: "lead",
        presetId: "factory.rage-distorsion",
        nucleo: "hardTune",
        nucleoLevel: 1,
        pan: 0,
        volumeDb: 0,
        how: "Con energía y cerca del micrófono; la distorsión hace el resto.",
      },
      {
        name: "Ad-libs",
        role: "adlib",
        presetId: "factory.adlib-rage",
        nucleo: "hardTune",
        nucleoLevel: 1,
        pan: -0.35,
        volumeDb: -3,
        how: "Gritados, cortos, entre frases.",
      },
    ],
    sources: [
      {
        label: "Wikipedia — A Great Chaos (créditos)",
        url: "https://en.wikipedia.org/wiki/A_Great_Chaos",
      },
      {
        label: "The Daily Northwestern — reseña",
        url: "https://dailynorthwestern.com/2023/10/22/ae/liner-notes-ken-carson-goes-mainstream-with-a-great-chaos/",
      },
      {
        label: "Wikipedia — Ken Carson (estilo)",
        url: "https://en.wikipedia.org/wiki/Ken_Carson",
      },
    ],
  },
  {
    id: "topboy-tgr",
    artist: "Topboy TGR",
    tagline: "Trap del Pacífico colombiano",
    facts: [
      {
        text: "Trap con base del trap estadounidense y puertorriqueño, con autotune y la interpretación centrada en el ritmo de la voz.",
        sure: true,
      },
      {
        text: "Cuenta su barrio y Buenaventura; él mismo produce y compone, y controla ritmo y tempo.",
        sure: true,
      },
      {
        text: "No hay entrevistas sobre cómo graba ni sobre su cadena: esta es nuestra lectura (voz seca y al frente, autotune instantáneo, eco corto).",
        sure: false,
      },
    ],
    layers: [
      {
        name: "Voz",
        role: "lead",
        presetId: "factory.pacifico",
        nucleo: "classic",
        nucleoLevel: 1,
        pan: 0,
        volumeDb: 0,
        how: "Marca el ritmo con cada sílaba: la voz va encima del beat.",
      },
      {
        name: "Coro doble",
        role: "double",
        presetId: "factory.coros-anchos",
        nucleo: "classic",
        nucleoLevel: 1,
        pan: -0.25,
        volumeDb: -6,
        how: "Dobla solo el coro.",
      },
      {
        name: "Ad-libs",
        role: "adlib",
        presetId: "factory.adlib-lejano",
        nucleo: "classic",
        nucleoLevel: 1,
        pan: 0.35,
        volumeDb: -5,
        how: "Respuestas cortas al final de las frases.",
      },
    ],
    sources: [
      {
        label: "Esquire Colombia — ¿Quién es Topboy TGR?",
        url: "https://esquirecolombia.com/topboy-tgr-biografia/",
      },
    ],
  },
];

export const ROLE_LABEL: Record<KitLayerRole, string> = {
  lead: "Voz principal",
  double: "Doble",
  adlib: "Ad-libs",
};
