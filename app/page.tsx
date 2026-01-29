"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { ParsedRow, CheckedRow, CheckSummary } from "@/types";

export default function Home() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [checkedRows, setCheckedRows] = useState<CheckedRow[]>([]);
  const [summary, setSummary] = useState<CheckSummary>({});
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [checkErrors, setCheckErrors] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  const [originalHeaders, setOriginalHeaders] = useState<string[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(true); // Dark-Mode ist Standard
  const [batchInterval, setBatchInterval] = useState<NodeJS.Timeout | null>(null);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [checkInfo, setCheckInfo] = useState<{
    supabaseCheck: { totalChecked: number; foundInDatabase: number; notFoundInDatabase: number };
    apiCheck: { totalToCheck: number; checked: number };
    newIsinsCount?: number; // Anzahl der neuen ISINs, die noch geprüft werden müssen
    totalIsinsCount?: number; // Gesamtanzahl der ISINs
  } | null>(null);
  const [showCheckInfo, setShowCheckInfo] = useState(false);
  const [checkStatus, setCheckStatus] = useState<'idle' | 'checking-supabase' | 'checking-api' | 'completed'>('idle');

  // Dark Mode initialisieren beim Laden - Dark-Mode ist Standard
  useEffect(() => {
    const savedMode = localStorage.getItem("darkMode");
    // Wenn nichts gespeichert ist, ist Dark-Mode Standard
    const shouldBeDark = savedMode === null ? true : savedMode === "true";
    setIsDarkMode(shouldBeDark);
    if (shouldBeDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  // Cleanup: Stoppe Batch-Intervalle beim Unmount
  useEffect(() => {
    return () => {
      if (batchInterval) {
        clearTimeout(batchInterval);
      }
    };
  }, [batchInterval]);

  // Dark Mode Toggle - umschaltet zwischen Dark (Standard) und Light
  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const newMode = !prev;
      localStorage.setItem("darkMode", String(newMode));
      if (newMode) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return newMode;
    });
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsUploading(true);
    setUploadErrors([]);
    setParsedRows([]);
    setCheckedRows([]);
    setSummary({});
    setJobId(null);
    setOriginalHeaders([]);
    // Stoppe laufende Batch-Intervalle
    if (batchInterval) {
      clearTimeout(batchInterval);
      setBatchInterval(null);
    }
    setCurrentBatchIndex(0);
    setNextOffset(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setUploadErrors([data.error || "Upload fehlgeschlagen"]);
        setIsUploading(false);
        return;
      }

      setJobId(data.jobId);
      setParsedRows(data.rows);
      setOriginalHeaders(data.headers || []);
      setUploadErrors(data.errors || []);
    } catch (error) {
      setUploadErrors([
        error instanceof Error ? error.message : "Unbekannter Fehler",
      ]);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
  });

  // Funktion zum Prüfen eines Batches
  const checkBatch = async (batchIdx: number, offset?: number) => {
    if (!jobId || parsedRows.length === 0) return;

    const startTime = Date.now();
    const batchSize = 40; // Alle Batches haben 40 ISINs
    const validIsins = parsedRows.filter((r) => r.validIsin);
    const uniqueIsins = new Set(validIsins.map((r) => r.isin));
    const totalUniqueIsins = uniqueIsins.size;
    
    // WICHTIG: Die Batch-Berechnung wird nach der Supabase-Prüfung aktualisiert
    // Initial: Berechne mit allen ISINs (wird später angepasst)
    let totalBatches = Math.ceil(totalUniqueIsins / batchSize);
    const BATCH_TIME_SECONDS = 60; // Jeder Batch dauert 1 Minute
    
    if (batchIdx === 0) {
      setIsChecking(true);
      setCheckProgress(0);
      setCheckErrors([]);
      setCheckedRows([]);
      setSummary({});
      setCurrentBatchIndex(0);
      setCheckStatus('checking-supabase'); // Zeige an, dass Supabase-Prüfung läuft
      // Initial: Geschätzte Zeit basierend auf allen ISINs (wird nach Supabase-Prüfung angepasst)
      const timerStartTime = Date.now();
      const initialTime = totalBatches * BATCH_TIME_SECONDS;
      setEstimatedTimeRemaining(initialTime);
      
      // Kontinuierlicher Timer für die Zeit
      const timeInterval = setInterval(() => {
        const elapsed = (Date.now() - timerStartTime) / 1000;
        const remainingTime = Math.max(0, initialTime - elapsed);
        setEstimatedTimeRemaining(remainingTime);
      }, 100);
      
      // Speichere den Interval, damit er später gestoppt werden kann
      (window as any).timeInterval = timeInterval;
    }

    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId,
          rows: parsedRows,
          batchIndex: batchIdx,
          offset,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setCheckErrors([data.error || "Prüfung fehlgeschlagen"]);
        if (batchIdx === 0) {
          setIsChecking(false);
          setShowCheckInfo(false);
          setCheckStatus('idle');
        }
        return;
      }

      // Zeige Prüfungsinformationen im ersten Batch und aktualisiere Zeitberechnung
      if (batchIdx === 0 && data.checkInfo) {
        setCheckInfo(data.checkInfo);
        setCheckStatus('checking-api'); // Wechsle zu API-Prüfung Status
        setShowCheckInfo(true);
        
        // WICHTIG: Aktualisiere Zeitberechnung basierend auf neuen ISINs (nicht vorhandene)
        const newIsinsCount = data.checkInfo.newIsinsCount || data.checkInfo.apiCheck.totalToCheck;
        const foundInDatabase = data.checkInfo.supabaseCheck.foundInDatabase;
        
        // Berechne Batches nur für neue ISINs
        const newTotalBatches = Math.ceil(newIsinsCount / batchSize);
        const newEstimatedTime = newTotalBatches * BATCH_TIME_SECONDS;
        
        console.log(`[checkBatch] Zeitberechnung aktualisiert: ${foundInDatabase} bereits vorhanden, ${newIsinsCount} neue ISINs, ${newTotalBatches} Batches, ${newEstimatedTime}s geschätzte Zeit`);
        
        // Aktualisiere geschätzte Zeit
        setEstimatedTimeRemaining(newEstimatedTime);
        
        // Stoppe alten Timer und starte neuen
        if ((window as any).timeInterval) {
          clearInterval((window as any).timeInterval);
        }
        
        const timerStartTime = Date.now();
        const timeInterval = setInterval(() => {
          const elapsed = (Date.now() - timerStartTime) / 1000;
          const remainingTime = Math.max(0, newEstimatedTime - elapsed);
          setEstimatedTimeRemaining(remainingTime);
        }, 100);
        (window as any).timeInterval = timeInterval;
        
        // Warte 4 Sekunden, damit der Benutzer die Informationen sehen kann
        await new Promise(resolve => setTimeout(resolve, 4000));
        setShowCheckInfo(false);
      }

      // Ergebnisse inkrementell hinzufügen
      if (batchIdx === 0) {
        // Erster Batch: Setze die Daten
        setCheckedRows(data.rows);
        setSummary(data.summary);
      } else {
        // Weitere Batches: Backend gibt bereits die vollständigen gemergten Zeilen zurück
        setCheckedRows(data.rows);
        
        // Summary: Verwende die vollständige gemergte Summary vom Backend
        if (data.summary && Object.keys(data.summary).length > 0) {
          setSummary(data.summary);
        }
      }

      // Aktualisiere Progress für fertigen Batch
      // WICHTIG: Progress basiert nur auf neuen ISINs (nicht auf bereits vorhandenen)
      const newIsinsCount = checkInfo?.newIsinsCount || checkInfo?.apiCheck.totalToCheck || totalUniqueIsins;
      const actualTotalBatches = Math.ceil(newIsinsCount / batchSize);
      const batchProgress = actualTotalBatches > 0 ? ((batchIdx + 1) / actualTotalBatches) * 100 : 100;
      setCheckProgress(Math.min(batchProgress, 100));
      
      setCheckErrors(data.errors || []);
      setNextOffset(data.nextOffset || null);

      // Wenn es weitere ISINs gibt, starte nächsten Batch nach 1 Minute
      if (data.hasMore && data.nextOffset !== undefined) {
        // Aktualisiere den kontinuierlichen Timer für die Zeit
        // WICHTIG: Berechne nur für neue ISINs (nicht für bereits vorhandene)
        const newIsinsCountForTimer = checkInfo?.newIsinsCount || checkInfo?.apiCheck.totalToCheck || totalUniqueIsins;
        const actualTotalBatches = Math.ceil(newIsinsCountForTimer / batchSize);
        const remainingBatches = actualTotalBatches - batchIdx - 1;
        
        // Setze initiale Zeit (verbleibende Batches + 1 Minute für aktuellen Batch)
        const initialTime = remainingBatches * BATCH_TIME_SECONDS + BATCH_TIME_SECONDS;
        setEstimatedTimeRemaining(initialTime);
        
        // Stoppe alten Timer falls vorhanden
        if ((window as any).timeInterval) {
          clearInterval((window as any).timeInterval);
        }
        
        // Kontinuierlicher Timer, der die Zeit herunterzählt
        const timerStartTime = Date.now();
        const timeInterval = setInterval(() => {
          const elapsed = (Date.now() - timerStartTime) / 1000;
          const remainingTime = Math.max(0, initialTime - elapsed);
          setEstimatedTimeRemaining(remainingTime);
          
          // Aktualisiere auch Progress während der Wartezeit
          // WICHTIG: Progress basiert nur auf neuen ISINs
          const waitProgress = (elapsed / BATCH_TIME_SECONDS) * 100;
          const totalProgress = actualTotalBatches > 0 
            ? ((batchIdx + 1) / actualTotalBatches) * 100 + (waitProgress / actualTotalBatches)
            : 100;
          setCheckProgress(Math.min(totalProgress, 95));
        }, 100);
        
        // Speichere den Interval
        (window as any).timeInterval = timeInterval;
        
        const timeoutId = setTimeout(() => {
          checkBatch(batchIdx + 1, data.nextOffset);
        }, 60000); // 1 Minute = 60000ms
        
        setBatchInterval(timeoutId as unknown as NodeJS.Timeout);
      } else {
        // Alle Batches fertig
        setIsChecking(false);
        setCheckProgress(100);
        setEstimatedTimeRemaining(0);
        setCheckStatus('completed');
        // Stoppe Timer
        if ((window as any).timeInterval) {
          clearInterval((window as any).timeInterval);
          (window as any).timeInterval = null;
        }
        if (batchInterval) {
          clearTimeout(batchInterval);
          setBatchInterval(null);
        }
      }
    } catch (error) {
      setCheckErrors([
        error instanceof Error ? error.message : "Unbekannter Fehler",
      ]);
      if (batchIdx === 0) {
        setIsChecking(false);
        setEstimatedTimeRemaining(null);
        setCheckStatus('idle');
        setShowCheckInfo(false);
      }
    }
  };

  const handleCheck = async () => {
    // Starte ersten Batch (50 ISINs)
    await checkBatch(0);
  };

  const handleDownload = async (
    mode: "singleSheet" | "sheetsByCategory",
    categoryFilter?: string,
    rowsToExport?: CheckedRow[]
  ) => {
    // Wenn rowsToExport übergeben wurde, verwende POST (direkte Datenübergabe)
    // Sonst verwende GET mit jobId (für Backward-Kompatibilität)
    try {
      let response: Response;
      
      if (rowsToExport && rowsToExport.length > 0) {
        // POST: Sende Daten direkt im Body
        response = await fetch("/api/download", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rows: rowsToExport,
            mode,
            categoryFilter,
            headers: originalHeaders,
          }),
        });
      } else if (jobId) {
        // GET: Verwende jobId (Fallback)
        const url = categoryFilter
          ? `/api/download?jobId=${jobId}&mode=${mode}&category=${encodeURIComponent(categoryFilter)}`
          : `/api/download?jobId=${jobId}&mode=${mode}`;
        response = await fetch(url);
      } else {
        alert("Keine Daten zum Exportieren vorhanden");
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Download fehlgeschlagen");
        return;
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      
      // Dateiname aus Response Header verwenden, falls vorhanden
      const contentDisposition = response.headers.get("Content-Disposition");
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          a.download = filenameMatch[1];
        } else {
          // Fallback: Dateiname basierend auf Kategorie
          if (categoryFilter) {
            const [category, subCategory] = categoryFilter.split("_");
            if (subCategory) {
              a.download = `${subCategory}.xlsx`;
            } else {
              a.download = category === "Aktie" ? `Aktien.xlsx` : `${category}.xlsx`;
            }
          } else {
            a.download = mode === "singleSheet" ? `gesamt.xlsx` : `kategorien.xlsx`;
          }
        }
      } else {
        // Fallback falls kein Header vorhanden
        if (categoryFilter) {
          const [category, subCategory] = categoryFilter.split("_");
          if (subCategory) {
            a.download = `${subCategory}.xlsx`;
          } else {
            a.download = category === "Aktie" ? `Aktien.xlsx` : `${category}.xlsx`;
          }
        } else {
          a.download = mode === "singleSheet" ? `gesamt.xlsx` : `kategorien.xlsx`;
        }
      }
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Download fehlgeschlagen"
      );
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
      <div className={`max-w-7xl mx-auto ${parsedRows.length === 0 ? "flex flex-col min-h-[calc(100vh-4rem)] justify-center" : ""}`}>
        {/* Header mit Titel und Navigation in einer Zeile */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              <a href="/" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                Kategorisierung
              </a>
            </h1>
            <span className="text-3xl font-bold text-gray-900 dark:text-white mx-2">/</span>
            <a
              href="/kategorien"
              className="text-3xl font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Kategorien
            </a>
            <span className="text-3xl font-bold text-gray-900 dark:text-white mx-2">/</span>
            <a
              href="/isin-suche"
              className="text-3xl font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Suche
            </a>
          </div>
          
          {/* Dark/Light Mode Toggle Switch - rechtsbündig */}
          <button
            onClick={toggleDarkMode}
            className="relative inline-flex h-8 w-16 items-center rounded-full bg-gray-300 dark:bg-gray-600 transition-colors focus:outline-none active:outline-none"
            aria-label={isDarkMode ? "Light Mode aktivieren" : "Dark Mode aktivieren"}
            title={isDarkMode ? "Light Mode aktivieren" : "Dark Mode aktivieren"}
          >
            {/* Toggle Knob */}
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white dark:bg-gray-800 transition-transform ${
                isDarkMode ? "translate-x-9" : "translate-x-1"
              } flex items-center justify-center shadow-lg`}
            >
              {isDarkMode ? (
                // Mond-Icon (weiß) wenn Dark-Mode aktiv
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              ) : (
                // Sonnen-Icon (schwarz) wenn Light-Mode aktiv
                <svg className="w-4 h-4 text-gray-900" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
              )}
            </span>
          </button>
        </div>

        {/* Upload Section */}
        <section className={`mb-8 ${parsedRows.length === 0 ? "flex-1 flex items-center" : ""}`}>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900 dark:border-blue-400"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            } ${isUploading ? "opacity-50 cursor-not-allowed" : ""} ${parsedRows.length === 0 ? "w-full min-h-[300px] flex items-center justify-center" : ""}`}
          >
            <input {...getInputProps()} disabled={isUploading} />
            <div className="flex flex-col items-center justify-center">
              {isUploading ? (
                <div className="text-gray-600 dark:text-gray-300">Wird hochgeladen...</div>
              ) : isDragActive ? (
                <div className="text-blue-600 dark:text-blue-400 font-medium text-lg">
                  Datei hier ablegen
                </div>
              ) : (
                <div>
                  <p className="text-gray-600 dark:text-gray-300 mb-2 text-lg">
                    Excel-Datei per Drag & Drop hochladen
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    oder klicken zum Auswählen
                  </p>
                </div>
              )}
            </div>
          </div>

          {uploadErrors.length > 0 && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg">
              <ul className="list-disc list-inside text-red-800 dark:text-red-200">
                {uploadErrors.map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Preview Table */}
        {parsedRows.length > 0 && (
          <section className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {checkedRows.length > 0
                  ? `Ergebnisse (${checkedRows.length} Zeilen)`
                  : `Vorschau (${parsedRows.length} Zeilen)`}
              </h2>
              <div className="flex items-center gap-4">
                {/* Status-Anzeige während der Prüfung */}
                {isChecking && (
                  <div className="flex flex-col gap-3 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg min-w-[400px]">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 text-lg">Prüfungsstatus:</h3>
                    <div className="space-y-3 text-sm">
                      {checkStatus === 'checking-supabase' && (
                        <div className="flex items-start gap-3">
                          <span className="font-bold text-blue-600 dark:text-blue-400 text-lg animate-pulse">⏳</span>
                          <div className="flex-1">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">Schritt 1: Supabase-Prüfung läuft...</span>
                            <div className="text-gray-700 dark:text-gray-300 mt-1">
                              Prüfe ISINs in der Datenbank...
                            </div>
                          </div>
                        </div>
                      )}
                      {checkStatus === 'checking-api' && checkInfo && (
                        <>
                          <div className="flex items-start gap-3">
                            <span className="font-bold text-green-600 dark:text-green-400 text-lg">✓</span>
                            <div className="flex-1">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">Schritt 1: Supabase-Prüfung abgeschlossen</span>
                              <div className="text-gray-700 dark:text-gray-300 mt-1">
                                {checkInfo.supabaseCheck.totalChecked} ISINs geprüft → {checkInfo.supabaseCheck.foundInDatabase} bereits in Datenbank gefunden
                              </div>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <span className="font-bold text-blue-600 dark:text-blue-400 text-lg animate-pulse">→</span>
                            <div className="flex-1">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">Schritt 2: Finnhub API-Prüfung läuft</span>
                              <div className="text-gray-700 dark:text-gray-300 mt-1">
                                {checkInfo.apiCheck.totalToCheck} ISINs werden jetzt über die API geprüft...
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {isChecking && checkStatus === 'checking-api' && !showCheckInfo && (
                  <div className="flex flex-col items-end gap-1">
                    {estimatedTimeRemaining !== null && estimatedTimeRemaining > 0 && (
                      <span className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        Geschätzte Zeit:{" "}
                        {estimatedTimeRemaining >= 60
                          ? `${Math.floor(estimatedTimeRemaining / 60)}m ${Math.floor(estimatedTimeRemaining % 60)}s`
                          : `${Math.floor(estimatedTimeRemaining)}s`}
                      </span>
                    )}
                    <div className="w-48 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div
                        className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${checkProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
                <button
                  onClick={handleCheck}
                  disabled={
                    isChecking ||
                    parsedRows.filter((r) => r.validIsin).length === 0
                  }
                  className="px-6 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isChecking ? "Wird kategorisiert..." : "Kategorisieren"}
                </button>
              </div>
            </div>

            {/* Summary */}
            {checkedRows.length > 0 && Object.keys(summary).length > 0 && (
              <div className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Zusammenfassung
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(() => {
                    // Berechne Summary direkt aus den angezeigten Zeilen mit der neuen Struktur
                    // Format: Oberkategorie_Hebel/Normal_Rohstoff_[Art]_Long/Short_[Hebelhoehe]
                    const calculatedSummary = checkedRows.reduce((acc, row) => {
                      let categoryKey = row.category;
                      
                      // Bestimme ob es Hebel oder Normal ist
                      const isHebel = row.hebelHoehe !== null && row.hebelHoehe !== undefined;
                      const isRohstoff = row.subCategory !== null && row.subCategory !== undefined && row.subCategory.startsWith("Rohstoff_");
                      
                      // Füge Hebel/Normal hinzu
                      if (isHebel) {
                        categoryKey += `_Hebel`;
                      } else {
                        categoryKey += `_Normal`;
                      }
                      
                      // Bei Rohstoffen: Füge Rohstoffart hinzu
                      if (isRohstoff && row.subCategory) {
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
                    }, {} as Record<string, number>);
                    
                    return Object.entries(calculatedSummary).map(([category, count]) => {
                      // Formatiere die Anzeige: Ersetze "_" mit " / "
                      // Entferne "Normal", "kein_Rohstoff" und "Rohstoff" (nur die Rohstoffart bleibt)
                      const parts = category.split("_");
                      const displayParts: string[] = [];
                      
                      for (let i = 0; i < parts.length; i++) {
                        const part = parts[i];
                        const nextPart = parts[i + 1];
                        
                        // Überspringe "Normal"
                        if (part === "Normal") {
                          continue;
                        }
                        
                        // Überspringe "kein_Rohstoff" (überspringe beide Teile)
                        if (part === "kein" && nextPart === "Rohstoff") {
                          i++; // Überspringe auch das nächste Element
                          continue;
                        }
                        
                        // Überspringe "Rohstoff" wenn danach eine Rohstoffart kommt
                        // Die Rohstoffart wird direkt hinzugefügt (nächste Iteration)
                        if (part === "Rohstoff" && nextPart) {
                          // Überspringe "Rohstoff", die Rohstoffart wird im nächsten Durchlauf hinzugefügt
                          continue;
                        }
                        
                        // Füge alle anderen Teile hinzu (inkl. Rohstoffart nach "Rohstoff")
                        displayParts.push(part);
                      }
                      
                      const displayCategory = displayParts.join(" / ");
                      
                      // Filtere die Zeilen für diese Kategorie (verwende die gleiche Logik wie oben)
                      const categoryRows = checkedRows.filter((row) => {
                        let rowKey = row.category;
                        
                        const isHebel = row.hebelHoehe !== null && row.hebelHoehe !== undefined;
                        const isRohstoff = row.subCategory && row.subCategory.startsWith("Rohstoff_");
                        
                        if (isHebel) {
                          rowKey += `_Hebel`;
                        } else {
                          rowKey += `_Normal`;
                        }
                        
                        if (isRohstoff && row.subCategory) {
                          const rohstoffArt = row.subCategory.replace("Rohstoff_", "");
                          rowKey += `_Rohstoff_${rohstoffArt}`;
                        } else {
                          rowKey += `_kein_Rohstoff`;
                        }
                        
                        if (row.direction) {
                          rowKey += `_${row.direction}`;
                        }
                        
                        if (isHebel && row.hebelHoehe) {
                          rowKey += `_${row.hebelHoehe}`;
                        }
                        
                        return rowKey === category;
                      });
                      
                      return (
                        <div key={category} className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            {displayCategory}:
                          </span>{" "}
                          <span className="text-gray-900 dark:text-white">{count}</span>
                          <button
                            onClick={() => handleDownload("singleSheet", category, categoryRows)}
                            className="ml-1 p-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                            title={`${displayCategory} als Excel exportieren`}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Table - zeigt geprüfte Daten wenn vorhanden, sonst geparste Daten */}
            {checkedRows.length > 0 ? (
              // Nach Kategorien gruppierte Ansicht
              (() => {
                const groupedByCategory = checkedRows.reduce(
                  (acc, row) => {
                    // Verwende die gleiche Logik wie in der Summary
                    // Format: Oberkategorie_Hebel/Normal_Rohstoff_[Art]_Long/Short_[Hebelhoehe]
                    let key = row.category;
                    
                    const isHebel = row.hebelHoehe !== null && row.hebelHoehe !== undefined;
                    const isRohstoff = row.subCategory !== null && row.subCategory !== undefined && row.subCategory.startsWith("Rohstoff_");
                    
                    if (isHebel) {
                      key += `_Hebel`;
                    } else {
                      key += `_Normal`;
                    }
                    
                    if (isRohstoff && row.subCategory) {
                      const rohstoffArt = row.subCategory.replace("Rohstoff_", "");
                      key += `_Rohstoff_${rohstoffArt}`;
                    } else {
                      key += `_kein_Rohstoff`;
                    }
                    
                    if (row.direction) {
                      key += `_${row.direction}`;
                    }
                    
                    if (isHebel && row.hebelHoehe) {
                      key += `_${row.hebelHoehe}`;
                    }
                    
                    if (!acc[key]) {
                      acc[key] = [];
                    }
                    acc[key].push(row);
                    return acc;
                  },
                  {} as Record<string, CheckedRow[]>
                );

                // Sortierung: Aktie zuerst, dann ETP, dann Fund, dann Unbekannt/Fehler
                const categoryOrder = (key: string): number => {
                  if (key.startsWith("Aktie")) return 1;
                  if (key.startsWith("ETP")) return 2;
                  if (key.startsWith("Fund")) return 3;
                  if (key.startsWith("Unbekannt/Fehler")) return 4;
                  if (key.startsWith("Nicht geprüft")) return 5;
                  return 6; // Fallback für andere Kategorien
                };

                return (
                  <div className="space-y-6">
                    {Object.entries(groupedByCategory)
                      .sort(([a], [b]) => {
                        const orderA = categoryOrder(a);
                        const orderB = categoryOrder(b);
                        if (orderA !== orderB) {
                          return orderA - orderB;
                        }
                        // Innerhalb derselben Hauptkategorie sortieren
                        // Sortiere nach: Hebel/Normal → Rohstoff/kein Rohstoff → Rohstoffart → Long/Short → Hebelhöhe
                        const aParts = a.split("_");
                        const bParts = b.split("_");
                        
                        // 1. Hebel vs Normal (Hebel zuerst)
                        if (aParts[1] !== bParts[1]) {
                          if (aParts[1] === "Hebel" && bParts[1] === "Normal") return -1;
                          if (aParts[1] === "Normal" && bParts[1] === "Hebel") return 1;
                          return (aParts[1] || "").localeCompare(bParts[1] || "");
                        }
                        
                        // 2. Rohstoff vs kein Rohstoff
                        if (aParts[2] !== bParts[2]) {
                          if (aParts[2] === "Rohstoff" && bParts[2] === "kein") return -1;
                          if (aParts[2] === "kein" && bParts[2] === "Rohstoff") return 1;
                          return (aParts[2] || "").localeCompare(bParts[2] || "");
                        }
                        
                        // 3. Rohstoffart (wenn Rohstoff)
                        if (aParts[2] === "Rohstoff" && aParts[3] && bParts[3]) {
                          if (aParts[3] !== bParts[3]) {
                            return (aParts[3] || "").localeCompare(bParts[3] || "");
                          }
                        }
                        
                        // 4. Long/Short (Long zuerst)
                        const aDirection = aParts.find(p => p === "long" || p === "short") || "";
                        const bDirection = bParts.find(p => p === "long" || p === "short") || "";
                        if (aDirection === "long" && bDirection === "short") return -1;
                        if (aDirection === "short" && bDirection === "long") return 1;
                        if (aDirection && bDirection) {
                          return aDirection.localeCompare(bDirection);
                        }
                        
                        // 5. Hebelhöhe
                        const aHoehe = aParts.find(p => p === "2x" || p === "3x" || p === "5x" || p === "10x" || p === "20x" || p === "Andere") || "";
                        const bHoehe = bParts.find(p => p === "2x" || p === "3x" || p === "5x" || p === "10x" || p === "20x" || p === "Andere") || "";
                        if (aHoehe && bHoehe && aHoehe !== bHoehe) {
                          const hoehenOrder: Record<string, number> = { "2x": 1, "3x": 2, "5x": 3, "10x": 4, "20x": 5, "Andere": 6 };
                          return (hoehenOrder[aHoehe] || 99) - (hoehenOrder[bHoehe] || 99);
                        }
                        
                        // Sonst alphabetisch sortieren
                        return a.localeCompare(b);
                      })
                      .map(([categoryKey, rows]) => {
                        // Formatiere die Anzeige genau wie in der Summary
                        // Entferne "Normal", "kein_Rohstoff" und "Rohstoff" (nur die Rohstoffart bleibt)
                        const parts = categoryKey.split("_");
                        const displayParts: string[] = [];
                        
                        for (let i = 0; i < parts.length; i++) {
                          const part = parts[i];
                          const nextPart = parts[i + 1];
                          
                          // Überspringe "Normal"
                          if (part === "Normal") {
                            continue;
                          }
                          
                          // Überspringe "kein_Rohstoff" (überspringe beide Teile)
                          if (part === "kein" && nextPart === "Rohstoff") {
                            i++; // Überspringe auch das nächste Element
                            continue;
                          }
                          
                          // Überspringe "Rohstoff" wenn danach eine Rohstoffart kommt
                          // Die Rohstoffart wird direkt hinzugefügt (nächste Iteration)
                          if (part === "Rohstoff" && nextPart) {
                            // Überspringe "Rohstoff", die Rohstoffart wird im nächsten Durchlauf hinzugefügt
                            continue;
                          }
                          
                          // Füge alle anderen Teile hinzu (inkl. Rohstoffart nach "Rohstoff")
                          displayParts.push(part);
                        }
                        
                        const displayCategory = displayParts.join(" / ");
                        
                        return (
                          <div key={categoryKey} className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700">
                            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex justify-between items-center">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {displayCategory} ({rows.length})
                              </h3>
                              <button
                                onClick={() => handleDownload("singleSheet", categoryKey, rows)}
                                className="px-4 py-1.5 text-sm bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors"
                                title={`${displayCategory} als Excel herunterladen`}
                              >
                                Excel
                              </button>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                  <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                      Zeile
                                    </th>
                                    {originalHeaders.length > 0 ? (
                                      originalHeaders.map((header) => (
                                        <th
                                          key={header}
                                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase"
                                        >
                                          {header}
                                        </th>
                                      ))
                                    ) : (
                                      <>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                          ISIN
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                          Name
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                          WKN
                                        </th>
                                      </>
                                    )}
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                      Unterkategorie
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                      Richtung
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                      Status
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                      Details
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                  {rows.map((row, index) => (
                                    <tr key={`${categoryKey}-${row.rowIndex}`} className="dark:hover:bg-gray-700">
                                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                        {index + 1}
                                      </td>
                                      {originalHeaders.length > 0 ? (
                                        originalHeaders.map((header) => {
                                          // Versuche zuerst originalRowData, dann Fallback auf isin/name/wkn
                                          let cellValue = "";
                                          const headerLower = header.toLowerCase();
                                          
                                          // Prüfe ob originalRowData existiert und den Header enthält
                                          if (row.originalRowData && header in row.originalRowData) {
                                            const value = row.originalRowData[header];
                                            // Zeige den Wert an, auch wenn er leer ist (aber nicht undefined/null)
                                            if (value !== undefined && value !== null) {
                                              cellValue = String(value);
                                            }
                                          } else {
                                            // Fallback auf isin/name/wkn nur wenn originalRowData nicht existiert oder der Header fehlt
                                            if (headerLower.includes("isin")) {
                                              cellValue = row.isin || "";
                                            } else if (headerLower.includes("name") || headerLower.includes("bezeichnung") || headerLower.includes("titel")) {
                                              cellValue = row.name || "";
                                            } else if (headerLower.includes("wkn")) {
                                              cellValue = row.wkn || "";
                                            }
                                          }
                                          
                                          return (
                                            <td
                                              key={header}
                                              className={`px-4 py-3 text-sm ${
                                                headerLower.includes("isin")
                                                  ? "font-mono text-gray-900 dark:text-white"
                                                  : "text-gray-900 dark:text-white"
                                              }`}
                                            >
                                              {cellValue}
                                            </td>
                                          );
                                        })
                                      ) : (
                                        <>
                                          <td className="px-4 py-3 text-sm font-mono text-gray-900">
                                            {row.isin}
                                          </td>
                                          <td className="px-4 py-3 text-sm text-gray-900">
                                            {row.name}
                                          </td>
                                          <td className="px-4 py-3 text-sm text-gray-900">
                                            {row.wkn}
                                          </td>
                                        </>
                                      )}
                                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        {row.subCategory || "-"}
                                      </td>
                                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        {row.direction || "-"}
                                      </td>
                                      <td className="px-4 py-3 text-sm">
                                        {row.status === "success" ? (
                                          <span className="text-green-600 dark:text-green-400">✓</span>
                                        ) : (
                                          <span className="text-red-600 dark:text-red-400">✗</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                                        <div
                                          className="truncate"
                                          title={row.notes || ""}
                                        >
                                          {row.notes || "-"}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })()
            ) : (
              // Normale Vorschau-Tabelle vor der Prüfung - zeigt alle ursprünglichen Spalten
              <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Zeile
                      </th>
                      {originalHeaders.length > 0 ? (
                        originalHeaders.map((header) => (
                          <th
                            key={header}
                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                          >
                            {header}
                          </th>
                        ))
                      ) : (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            ISIN
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Name
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            WKN
                          </th>
                        </>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Gültig
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {parsedRows.slice(0, 50).map((row, index) => (
                      <tr
                        key={row.rowIndex}
                        className={!row.validIsin ? "bg-red-50 dark:bg-red-900" : ""}
                      >
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          {index + 1}
                        </td>
                        {originalHeaders.length > 0 ? (
                          originalHeaders.map((header) => {
                            // Versuche zuerst originalRowData, dann Fallback auf isin/name/wkn
                            let cellValue = "";
                            const headerLower = header.toLowerCase();
                            
                            // Prüfe ob originalRowData existiert und den Header enthält
                            if (row.originalRowData && header in row.originalRowData) {
                              const value = row.originalRowData[header];
                              // Zeige den Wert an, auch wenn er leer ist (aber nicht undefined/null)
                              if (value !== undefined && value !== null) {
                                cellValue = String(value);
                              }
                            } else {
                              // Fallback auf isin/name/wkn nur wenn originalRowData nicht existiert oder der Header fehlt
                              if (headerLower.includes("isin")) {
                                cellValue = row.isin || "";
                              } else if (headerLower.includes("name") || headerLower.includes("bezeichnung") || headerLower.includes("titel")) {
                                cellValue = row.name || "";
                              } else if (headerLower.includes("wkn")) {
                                cellValue = row.wkn || "";
                              }
                            }
                            
                            return (
                              <td
                                key={header}
                                className={`px-4 py-3 text-sm ${
                                  headerLower.includes("isin")
                                    ? "font-mono text-gray-900 dark:text-white"
                                    : "text-gray-900 dark:text-white"
                                }`}
                              >
                                {cellValue}
                              </td>
                            );
                          })
                        ) : (
                          <>
                            <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">
                              {row.isin}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {row.name}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {row.wkn}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-sm">
                          {row.validIsin ? (
                            <span className="text-green-600 dark:text-green-400">✓</span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400">✗</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 50 && (
                  <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                    ... und {parsedRows.length - 50} weitere Zeilen
                  </div>
                )}
              </div>
            )}

            {/* Download Buttons - nur wenn geprüft */}
            {checkedRows.length > 0 && (
              <div className="mt-6 flex gap-4">
                <button
                  onClick={() => handleDownload("singleSheet", undefined, checkedRows)}
                  className="px-6 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600"
                >
                  Gesamt (1 Sheet) herunterladen
                </button>
                <button
                  onClick={() => handleDownload("sheetsByCategory", undefined, checkedRows)}
                  className="px-6 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600"
                >
                  Pro Kategorie (Sheets) herunterladen
                </button>
              </div>
            )}
          </section>
        )}


        {checkErrors.length > 0 && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg">
            <ul className="list-disc list-inside text-red-800 dark:text-red-200">
              {checkErrors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
