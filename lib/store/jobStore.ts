import { JobData } from "@/types";

/**
 * In-Memory Store für Job-Daten
 * 
 * HINWEIS: In Produktion sollte dies durch eine persistente Datenbank
 * (z.B. PostgreSQL, MongoDB, Redis) ersetzt werden.
 */
class JobStore {
  private store: Map<string, JobData> = new Map();

  /**
   * Speichert Job-Daten
   */
  set(jobId: string, data: JobData): void {
    this.store.set(jobId, data);
  }

  /**
   * Lädt Job-Daten
   */
  get(jobId: string): JobData | undefined {
    return this.store.get(jobId);
  }

  /**
   * Prüft, ob ein Job existiert
   */
  has(jobId: string): boolean {
    return this.store.has(jobId);
  }

  /**
   * Löscht Job-Daten
   */
  delete(jobId: string): boolean {
    return this.store.delete(jobId);
  }

  /**
   * Generiert eine eindeutige Job-ID
   */
  generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Singleton-Instanz
export const jobStore = new JobStore();
