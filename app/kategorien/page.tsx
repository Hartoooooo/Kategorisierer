"use client";

import { useState, useEffect } from "react";
import CategoryNavigator from "@/lib/categories/CategoryNavigator";
import { CategoryPath } from "@/lib/categories/types";

export default function KategorienPage() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [currentPath, setCurrentPath] = useState<CategoryPath | null>(null);

  // Dark Mode initialisieren beim Laden
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

  // Dark Mode Toggle
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

  const handlePathChange = (path: CategoryPath) => {
    setCurrentPath(path);
    // Hier können später Supabase-Abfragen erfolgen
    console.log("Aktueller Pfad:", path);
  };

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto">
        {/* Header mit Titel und Dark/Light Mode Toggle */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors text-sm font-medium"
            >
              ← Zurück zur Startseite
            </a>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Kategorien-Navigation
            </h1>
          </div>

          {/* Dark/Light Mode Toggle Switch */}
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

        {/* Kategorien-Navigator */}
        <CategoryNavigator onPathChange={handlePathChange} />

        {/* Info-Box */}
        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Hinweis:</strong> Diese Seite ermöglicht die Navigation durch die
            Kategorienstruktur. Nach der API-Prüfung können die Werte hier aus Supabase
            geladen und angezeigt werden.
          </p>
        </div>
      </div>
    </div>
  );
}
