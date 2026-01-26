import * as XLSX from "xlsx";
import { CheckedRow, Category } from "@/types";

/**
 * Erstellt einen sicheren Sheet-Namen (Excel-Limit: 31 Zeichen, keine Sonderzeichen)
 */
function sanitizeSheetName(name: string): string {
  return name
    .replace(/[\\\/\?\*\[\]:]/g, "")
    .substring(0, 31)
    .trim() || "Sheet";
}

/**
 * Erstellt eine Excel-Datei mit einem Sheet
 * Exportiert alle ursprünglichen Spalten in der ursprünglichen Reihenfolge
 */
export function createSingleSheetExcel(rows: CheckedRow[], headers?: string[]): Buffer {
  const workbook = XLSX.utils.book_new();

  if (!rows || rows.length === 0) {
    const worksheet = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "All");
    return Buffer.from(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
  }

  // Verwende die ursprünglichen Header, falls vorhanden
  const originalHeaders = headers || 
    (rows[0]?.originalRowData ? Object.keys(rows[0].originalRowData) : ["ISIN", "Name", "WKN"]);

  // Erstelle Daten-Array mit allen ursprünglichen Spalten in der richtigen Reihenfolge
  const data = rows.map((row) => {
    const rowData: Record<string, unknown> = {};
    originalHeaders.forEach((header) => {
      // Verwende ursprüngliche Daten, falls vorhanden
      if (row.originalRowData && header in row.originalRowData) {
        rowData[header] = row.originalRowData[header];
      } else {
        // Fallback auf ISIN/Name/WKN falls originalRowData nicht vorhanden
        if (header.toLowerCase().includes("isin")) {
          rowData[header] = row.isin;
        } else if (header.toLowerCase().includes("name") || header.toLowerCase().includes("bezeichnung")) {
          rowData[header] = row.name;
        } else if (header.toLowerCase().includes("wkn")) {
          rowData[header] = row.wkn;
        } else {
          rowData[header] = "";
        }
      }
    });
    return rowData;
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, "All");

  return Buffer.from(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

/**
 * Erstellt eine Excel-Datei mit mehreren Sheets (pro Kategorie)
 * Exportiert alle ursprünglichen Spalten in der ursprünglichen Reihenfolge
 */
export function createMultiSheetExcel(rows: CheckedRow[], headers?: string[]): Buffer {
  const workbook = XLSX.utils.book_new();

  if (!rows || rows.length === 0) {
    const worksheet = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    return Buffer.from(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
  }

  // Verwende die ursprünglichen Header, falls vorhanden
  const originalHeaders = headers || 
    (rows[0]?.originalRowData ? Object.keys(rows[0].originalRowData) : ["ISIN", "Name", "WKN"]);

  // Gruppiere nach Kategorie
  const byCategory: Record<string, CheckedRow[]> = {};

  rows.forEach((row) => {
    const key = row.category;
    if (!byCategory[key]) {
      byCategory[key] = [];
    }
    byCategory[key].push(row);
  });

  // Erstelle ein Sheet pro Kategorie
  // Exportiert alle ursprünglichen Spalten in der richtigen Reihenfolge
  Object.entries(byCategory).forEach(([category, categoryRows]) => {
    const data = categoryRows.map((row) => {
      const rowData: Record<string, unknown> = {};
      originalHeaders.forEach((header) => {
        // Verwende ursprüngliche Daten, falls vorhanden
        if (row.originalRowData && header in row.originalRowData) {
          rowData[header] = row.originalRowData[header];
        } else {
          // Fallback auf ISIN/Name/WKN falls originalRowData nicht vorhanden
          if (header.toLowerCase().includes("isin")) {
            rowData[header] = row.isin;
          } else if (header.toLowerCase().includes("name") || header.toLowerCase().includes("bezeichnung")) {
            rowData[header] = row.name;
          } else if (header.toLowerCase().includes("wkn")) {
            rowData[header] = row.wkn;
          } else {
            rowData[header] = "";
          }
        }
      });
      return rowData;
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const sheetName = sanitizeSheetName(category);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  return Buffer.from(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}
