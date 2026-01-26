import { Category, SubCategory, Direction, HebelHoehe, FinnhubProfile } from "@/types";

/**
 * Extrahiert die Hebelhöhe aus einem Namen
 */
function extractLeverageMultiplier(name: string): HebelHoehe {
  const normalized = name.toLowerCase();
  // Suche nach Multiplikatoren: 2x, 3x, 5x, 10x, 20x
  const multipliers: Array<{ pattern: RegExp; value: HebelHoehe }> = [
    { pattern: /\b20x\b/i, value: "20x" },
    { pattern: /\b10x\b/i, value: "10x" },
    { pattern: /\b5x\b/i, value: "5x" },
    { pattern: /\b3x\b/i, value: "3x" },
    { pattern: /\b2x\b/i, value: "2x" },
  ];

  for (const { pattern, value } of multipliers) {
    if (pattern.test(normalized)) {
      return value;
    }
  }

  // Prüfe auf andere Multiplikatoren (4x, 6x, 7x, 8x, 9x, etc.)
  if (/\b[4-9]\d*x\b/i.test(normalized) || /\b[1-9]\d{2,}x\b/i.test(normalized)) {
    return "Andere";
  }

  return null;
}

/**
 * Kategorisiert ein Asset basierend auf Finnhub-Daten
 */
