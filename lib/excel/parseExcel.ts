import * as XLSX from "xlsx";
import { ParsedRow } from "@/types";
import { normalizeIsin, validateIsin } from "@/lib/utils/isin";

interface ExcelRow {
  [key: string]: unknown;
}

/**
 * Normalisiert Spaltennamen für flexibles Matching
 */
function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_\s]/g, "");
}

/**
 * Findet Spaltenindizes für ISIN, Name, WKN
 */
function findColumns(headers: string[]): {
  isinIndex: number | null;
  nameIndex: number | null;
  wknIndex: number | null;
} {
  let isinIndex: number | null = null;
  let nameIndex: number | null = null;
  let wknIndex: number | null = null;

  const isinAliases = ["isin", "isincode", "isincode"];
  const nameAliases = ["name", "bezeichnung", "titel", "instrumentname"];
  const wknAliases = ["wkn", "wertpapierkennnummer"];

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!isinIndex && isinAliases.some((alias) => normalized.includes(alias))) {
      isinIndex = index;
    }
    if (!nameIndex && nameAliases.some((alias) => normalized.includes(alias))) {
      nameIndex = index;
    }
    if (!wknIndex && wknAliases.some((alias) => normalized.includes(alias))) {
      wknIndex = index;
    }
  });

  return { isinIndex, nameIndex, wknIndex };
}

/**
 * Parst eine Excel-Datei und extrahiert ISIN, Name, WKN sowie alle anderen Spalten
 */
export function parseExcel(buffer: ArrayBuffer): {
  rows: ParsedRow[];
  errors: string[];
  headers: string[];
} {
  const errors: string[] = [];
  const rows: ParsedRow[] = [];
  let headers: string[] = [];

  try {
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      errors.push("Kein Sheet in der Excel-Datei gefunden");
      return { rows, errors, headers };
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
    });

    if (jsonData.length === 0) {
      errors.push("Die Excel-Datei ist leer");
      return { rows, errors, headers };
    }

    // Erste Zeile als Header
    const headerRow = jsonData[0] as string[];
    if (!Array.isArray(headerRow)) {
      errors.push("Ungültiges Header-Format");
      return { rows, errors, headers };
    }

    // Header speichern
    headers = headerRow.map((h) => String(h || "").trim());

    const { isinIndex, nameIndex, wknIndex } = findColumns(headerRow);

    if (isinIndex === null) {
      errors.push("ISIN-Spalte nicht gefunden");
    }
    if (nameIndex === null) {
      errors.push("Name-Spalte nicht gefunden");
    }
    if (wknIndex === null) {
      errors.push("WKN-Spalte nicht gefunden");
    }

    if (isinIndex === null || nameIndex === null || wknIndex === null) {
      return { rows, errors, headers };
    }

    // Datenzeilen verarbeiten (ab Zeile 2)
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i] as unknown[];
      if (!Array.isArray(row)) continue;

      const isinRaw = String(row[isinIndex] || "").trim();
      const nameRaw = String(row[nameIndex] || "").trim();
      const wknRaw = String(row[wknIndex] || "").trim();

      // Überspringe leere Zeilen
      if (!isinRaw && !nameRaw && !wknRaw) continue;

      const normalizedIsin = normalizeIsin(isinRaw);
      const validIsin = validateIsin(normalizedIsin);

      // Alle ursprünglichen Spalten speichern
      const originalRowData: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        const value = row[index];
        originalRowData[header] = value !== undefined && value !== null ? value : "";
      });

      rows.push({
        rowIndex: i + 1, // Excel-Zeilenindex (1-basiert)
        isin: normalizedIsin,
        name: nameRaw,
        wkn: wknRaw,
        validIsin,
        originalRowData,
      });
    }
  } catch (error) {
    errors.push(
      `Fehler beim Parsen der Excel-Datei: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`
    );
  }

  return { rows, errors, headers };
}
