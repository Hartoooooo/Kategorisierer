import { Category, SubCategory, Direction, HebelHoehe } from "@/types";

interface CachedResult {
  category: Category;
  subCategory: SubCategory;
  direction: Direction;
  hebelHoehe?: HebelHoehe;
  status: "success" | "error";
  notes?: string;
  cachedAt: number;
}

/**
 * In-Memory Cache für ISIN-Ergebnisse
 * 
 * HINWEIS: In Produktion sollte dies durch Redis oder eine persistente Datenbank
 * ersetzt werden, um Cache über Server-Restarts hinweg zu erhalten.
 */
class IsinCache {
  private cache: Map<string, CachedResult> = new Map();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 Stunden

  /**
   * Prüft, ob ein Ergebnis für eine ISIN gecacht ist
   */
  get(isin: string): CachedResult | null {
    const cached = this.cache.get(isin);
    if (!cached) return null;

    // Prüfe TTL
    if (Date.now() - cached.cachedAt > this.TTL) {
      this.cache.delete(isin);
      return null;
    }

    return cached;
  }

  /**
   * Speichert ein Ergebnis für eine ISIN
   */
  set(isin: string, result: Omit<CachedResult, "cachedAt">): void {
    this.cache.set(isin, {
      ...result,
      cachedAt: Date.now(),
    });
  }

  /**
   * Löscht alle abgelaufenen Einträge
   */
  cleanup(): void {
    const now = Date.now();
    for (const [isin, cached] of this.cache.entries()) {
      if (now - cached.cachedAt > this.TTL) {
        this.cache.delete(isin);
      }
    }
  }

  /**
   * Gibt die Anzahl der gecachten Einträge zurück
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Löscht den gesamten Cache
   */
  clear(): void {
    this.cache.clear();
  }
}

// Singleton-Instanz
export const isinCache = new IsinCache();

// Cleanup alle 6 Stunden
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    isinCache.cleanup();
  }, 6 * 60 * 60 * 1000);
}