export function categorizeAsset(
  profile: FinnhubProfile,
  name?: string,
  originalRowData?: Record<string, unknown>
): {
  category: Category;
  subCategory: SubCategory;
  direction: Direction;
  hebelHoehe: HebelHoehe;
} {
  const type = (profile.type || "").toLowerCase();
  const description = (profile.description || "").toLowerCase();
  const assetClass = (profile.assetClass || "").toLowerCase();
  const profileName = (profile.name || "").toLowerCase();
  const providedName = (name || "").toLowerCase();
  
  // Kombiniere alle verfügbaren Textfelder - Name hat hohe Priorität für Rohstoff-Erkennung
  const combinedText = `${type} ${description} ${assetClass} ${profileName} ${providedName}`.toLowerCase();
  
  // Prüfe auf Hebel-Multiplikatoren (2x, 3x, 4x, etc.) im API-Namen
  // Verwende sowohl profileName als auch providedName, da die API den Namen liefern kann
  const nameToCheck = profileName || providedName;
  const hebelHoehe = nameToCheck ? extractLeverageMultiplier(nameToCheck) : null;
  const hasLeverageMultiplier = hebelHoehe !== null;
  
  // WICHTIG: Nahrungsmittel explizit ausschließen
  const isFoodCommodity =
    combinedText.includes("wheat") ||
    combinedText.includes("weizen") ||
    combinedText.includes("corn") ||
    combinedText.includes("mais") ||
    combinedText.includes("soybean") ||
    combinedText.includes("soja") ||
    combinedText.includes("coffee") ||
    combinedText.includes("kaffee") ||
    combinedText.includes("cocoa") ||
    combinedText.includes("kakao") ||
    combinedText.includes("sugar") ||
    combinedText.includes("zucker") ||
    combinedText.includes("cotton") ||
    combinedText.includes("baumwolle") ||
    combinedText.includes("orange") ||
    combinedText.includes("orange juice") ||
    combinedText.includes("livestock") ||
    combinedText.includes("vieh") ||
    combinedText.includes("cattle") ||
    combinedText.includes("rind") ||
    combinedText.includes("pork") ||
    combinedText.includes("schwein");
  
  console.log(`[categorizeAsset] Analysiere:`, {
    type,
    description: description.substring(0, 100),
    profileName: profileName.substring(0, 100),
    providedName: providedName.substring(0, 100),
    combinedText: combinedText.substring(0, 200),
    isFoodCommodity,
  });

  // WICHTIG: Prüfe zuerst, ob es ein ETF oder Basket ist
  // Wenn "basket" oder "ETF" im Namen vorkommt ODER in der "basket"-Spalte "ETF" steht, darf es NICHT als Aktie kategorisiert werden
  const basketValue = originalRowData?.basket 
    ? String(originalRowData.basket).toLowerCase().trim() 
    : "";
  const isETFOrBasket = 
    combinedText.includes("basket") ||
    combinedText.includes("etf") ||
    combinedText.includes("exchange traded fund") ||
    type.includes("etf") ||
    type.includes("basket") ||
    basketValue.includes("etf");

  // Bestimme zuerst die Oberkategorie (Aktie, ETP oder Fund)
  // WICHTIG: Dies wird VOR der Rohstoff-Erkennung gemacht, damit Rohstoffe die richtige Oberkategorie bekommen
  let oberkategorie: "Aktie" | "ETP" | "Fund" | null = null;

  // Fund erkennen: Mutual Fund, Investment Fund (zuerst prüfen, da "fund" auch in anderen Kontexten vorkommen kann)
  if (
    type.includes("mutual fund") ||
    type.includes("investment fund") ||
    (type.includes("fund") && !type.includes("etf"))
  ) {
    oberkategorie = "Fund";
  }
  // Aktie erkennen: equity/stock/common share
  // ABER: Nicht als Aktie kategorisieren, wenn es ein ETF oder Basket ist
  else if (
    !isETFOrBasket &&
    (type.includes("equity") ||
    type.includes("stock") ||
    type.includes("common share") ||
    type.includes("share") ||
    assetClass === "equity")
  ) {
    oberkategorie = "Aktie";
  }
  // ETP erkennen: Exchange Traded Product oder ETF
  else if (
    type.includes("etp") || 
    type.includes("etf") ||
    combinedText.includes(" exchange traded product ") ||
    combinedText.includes("exchange traded fund")
  ) {
    oberkategorie = "ETP";
  }

  // Rohstoff erkennen: ETF/ETN/ETC auf Gold/Silver/Platinum per Keywords
  // WICHTIG: Rohstoff-Exposures erkennst du häufig über Name/Description Keywords
  // Der Name aus Finnhub Search-Ergebnissen enthält IMMER den Rohstoff-Typ!
  // ETPs werden separat behandelt - sie werden nur als Rohstoff erkannt, wenn sie Rohstoff-Keywords haben
  const isCommodityType =
    type.includes("commodity") ||
    type.includes("etc") ||
    type.includes("etn") ||
    type.includes("etf"); // ETF kann auch Rohstoff sein

  // Erweiterte Keyword-Erkennung für Rohstoffe
  // WICHTIG: Nur Bergbau-Rohstoffe & Öl, KEINE Nahrungsmittel!
  // Englische und deutsche Begriffe werden beide erkannt
  const hasCommodityKeywords =
    combinedText.includes("rohstoff") ||
    combinedText.includes("commodity") ||
    // Edelmetalle
    combinedText.includes("gold") ||
    combinedText.includes("xau") ||
    combinedText.includes("gld") || // GLD ist ein häufiger Gold-ETF
    combinedText.includes("silver") ||
    combinedText.includes("silber") ||
    combinedText.includes("xag") ||
    combinedText.includes("slv") || // SLV ist ein häufiger Silber-ETF
    combinedText.includes("platinum") ||
    combinedText.includes("platin") ||
    combinedText.includes("xpt") ||
    combinedText.includes("palladium") ||
    combinedText.includes("pallad") ||
    combinedText.includes("xpd") ||
    // Kupfer
    combinedText.includes("copper") ||
    combinedText.includes("kupfer") ||
    combinedText.includes("cu ") || // CU ist das chemische Symbol für Kupfer
    combinedText.includes(" cu") ||
    // Öl
    combinedText.includes("oil") ||
    combinedText.includes("öl") ||
    combinedText.includes("crude") ||
    combinedText.includes("wti") ||
    combinedText.includes("brent") ||
    combinedText.includes(" cl") || // CL ist ein häufiger Öl-Futures Ticker
    combinedText.includes("cl ") ||
    combinedText.includes("petroleum") ||
    // Weitere Bergbau-Rohstoffe - Englisch und Deutsch
    combinedText.includes("nickel") ||
    combinedText.includes("nickel") ||
    combinedText.includes("zinc") ||
    combinedText.includes("zink") ||
    combinedText.includes("aluminum") ||
    combinedText.includes("aluminium") ||
    combinedText.includes("tin") ||
    combinedText.includes("zinn") ||
    // "lead" wird als eigenständiges Wort erkannt (auch am Ende wie "WisdomTree Lead")
    (combinedText.match(/\blead\b/i) !== null) ||
    combinedText.includes("blei") || // Deutsch für Lead
    combinedText.includes("iron") ||
    combinedText.includes("eisen") ||
    combinedText.includes("steel") ||
    combinedText.includes("stahl") ||
    combinedText.includes("coal") ||
    combinedText.includes("kohle") ||
    combinedText.includes("uranium") ||
    combinedText.includes("uran") ||
    combinedText.includes("lithium") ||
    combinedText.includes("cobalt") ||
    combinedText.includes("kobalt") ||
    // Weitere englische Rohstoff-Begriffe
    combinedText.includes("platinum") ||
    combinedText.includes("palladium") ||
    combinedText.includes("rhodium") ||
    combinedText.includes("rhodium") ||
    combinedText.includes("tungsten") ||
    combinedText.includes("wolfram") ||
    combinedText.includes("molybdenum") ||
    combinedText.includes("molybdän") ||
    combinedText.includes("titanium") ||
    combinedText.includes("titan") ||
    combinedText.includes("chrome") ||
    combinedText.includes("chrom") ||
    combinedText.includes("manganese") ||
    combinedText.includes("mangan");

  // Wenn es ein ETC/ETN ist ODER Commodity-Keywords vorhanden sind
  // ABER: Nahrungsmittel explizit ausschließen
  // "lead" im Namen wird immer als Blei-Rohstoff erkannt (auch ohne ETC/ETN)
  // Wir prüfen auf "lead" als eigenständiges Wort mit Word-Boundaries
  const hasLeadKeyword = combinedText.match(/\blead\b/i) !== null;
  
  // Wenn "lead" gefunden wurde, ist es immer ein Rohstoff (Blei)
  const isLeadCommodity = hasLeadKeyword;
  
  // Prüfe ob es ein ETP ist
  const isETP = type.includes("etp") || combinedText.includes(" exchange traded product ");
  
  // ETPs werden nur als Rohstoff erkannt, wenn sie explizit Rohstoff-Keywords haben
  // Für ETPs: isCommodityType allein reicht NICHT, es müssen Rohstoff-Keywords vorhanden sein
  const shouldBeCommodity = 
    (isCommodityType || hasCommodityKeywords || isLeadCommodity) && 
    !isFoodCommodity &&
    // Wenn es ein ETP ist, müssen explizit Rohstoff-Keywords vorhanden sein
    (!isETP || hasCommodityKeywords || isLeadCommodity);
  
  if (shouldBeCommodity) {
    const commoditySubCategory = detectCommoditySubCategory(combinedText, nameToCheck);
    console.log(`[categorizeAsset] Rohstoff erkannt: ${commoditySubCategory || "Andere"}`);
    
    // Wenn keine Oberkategorie bestimmt wurde, versuche sie zu bestimmen
    // Standard: ETP für Rohstoff-Produkte (ETC/ETN sind meist ETPs)
    if (!oberkategorie) {
      if (type.includes("etc") || type.includes("etn")) {
        oberkategorie = "ETP";
      } else if (type.includes("etf")) {
        oberkategorie = "ETP";
      } else {
        // Fallback: ETP für Rohstoff-Produkte
        oberkategorie = "ETP";
      }
    }
    
    // Neue Struktur: Oberkategorie_Hebel/Normal_Rohstoff_[Art]_Long/Short_[Hebelhoehe]
    // Bei Rohstoffen: subCategory = "Rohstoff_[Art]" (z.B. "Rohstoff_Gold")
    // Die Rohstoffart wird IMMER gespeichert, auch bei Hebeln
    // Die Richtung und Hebelhöhe werden separat gespeichert
    const rohstoffSubCategory = `Rohstoff_${commoditySubCategory || "Andere"}`;
    
    return {
      category: oberkategorie,
      subCategory: rohstoffSubCategory as SubCategory,
      direction: detectDirection(combinedText),
      hebelHoehe: hasLeverageMultiplier ? hebelHoehe : null,
    };
  }
  
  // Wenn Oberkategorie bereits bestimmt wurde, aber kein Rohstoff
  if (oberkategorie) {
    // Neue Struktur: Oberkategorie_Hebel/Normal_Long/Short_[Hebelhoehe]
    // Bei Nicht-Rohstoffen: subCategory = "Hebel" oder "Normal"
    return {
      category: oberkategorie,
      subCategory: hasLeverageMultiplier ? "Hebel" : "Normal",
      direction: detectDirection(combinedText),
      hebelHoehe: hasLeverageMultiplier ? hebelHoehe : null,
    };
  }
  
  // Wenn Nahrungsmittel erkannt wurde, als Aktie behandeln (falls es eine Aktie ist)
  if (isFoodCommodity) {
    console.log(`[categorizeAsset] Nahrungsmittel erkannt, als Aktie behandelt`);
  }


  // Fallback: Unbekannt
  return {
    category: "Unbekannt/Fehler",
    subCategory: hasLeverageMultiplier ? "Hebel" : null,
    direction: null,
    hebelHoehe: null,
  };
}

