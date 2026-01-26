"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface IsinSearchResult {
  isin: string;
  name: string | null;
  wkn: string | null;
  category: string;
  unterkategorie_typ: string | null;
  rohstoff_typ: string | null;
  rohstoff_art: string | null;
  direction: string | null;
  hebel_hoehe: string | null;
  sub_category: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export default function IsinSuchePage() {
  const [isin, setIsin] = useState("");
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

  // Suche automatisch, wenn ISIN eingegeben wird
  useEffect(() => {
    const normalizedIsin = isin.trim().toUpperCase();
    
    if (normalizedIsin.length >= 12) {
      // ISINs sind normalerweise 12 Zeichen lang
      handleSearch(normalizedIsin);
    } else {
      setResult(null);
      setError(null);
    }
  }, [isin]);

  const handleSearch = async (searchIsin?: string) => {
    const searchValue = searchIsin || isin.trim().toUpperCase();
    
    if (!searchValue || searchValue.length < 12) {
      setError("Bitte geben Sie eine gültige ISIN ein (mindestens 12 Zeichen)");
      return;
    }

    setIsSearching(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/isin-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isin: searchValue }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Fehler beim Suchen");
        return;
      }

      if (data.found) {
        setResult(data.data);
      } else {
        setError("ISIN nicht in der Datenbank gefunden");
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
            ISIN Suche
          </h1>
          <div className="flex items-center gap-4">
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
            <label htmlFor="isin-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              ISIN eingeben:
            </label>
            <input
              id="isin-input"
              type="text"
              value={isin}
              onChange={(e) => setIsin(e.target.value.toUpperCase())}
              placeholder="z.B. DE0001234567"
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
