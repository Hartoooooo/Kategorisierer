import { NextRequest, NextResponse } from "next/server";
import { createApiClient } from "@/lib/superbase/api";

interface CategoryFilter {
  category?: string;
  unterkategorie_typ?: string;
  rohstoff_typ?: string;
  rohstoff_art?: string;
  direction?: string;
  hebel_hoehe?: string;
  limit?: number;
  offset?: number;
}

interface CategoryStats {
  category: string;
  unterkategorie_typ: string | null;
  rohstoff_typ: string | null;
  rohstoff_art: string | null;
  direction: string | null;
  hebel_hoehe: string | null;
  count: number;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiClient();
    const searchParams = request.nextUrl.searchParams;

    // Parse Filter-Parameter
    const filter: CategoryFilter = {
      category: searchParams.get("category") || undefined,
      unterkategorie_typ: searchParams.get("unterkategorie_typ") || undefined,
      rohstoff_typ: searchParams.get("rohstoff_typ") || undefined,
      rohstoff_art: searchParams.get("rohstoff_art") || undefined,
      direction: searchParams.get("direction") || undefined,
      hebel_hoehe: searchParams.get("hebel_hoehe") || undefined,
      limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined,
      offset: searchParams.get("offset") ? parseInt(searchParams.get("offset")!) : undefined,
    };

    // Baue Query auf
    let query = supabase.from("categorized_assets").select("*", { count: "exact" });

    // Wende Filter an
    if (filter.category) {
      query = query.eq("category", filter.category);
    }
    if (filter.unterkategorie_typ) {
      query = query.eq("unterkategorie_typ", filter.unterkategorie_typ);
    }
    if (filter.rohstoff_typ) {
      query = query.eq("rohstoff_typ", filter.rohstoff_typ);
    }
    if (filter.rohstoff_art) {
      query = query.eq("rohstoff_art", filter.rohstoff_art);
    }
    if (filter.direction) {
      query = query.eq("direction", filter.direction);
    }
    if (filter.hebel_hoehe) {
      query = query.eq("hebel_hoehe", filter.hebel_hoehe);
    }

    // Pagination
    if (filter.limit) {
      query = query.limit(filter.limit);
    }
    if (filter.offset) {
      query = query.range(filter.offset, filter.offset + (filter.limit || 100) - 1);
    }

    const { data, error, count } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/categories] Supabase Fehler:", error);
      return NextResponse.json(
        { error: error.message || "Fehler beim Laden der Daten" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data || [],
      count: count || 0,
      filter,
    });
  } catch (error) {
    console.error("[GET /api/categories] Exception:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 }
    );
  }
}

// Endpoint für Statistiken über alle Kategorien
export async function POST(request: NextRequest) {
  try {
    const supabase = createApiClient();
    const body = await request.json();
    const { action } = body;

    if (action === "stats") {
      // Lade alle eindeutigen Kategorien-Kombinationen mit Anzahl
      const { data, error } = await supabase
        .from("categorized_assets")
        .select("category, unterkategorie_typ, rohstoff_typ, rohstoff_art, direction, hebel_hoehe");

      if (error) {
        console.error("[POST /api/categories] Supabase Fehler:", error);
        return NextResponse.json(
          { error: error.message || "Fehler beim Laden der Statistiken" },
          { status: 500 }
        );
      }

      // Gruppiere nach Kategorien-Kombinationen
      const statsMap = new Map<string, CategoryStats>();
      
      (data || []).forEach((item) => {
        const key = `${item.category}_${item.unterkategorie_typ || "null"}_${item.rohstoff_typ || "null"}_${item.rohstoff_art || "null"}_${item.direction || "null"}_${item.hebel_hoehe || "null"}`;
        
        if (!statsMap.has(key)) {
          statsMap.set(key, {
            category: item.category,
            unterkategorie_typ: item.unterkategorie_typ,
            rohstoff_typ: item.rohstoff_typ,
            rohstoff_art: item.rohstoff_art,
            direction: item.direction,
            hebel_hoehe: item.hebel_hoehe,
            count: 0,
          });
        }
        
        const stat = statsMap.get(key)!;
        stat.count++;
      });

      const stats = Array.from(statsMap.values()).sort((a, b) => {
        // Sortiere nach Kategorie, dann nach Anzahl
        if (a.category !== b.category) {
          const order = { Aktie: 1, ETP: 2, Fund: 3 };
          return (order[a.category as keyof typeof order] || 99) - (order[b.category as keyof typeof order] || 99);
        }
        return b.count - a.count;
      });

      return NextResponse.json({ stats });
    }

    return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/categories] Exception:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 }
    );
  }
}
