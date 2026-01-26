import { createClient } from "./server";

/**
 * Test-Funktion zum Prüfen der Supabase-Verbindung und Abfrage
 * Kann in der API-Route temporär aufgerufen werden
 */
export async function testSupabaseQuery() {
  try {
    const supabase = await createClient();
    
    console.log("[testSupabaseQuery] Teste Supabase-Verbindung...");
    
    // Test 1: Prüfe ob Tabelle existiert und wie viele Einträge vorhanden sind
    const { count, error: countError } = await supabase
      .from("categorized_assets")
      .select("*", { count: "exact", head: true });
    
    if (countError) {
      console.error("[testSupabaseQuery] Fehler beim Zählen:", countError);
      return { success: false, error: countError };
    }
    
    console.log(`[testSupabaseQuery] Anzahl Einträge in Tabelle: ${count}`);
    
    // Test 2: Hole ein paar Beispiel-ISINs
    const { data: sampleData, error: sampleError } = await supabase
      .from("categorized_assets")
      .select("isin, category, name")
      .limit(5);
    
    if (sampleError) {
      console.error("[testSupabaseQuery] Fehler beim Abrufen von Beispielen:", sampleError);
      return { success: false, error: sampleError, count };
    }
    
    console.log(`[testSupabaseQuery] Beispiel-ISINs:`, sampleData);
    
    // Test 3: Teste eine spezifische ISIN-Abfrage
    if (sampleData && sampleData.length > 0) {
      const testIsin = sampleData[0].isin;
      console.log(`[testSupabaseQuery] Teste Abfrage für ISIN: ${testIsin}`);
      
      const { data: testData, error: testError } = await supabase
        .from("categorized_assets")
        .select("*")
        .eq("isin", testIsin)
        .limit(1);
      
      if (testError) {
        console.error("[testSupabaseQuery] Fehler bei spezifischer ISIN-Abfrage:", testError);
        return { success: false, error: testError, count, sampleData };
      }
      
      console.log(`[testSupabaseQuery] Ergebnis für ISIN ${testIsin}:`, testData);
      
      return {
        success: true,
        count,
        sampleData,
        testIsin,
        testResult: testData,
      };
    }
    
    return {
      success: true,
      count,
      sampleData,
      message: "Tabelle ist leer",
    };
  } catch (error) {
    console.error("[testSupabaseQuery] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