/**
 * Erkennt die Rohstoff-Unterkategorie
 * WICHTIG: Name aus Finnhub Search enthält IMMER den Rohstoff-Typ!
 * Nur Bergbau-Rohstoffe & Öl, KEINE Nahrungsmittel!
 * Bei Rohstoffnamen wird eine neue Kategorie erstellt, falls noch nicht vorhanden
 */
function detectCommoditySubCategory(text: string, name?: string): SubCategory {
  const normalized = text.toLowerCase();
  
  // Gold: gold, xau, gld (häufiger Gold-ETF/ETC Ticker)
  if (
    normalized.includes("gold") || 
    normalized.includes("xau") || 
    normalized.includes("gld") ||
    normalized.includes(" gold ") ||
    normalized.startsWith("gold") ||
    normalized.endsWith("gold")
  ) {
    return "Gold";
  }
  
  // Silber: silver, silber, xag, slv (häufiger Silber-ETF/ETC Ticker)
  if (
    normalized.includes("silver") || 
    normalized.includes("silber") || 
    normalized.includes("xag") ||
    normalized.includes("slv") ||
    normalized.includes(" silver ") ||
    normalized.startsWith("silver") ||
    normalized.endsWith("silver")
  ) {
    return "Silber";
  }
  
  // Platin: platinum, platin, xpt
  if (
    normalized.includes("platinum") || 
    normalized.includes("platin") || 
    normalized.includes("xpt") ||
    normalized.includes(" platinum ") ||
    normalized.startsWith("platinum") ||
    normalized.endsWith("platinum")
  ) {
    return "Platin";
  }
  
  // Kupfer: copper, kupfer, cu (chemisches Symbol)
  if (
    normalized.includes("copper") ||
    normalized.includes("kupfer") ||
    normalized.includes(" cu ") ||
    normalized.includes("cu ") ||
    normalized.includes(" cu") ||
    normalized.startsWith("cu ") ||
    normalized.endsWith(" cu")
  ) {
    return "Kupfer";
  }
  
  // Öl: oil, öl, crude, wti, brent, cl (Futures Ticker)
  if (
    normalized.includes("oil") ||
    normalized.includes("öl") ||
    normalized.includes("crude") ||
    normalized.includes("wti") ||
    normalized.includes("brent") ||
    normalized.includes(" cl ") ||
    normalized.includes("cl ") ||
    normalized.includes(" cl") ||
    normalized.startsWith("cl ") ||
    normalized.endsWith(" cl") ||
    normalized.includes("petroleum")
  ) {
    return "Öl";
  }

  // Gas: gas, natural gas, erdgas
  if (
    normalized.includes("gas") ||
    normalized.includes("natural gas") ||
    normalized.includes("erdgas") ||
    normalized.includes("ng ") || // NG ist ein häufiger Gas-Futures Ticker
    normalized.includes(" ng") ||
    normalized.startsWith("ng ") ||
    normalized.endsWith(" ng")
  ) {
    return "Gas";
  }
  
  // Blei: lead (englisch) oder blei (deutsch)
  // PB ist das chemische Symbol für Blei
  // WICHTIG: "lead" wird als Blei-Rohstoff erkannt, wenn es im Namen vorkommt
  // Wir verwenden Word-Boundaries (\b) um sicherzustellen, dass "lead" als eigenständiges Wort erkannt wird
  // z.B. "WisdomTree Lead" oder "Lead ETC" werden erkannt, aber nicht "plead" oder "leadership"
  const hasLead = 
    normalized.includes("blei") ||
    normalized.includes("pb ") ||
    normalized.includes(" pb") ||
    normalized.startsWith("pb ") ||
    normalized.endsWith(" pb") ||
    // Word-Boundary-Prüfung für "lead" - erkennt "lead" als eigenständiges Wort
    normalized.match(/\blead\b/i) !== null;
  
  if (hasLead) {
    console.log(`[detectCommoditySubCategory] Blei erkannt in: "${normalized}"`);
    return "Blei"; // Blei hat jetzt eine eigene Subkategorie
  }
  
  // Zinn/Tin: tin (englisch) oder zinn (deutsch)
  // SN ist das chemische Symbol für Zinn
  // WICHTIG: "tin" wird als Zinn-Rohstoff erkannt, wenn es im Namen vorkommt
  // Wir verwenden Word-Boundaries (\b) um sicherzustellen, dass "tin" als eigenständiges Wort erkannt wird
  const hasTin = 
    normalized.includes("zinn") ||
    normalized.includes("sn ") ||
    normalized.includes(" sn") ||
    normalized.startsWith("sn ") ||
    normalized.endsWith(" sn") ||
    // Word-Boundary-Prüfung für "tin" - erkennt "tin" als eigenständiges Wort
    normalized.match(/\btin\b/i) !== null;
  
  if (hasTin) {
    console.log(`[detectCommoditySubCategory] Zinn/Tin erkannt in: "${normalized}"`);
    return "Tin"; // Tin hat jetzt eine eigene Subkategorie
  }
  
  // Alle anderen Bergbau-Rohstoffe → "Andere"
  // (Nickel, Zink, Aluminium, Palladium, Uran, Lithium, etc.)
  return "Andere";
}

/**
 * Erkennt Long/Short Richtung
 * short|inverse|bear|-1x → short
 * long|bull|1x oder default → long
 */
function detectDirection(text: string): Direction {
  const normalized = text.toLowerCase();
  
  // Short Keywords: short, inverse, bear, -1x, -2x, -3x
  const shortKeywords = [
    "short",
    "inverse",
    "bear",
    "-1x",
    "-2x",
    "-3x",
    "short selling",
    "leerverkauf",
  ];

  const hasShortKeyword = shortKeywords.some((keyword) =>
    normalized.includes(keyword)
  );

  if (hasShortKeyword) {
    return "short";
  }

  // Long Keywords: long, bull, 1x (explizit)
  const longKeywords = ["long", "bull", "1x"];
  const hasLongKeyword = longKeywords.some((keyword) =>
    normalized.includes(keyword)
  );

  // Default ist long, auch wenn kein explizites Keyword vorhanden
  return "long";
}
