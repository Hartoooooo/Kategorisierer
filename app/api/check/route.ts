import { NextRequest, NextResponse } from "next/server";
import { checkRequestSchema } from "@/lib/validation/schemas";
import { jobStore } from "@/lib/store/jobStore";
import { resolveIsin } from "@/lib/finnhub/resolveIsin";
import { finnhubRequestBatch } from "@/lib/finnhub/client";
import { CheckedRow, CheckSummary } from "@/types";
import { saveCategorizedToSupabase } from "@/lib/superbase/saveCategorized";
import { checkExistingIsins, convertSupabaseToResolveResult } from "@/lib/superbase/checkExisting";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = checkRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Ungültige Anfrage", details: validation.error.errors },
        { status: 400 }
      );
    }

    const { jobId, rows, batchIndex = 0, offset } = validation.data;

    // Validierung: Prüfe ob rows vorhanden sind
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "Keine Zeilen zum Prüfen vorhanden" },
        { status: 400 }
      );
    }

    // Nur gültige ISINs prüfen
    const validRows = rows.filter((row) => row.validIsin);
    if (validRows.length === 0) {
      return NextResponse.json(
        {
          summary: {},
          rows: rows.map((row) => ({
            ...row,
            category: "Unbekannt/Fehler" as const,
            subCategory: null,
            direction: null,
            hebelHoehe: null,
            status: "error" as const,
            notes: "Ungültige ISIN",
          })),
          errors: ["Keine gültigen ISINs zum Prüfen gefunden"],
        },
        { status: 200 }
      );
    }

    // Eindeutige ISINs sammeln (jede ISIN nur einmal prüfen)
    // Speichere auch originalRowData für die erste Zeile jeder ISIN
    const uniqueIsins = new Map<
      string,
      { isin: string; name: string; rowIndices: number[]; originalRowData?: Record<string, unknown> }
    >();

    validRows.forEach((row) => {
      if (!uniqueIsins.has(row.isin)) {
        uniqueIsins.set(row.isin, {
          isin: row.isin,
          name: row.name,
          rowIndices: [],
          originalRowData: row.originalRowData,
        });
      }
      uniqueIsins.get(row.isin)!.rowIndices.push(row.rowIndex);
    });

    // Alle eindeutigen ISINs prüfen
    let uniqueIsinsArray = Array.from(uniqueIsins.values());
    
    // Batch-Logik: Alle Batches je 40 ISINs
    const BATCH_SIZE = 40;
    
    // Deklariere Variablen außerhalb der if-else-Blöcke
    let existingIsins: Array<{ isin: string; name: string; rowIndices: number[]; originalRowData?: Record<string, unknown>; supabaseData: ReturnType<typeof convertSupabaseToResolveResult> }> = [];
    let newIsins: Array<{ isin: string; name: string; rowIndices: number[]; originalRowData?: Record<string, unknown> }> = [];
    let isinsNotChecked: Array<{ isin: string; name: string; rowIndices: number[]; originalRowData?: Record<string, unknown> }> = [];
    
    // Im ersten Batch: Prüfe ALLE ISINs auf einmal in Supabase
    if (batchIndex === 0) {
      console.log(`[check] Batch ${batchIndex}: Prüfe alle ${uniqueIsinsArray.length} ISINs in Supabase`);
      
      // Prüfe alle ISINs auf einmal in Supabase
      const allIsinsArray = uniqueIsinsArray.map(item => item.isin);
      let existingIsinsMap: Map<string, any>;
      
      // DEBUG: Teste Supabase-Verbindung (kann später entfernt werden)
      if (allIsinsArray.length > 0) {
        console.log(`[check] DEBUG: Prüfe ${allIsinsArray.length} ISINs in Supabase`);
        console.log(`[check] DEBUG: Erste 5 ISINs:`, allIsinsArray.slice(0, 5));
      }
      
      try {
        existingIsinsMap = await checkExistingIsins(allIsinsArray);
        console.log(`[check] DEBUG: existingIsinsMap Größe:`, existingIsinsMap.size);
        console.log(`[check] DEBUG: Gefundene ISINs:`, Array.from(existingIsinsMap.entries()).filter(([_, v]) => v !== null).map(([isin, _]) => isin));
      } catch (error) {
        console.error(`[check] Fehler beim Prüfen in Supabase:`, error);
        // Bei Fehler: alle ISINs als nicht vorhanden behandeln
        existingIsinsMap = new Map();
      }
      
      // Trenne ISINs in bereits vorhandene und neue
      const existingIsinsFromDb: Array<{ isin: string; name: string; rowIndices: number[]; originalRowData?: Record<string, unknown>; supabaseData: ReturnType<typeof convertSupabaseToResolveResult> }> = [];
      const newIsinsToCheck: Array<{ isin: string; name: string; rowIndices: number[]; originalRowData?: Record<string, unknown> }> = [];
      
      uniqueIsinsArray.forEach(({ isin, name, rowIndices, originalRowData }) => {
        // Normalisiere ISIN für Vergleich (Großbuchstaben, keine Leerzeichen)
        const normalizedIsin = isin.trim().toUpperCase();
        
        // Prüfe sowohl mit normalisierter als auch mit ursprünglicher ISIN
        const existingData = existingIsinsMap.get(normalizedIsin) || existingIsinsMap.get(isin);
        
        if (existingData) {
          // ISIN existiert bereits in Supabase
          const convertedData = convertSupabaseToResolveResult(existingData);
          existingIsinsFromDb.push({ isin, name, rowIndices, originalRowData, supabaseData: convertedData });
          console.log(`[check] ISIN ${isin} (normalisiert: ${normalizedIsin}) bereits in Supabase gefunden, überspringe API-Prüfung`);
        } else {
          // ISIN nicht in Supabase, muss über API geprüft werden
          newIsinsToCheck.push({ isin, name, rowIndices, originalRowData });
          console.log(`[check] ISIN ${isin} (normalisiert: ${normalizedIsin}) NICHT in Supabase gefunden, wird über API geprüft`);
        }
      });
      
      console.log(`[check] Batch ${batchIndex}: SUPABASE-PRÜFUNG ABGESCHLOSSEN - ${existingIsinsFromDb.length} ISINs bereits in Datenbank gefunden, ${newIsinsToCheck.length} ISINs müssen über Finnhub API geprüft werden`);
      
      // Speichere die nicht gefundenen ISINs im jobStore für weitere Batches
      if (jobId && newIsinsToCheck.length > 0) {
        const existingJobData = jobStore.get(jobId);
        jobStore.set(jobId, {
          ...existingJobData,
          parsedRows: rows,
          newIsinsToCheck: newIsinsToCheck, // Speichere für weitere Batches
          originalHeaders: existingJobData?.originalHeaders,
        });
      }
      
      // Hole 429-Fehler aus dem jobStore (falls vorhanden) und prüfe sie ZUERST in Supabase
      let rateLimitIsinsFromStore: Array<{ isin: string; name: string; rowIndices: number[]; originalRowData?: Record<string, unknown> }> = [];
      if (jobId) {
        const existingJobData = jobStore.get(jobId);
        if (existingJobData?.checkedRows) {
          const rateLimitRows = existingJobData.checkedRows.filter(
            (row) => row.category === "Nicht geprüft" && (row.notes?.includes("429") || row.notes?.includes("Rate Limit"))
          );
          
          const rateLimitIsinsMap = new Map<string, { isin: string; name: string; rowIndices: number[]; originalRowData?: Record<string, unknown> }>();
          rateLimitRows.forEach((row) => {
            if (!rateLimitIsinsMap.has(row.isin)) {
              rateLimitIsinsMap.set(row.isin, {
                isin: row.isin,
                name: row.name,
                rowIndices: [],
                originalRowData: row.originalRowData,
              });
            }
            rateLimitIsinsMap.get(row.isin)!.rowIndices.push(row.rowIndex);
          });
          
          rateLimitIsinsFromStore = Array.from(rateLimitIsinsMap.values());
          
          // WICHTIG: Prüfe 429-Fehler-ISINs ZUERST in Supabase, bevor sie zur API-Liste hinzugefügt werden
          if (rateLimitIsinsFromStore.length > 0) {
            const rateLimitIsinsArray = rateLimitIsinsFromStore.map(item => item.isin);
            let rateLimitExistingMap: Map<string, any>;
            
            try {
              rateLimitExistingMap = await checkExistingIsins(rateLimitIsinsArray);
              console.log(`[check] Prüfe ${rateLimitIsinsFromStore.length} 429-Fehler-ISINs in Supabase`);
            } catch (error) {
              console.error(`[check] Fehler beim Prüfen von 429-Fehler-ISINs in Supabase:`, error);
              rateLimitExistingMap = new Map();
            }
            
            // Trenne 429-Fehler-ISINs in bereits vorhandene und neue
            const rateLimitExisting: Array<{ isin: string; name: string; rowIndices: number[]; originalRowData?: Record<string, unknown>; supabaseData: ReturnType<typeof convertSupabaseToResolveResult> }> = [];
            const rateLimitNew: Array<{ isin: string; name: string; rowIndices: number[]; originalRowData?: Record<string, unknown> }> = [];
            
            rateLimitIsinsFromStore.forEach(({ isin, name, rowIndices, originalRowData }) => {
              const existingData = rateLimitExistingMap.get(isin);
              if (existingData) {
                // ISIN existiert bereits in Supabase
                const convertedData = convertSupabaseToResolveResult(existingData);
                rateLimitExisting.push({ isin, name, rowIndices, originalRowData, supabaseData: convertedData });
                console.log(`[check] 429-Fehler-ISIN ${isin} bereits in Supabase gefunden, überspringe API-Prüfung`);
              } else {
                // ISIN nicht in Supabase, muss über API geprüft werden
                rateLimitNew.push({ isin, name, rowIndices, originalRowData });
              }
            });
            
            // Füge bereits vorhandene 429-Fehler-ISINs zu existingIsins hinzu
            existingIsinsFromDb.push(...rateLimitExisting);
            
            // Nur neue 429-Fehler-ISINs werden zur API-Liste hinzugefügt
            rateLimitIsinsFromStore = rateLimitNew;
            console.log(`[check] ${rateLimitExisting.length} 429-Fehler-ISINs bereits in Supabase, ${rateLimitNew.length} müssen über API geprüft werden`);
          }
        }
      }
      
      // Im ersten Batch: Verarbeite nur die ersten BATCH_SIZE neuen ISINs
      let isinsToCheck = newIsinsToCheck.slice(0, BATCH_SIZE);
      isinsNotChecked = newIsinsToCheck.slice(BATCH_SIZE);
      
      // Verarbeite die gefundenen ISINs aus der Datenbank (inkl. 429-Fehler-ISINs die bereits in Supabase sind)
      existingIsins = existingIsinsFromDb;
      newIsins = isinsToCheck;
      
      // Füge neue 429-Fehler-ISINs zu den neuen ISINs hinzu (haben Priorität)
      if (rateLimitIsinsFromStore.length > 0) {
        newIsins.unshift(...rateLimitIsinsFromStore);
      }
      
      console.log(`[check] Batch ${batchIndex}: STARTE FINNHUB API-PRÜFUNG - ${existingIsins.length} ISINs aus Datenbank (werden NICHT über API geprüft), ${newIsins.length} ISINs werden über Finnhub API geprüft (inkl. ${rateLimitIsinsFromStore.length} 429-Fehler), ${isinsNotChecked.length} ISINs warten auf nächste Batches`);
    } else {
      // Weitere Batches: Lade die nicht gefundenen ISINs aus dem jobStore
      if (!jobId) {
        return NextResponse.json({
          summary: {},
          rows: [],
          errors: ["jobId fehlt für weitere Batches"],
          hasMore: false,
        }, { status: 400 });
      }
      
      const existingJobData = jobStore.get(jobId);
      const newIsinsToCheck = existingJobData?.newIsinsToCheck || [];
      
      if (newIsinsToCheck.length === 0) {
        return NextResponse.json({
          summary: {},
          rows: [],
          errors: ["Keine weiteren ISINs zum Prüfen"],
          hasMore: false,
        });
      }
      
      // Berechne den Start-Index für diesen Batch
      const startIndex = offset !== undefined ? offset : (batchIndex - 1) * BATCH_SIZE;
      const endIndex = Math.min(startIndex + BATCH_SIZE, newIsinsToCheck.length);
      let isinsToCheck = newIsinsToCheck.slice(startIndex, endIndex);
      
      console.log(`[check] Batch ${batchIndex}: Verarbeite ISINs ${startIndex} bis ${endIndex} von ${newIsinsToCheck.length} nicht gefundenen ISINs`);
      
      // Keine ISINs aus Datenbank in weiteren Batches (alle wurden bereits im ersten Batch geprüft)
      existingIsins = [];
      newIsins = isinsToCheck;
      // In weiteren Batches gibt es keine "nicht geprüften" ISINs mehr (alle werden verarbeitet)
      isinsNotChecked = [];
    }

    // Finnhub Requests nur für neue ISINs vorbereiten
    const resolveRequests = newIsins.map(
      ({ isin, name, originalRowData }) => () => resolveIsin(isin, name, originalRowData)
    );

    // Batch-Requests mit Concurrency-Limit ausführen (nur für neue ISINs)
    // Wenn keine neuen ISINs vorhanden sind, verwende leere Ergebnisse
    let resolveResults: Array<Awaited<ReturnType<typeof resolveIsin>>> = [];
    let averageTimePerRequest = 0;
    
    if (resolveRequests.length > 0) {
      const batchResult = await finnhubRequestBatch(resolveRequests);
      resolveResults = batchResult.results;
      averageTimePerRequest = batchResult.averageTimePerRequest;
    } else {
      console.log(`[check] Batch ${batchIndex}: Keine neuen ISINs zum Prüfen über Finnhub API (alle bereits in Supabase oder bereits geprüft)`);
    }

    // Berechne die geschätzte verbleibende Zeit
    // Formel: (Anzahl noch zu prüfender ISINs / Concurrency-Limit) * durchschnittliche Zeit pro Request
    const CONCURRENCY_LIMIT = parseInt(process.env.FINNHUB_CONCURRENCY_LIMIT || "17", 10);
    
    // Berechne verbleibende ISINs für weitere Batches
    let remainingIsinsCount = 0;
    if (batchIndex === 0) {
      if (jobId) {
        const existingJobData = jobStore.get(jobId);
        remainingIsinsCount = existingJobData?.newIsinsToCheck?.length || 0;
        // Subtrahiere die bereits verarbeiteten ISINs (inkl. 429-Fehler)
        remainingIsinsCount = Math.max(0, remainingIsinsCount - newIsins.length);
      }
    } else {
      if (jobId) {
        const existingJobData = jobStore.get(jobId);
        const allNewIsins = existingJobData?.newIsinsToCheck || [];
        const startIndex = offset !== undefined ? offset : (batchIndex - 1) * BATCH_SIZE;
        remainingIsinsCount = Math.max(0, allNewIsins.length - (startIndex + BATCH_SIZE));
      }
    }
    
    const estimatedTotalTime =
      (remainingIsinsCount / CONCURRENCY_LIMIT) * averageTimePerRequest;
    const estimatedTimeRemaining = estimatedTotalTime;
    
    // Berechne totalIsins für die Response
    const totalIsins = newIsins.length;

    // Ergebnisse auf alle Zeilen mappen
    let checkedRows: CheckedRow[] = [];
    const summary: CheckSummary = {};

    // Sammle 429 Rate Limit Fehler für spätere Wiederholung
    const rateLimitIsins: Array<{ isin: string; name: string; rowIndices: number[]; originalRowData?: Record<string, unknown> }> = [];

    // Zuerst: ISINs aus Supabase verarbeiten
    existingIsins.forEach(({ isin, name, rowIndices, originalRowData, supabaseData }) => {
      const result = supabaseData;

      // Kategorisierung für Summary
      let categoryKey = result.category;
      
      const isHebel = result.hebelHoehe !== null && result.hebelHoehe !== undefined;
      const isRohstoff = result.subCategory !== null && result.subCategory !== undefined && result.subCategory.startsWith("Rohstoff_");
      
      if (isHebel) {
        categoryKey += `_Hebel`;
      } else {
        categoryKey += `_Normal`;
      }
      
      if (isRohstoff) {
        const rohstoffArt = result.subCategory.replace("Rohstoff_", "");
        categoryKey += `_Rohstoff_${rohstoffArt}`;
      } else {
        categoryKey += `_kein_Rohstoff`;
      }
      
      if (result.direction) {
        categoryKey += `_${result.direction}`;
      }
      
      if (isHebel && result.hebelHoehe) {
        categoryKey += `_${result.hebelHoehe}`;
      }
      
      summary[categoryKey] = (summary[categoryKey] || 0) + rowIndices.length;

      // Für jede Zeile mit dieser ISIN ein CheckedRow erstellen
      rowIndices.forEach((rowIndex) => {
        const originalRow = rows.find((r) => r.rowIndex === rowIndex);
        if (originalRow) {
          checkedRows.push({
            ...originalRow,
            category: result.category as CheckedRow["category"],
            subCategory: result.subCategory as CheckedRow["subCategory"],
            direction: result.direction as CheckedRow["direction"],
            hebelHoehe: result.hebelHoehe as CheckedRow["hebelHoehe"],
            status: result.status,
            notes: result.notes,
          });
        }
      });
    });

    // Dann: Neue ISINs aus API-Ergebnissen verarbeiten
    newIsins.forEach(({ isin, name, rowIndices, originalRowData }, index) => {
      const result = resolveResults[index];

      // Fallback, falls das Ergebnis fehlt oder null ist
      if (!result) {
        const fallbackResult = {
          category: "Unbekannt/Fehler" as const,
          subCategory: null as const,
          direction: null as const,
          hebelHoehe: null as const,
          status: "error" as const,
          notes: `Fehler beim Abrufen der Daten für ISIN ${isin}`,
        };

        const categoryKey = "Unbekannt/Fehler";
        summary[categoryKey] = (summary[categoryKey] || 0) + rowIndices.length;

        rowIndices.forEach((rowIndex) => {
          const originalRow = rows.find((r) => r.rowIndex === rowIndex);
          if (originalRow) {
            checkedRows.push({
              ...originalRow,
              ...fallbackResult,
            });
          }
        });
        return;
      }

      // Prüfe ob es ein 429 Rate Limit Fehler ist
      if (result.isRateLimit) {
        // Sammle für spätere Wiederholung
        rateLimitIsins.push({ isin, name, rowIndices, originalRowData });
        // Füge als "Nicht geprüft" hinzu (wird im nächsten Batch erneut geprüft)
        const categoryKey = "Nicht geprüft";
        summary[categoryKey] = (summary[categoryKey] || 0) + rowIndices.length;
        
        console.log(`[check] Batch ${batchIndex}: ISIN ${isin} hat 429-Fehler, wird als "Nicht geprüft" markiert`);
        
        rowIndices.forEach((rowIndex) => {
          const originalRow = rows.find((r) => r.rowIndex === rowIndex);
          if (originalRow) {
            checkedRows.push({
              ...originalRow,
              category: "Nicht geprüft" as const,
              subCategory: null,
              direction: null,
              hebelHoehe: null,
              status: "pending" as const,
              notes: `429 Rate Limit - wird im nächsten Batch erneut geprüft`,
            });
          }
        });
        return;
      }

      // Erstelle Category-Key basierend auf der neuen Struktur
      // Format: Oberkategorie_Hebel/Normal_Rohstoff_[Art]_Long/Short_[Hebelhoehe]
      // Beispiel: ETP_Hebel_Rohstoff_Gold_Long_2x
      // Beispiel: ETP_Normal_Rohstoff_Gold
      // Beispiel: ETP_Hebel_Long_2x (kein Rohstoff)
      // Beispiel: ETP_Normal (kein Rohstoff, kein Hebel)
      let categoryKey = result.category;
      
      // Bestimme ob es Hebel oder Normal ist
      const isHebel = result.hebelHoehe !== null && result.hebelHoehe !== undefined;
      const isRohstoff = result.subCategory && result.subCategory.startsWith("Rohstoff_");
      
      // Füge Hebel/Normal hinzu
      if (isHebel) {
        categoryKey += `_Hebel`;
      } else {
        categoryKey += `_Normal`;
      }
      
      // Bei Rohstoffen: Füge Rohstoffart hinzu
      if (isRohstoff) {
        // subCategory ist z.B. "Rohstoff_Gold", extrahiere nur "Gold"
        const rohstoffArt = result.subCategory.replace("Rohstoff_", "");
        categoryKey += `_Rohstoff_${rohstoffArt}`;
      } else {
        // Kein Rohstoff
        categoryKey += `_kein_Rohstoff`;
      }
      
      // Füge Richtung hinzu (Long/Short)
      if (result.direction) {
        categoryKey += `_${result.direction}`;
      }
      
      // Füge Hebelhöhe hinzu (nur bei Hebeln)
      if (isHebel && result.hebelHoehe) {
        categoryKey += `_${result.hebelHoehe}`;
      }

      // Summary aktualisieren
      summary[categoryKey] = (summary[categoryKey] || 0) + rowIndices.length;

      // Alle Zeilen mit dieser ISIN aktualisieren
      rowIndices.forEach((rowIndex) => {
        const originalRow = rows.find((r) => r.rowIndex === rowIndex);
        if (originalRow) {
          checkedRows.push({
            ...originalRow,
            category: result.category,
            subCategory: result.subCategory,
            direction: result.direction,
            hebelHoehe: result.hebelHoehe,
            status: result.status,
            notes: result.notes,
          });
        }
      });
    });

    // Nicht geprüfte ISINs hinzufügen (nur wenn es noch weitere gibt)
    // Diese werden erst in späteren Batches geprüft
    if (batchIndex === 0 && isinsNotChecked.length > 0) {
      isinsNotChecked.forEach(({ isin, name, rowIndices }) => {
        const categoryKey = "Nicht geprüft";
        summary[categoryKey] = (summary[categoryKey] || 0) + rowIndices.length;

        rowIndices.forEach((rowIndex) => {
          const originalRow = rows.find((r) => r.rowIndex === rowIndex);
          if (originalRow) {
            checkedRows.push({
              ...originalRow,
              category: "Nicht geprüft" as const,
              subCategory: null,
              direction: null,
              hebelHoehe: null,
              status: "pending" as const,
              notes: `Wird in späteren Batches geprüft`,
            });
          }
        });
      });
    }

    // Ungültige ISINs hinzufügen
    rows
      .filter((row) => !row.validIsin)
      .forEach((row) => {
        checkedRows.push({
          ...row,
          category: "Unbekannt/Fehler",
          subCategory: null,
          direction: null,
          hebelHoehe: null,
          status: "error",
          notes: "Ungültige ISIN",
        });
        summary["Unbekannt/Fehler"] = (summary["Unbekannt/Fehler"] || 0) + 1;
      });

    // Sortiere: "Nicht geprüft" (inkl. 429-Fehler) zuerst, dann nach rowIndex
    checkedRows.sort((a, b) => {
      const aIsPending = a.category === "Nicht geprüft";
      const bIsPending = b.category === "Nicht geprüft";
      if (aIsPending && !bIsPending) return -1;
      if (!aIsPending && bIsPending) return 1;
      return a.rowIndex - b.rowIndex;
    });

    // Job-Daten optional im Store speichern (für Download-Endpoint)
    // Bei weiteren Batches: Ergebnisse zu bestehenden hinzufügen, nicht ersetzen
    let mergedCheckedRows = checkedRows;
    
    if (jobId) {
      const existingJobData = jobStore.get(jobId);
      
      if (batchIndex > 0 && existingJobData?.checkedRows) {
        // Entferne alte "Nicht geprüft" Einträge für ISINs, die jetzt geprüft wurden
        const checkedIsins = new Set(checkedRows.map(r => r.isin));
        const filteredExistingRows = existingJobData.checkedRows.filter(row => 
          row.category !== "Nicht geprüft" || !checkedIsins.has(row.isin)
        );
        
        // Merge: Neue Ergebnisse zu bestehenden hinzufügen
        mergedCheckedRows = [...filteredExistingRows, ...checkedRows];
        
        // Sortiere: "Nicht geprüft" zuerst, dann nach rowIndex
        mergedCheckedRows.sort((a, b) => {
          const aIsPending = a.category === "Nicht geprüft";
          const bIsPending = b.category === "Nicht geprüft";
          if (aIsPending && !bIsPending) return -1;
          if (!aIsPending && bIsPending) return 1;
          return a.rowIndex - b.rowIndex;
        });
      } else if (batchIndex === 0) {
        // Im ersten Batch: Sortiere auch hier
        mergedCheckedRows.sort((a, b) => {
          const aIsPending = a.category === "Nicht geprüft";
          const bIsPending = b.category === "Nicht geprüft";
          if (aIsPending && !bIsPending) return -1;
          if (!aIsPending && bIsPending) return 1;
          return a.rowIndex - b.rowIndex;
        });
      }
      
      // Behalte newIsinsToCheck für weitere Batches
      const currentNewIsinsToCheck = existingJobData?.newIsinsToCheck || [];
      
      jobStore.set(jobId, {
        parsedRows: rows,
        checkedRows: mergedCheckedRows,
        // Header aus bestehenden Job-Daten übernehmen
        originalHeaders: existingJobData?.originalHeaders,
        // Behalte newIsinsToCheck für weitere Batches
        newIsinsToCheck: currentNewIsinsToCheck,
      });
    }
    
    // Summary IMMER aus den tatsächlich angezeigten Zeilen berechnen
    const finalSummary = mergedCheckedRows.reduce((acc, row) => {
      // Format: Oberkategorie_Hebel/Normal_Rohstoff_[Art]_Long/Short_[Hebelhoehe]
      let categoryKey = row.category;
      
      // Bestimme ob es Hebel oder Normal ist
      const isHebel = row.hebelHoehe !== null && row.hebelHoehe !== undefined;
      const isRohstoff = row.subCategory && row.subCategory.startsWith("Rohstoff_");
      
      // Füge Hebel/Normal hinzu
      if (isHebel) {
        categoryKey += `_Hebel`;
      } else {
        categoryKey += `_Normal`;
      }
      
      // Bei Rohstoffen: Füge Rohstoffart hinzu
      if (isRohstoff) {
        // subCategory ist z.B. "Rohstoff_Gold", extrahiere nur "Gold"
        const rohstoffArt = row.subCategory.replace("Rohstoff_", "");
        categoryKey += `_Rohstoff_${rohstoffArt}`;
      } else {
        // Kein Rohstoff
        categoryKey += `_kein_Rohstoff`;
      }
      
      // Füge Richtung hinzu (Long/Short)
      if (row.direction) {
        categoryKey += `_${row.direction}`;
      }
      
      // Füge Hebelhöhe hinzu (nur bei Hebeln)
      if (isHebel && row.hebelHoehe) {
        categoryKey += `_${row.hebelHoehe}`;
      }
      
      acc[categoryKey] = (acc[categoryKey] || 0) + 1;
      return acc;
    }, {} as CheckSummary);

    // Speichere erfolgreich kategorisierte Zeilen in Supabase
    // WICHTIG: Nur neue ISINs speichern, die über die API geprüft wurden
    // Bereits vorhandene ISINs aus Supabase sollen NICHT nochmal gespeichert werden
    const isinsFromDatabase = new Set(existingIsins.map(e => e.isin));
    const successfullyCategorizedRows = mergedCheckedRows.filter(
      row => 
        row.status === "success" && 
        row.category !== "Unbekannt/Fehler" && 
        row.category !== "Nicht geprüft" &&
        !isinsFromDatabase.has(row.isin) // Filtere bereits vorhandene ISINs aus
    );
    
    if (successfullyCategorizedRows.length > 0) {
      console.log(`[check] Speichere ${successfullyCategorizedRows.length} neue ISINs in Supabase (${existingIsins.length} bereits vorhandene ISINs werden übersprungen)`);
      // Speichere asynchron, damit die API-Antwort nicht blockiert wird
      saveCategorizedToSupabase(successfullyCategorizedRows).catch((error) => {
        console.error("[check] Fehler beim Speichern in Supabase:", error);
      });
    } else {
      console.log(`[check] Keine neuen ISINs zum Speichern (alle ${existingIsins.length} ISINs waren bereits in Supabase)`);
    }

    return NextResponse.json({
      summary: finalSummary, // Summary immer aus den tatsächlich angezeigten Zeilen berechnet
      rows: batchIndex > 0 ? mergedCheckedRows : checkedRows, // Bei weiteren Batches die gemergten Zeilen zurückgeben
      errors: [],
      timing: {
        averageTimePerRequest,
        totalIsins,
        estimatedTotalTime: estimatedTotalTime,
      },
      hasMore: remainingIsinsCount > 0, // Gibt es noch weitere ISINs?
      nextOffset: batchIndex === 0 
        ? BATCH_SIZE // Im ersten Batch: nächster Offset ist BATCH_SIZE
        : (offset !== undefined ? offset : (batchIndex - 1) * BATCH_SIZE) + BATCH_SIZE, // In weiteren Batches: aktueller Offset + BATCH_SIZE
      // Informationen über die Prüfungen für das Frontend
      checkInfo: batchIndex === 0 ? {
        supabaseCheck: {
          totalChecked: uniqueIsinsArray.length,
          foundInDatabase: existingIsins.length,
          notFoundInDatabase: newIsins.length,
        },
        apiCheck: {
          totalToCheck: newIsins.length,
          checked: resolveResults.filter(r => r !== null).length,
        },
        // WICHTIG: Anzahl der neuen ISINs für Zeitberechnung
        newIsinsCount: newIsins.length,
        totalIsinsCount: uniqueIsinsArray.length,
      } : undefined,
    });
  } catch (error) {
    console.error("Check-Fehler:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unbekannter Fehler beim Prüfen",
        summary: {},
        rows: [],
        errors: [
          error instanceof Error ? error.message : "Unbekannter Fehler",
        ],
      },
      { status: 500 }
    );
  }
}
