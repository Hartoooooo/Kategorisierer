import { NextRequest, NextResponse } from "next/server";
import { createApiClient } from "@/lib/superbase/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { isin } = body;

    if (!isin || typeof isin !== "string") {
      return NextResponse.json(
        { error: "ISIN fehlt oder ist ungültig" },
        { status: 400 }
      );
    }

    // Normalisiere ISIN (Großbuchstaben, keine Leerzeichen)
    const normalizedIsin = isin.trim().toUpperCase();

    if (normalizedIsin.length < 12) {
      return NextResponse.json(
        { error: "ISIN muss mindestens 12 Zeichen lang sein" },
        { status: 400 }
      );
    }

    const supabase = createApiClient();

    // Suche ISIN in Supabase
    const { data, error } = await supabase
      .from("categorized_assets")
      .select("*")
      .eq("isin", normalizedIsin)
      .limit(1)
      .single();

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
