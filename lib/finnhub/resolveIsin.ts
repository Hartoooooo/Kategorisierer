import { finnhubRequest } from "./client";
import { categorizeAsset } from "./mapping";
import { Category, SubCategory, Direction, HebelHoehe, FinnhubProfile } from "@/types";
import { isinCache } from "@/lib/store/isinCache";

interface ResolveResult {
  category: Category;
  subCategory: SubCategory;
  direction: Direction;
  hebelHoehe?: HebelHoehe;
  status: "success" | "error";
  notes?: string;
  isRateLimit?: boolean; // Markiert 429 Rate Limit Fehler für spätere Wiederholung
}

interface SearchResult {
  description?: string;
  displaySymbol?: string;
  symbol?: string;
  type?: string;
  [key: string]: unknown;
}

/**
 * Prüft ob ein Profil "leer" ist (keine nützlichen Daten enthält)
 */
function isEmptyProfile(profile: unknown): boolean {
  if (!profile || typeof profile !== "object") return true;
  const p = profile as Record<string, unknown>;
  return !p.name && !p.ticker && !p.symbol && !p.type && !p.description;
}

/**
 * Findet den besten Match aus Suchergebnissen
 * Priorität: Common Stock/Equity > ETF > andere
 */
function findBestMatch(results: SearchResult[]): SearchResult | null {
  if (results.length === 0) return null;

  // Priorität 1: Common Stock / Equity
  const equityMatch = results.find(
    (r) =>
      r.type?.toLowerCase().includes("common stock") ||
      r.type?.toLowerCase().includes("equity") ||
      r.type?.toLowerCase().includes("stock")
  );
  if (equityMatch) return equityMatch;

  // Priorität 2: ETF
  const etfMatch = results.find((r) =>
    r.type?.toLowerCase().includes("etf")
  );
  if (etfMatch) return etfMatch;

  // Priorität 3: ETC/ETN
  const etcMatch = results.find(
    (r) =>
      r.type?.toLowerCase().includes("etc") ||
      r.type?.toLowerCase().includes("etn")
  );
  if (etcMatch) return etcMatch;

  // Fallback: Erstes Ergebnis
  return results[0];
}

/**
 * Versucht, eine ISIN über verschiedene Finnhub-Endpoints aufzulösen
 * Strategie:
 * 1. Company Profile2 per ISIN
 * 2. Symbol Lookup per ISIN (Best Match)
 * 3. Mit Symbol weiter anreichern
 */
