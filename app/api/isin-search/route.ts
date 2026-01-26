import { NextRequest, NextResponse } from "next/server";
import { createApiClient } from "@/lib/superbase/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { isin, wkn } = body;

    const searchValue = isin || wkn;
    const searchType = isin ? "isin" : "wkn";

    if (!searchValue || typeof searchValue !== "string") {
      return NextResponse.json(
        { error: "ISIN oder WKN fehlt oder ist ungültig" },
        { status: 400 }
      );
    }

    // Normalisiere Suchwert (Großbuchstaben, keine Leerzeichen)
    const normalizedValue = searchValue.trim().toUpperCase();

    // Validierung: ISIN muss mindestens 12 Zeichen haben, WKN mindestens 6
    if (searchType === "isin" && normalizedValue.length < 12) {
      return NextResponse.json(
        { error: "ISIN muss mindestens 12 Zeichen lang sein" },
        { status: 400 }
      );
    }

    if (searchType === "wkn" && normalizedValue.length < 6) {
      return NextResponse.json(
        { error: "WKN muss mindestens 6 Zeichen lang sein" },
        { status: 400 }
      );
    }

    const supabase = createApiClient();

    // Suche nach ISIN oder WKN in Supabase
    let query = supabase.from("categorized_assets").select("*");
    
    if (searchType === "isin") {
      query = query.eq("isin", normalizedValue);
    } else {
      query = query.eq("wkn", normalizedValue);
    }
    
    const { data, error } = await query.limit(1).single();

    if (error) {
      // Wenn kein Eintrag gefunden wurde (PGRST116 = no rows returned)
      if (error.code === "PGRST116") {
        return NextResponse.json({
          found: false,
          data: null,
        });
      }

      console.error("[isin-search] Fehler beim Suchen:", error);
      return NextResponse.json(
        { error: "Fehler beim Suchen in der Datenbank", details: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({
        found: false,
        data: null,
      });
    }

    return NextResponse.json({
      found: true,
      data: data,
    });
  } catch (error) {
    console.error("[isin-search] Exception:", error);
    return NextResponse.json(
      {
        error: "Unbekannter Fehler",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
