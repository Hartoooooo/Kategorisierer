"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface IsinSearchResult {
  isin: string;
  name: string | null;
  wkn: string | null;
  mnemonic?: string | null;
  category: string;
  unterkategorie_typ: string | null;
  rohstoff_typ: string | null;
  rohstoff_art: string | null;
  direction: string | null;
  hebel_hoehe: string | null;
  sub_category: string | null;
  status: string;
  notes: string | null;
  original_row_data?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Extrahiert Mnemonic aus original_row_data
 */
function extractMnemonic(originalRowData: Record<string, unknown> | null | string): string | null {
  if (!originalRowData) return null;
  
  // Falls original_row_data ein JSON-String ist, parse ihn zuerst
  let data: Record<string, unknown> | null = null;
  if (typeof originalRowData === "string") {
    try {
      data = JSON.parse(originalRowData);
    } catch (e) {
      return null;
    }
  } else {
    data = originalRowData as Record<string, unknown>;
  }
  
  if (!data) return null;
  
  // Versuche zuerst direkt auf "Mnemonic" zuzugreifen
  let mnemonic = data["Mnemonic"];
  
  // Falls nicht gefunden, versuche case-insensitive Suche
  if (!mnemonic) {
    const keys = Object.keys(data);
    const mnemonicKey = keys.find(key => key.toLowerCase() === "mnemonic");
    if (mnemonicKey) {
      mnemonic = data[mnemonicKey];
    }
  }
  
  if (!mnemonic) return null;
  
  // Wenn es bereits ein String ist
  if (typeof mnemonic === "string") {
    let cleaned = mnemonic.trim();
    
    // Entferne alle Anführungszeichen am Anfang und Ende (auch verschachtelte)
    let previousLength = cleaned.length;
    while (true) {
      cleaned = cleaned.replace(/^["']+|["']+$/g, '');
      if (cleaned.length === previousLength) break;
      previousLength = cleaned.length;
    }
    
    return cleaned.trim() || null;
  }
  
  // Konvertiere zu String und entferne Anführungszeichen
  let cleaned = String(mnemonic).trim();
  let previousLength = cleaned.length;
  while (true) {
    cleaned = cleaned.replace(/^["']+|["']+$/g, '');
    if (cleaned.length === previousLength) break;
    previousLength = cleaned.length;
  }
  return cleaned || null;
}

export default function IsinSuchePage() {
  const [searchValue, setSearchValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<IsinSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Dark Mode initialisieren
  useEffect(() => {
    const savedMode = localStorage.getItem("darkMode");
    const shouldBeDark = savedMode === null ? true : savedMode === "true";
    setIsDarkMode(shouldBeDark);
    if (shouldBeDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  // Suche automatisch, wenn ISIN, WKN oder Mnemonic eingegeben wird (mit Debouncing)
  useEffect(() => {
    const normalizedSearch = searchValue.trim().toUpperCase();
    
    // Wenn das Suchfeld leer ist, lösche Ergebnisse
    if (normalizedSearch.length === 0) {
      setResult(null);
      setError(null);
      return;
    }
    
    // Debouncing: Warte 500ms nach dem letzten Tastendruck bevor gesucht wird
    const debounceTimer = setTimeout(() => {
      // ISIN: mindestens 12 Zeichen, WKN: mindestens 6 Zeichen, Mnemonic: mindestens 1 Zeichen
      if (normalizedSearch.length >= 12 || (normalizedSearch.length >= 6 && normalizedSearch.length < 12) || normalizedSearch.length >= 1) {
        handleSearch(normalizedSearch);
      }
    }, 500); // 500ms Verzögerung
    
    // Cleanup: Timer löschen wenn sich der Wert vor Ablauf ändert
    return () => {
      clearTimeout(debounceTimer);
    };
  }, [searchValue]);

  const handleSearch = async (searchInput?: string) => {
    const normalizedValue = searchInput || searchValue.trim().toUpperCase();
    
    if (!normalizedValue) {
      setError("Bitte geben Sie eine ISIN, WKN oder Mnemonic ein");
      return;
    }

    setIsSearching(true);
    setError(null);
    setResult(null);

    try {
      // Bestimme ob es eine ISIN (12+ Zeichen), WKN (6-11 Zeichen) oder Mnemonic (1-5 Zeichen) ist
      const isIsin = normalizedValue.length >= 12;
      const isWkn = normalizedValue.length >= 6 && normalizedValue.length < 12;
      
      let requestBody;
      if (isIsin) {
        requestBody = { isin: normalizedValue };
      } else if (isWkn) {
        requestBody = { wkn: normalizedValue };
      } else {
        requestBody = { mnemonic: normalizedValue };
      }

      const response = await fetch("/api/isin-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Fehler beim Suchen");
        return;
      }

      if (data.found) {
        // Extrahiere Mnemonic falls nicht bereits vorhanden
        const resultData = data.data;
        if (!resultData.mnemonic && resultData.original_row_data) {
          resultData.mnemonic = extractMnemonic(resultData.original_row_data);
        }
        setResult(resultData);
      } else {
        if (isIsin) {
          setError("ISIN nicht in der Datenbank gefunden");
        } else if (isWkn) {
          setError("WKN nicht in der Datenbank gefunden");
        } else {
          setError("Mnemonic nicht in der Datenbank gefunden");
        }
      }
    } catch (err) {
      setError("Fehler beim Suchen: " + (err instanceof Error ? err.message : "Unbekannter Fehler"));
    } finally {
      setIsSearching(false);
    }
  };

  // Formatiere den Kategorie-Pfad wie in der Zusammenfassung
  // Format: Oberkategorie / Hebel / Rohstoff-Art / Long/Short / Hebelhöhe
  // Filtert "Normal", "kein_Rohstoff" und "Rohstoff" Präfix heraus
  const formatCategoryPath = (result: IsinSearchResult): string => {
    const parts: string[] = [];
    
    // Oberkategorie (immer)
    parts.push(result.category);
    
    // Unterkategorie-Typ: Nur "Hebel" hinzufügen, "Normal" überspringen
    const isHebel = result.hebel_hoehe !== null && result.hebel_hoehe !== undefined;
    if (isHebel) {
      parts.push("Hebel");
    }
    // "Normal" wird nicht angezeigt
    
    // Rohstoff-Art: Nur die Art hinzufügen (ohne "Rohstoff" Präfix)
    // Prüfe sowohl neue strukturierte Felder als auch Legacy-Feld
    const isRohstoff = result.rohstoff_typ === "Rohstoff" || 
                       (result.sub_category && result.sub_category.startsWith("Rohstoff_"));
    
    if (isRohstoff) {
      if (result.rohstoff_art) {
        parts.push(result.rohstoff_art);
      } else if (result.sub_category && result.sub_category.startsWith("Rohstoff_")) {
        // Legacy: Extrahiere aus sub_category
        const rohstoffArt = result.sub_category.replace("Rohstoff_", "");
        parts.push(rohstoffArt);
      }
    }
    // "kein_Rohstoff" wird nicht angezeigt
    
    // Direction (Long/Short) - nur bei Hebeln
    if (result.direction) {
      parts.push(result.direction);
    }
    
    // Hebelhöhe - nur bei Hebeln
    if (result.hebel_hoehe) {
      parts.push(result.hebel_hoehe);
    }
    
    return parts.join(" / ");
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            ISIN / WKN / Mnemonic Suche
          </h1>
          <div className="flex items-center gap-4">
            {/* Dark/Light Mode Toggle */}
            <button
              onClick={() => {
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
              }}
              className="relative inline-flex h-8 w-16 items-center rounded-full bg-gray-300 dark:bg-gray-600 transition-colors focus:outline-none active:outline-none"
              aria-label={isDarkMode ? "Light Mode aktivieren" : "Dark Mode aktivieren"}
              title={isDarkMode ? "Light Mode aktivieren" : "Dark Mode aktivieren"}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white dark:bg-gray-800 transition-transform ${
                  isDarkMode ? "translate-x-9" : "translate-x-1"
                } flex items-center justify-center shadow-lg`}
              >
                {isDarkMode ? (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-gray-900" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                  </svg>
                )}
              </span>
            </button>
            <Link
              href="/"
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Zurück zur Startseite
            </Link>
          </div>
        </div>

        {/* Suchfeld - mittig */}
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-full max-w-2xl">
            <label htmlFor="search-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              ISIN, WKN oder Mnemonic eingeben:
            </label>
            <input
              id="search-input"
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
              placeholder="z.B. DE0001234567 (ISIN), 123456 (WKN) oder GWS (Mnemonic)"
              className="w-full px-6 py-4 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white transition-colors"
              disabled={isSearching}
            />
            
            {isSearching && (
              <div className="mt-4 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
                <p className="mt-2 text-gray-600 dark:text-gray-400">Suche läuft...</p>
              </div>
            )}

            {/* Fehleranzeige */}
            {error && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            {/* Ergebnisanzeige */}
            {result && (
              <div className="mt-6 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  {formatCategoryPath(result)}
                </h2>
                
                <div className="space-y-4">
                  {result.name && (
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Name:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">{result.name}</span>
                    </div>
                  )}
                  
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">ISIN:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{result.isin}</span>
                  </div>
                  
                  {result.wkn && (
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">WKN:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">{result.wkn}</span>
                    </div>
                  )}
                  
                  {(result.mnemonic || (result.original_row_data && extractMnemonic(result.original_row_data))) && (
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Mnemonic:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">
                        {result.mnemonic || (result.original_row_data ? extractMnemonic(result.original_row_data) : null) || "-"}
                      </span>
                    </div>
                  )}
                  
                  <div className="text-sm text-gray-500 dark:text-gray-400 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div>Erstellt am: {new Date(result.created_at).toLocaleString("de-DE")}</div>
                    <div>Aktualisiert am: {new Date(result.updated_at).toLocaleString("de-DE")}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
