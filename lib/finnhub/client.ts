const FINNHUB_BASE_URL =
  process.env.FINNHUB_BASE_URL || "https://finnhub.io/api/v1";
const FINNHUB_SECRET = process.env.FINNHUB_SECRET;
const REQUEST_TIMEOUT = 7000; // 7 Sekunden (optimiert von 10s)
const MAX_RETRIES = 2;
const CONCURRENCY_LIMIT = parseInt(process.env.FINNHUB_CONCURRENCY_LIMIT || "17", 10); // Standard: 17 (konfigurierbar)

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
}

/**
 * Wartet eine bestimmte Zeit
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Führt einen Request mit Retry-Logik aus
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const { maxRetries = MAX_RETRIES, baseDelay = 1000 } = retryOptions;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Retry bei 429 (Rate Limit) oder 5xx Fehlern
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
          await sleep(delay);
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}

/**
 * Führt einen Finnhub API Request aus
 */
export async function finnhubRequest(
  endpoint: string,
  params?: Record<string, string>
): Promise<unknown> {
  if (!FINNHUB_SECRET) {
    throw new Error("FINNHUB_SECRET ist nicht gesetzt");
  }

  const url = new URL(`${FINNHUB_BASE_URL}${endpoint}`);
  
  // Token als Query-Parameter hinzufügen (laut Dokumentation unterstützt)
  url.searchParams.append("token", FINNHUB_SECRET);
  
  // Zusätzliche Parameter hinzufügen
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  // Log URL ohne Token für Debugging
  const urlForLogging = url.toString().replace(/token=[^&]+/, "token=***");
  console.log(`[finnhubRequest] Rufe auf: ${urlForLogging}`);

  const response = await fetchWithRetry(url.toString(), {
    method: "GET",
    headers: {
      "X-Finnhub-Token": FINNHUB_SECRET, // Header als Alternative/Backup
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Keine Fehlerdetails verfügbar");
    console.error(`[finnhubRequest] API Fehler für ${endpoint}:`, {
      status: response.status,
      statusText: response.statusText,
      errorText: errorText.substring(0, 500),
    });
    throw new Error(
      `Finnhub API Fehler: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`
    );
  }

  const data = await response.json();
  console.log(`[finnhubRequest] Erfolgreich: ${endpoint}`, JSON.stringify(data).substring(0, 200));
  return data;
}

/**
 * Führt mehrere Requests mit Concurrency-Limit aus
 * Behält die Reihenfolge der Requests bei
 * Trackt die Zeit pro Request für Zeit-Schätzungen
 */
export async function finnhubRequestBatch<T>(
  requests: Array<() => Promise<T>>,
  limit: number = CONCURRENCY_LIMIT
): Promise<{ results: T[]; averageTimePerRequest: number }> {
  const results: (T | null)[] = new Array(requests.length).fill(null);
  const executing: Array<{ index: number; promise: Promise<void>; startTime: number }> = [];
  const requestTimes: number[] = [];

  for (let i = 0; i < requests.length; i++) {
    const index = i;
    const request = requests[i];
    const startTime = Date.now();

    const promise = request()
      .then((result) => {
        const duration = Date.now() - startTime;
        requestTimes.push(duration);
        results[index] = result;
      })
      .catch((error) => {
        const duration = Date.now() - startTime;
        requestTimes.push(duration);
        console.error(`Request ${index} fehlgeschlagen:`, error);
        // Fehler werden als null gespeichert, damit die Reihenfolge erhalten bleibt
        results[index] = null;
      });

    executing.push({ index, promise, startTime });

    if (executing.length >= limit) {
      await Promise.race(executing.map((e) => e.promise));
      // Entferne das erste fertige Promise
      const finished = executing.shift();
      if (finished) {
        await finished.promise;
      }
    }
  }

  // Warte auf alle verbleibenden Promises
  await Promise.all(executing.map((e) => e.promise));

  // Berechne die durchschnittliche Zeit pro Request
  const averageTimePerRequest =
    requestTimes.length > 0
      ? requestTimes.reduce((sum, time) => sum + time, 0) / requestTimes.length
      : 0;

  return { results: results as T[], averageTimePerRequest };
}
