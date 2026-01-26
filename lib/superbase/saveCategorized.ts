import { createClient } from "./server";
import { CheckedRow } from "@/types";

/**
 * Speichert kategorisierte Daten in Supabase
 */
export async function saveCategorizedToSupabase(rows: CheckedRow[]): Promise<void> {
  try {
    const supabase = await createClient();
    
    // Bereite die Daten für Supabase vor
    const dataToInsert = rows
      .filter(row => row.status === "success") // Nur erfolgreich kategorisierte Zeilen
      .map(row => {
        // Extrahiere die vollständige Kategorisierung
        const isHebel = row.hebelHoehe !== null && row.hebelHoehe !== undefined;
        const isRohstoff = row.subCategory !== null && row.subCategory !== undefined && row.subCategory.startsWith("Rohstoff_");
        
        // Bestimme Unterkategorie-Typ
        const unterkategorieTyp = isHebel ? "Hebel" : "Normal";
        
        // Bestimme Rohstoff-Typ
        const rohstoffTyp = isRohstoff ? "Rohstoff" : "kein_Rohstoff";
        
        // Extrahiere Rohstoff-Art (falls vorhanden)
        const rohstoffArt = isRohstoff && row.subCategory 
          ? row.subCategory.replace("Rohstoff_", "") 
          : null;
        
        return {
          isin: row.isin,
          name: row.name,
          wkn: row.wkn,
          category: row.category,
          // Neue strukturierte Felder
          unterkategorie_typ: unterkategorieTyp,
          rohstoff_typ: rohstoffTyp,
          rohstoff_art: rohstoffArt,
          direction: row.direction,
          hebel_hoehe: row.hebelHoehe,
          // Legacy-Feld für Rückwärtskompatibilität
          sub_category: row.subCategory,
          status: row.status,
          notes: row.notes || null,
          original_row_data: row.originalRowData || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });

    if (dataToInsert.length === 0) {
      console.log("[saveCategorizedToSupabase] Keine erfolgreich kategorisierten Zeilen zum Speichern");
      return;
    }

    // Verwende upsert, um Duplikate zu vermeiden (basierend auf ISIN)
    // Falls die ISIN bereits existiert, wird der Eintrag aktualisiert
    const { error } = await supabase
      .from("categorized_assets")
      .upsert(dataToInsert, {
        onConflict: "isin",
        ignoreDuplicates: false, // Aktualisiere bestehende Einträge
      });

    if (error) {
      console.error("[saveCategorizedToSupabase] Fehler beim Speichern in Supabase:", error);
      throw error;
    }

    console.log(`[saveCategorizedToSupabase] Erfolgreich ${dataToInsert.length} Zeilen in Supabase gespeichert`);
  } catch (error) {
    console.error("[saveCategorizedToSupabase] Fehler:", error);
    // Wir werfen den Fehler nicht weiter, damit die API-Antwort nicht fehlschlägt
    // Die Daten werden trotzdem zurückgegeben, auch wenn das Speichern fehlschlägt
  }
}
