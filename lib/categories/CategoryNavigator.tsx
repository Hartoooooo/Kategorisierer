"use client";

import { useState } from "react";
import {
  CategoryPath,
  categoryConfig,
} from "./types";

interface CategoryNavigatorProps {
  onPathChange?: (path: CategoryPath) => void;
  initialPath?: CategoryPath;
}

export default function CategoryNavigator({
  onPathChange,
  initialPath,
}: CategoryNavigatorProps) {
  const [currentPath, setCurrentPath] = useState<CategoryPath>(
    initialPath || {}
  );

  const updatePath = (updates: Partial<CategoryPath>) => {
    const newPath: CategoryPath = {
      ...currentPath,
      ...updates,
      ...(updates.oberkategorie !== undefined &&
      updates.oberkategorie !== currentPath.oberkategorie
        ? { unterkategorieTyp: undefined, hebelRichtung: undefined, rohstoffTyp: undefined, rohstoffArt: undefined, hebelHoehe: undefined }
        : {}),
      ...(updates.unterkategorieTyp !== undefined &&
      updates.unterkategorieTyp !== currentPath.unterkategorieTyp
        ? { hebelRichtung: undefined, rohstoffTyp: undefined, rohstoffArt: undefined, hebelHoehe: undefined }
        : {}),
      ...(updates.hebelRichtung !== undefined &&
      updates.hebelRichtung !== currentPath.hebelRichtung
        ? { rohstoffTyp: undefined, rohstoffArt: undefined, hebelHoehe: undefined }
        : {}),
      ...(updates.rohstoffTyp !== undefined &&
      updates.rohstoffTyp !== currentPath.rohstoffTyp
        ? { rohstoffArt: undefined, hebelHoehe: undefined }
        : {}),
      ...(updates.rohstoffArt !== undefined &&
      updates.rohstoffArt !== currentPath.rohstoffArt
        ? { hebelHoehe: undefined }
        : {}),
    };
    setCurrentPath(newPath);
    onPathChange?.(newPath);
  };

  const getBreadcrumbPath = (): string[] => {
    const path: string[] = [];
    if (currentPath.oberkategorie) {
      path.push(currentPath.oberkategorie);
    }
    if (currentPath.unterkategorieTyp) {
      path.push(currentPath.unterkategorieTyp);
    }
    if (currentPath.hebelRichtung) {
      path.push(currentPath.hebelRichtung);
    }
    if (currentPath.rohstoffTyp) {
      path.push(currentPath.rohstoffTyp);
    }
    if (currentPath.rohstoffArt) {
      path.push(currentPath.rohstoffArt);
    }
    if (currentPath.hebelHoehe) {
      path.push(`Hebel: ${currentPath.hebelHoehe}`);
    }
    return path;
  };

  const canGoBack = () => {
    return (
      currentPath.hebelHoehe ||
      currentPath.rohstoffArt ||
      currentPath.rohstoffTyp ||
      currentPath.hebelRichtung ||
      currentPath.unterkategorieTyp ||
      currentPath.oberkategorie
    );
  };

  const goBack = () => {
    if (currentPath.hebelHoehe) {
      updatePath({ hebelHoehe: undefined });
    } else if (currentPath.rohstoffArt) {
      updatePath({ rohstoffArt: undefined });
    } else if (currentPath.rohstoffTyp) {
      updatePath({ rohstoffTyp: undefined });
    } else if (currentPath.hebelRichtung) {
      updatePath({ hebelRichtung: undefined });
    } else if (currentPath.unterkategorieTyp) {
      updatePath({ unterkategorieTyp: undefined });
    } else if (currentPath.oberkategorie) {
      updatePath({ oberkategorie: undefined });
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      {/* Breadcrumb Navigation */}
      {canGoBack() && (
        <div className="flex justify-center items-center gap-4">
          <button
            onClick={goBack}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
          >
            ← Zurück
          </button>
          <div className="flex items-center gap-2">
            {getBreadcrumbPath().map((segment, index) => (
              <div key={index} className="flex items-center gap-2">
                {index > 0 && (
                  <span className="text-gray-400 dark:text-gray-600">/</span>
                )}
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {segment}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Oberkategorien */}
      {!currentPath.oberkategorie && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center">
            Wählen Sie eine Überkategorie
          </h2>
          <div className="flex justify-center items-center gap-4 flex-wrap">
            {categoryConfig.oberkategorien.map((kat) => (
              <button
                key={kat}
                onClick={() =>
                  updatePath({
                    oberkategorie: kat,
                  })
                }
                className="px-12 py-6 text-xl font-medium text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md min-w-[150px]"
              >
                {kat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unterkategorien (Hebel/Normal) */}
      {currentPath.oberkategorie &&
        !currentPath.unterkategorieTyp &&
        categoryConfig.unterkategorien[currentPath.oberkategorie] && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center">
              Wählen Sie eine Unterkategorie
            </h2>
            <div className="flex justify-center items-center gap-4 flex-wrap">
              {categoryConfig.unterkategorien[
                currentPath.oberkategorie
              ].map((typ) => (
                <button
                  key={typ}
                  onClick={() => {
                    updatePath({ unterkategorieTyp: typ });
                  }}
                  className="px-12 py-6 text-xl font-medium text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md min-w-[180px]"
                >
                  {typ}
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Hebel-Richtungen (Long/Short) */}
      {currentPath.unterkategorieTyp === "Hebel" &&
        !currentPath.hebelRichtung &&
        categoryConfig.hebelRichtungen["Hebel"] && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center">
              Wählen Sie eine Hebel-Richtung
            </h2>
            <div className="flex justify-center items-center gap-4 flex-wrap">
              {categoryConfig.hebelRichtungen["Hebel"]!.map((richtung) => (
                <button
                  key={richtung}
                  onClick={() => updatePath({ hebelRichtung: richtung })}
                  className="px-12 py-6 text-xl font-medium text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md min-w-[150px]"
                >
                  {richtung}
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Rohstoff-Typ (Rohstoff/kein Rohstoff) */}
      {currentPath.hebelRichtung &&
        !currentPath.rohstoffTyp &&
        categoryConfig.rohstoffTypen[currentPath.hebelRichtung] && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center">
              Wählen Sie einen Typ
            </h2>
            <div className="flex justify-center items-center gap-4 flex-wrap">
              {categoryConfig.rohstoffTypen[
                currentPath.hebelRichtung
              ].map((typ) => (
                <button
                  key={typ}
                  onClick={() => updatePath({ rohstoffTyp: typ })}
                  className="px-12 py-6 text-xl font-medium text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md min-w-[200px]"
                >
                  {typ}
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Rohstoff-Arten */}
      {currentPath.rohstoffTyp === "Rohstoff" &&
        !currentPath.rohstoffArt && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center">
              Wählen Sie die Art des Rohstoffs
            </h2>
            <div className="flex justify-center items-center gap-3 flex-wrap">
              {categoryConfig.rohstoffArten.map((art) => (
                <button
                  key={art}
                  onClick={() => updatePath({ rohstoffArt: art })}
                  className="px-10 py-5 text-lg font-medium text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md min-w-[130px]"
                >
                  {art}
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Hebel-Höhe */}
      {(currentPath.rohstoffArt ||
        currentPath.rohstoffTyp === "kein Rohstoff") &&
        !currentPath.hebelHoehe && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center">
              Wählen Sie die Höhe des Hebels
            </h2>
            <div className="flex justify-center items-center gap-3 flex-wrap">
              {categoryConfig.hebelHoehen.map((hoehe) => (
                <button
                  key={hoehe}
                  onClick={() => updatePath({ hebelHoehe: hoehe })}
                  className="px-10 py-5 text-lg font-medium text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md min-w-[100px]"
                >
                  {hoehe}
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Finale Ansicht - vollständiger Pfad ausgewählt */}
      {currentPath.hebelHoehe && (
        <div className="space-y-6">
          <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 text-center">
              Vollständiger Kategoriepfad ausgewählt
            </h2>
            <div className="space-y-2 text-gray-700 dark:text-gray-300 max-w-md mx-auto">
              {currentPath.oberkategorie && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="font-medium text-gray-600 dark:text-gray-400">Überkategorie:</span>
                  <span>{currentPath.oberkategorie}</span>
                </div>
              )}
              {currentPath.unterkategorieTyp && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="font-medium text-gray-600 dark:text-gray-400">Unterkategorie:</span>
                  <span>{currentPath.unterkategorieTyp}</span>
                </div>
              )}
              {currentPath.hebelRichtung && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="font-medium text-gray-600 dark:text-gray-400">Richtung:</span>
                  <span>{currentPath.hebelRichtung}</span>
                </div>
              )}
              {currentPath.rohstoffTyp && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="font-medium text-gray-600 dark:text-gray-400">Typ:</span>
                  <span>{currentPath.rohstoffTyp}</span>
                </div>
              )}
              {currentPath.rohstoffArt && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="font-medium text-gray-600 dark:text-gray-400">Rohstoffart:</span>
                  <span>{currentPath.rohstoffArt}</span>
                </div>
              )}
              {currentPath.hebelHoehe && (
                <div className="flex justify-between items-center py-2">
                  <span className="font-medium text-gray-600 dark:text-gray-400">Hebelhöhe:</span>
                  <span>{currentPath.hebelHoehe}</span>
                </div>
              )}
            </div>
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400 text-center">
              Hier können später die Werte aus Supabase angezeigt werden.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
