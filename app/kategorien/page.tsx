"use client";

import { useState, useEffect } from "react";

interface Asset {
  id: string;
  isin: string;
  name: string | null;
  wkn: string | null;
  category: string;
  unterkategorie_typ: string | null;
  rohstoff_typ: string | null;
  rohstoff_art: string | null;
  direction: string | null;
  hebel_hoehe: string | null;
  status: string;
  notes: string | null;
  original_row_data: Record<string, unknown> | null;
}

interface CategoryStats {
  category: string;
  unterkategorie_typ: string | null;
  rohstoff_typ: string | null;
  rohstoff_art: string | null;
  direction: string | null;
  hebel_hoehe: string | null;
  count: number;
}

/**
 * Extrahiert den Namen aus den Notes nach "Name:"
 */
function extractNameFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  
  // Suche nach "Name:" (case-insensitive)
  const nameIndex = notes.toLowerCase().indexOf("name:");
  if (nameIndex === -1) return null;
  
  // Extrahiere den Text nach "Name:"
  let nameText = notes.substring(nameIndex + 5).trim();
  
  // Stoppe beim nächsten "|" oder am Ende
  const pipeIndex = nameText.indexOf("|");
  if (pipeIndex !== -1) {
    nameText = nameText.substring(0, pipeIndex).trim();
  }
  
  // Entferne alle Anführungszeichen (am Anfang, Ende oder überall)
  nameText = nameText.replace(/^["']+|["']+$/g, '').trim();
  
  return nameText || null;
}

export default function KategorienPage() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedUnterkategorie, setSelectedUnterkategorie] = useState<string | null>(null);
  const [selectedRohstoffArt, setSelectedRohstoffArt] = useState<string | null>(null);
  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);
  const [selectedHebelHoehe, setSelectedHebelHoehe] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [clickedIsin, setClickedIsin] = useState<string | null>(null);
  const [clickedWkn, setClickedWkn] = useState<string | null>(null);
  const [searchIsin, setSearchIsin] = useState("");
  const [isSearchingIsin, setIsSearchingIsin] = useState(false);
  const [searchResult, setSearchResult] = useState<Asset | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

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

  // Lade Statistiken beim Mount
  useEffect(() => {
    loadStats();
  }, []);

  // Lade Assets wenn Filter sich ändern
  useEffect(() => {
    loadAssets();
  }, [selectedCategory, selectedUnterkategorie, selectedRohstoffArt, selectedDirection, selectedHebelHoehe, currentPage]);

  // Suche automatisch, wenn ISIN oder WKN eingegeben wird
  useEffect(() => {
    const normalizedSearch = searchIsin.trim().toUpperCase();
    
    // ISIN: mindestens 12 Zeichen, WKN: mindestens 6 Zeichen
    if (normalizedSearch.length >= 12 || (normalizedSearch.length >= 6 && normalizedSearch.length < 12)) {
      handleIsinSearch(normalizedSearch);
    } else {
      setSearchResult(null);
      setSearchError(null);
      // Wenn keine Suche mehr eingegeben wird, lade normale Assets
      if (normalizedSearch.length === 0 && !loading) {
        loadAssets();
      }
    }
  }, [searchIsin]);

  const loadStats = async () => {
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stats" }),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Laden der Statistiken");
      }

      const data = await response.json();
      setStats(data.stats || []);
    } catch (error) {
      console.error("Fehler beim Laden der Statistiken:", error);
    }
  };

  const loadAssets = async () => {
    // Wenn eine ISIN-Suche aktiv ist, nicht die normalen Assets laden
    if (searchIsin.trim().length >= 12) {
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.append("category", selectedCategory);
      if (selectedUnterkategorie) params.append("unterkategorie_typ", selectedUnterkategorie);
      if (selectedRohstoffArt) params.append("rohstoff_art", selectedRohstoffArt);
      if (selectedDirection) params.append("direction", selectedDirection);
      if (selectedHebelHoehe) params.append("hebel_hoehe", selectedHebelHoehe);
      params.append("limit", pageSize.toString());
      params.append("offset", ((currentPage - 1) * pageSize).toString());

      const response = await fetch(`/api/categories?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Fehler beim Laden der Daten");
      }

      const data = await response.json();
      setAssets(data.data || []);
      setTotalCount(data.count || 0);
    } catch (error) {
      console.error("Fehler beim Laden der Assets:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDarkMode = () => {
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
  };

  const copyIsinToClipboard = async (isin: string) => {
    try {
      await navigator.clipboard.writeText(isin);
      setClickedIsin(isin);
      setTimeout(() => {
        setClickedIsin(null);
      }, 500);
    } catch (error) {
      console.error("Fehler beim Kopieren:", error);
    }
  };

  const copyWknToClipboard = async (wkn: string) => {
    if (!wkn || wkn === "-") return;
    try {
      await navigator.clipboard.writeText(wkn);
      setClickedWkn(wkn);
      setTimeout(() => {
        setClickedWkn(null);
      }, 500);
    } catch (error) {
      console.error("Fehler beim Kopieren:", error);
    }
  };

  const handleIsinSearch = async (searchValue: string) => {
    // Bestimme ob es eine ISIN (12+ Zeichen) oder WKN (6-11 Zeichen) ist
    const isIsin = searchValue.length >= 12;
    const isWkn = searchValue.length >= 6 && searchValue.length < 12;

    if (!isIsin && !isWkn) {
      setSearchError("Bitte geben Sie eine gültige ISIN (mindestens 12 Zeichen) oder WKN (mindestens 6 Zeichen) ein");
      return;
    }

    setIsSearchingIsin(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const requestBody = isIsin 
        ? { isin: searchValue }
        : { wkn: searchValue };

      const response = await fetch("/api/isin-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        setSearchError(data.error || "Fehler beim Suchen");
        return;
      }

      if (data.found) {
        setSearchResult(data.data);
        // Setze die Assets auf das gefundene Ergebnis
        setAssets([data.data]);
        setTotalCount(1);
      } else {
        setSearchError(isIsin ? "ISIN nicht in der Datenbank gefunden" : "WKN nicht in der Datenbank gefunden");
        setAssets([]);
        setTotalCount(0);
      }
    } catch (err) {
      setSearchError("Fehler beim Suchen: " + (err instanceof Error ? err.message : "Unbekannter Fehler"));
      setAssets([]);
      setTotalCount(0);
    } finally {
      setIsSearchingIsin(false);
    }
  };

  const resetFilters = () => {
    setSelectedCategory(null);
    setSelectedUnterkategorie(null);
    setSelectedRohstoffArt(null);
    setSelectedDirection(null);
    setSelectedHebelHoehe(null);
    setCurrentPage(1);
  };

  const formatCategoryLabel = (stat: CategoryStats): string => {
    const parts: string[] = [];
    
    if (stat.category) parts.push(stat.category);
    if (stat.unterkategorie_typ) parts.push(stat.unterkategorie_typ);
    if (stat.rohstoff_typ === "Rohstoff" && stat.rohstoff_art) {
      parts.push(stat.rohstoff_art);
    }
    if (stat.direction) parts.push(stat.direction);
    if (stat.hebel_hoehe) parts.push(stat.hebel_hoehe);
    
    return parts.join(" / ");
  };

  // Gruppiere Statistiken nach Hauptkategorien
  const groupedStats = stats.reduce((acc, stat) => {
    if (!acc[stat.category]) {
      acc[stat.category] = [];
    }
    acc[stat.category].push(stat);
    return acc;
  }, {} as Record<string, CategoryStats[]>);

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors text-sm font-medium"
            >
              ← Zurück zur Startseite
            </a>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              EIX-Kategorien-Übersicht
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* ISIN Suche */}
            <div className="relative">
              <input
                type="text"
                value={searchIsin}
                onChange={(e) => setSearchIsin(e.target.value.toUpperCase())}
                placeholder="ISIN oder WKN suchen..."
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-0 w-48"
                disabled={isSearchingIsin}
              />
              {isSearchingIsin && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 dark:border-blue-400"></div>
                </div>
              )}
            </div>

            {/* Dark/Light Mode Toggle */}
            <button
              onClick={toggleDarkMode}
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
          </div>
        </div>

        {/* Filter-Sektion */}
        <div className="mb-8 p-4 bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Filter</h2>
            <button
              onClick={resetFilters}
              className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Filter zurücksetzen
            </button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Kategorie Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Kategorie
              </label>
              <select
                value={selectedCategory || ""}
                onChange={(e) => {
                  setSelectedCategory(e.target.value || null);
                  setCurrentPage(1);
                }}
                className="w-full pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-0 appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
              >
                <option value="">Alle</option>
                <option value="Aktie">Aktie</option>
                <option value="ETP">ETP</option>
                <option value="Fund">Fund</option>
              </select>
            </div>

            {/* Unterkategorie Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Unterkategorie
              </label>
              <select
                value={selectedUnterkategorie || ""}
                onChange={(e) => {
                  setSelectedUnterkategorie(e.target.value || null);
                  setCurrentPage(1);
                }}
                className="w-full pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-0 appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
              >
                <option value="">Alle</option>
                <option value="Hebel">Hebel</option>
                <option value="Normal">Normal</option>
              </select>
            </div>

            {/* Direction Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Richtung
              </label>
              <select
                value={selectedDirection || ""}
                onChange={(e) => {
                  setSelectedDirection(e.target.value || null);
                  setCurrentPage(1);
                }}
                className="w-full pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-0 appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
              >
                <option value="">Alle</option>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>

            {/* Rohstoff-Art Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Rohstoff-Art
              </label>
              <select
                value={selectedRohstoffArt || ""}
                onChange={(e) => {
                  setSelectedRohstoffArt(e.target.value || null);
                  setCurrentPage(1);
                }}
                className="w-full pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-0 appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
              >
                <option value="">Alle</option>
                <option value="Gold">Gold</option>
                <option value="Gold-Mine">Gold-Mine</option>
                <option value="Silber">Silber</option>
                <option value="Platin">Platin</option>
                <option value="Kupfer">Kupfer</option>
                <option value="Öl">Öl</option>
                <option value="Gas">Gas</option>
                <option value="Blei">Blei</option>
                <option value="Tin">Tin</option>
                <option value="Andere">Andere</option>
              </select>
            </div>

            {/* Hebelhöhe Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Hebelhöhe
              </label>
              <select
                value={selectedHebelHoehe || ""}
                onChange={(e) => {
                  setSelectedHebelHoehe(e.target.value || null);
                  setCurrentPage(1);
                }}
                className="w-full pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-0 appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
              >
                <option value="">Alle</option>
                <option value="2x">2x</option>
                <option value="3x">3x</option>
                <option value="5x">5x</option>
                <option value="10x">10x</option>
                <option value="20x">20x</option>
                <option value="Andere">Andere</option>
              </select>
            </div>
          </div>
        </div>

        {/* Kategorien-Übersicht */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Verfügbare Kategorien ({stats.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(groupedStats).map(([category, categoryStats]) => (
              <div
                key={category}
                className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700 p-4 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => {
                  setSelectedCategory(category);
                  setCurrentPage(1);
                }}
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {category}
                </h3>
                <div className="space-y-1">
                  {categoryStats.slice(0, 5).map((stat, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between text-sm text-gray-600 dark:text-gray-400"
                    >
                      <span className="truncate">{formatCategoryLabel(stat)}</span>
                      <span className="ml-2 font-medium">{stat.count}</span>
                    </div>
                  ))}
                  {categoryStats.length > 5 && (
                    <div className="text-xs text-gray-500 dark:text-gray-500">
                      +{categoryStats.length - 5} weitere...
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ergebnisse */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Ergebnisse ({totalCount})
            </h2>
            {loading && (
              <div className="text-sm text-gray-600 dark:text-gray-400">Lädt...</div>
            )}
          </div>

          {/* Fehlermeldung für ISIN/WKN-Suche */}
          {searchError && (searchIsin.trim().length >= 12 || (searchIsin.trim().length >= 6 && searchIsin.trim().length < 12)) && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-800 dark:text-red-200">{searchError}</p>
            </div>
          )}

          {assets.length === 0 && !loading ? (
            <div className="p-8 text-center bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700">
              <p className="text-gray-600 dark:text-gray-400">
                Keine Ergebnisse gefunden. Bitte Filter anpassen.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase min-w-[300px]">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        ISIN
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        WKN
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Kategorie
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Unterkategorie
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Rohstoff
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Richtung
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Hebelhöhe
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {assets.map((asset) => (
                      <tr
                        key={asset.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white min-w-[300px]">
                          {extractNameFromNotes(asset.notes) || asset.name || "-"}
                        </td>
                        <td 
                          className="px-4 py-3 text-sm font-mono cursor-pointer"
                          onClick={() => copyIsinToClipboard(asset.isin)}
                          title="Klicken zum Kopieren"
                        >
                          <span className={clickedIsin === asset.isin ? "text-blue-600 dark:text-blue-400 transition-colors" : "text-gray-900 dark:text-white transition-colors"}>
                            {asset.isin}
                          </span>
                        </td>
                        <td 
                          className="px-4 py-3 text-sm cursor-pointer"
                          onClick={() => copyWknToClipboard(asset.wkn || "")}
                          title={asset.wkn ? "Klicken zum Kopieren" : ""}
                        >
                          <span className={clickedWkn === asset.wkn ? "text-blue-600 dark:text-blue-400 transition-colors" : "text-gray-900 dark:text-white transition-colors"}>
                            {asset.wkn || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          {asset.category}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {asset.unterkategorie_typ || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {asset.rohstoff_typ === "kein_Rohstoff" ? "-" : (asset.rohstoff_art || "-")}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {asset.direction || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {asset.hebel_hoehe || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex justify-center items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Zurück
                  </button>
                  <span className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                    Seite {currentPage} von {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Weiter
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
