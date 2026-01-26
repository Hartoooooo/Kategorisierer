import { NextRequest, NextResponse } from "next/server";
import { parseExcel } from "@/lib/excel/parseExcel";
import { jobStore } from "@/lib/store/jobStore";

const MAX_UPLOAD_SIZE = (parseInt(process.env.APP_MAX_UPLOAD_MB || "10") * 1024 * 1024);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Keine Datei hochgeladen" },
        { status: 400 }
      );
    }

    // Dateityp prüfen
    if (
      !file.name.endsWith(".xlsx") &&
      !file.name.endsWith(".xls") &&
      file.type !==
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      return NextResponse.json(
        { error: "Nur Excel-Dateien (.xlsx, .xls) werden unterstützt" },
        { status: 400 }
      );
    }

    // Dateigröße prüfen
    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        {
          error: `Datei zu groß. Maximum: ${process.env.APP_MAX_UPLOAD_MB || 10} MB`,
        },
        { status: 400 }
      );
    }

    // Datei in Buffer konvertieren
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Excel parsen
    const { rows, errors, headers } = parseExcel(buffer.buffer);

    if (errors.length > 0 && rows.length === 0) {
      return NextResponse.json(
        { error: errors.join("; ") },
        { status: 400 }
      );
    }

    // Job erstellen
    const jobId = jobStore.generateJobId();
    jobStore.set(jobId, { parsedRows: rows, originalHeaders: headers });

    return NextResponse.json({
      jobId,
      rows,
      headers,
      errors: errors.length > 0 ? errors : [],
    });
  } catch (error) {
    console.error("Upload-Fehler:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unbekannter Fehler beim Upload",
      },
      { status: 500 }
    );
  }
}
