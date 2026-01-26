/**
 * Typen für die Kategorienstruktur
 */

export type Oberkategorie = "ETP" | "Fund" | "Aktie";

export type UnterkategorieTyp = "Hebel" | "Normal";

export type HebelRichtung = "Long" | "Short";

export type RohstoffTyp = "Rohstoff" | "kein Rohstoff";

export type RohstoffArt =
  | "Gold"
  | "Silber"
  | "Platin"
  | "Kupfer"
  | "Öl"
  | "Gas"
  | "Weizen"
  | "Mais"
  | "Kaffee"
  | "Kakao"
  | "Zucker"
  | "Baumwolle"
  | "Andere";

export type HebelHoehe = "2x" | "3x" | "5x" | "10x" | "20x" | "Andere";

/**
 * Vollständiger Pfad durch die Kategorien
 */
export interface CategoryPath {
  oberkategorie?: Oberkategorie;
  unterkategorieTyp?: UnterkategorieTyp;
  hebelRichtung?: HebelRichtung;
  rohstoffTyp?: RohstoffTyp;
  rohstoffArt?: RohstoffArt;
  hebelHoehe?: HebelHoehe;
}

/**
 * Kategorien-Konfiguration
 */
export interface CategoryConfig {
  oberkategorien: Oberkategorie[];
  unterkategorien: Record<Oberkategorie, UnterkategorieTyp[]>;
  hebelRichtungen: Record<UnterkategorieTyp, HebelRichtung[] | null>;
  rohstoffTypen: Record<HebelRichtung, RohstoffTyp[]>;
  rohstoffArten: RohstoffArt[];
  hebelHoehen: HebelHoehe[];
}

export const categoryConfig: CategoryConfig = {
  oberkategorien: ["ETP", "Fund", "Aktie"],
  unterkategorien: {
    ETP: ["Hebel", "Normal"],
    Fund: ["Hebel", "Normal"],
    Aktie: ["Hebel", "Normal"],
  },
  hebelRichtungen: {
    Hebel: ["Long", "Short"],
    Normal: null,
  },
  rohstoffTypen: {
    Long: ["Rohstoff", "kein Rohstoff"],
    Short: ["Rohstoff", "kein Rohstoff"],
  },
  rohstoffArten: [
    "Gold",
    "Silber",
    "Platin",
    "Kupfer",
    "Öl",
    "Gas",
    "Weizen",
    "Mais",
    "Kaffee",
    "Kakao",
    "Zucker",
    "Baumwolle",
    "Andere",
  ],
  hebelHoehen: ["2x", "3x", "5x", "10x", "20x", "Andere"],
};
