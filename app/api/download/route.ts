import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@/lib/store/jobStore";
import {
  createSingleSheetExcel,
  createMultiSheetExcel,
} from "@/lib/excel/writeExcel";
import { CheckedRow } from "@/types";

/**
 * Filtert Zeilen nach Kategorie
 * Unterstützt jetzt auch Long/Short bei Rohstoffen: "Rohstoff_Gold_long" oder "Rohstoff_Gold_short"
 */
function filterByCategory(
  rows: CheckedRow[],
  categoryFilter: string
): CheckedRow[] {
  const parts = categoryFilter.split("_");
  const category = parts[0];
  const subCategory = parts[1] || null;
  const direction = parts[2] || null; // Long/Short bei Rohstoffen
  
  return rows.filter((row) => {
    // Hauptkategorie muss übereinstimmen
    if (row.category !== category) {
      return false;
    }
    
    // Wenn Subkategorie angegeben ist, muss sie übereinstimmen
    if (subCategory && row.subCategory !== subCategory) {
      return false;
    }
    
    // Bei Rohstoffen: Wenn direction angegeben ist, muss sie übereinstimmen
    if (category === "Rohstoff" && direction && row.direction !== direction) {
      return false;
    }
    
    return true;
  });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get("jobId");
    const mode = searchParams.get("mode") || "singleSheet";
    const categoryFilter = searchParams.get("category");

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId Parameter fehlt" },
        { status: 400 }
      );
    }

    const jobData = jobStore.get(jobId);
    if (!jobData) {
      return NextResponse.json(
        { error: "Job nicht gefunden" },
        { status: 404 }
      );
    }

    if (!jobData.checkedRows || jobData.checkedRows.length === 0) {
      return NextResponse.json(
        { error: "Keine geprüften Daten vorhanden. Bitte zuerst ISINs prüfen." },
        { status: 400 }
      );
    }

    // Wenn categoryFilter gesetzt ist, filtere nur diese Kategorie
    let rowsToExport = jobData.checkedRows;
    if (categoryFilter) {
      rowsToExport = filterByCategory(jobData.checkedRows, categoryFilter);
    }

    // Verwende die ursprünglichen Header aus dem Job
    const originalHeaders = jobData.originalHeaders;

    // Excel generieren
    let buffer: Buffer;
    let filename: string;

    if (categoryFilter) {
      // Einzelne Kategorie: Dateiname = Kategoriename
      const [category, subCategory] = categoryFilter.split("_");
      if (subCategory) {
        // Unterkategorie: Gold, Silber, Platin, Kupfer, Öl, Andere
        filename = `${subCategory}.xlsx`;
      } else {
        // Hauptkategorie: Aktie -> Aktien, Rohstoff -> Rohstoff, etc.
        filename = category === "Aktie" ? `Aktien.xlsx` : `${category}.xlsx`;
      }
      buffer = createSingleSheetExcel(rowsToExport, originalHeaders);
    } else if (mode === "sheetsByCategory") {
      buffer = createMultiSheetExcel(rowsToExport, originalHeaders);
      filename = `kategorien.xlsx`;
    } else {
      buffer = createSingleSheetExcel(rowsToExport, originalHeaders);
      filename = `gesamt.xlsx`;
    }

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Download-Fehler:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unbekannter Fehler beim Download",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rows, mode = "singleSheet", categoryFilter, headers } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "Keine Daten zum Exportieren vorhanden" },
        { status: 400 }
      );
    }

    // Wenn categoryFilter gesetzt ist, filtere nur diese Kategorie
    let rowsToExport = rows as CheckedRow[];
    if (categoryFilter) {
      rowsToExport = filterByCategory(rowsToExport, categoryFilter);
    }

    // Verwende übergebene Header oder extrahiere aus den ersten Zeilen
    const originalHeaders = headers || 
      (rowsToExport[0]?.originalRowData ? Object.keys(rowsToExport[0].originalRowData) : undefined);

    // Excel generieren
    let buffer: Buffer;
    let filename: string;

    if (categoryFilter) {
      // Einzelne Kategorie: Dateiname = Kategoriename
      const [category, subCategory] = categoryFilter.split("_");
      if (subCategory) {
        // Unterkategorie: Gold, Silber, Platin, Kupfer, Öl, Andere
        filename = `${subCategory}.xlsx`;
      } else {
        // Hauptkategorie: Aktie -> Aktien, Rohstoff -> Rohstoff, etc.
        filename = category === "Aktie" ? `Aktien.xlsx` : `${category}.xlsx`;
      }
      buffer = createSingleSheetExcel(rowsToExport, originalHeaders);
    } else if (mode === "sheetsByCategory") {
      buffer = createMultiSheetExcel(rowsToExport, originalHeaders);
      filename = `kategorien.xlsx`;
    } else {
      buffer = createSingleSheetExcel(rowsToExport, originalHeaders);
      filename = `gesamt.xlsx`;
    }

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Download-Fehler:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unbekannter Fehler beim Download",
      },
      { status: 500 }
    );
  }
}