export async function resolveIsin(
  isin: string,
  name?: string,
  originalRowData?: Record<string, unknown>
): Promise<ResolveResult> {
  // Prüfe Cache zuerst
  const cached = isinCache.get(isin);
  if (cached) {
    console.log(`[resolveIsin] Cache-Treffer für ${isin}`);
    return {
      category: cached.category,
      subCategory: cached.subCategory,
      direction: cached.direction,
      hebelHoehe: cached.hebelHoehe,
      status: cached.status,
      notes: cached.notes ? `${cached.notes} (aus Cache)` : undefined,
    };
  }

  let lastError: Error | null = null;

  // Schritt 1: Company Profile2 per ISIN versuchen
  try {
    console.log(`[resolveIsin] Schritt 1: Versuche Profile2 für ISIN ${isin}, Name: ${name || "nicht vorhanden"}`);
    const profile = await finnhubRequest("/stock/profile2", {
      isin: isin,
    });

    console.log(`[resolveIsin] Profile2 Response für ${isin}:`, JSON.stringify(profile).substring(0, 500));

    if (!isEmptyProfile(profile)) {
      const profileObj = profile as FinnhubProfile;
      const categorization = categorizeAsset(profileObj, name, originalRowData);
      console.log(`[resolveIsin] Erfolgreich kategorisiert ${isin}:`, categorization);
      const result = {
        ...categorization,
        status: "success" as const,
        notes: `✅ Gefunden via Profile2 (ISIN): ${profileObj.name || profileObj.ticker || isin} | Type: ${profileObj.type || "N/A"} | Kategorie: ${categorization.category}${categorization.subCategory ? ` (${categorization.subCategory})` : ""}`,
      };
      // Cache das Ergebnis
      isinCache.set(isin, result);
      return result;
    } else {
      console.log(`[resolveIsin] Profile2 leer für ${isin}, gehe zu Schritt 2`);
    }
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    console.error(`[resolveIsin] Fehler bei Schritt 1 für ${isin}:`, lastError.message);
    // Weiter zu Schritt 2
  }

  // Schritt 2: Symbol Lookup per ISIN
  try {
    console.log(`[resolveIsin] Schritt 2: Versuche Search für ISIN ${isin}, Name: ${name || "nicht vorhanden"}`);
    const searchResult = await finnhubRequest("/search", { q: isin });
    
    console.log(`[resolveIsin] Search Response für ${isin}:`, JSON.stringify(searchResult).substring(0, 500));
    
    if (
      searchResult &&
      typeof searchResult === "object" &&
      "result" in searchResult &&
      Array.isArray((searchResult as { result: unknown[] }).result)
    ) {
      const results = (searchResult as { result: unknown[] }).result as SearchResult[];
      
      console.log(`[resolveIsin] ${results.length} Suchergebnisse für ${isin}`);
      results.forEach((r, idx) => {
        console.log(`[resolveIsin] Ergebnis ${idx + 1}:`, {
          symbol: r.symbol,
          description: r.description,
          displaySymbol: r.displaySymbol,
          type: r.type,
        });
      });
      
      if (results.length > 0) {
        const bestMatch = findBestMatch(results);
        if (!bestMatch) {
          throw new Error(`Kein passender Match für ISIN ${isin} gefunden`);
        }
        console.log(`[resolveIsin] Best Match für ${isin}:`, {
          symbol: bestMatch.symbol,
          description: bestMatch.description,
          displaySymbol: bestMatch.displaySymbol,
          type: bestMatch.type,
        });
        
        if (bestMatch && bestMatch.symbol) {
          // Schritt 3: Mit Symbol weiter anreichern
          try {
            console.log(`[resolveIsin] Schritt 3: Hole Profile2 für Symbol ${bestMatch.symbol}`);
            const enrichedProfile = await finnhubRequest("/stock/profile2", {
              symbol: bestMatch.symbol,
            });

            console.log(`[resolveIsin] Profile2 für Symbol ${bestMatch.symbol}:`, JSON.stringify(enrichedProfile).substring(0, 200));

            if (!isEmptyProfile(enrichedProfile)) {
              const profileObj = enrichedProfile as FinnhubProfile;
              // Kombiniere Daten aus Search und Profile
              // WICHTIG: Name aus Search-Ergebnissen hat Priorität (dort steht immer der Rohstoff drin)
              const searchName = bestMatch.description || bestMatch.displaySymbol || name;
              console.log(`[resolveIsin] Verwende Search-Name für ${isin}: "${searchName}"`);
              console.log(`[resolveIsin] Profile-Name: "${profileObj.name}", Original-Name: "${name}"`);
              
              const combinedProfile: FinnhubProfile = {
                ...profileObj,
                type: profileObj.type || bestMatch.type,
                description: profileObj.description || bestMatch.description || searchName,
                name: profileObj.name || searchName || bestMatch.symbol,
              };

              // Verwende sowohl den Namen aus Search als auch den ursprünglichen Namen
              const categorization = categorizeAsset(combinedProfile, searchName || name || profileObj.name, originalRowData);
              console.log(`[resolveIsin] Kategorisierung für ${isin}:`, categorization, `| Analysierter Text: "${searchName || name || profileObj.name}"`);
              const result = {
                ...categorization,
                status: "success" as const,
                notes: `✅ Gefunden via Search + Profile2 | Symbol: ${bestMatch.symbol} | Name: "${searchName}" | Type: ${bestMatch.type || "N/A"} | Kategorie: ${categorization.category}${categorization.subCategory ? ` (${categorization.subCategory})` : ""}`,
              };
              // Cache das Ergebnis
              isinCache.set(isin, result);
              return result;
            }

            // Falls Profile leer ist, prüfe ob Search-Daten ausreichend sind
            // Nur kategorisieren wenn die API tatsächlich relevante Daten zurückgibt
            if (bestMatch.type || bestMatch.description || bestMatch.displaySymbol) {
              const searchName = bestMatch.description || bestMatch.displaySymbol || name || bestMatch.symbol;
              console.log(`[resolveIsin] Profile2 leer, verwende nur Search-Daten für ${isin}`);
              console.log(`[resolveIsin] Search-Name: "${searchName}" | Description: "${bestMatch.description}" | DisplaySymbol: "${bestMatch.displaySymbol}"`);
              
              const searchProfile: FinnhubProfile = {
                symbol: bestMatch.symbol,
                ticker: bestMatch.symbol,
                type: bestMatch.type,
                description: bestMatch.description,
                name: searchName,
              };

              // Verwende sowohl den Namen aus Search als auch den ursprünglichen Namen
              const categorization = categorizeAsset(searchProfile, searchName || name, originalRowData);
              console.log(`[resolveIsin] Kategorisierung für ${isin} (nur Search):`, categorization, `| Analysierter Text: "${searchName || name}"`);
              const result = {
                ...categorization,
                status: "success" as const,
                notes: `✅ Gefunden via Search | Symbol: ${bestMatch.symbol} | Name: "${searchName}" | Type: ${bestMatch.type || "N/A"} | Kategorie: ${categorization.category}${categorization.subCategory ? ` (${categorization.subCategory})` : ""}`,
              };
              // Cache das Ergebnis
              isinCache.set(isin, result);
              return result;
            }
            // Wenn Search-Daten nicht ausreichend sind, weiter zum nächsten Schritt
          } catch (error) {
            // Falls Profile2 fehlschlägt, prüfe ob Search-Daten ausreichend sind
            // Nur kategorisieren wenn die API tatsächlich relevante Daten zurückgibt
            if (bestMatch.type || bestMatch.description || bestMatch.displaySymbol) {
              const searchName = bestMatch.description || bestMatch.displaySymbol || name || bestMatch.symbol;
              console.log(`[resolveIsin] Profile2 fehlgeschlagen, verwende nur Search-Daten für ${isin}`);
              console.log(`[resolveIsin] Search-Name: "${searchName}" | Description: "${bestMatch.description}" | DisplaySymbol: "${bestMatch.displaySymbol}"`);
              
              const searchProfile: FinnhubProfile = {
                symbol: bestMatch.symbol,
                ticker: bestMatch.symbol,
                type: bestMatch.type,
                description: bestMatch.description,
                name: searchName,
              };

              // Verwende sowohl den Namen aus Search als auch den ursprünglichen Namen
              const categorization = categorizeAsset(searchProfile, searchName || name, originalRowData);
              console.log(`[resolveIsin] Kategorisierung für ${isin} (Search ohne Profile2):`, categorization, `| Analysierter Text: "${searchName || name}"`);
              const result = {
                ...categorization,
                status: "success" as const,
                notes: `✅ Gefunden via Search (Profile2 fehlgeschlagen) | Symbol: ${bestMatch.symbol} | Name: "${searchName}" | Type: ${bestMatch.type || "N/A"} | Kategorie: ${categorization.category}${categorization.subCategory ? ` (${categorization.subCategory})` : ""}`,
              };
              // Cache das Ergebnis
              isinCache.set(isin, result);
              return result;
            }
            // Wenn Search-Daten nicht ausreichend sind, weiter zum Fehler
            lastError = error instanceof Error ? error : new Error(String(error));
          }
        }
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
  }

  // Kein Treffer gefunden - keine heuristische Erkennung mehr
  // Nur kategorisieren, wenn die API tatsächlich Daten zurückgibt
  console.log(`[resolveIsin] ❌ Kein Treffer für ${isin}, Name: "${name || "nicht vorhanden"}"`);
  
  // Prüfe ob es ein 429 Rate Limit Fehler war
  const isRateLimitError = lastError?.message?.includes("429") || lastError?.message?.toLowerCase().includes("too many requests");
  
  const errorResult = {
    category: "Unbekannt/Fehler" as const,
    subCategory: null,
    direction: null,
    hebelHoehe: null,
    status: "error" as const,
    notes: `❌ ISIN ${isin} konnte nicht über Finnhub aufgelöst werden${name ? ` | Name: "${name}"` : ""}${lastError ? ` | Fehler: ${lastError.message}` : ""}${isRateLimitError ? " | ⚠️ Rate Limit (429) - wird später erneut geprüft" : ""}`,
    // Markiere 429-Fehler für spätere Wiederholung
    isRateLimit: isRateLimitError || false,
  };
  // Cache auch Fehler-Ergebnisse (aber nicht bei 429, damit sie erneut geprüft werden)
  if (!isRateLimitError) {
    isinCache.set(isin, errorResult);
  }
  return errorResult;
}
