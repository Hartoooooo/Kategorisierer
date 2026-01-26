/**
 * Normalisiert eine ISIN: trim + uppercase
 */
export function normalizeIsin(isin: string): string {
  return isin.trim().toUpperCase();
}

/**
 * Validiert eine ISIN nach dem Standard-Format
 * Format: 2 Buchstaben (Ländercode) + 9 alphanumerische Zeichen + 1 Prüfziffer = 12 Zeichen total
 * Regex: ^[A-Z]{2}[A-Z0-9]{10}$
 */
export function validateIsin(isin: string): boolean {
  const normalized = normalizeIsin(isin);
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(normalized);
}
