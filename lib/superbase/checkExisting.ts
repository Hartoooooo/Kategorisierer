import { createApiClient } from "./api";
import { CheckedRow } from "@/types";

interface SupabaseAsset {
  isin: string;
  name: string | null;
  wkn: string | null;
  category: string;
  // Neue strukturierte Felder
  unterkategorie_typ?: string | null;
  rohstoff_typ?: string | null;
  rohstoff_art?: string | null;
  direction: string | null;
  hebel_hoehe: string | null;
  // Legacy-Feld
  sub_category: string | null;
  status: string;
  notes: string | null;
  original_row_data: Record<string, unknown> | null;
}

/**
 * Prüft, ob ISINs bereits in Supabase existieren und lädt deren Daten
 * @param isins Array von ISINs, die geprüft werden sollen
 * @returns Map mit ISIN als Key und den Daten aus Supabase als Value (oder null wenn nicht vorhanden)
 */
export async function checkExistingIsins(
  isins: string[]
): Promise<Map<string, SupabaseAsset | null>> {
  try {
    const supabase = createApiClient();
    
    if (isins.length === 0) {
      console.log("[checkExistingIsins] Keine ISINs zum Prüfen");
      return new Map();
    }

    console.log(`[checkExistingIsins] Prüfe ${isins.length} ISINs in Supabase:`, isins.slice(0, 5), isins.length > 5 ? "..." : "");

    // Lade alle ISINs auf einmal aus Supabase
    // WICHTIG: .in() funktioniert nur mit Arrays bis zu einer bestimmten Größe
    // Bei vielen ISINs müssen wir möglicherweise in Batches aufteilen
    const MAX_ISINS_PER_QUERY = 100; // Supabase Limit für .in() Queries
    
    let allData: SupabaseAsset[] = [];
    
    // Teile ISINs in Batches auf, falls nötig
    for (let i = 0; i < isins.length; i += MAX_ISINS_PER_QUERY) {
      const batch = isins.slice(i, i + MAX_ISINS_PER_QUERY);
      console.log(`[checkExistingIsins] Prüfe Batch ${Math.floor(i / MAX_ISINS_PER_QUERY) + 1}: ${batch.length} ISINs`);
      
      const { data, error } = await supabase
        .from("categorized_assets")
        .select("*")
        .in("isin", batch);
      
      if (error) {
        console.error(`[checkExistingIsins] Fehler beim Laden Batch ${Math.floor(i / MAX_ISINS_PER_QUERY) + 1}:`, error);
        // Bei Fehler: diesen Batch überspringen, aber weitermachen
        continue;
      }
      
      if (data && Array.isArray(data)) {
        allData = [...allData, ...data];
        console.log(`[checkExistingIsins] Batch ${Math.floor(i / MAX_ISINS_PER_QUERY) + 1}: ${data.length} Einträge gefunden`);
      }
    }
    
    // Verwende die gesammelten Daten
    const data = allData;

    console.log(`[checkExistingIsins] Supabase Response:`, {
      dataLength: data?.length || 0,
      dataType: Array.isArray(data) ? "array" : typeof data,
      firstFew: data && Array.isArray(data) ? data.slice(0, 3).map(a => ({ isin: a.isin, category: a.category })) : data,
    });

    // Erstelle Map mit ISIN als Key
    const existingMap = new Map<string, SupabaseAsset | null>();
    
    // Alle angefragten ISINs initialisieren
    isins.forEach(isin => {
      existingMap.set(isin, null);
    });
    
      // Fülle Map mit gefundenen Daten
      if (data && Array.isArray(data)) {
        console.log(`[checkExistingIsins] Verarbeite ${data.length} gefundene Einträge`);
        let foundCount = 0;
        
        // Erstelle eine Map mit normalisierten ISINs aus der Datenbank
        const dbIsinMap = new Map<string, SupabaseAsset>();
        data.forEach((asset: SupabaseAsset) => {
          if (asset.isin) {
            // Normalisiere ISIN (entferne Leerzeichen, konvertiere zu Großbuchstaben)
            const normalizedIsin = asset.isin.trim().toUpperCase();
            dbIsinMap.set(normalizedIsin, asset);
            // Speichere auch die ursprüngliche ISIN als Key
            dbIsinMap.set(asset.isin, asset);
          } else {
            console.warn(`[checkExistingIsins] Eintrag ohne ISIN gefunden:`, asset);
          }
        });
        
        // Vergleiche angefragte ISINs mit Datenbank-ISINs
        isins.forEach(requestedIsin => {
          const normalizedRequested = requestedIsin.trim().toUpperCase();
          
          // Prüfe zuerst mit normalisierter ISIN, dann mit ursprünglicher
          const found = dbIsinMap.get(normalizedRequested) || dbIsinMap.get(requestedIsin);
          
          if (found) {
            existingMap.set(requestedIsin, found);
            foundCount++;
            if (foundCount <= 5) {
              console.log(`[checkExistingIsins] Gefunden: ISIN ${requestedIsin} (normalisiert: ${normalizedRequested}), Kategorie: ${found.category}`);
            }
          }
        });
      } else {
        console.warn(`[checkExistingIsins] Daten sind kein Array:`, typeof data, data);
      }

    const foundCount = Array.from(existingMap.values()).filter(v => v !== null).length;
    console.log(`[checkExistingIsins] ERGEBNIS: ${foundCount} von ${isins.length} ISINs bereits in Supabase gefunden`);

    return existingMap;
  } catch (error) {
    console.error("[checkExistingIsins] Exception:", error);
    if (error instanceof Error) {
      console.error("[checkExistingIsins] Error Stack:", error.stack);
    }
    // Bei Fehler: alle ISINs als nicht vorhanden markieren
    return new Map(isins.map(isin => [isin, null]));
  }
}

/**
 * Konvertiert Supabase-Daten in das Format von ResolveResult
 * Unterstützt sowohl neue strukturierte Felder als auch Legacy-Felder
 */
export function convertSupabaseToResolveResult(asset: SupabaseAsset): {
  category: string;
  subCategory: string | null;
  direction: string | null;
  hebelHoehe: string | null;
  status: "success" | "error";
  notes?: string;
  fromDatabase?: boolean;
} {
  // Wenn neue strukturierte Felder vorhanden sind, verwende diese
  // Ansonsten verwende Legacy-Felder (für Rückwärtskompatibilität)
  let subCategory: string | null = null;
  
  if (asset.unterkategorie_typ && asset.rohstoff_typ) {
    // Neue Struktur: Baue subCategory aus den neuen Feldern zusammen
    if (asset.rohstoff_typ === "Rohstoff" && asset.rohstoff_art) {
      subCategory = `Rohstoff_${asset.rohstoff_art}`;
    } else {
      // Kein Rohstoff
      subCategory = asset.unterkategorie_typ === "Hebel" ? null : "Normal";
    }
  } else {
    // Legacy: Verwende sub_category direkt
    subCategory = asset.sub_category;
  }
  
  return {
    category: asset.category,
    subCategory: subCategory,
    direction: asset.direction as "long" | "short" | null,
    hebelHoehe: asset.hebel_hoehe as "2x" | "3x" | "5x" | "10x" | "20x" | "Andere" | null,
    status: asset.status as "success" | "error",
    notes: asset.notes ? `${asset.notes} (aus Datenbank)` : "Aus Datenbank geladen",
    fromDatabase: true,
  };
}
