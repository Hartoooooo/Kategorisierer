import { NextRequest, NextResponse } from "next/server";
import { createApiClient } from "@/lib/superbase/api";

interface CategoryFilter {
  category?: string;
  unterkategorie_typ?: string;
  rohstoff_typ?: string;
  rohstoff_art?: string;
  direction?: string;
  hebel_hoehe?: string;
  basket?: string;
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
      basket: searchParams.get("basket") || undefined,
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

    // Wenn Basket-Filter aktiv ist, müssen wir alle Daten laden und dann filtern
    // (da JSONB-Filterung in Supabase nicht einfach möglich ist)
    const needsBasketFilter = !!filter.basket;
    
    let data: any[] = [];
    let error: any = null;
    let count: number = 0;
    
    if (!needsBasketFilter) {
      // Normale Pagination ohne Basket-Filter
      if (filter.limit) {
        query = query.limit(filter.limit);
      }
      if (filter.offset) {
        query = query.range(filter.offset, filter.offset + (filter.limit || 100) - 1);
      }
      
      const result = await query.order("created_at", { ascending: false });
      data = result.data || [];
      error = result.error;
      count = result.count || 0;
    } else {
      // Bei Basket-Filter: Lade ALLE Daten mit Pagination
      // Da wir nach JSONB filtern müssen, müssen wir alle Daten laden
      const allData: any[] = [];
      const pageSize = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const pageQuery = supabase
          .from("categorized_assets")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        
        // Wende alle anderen Filter an
        if (filter.category) pageQuery.eq("category", filter.category);
        if (filter.unterkategorie_typ) pageQuery.eq("unterkategorie_typ", filter.unterkategorie_typ);
        if (filter.rohstoff_typ) pageQuery.eq("rohstoff_typ", filter.rohstoff_typ);
        if (filter.rohstoff_art) pageQuery.eq("rohstoff_art", filter.rohstoff_art);
        if (filter.direction) pageQuery.eq("direction", filter.direction);
        if (filter.hebel_hoehe) pageQuery.eq("hebel_hoehe", filter.hebel_hoehe);
        
        const pageResult = await pageQuery;
        
        if (pageResult.error) {
          error = pageResult.error;
          break;
        }
        
        if (pageResult.data && pageResult.data.length > 0) {
          allData.push(...pageResult.data);
          offset += pageSize;
          
          // Wenn weniger als pageSize zurückgegeben wurde, sind wir am Ende
          if (pageResult.data.length < pageSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
        
        // Setze count nur beim ersten Durchlauf
        if (offset === pageSize) {
          count = pageResult.count || 0;
        }
      }
      
      data = allData;
      console.log(`[GET /api/categories] Alle Daten geladen für Basket-Filter: ${data.length} Datensätze`);
    }

    if (error) {
      console.error("[GET /api/categories] Supabase Fehler:", error);
      return NextResponse.json(
        { error: error.message || "Fehler beim Laden der Daten" },
        { status: 500 }
      );
    }

    // Filtere nach Basket in original_row_data (falls angegeben)
    let filteredData = data || [];
    let filteredCount = count || 0;

    if (filter.basket) {
      console.log(`[GET /api/categories] Filtere nach Basket: "${filter.basket}"`);
      console.log(`[GET /api/categories] Gesamtanzahl vor Filter: ${filteredData.length}`);
      
      // Zeige Beispiel-Basket-Werte für Debugging (mehr Beispiele)
      const sampleBaskets: string[] = [];
      const eixBExamples: string[] = [];
      const eixMExamples: string[] = [];
      
      filteredData.slice(0, 100).forEach((item: any) => {
        if (item.original_row_data) {
          const basketKeys = Object.keys(item.original_row_data).filter(k => 
            k.toLowerCase() === "basket"
          );
          if (basketKeys.length > 0) {
            const basket = item.original_row_data[basketKeys[0]];
            if (basket) {
              let basketValue = String(basket).trim();
              let previousLength = basketValue.length;
              while (true) {
                basketValue = basketValue.replace(/^["']+|["']+$/g, '');
                if (basketValue.length === previousLength) break;
                previousLength = basketValue.length;
              }
              
              const normalized = basketValue.toUpperCase().trim();
              
              if (!sampleBaskets.includes(basketValue)) {
                sampleBaskets.push(basketValue);
              }
              
              // Sammle EIX B und EIX M Beispiele separat
              if (normalized.includes("EIX B") && eixBExamples.length < 5) {
                eixBExamples.push(basketValue);
              }
              if (normalized.includes("EIX M") && eixMExamples.length < 5) {
                eixMExamples.push(basketValue);
              }
            }
          }
        }
      });
      console.log(`[GET /api/categories] Beispiel-Basket-Werte (erste 100):`, sampleBaskets.slice(0, 20));
      console.log(`[GET /api/categories] EIX B Beispiele:`, eixBExamples);
      console.log(`[GET /api/categories] EIX M Beispiele:`, eixMExamples);
      
      // Filtere alle Daten nach Basket
      let matchCount = 0;
      let noBasketCount = 0;
      let emptyBasketCount = 0;
      
      filteredData = filteredData.filter((item: any) => {
        if (!item.original_row_data) {
          noBasketCount++;
          return false;
        }
        
        // Suche nach Basket in verschiedenen Schreibweisen (case-insensitive)
        const basketKeys = Object.keys(item.original_row_data).filter(k => 
          k.toLowerCase() === "basket"
        );
        
        if (basketKeys.length === 0) {
          noBasketCount++;
          return false;
        }
        
        const basket = item.original_row_data[basketKeys[0]];
        
        if (!basket) {
          emptyBasketCount++;
          return false;
        }
        
        // Normalisiere den Wert (String, entferne Anführungszeichen)
        let basketValue = String(basket).trim();
        // Entferne mehrfach Anführungszeichen
        let previousLength = basketValue.length;
        while (true) {
          basketValue = basketValue.replace(/^["']+|["']+$/g, '');
          if (basketValue.length === previousLength) break;
          previousLength = basketValue.length;
        }
        
        // Prüfe ob der Basket-Wert "EIX B" oder "EIX M" enthält (auch wenn danach noch Text kommt)
        // z.B. "EIX B US" oder "EIX M US" sollte matchen für "EIX B" bzw. "EIX M"
        // Normalisiere beide Werte für Vergleich (Großbuchstaben, keine Leerzeichen am Anfang/Ende)
        const normalizedBasketValue = basketValue.toUpperCase().trim();
        const normalizedFilter = filter.basket ? filter.basket.toUpperCase().trim() : "";
        
        // Prüfe ob der normalisierte Basket-Wert den Filter enthält
        // z.B. "EIX M US" sollte "EIX M" enthalten, "EIX B US" sollte "EIX B" enthalten
        let matches = false;
        if (normalizedFilter) {
          // Direkte Suche - prüfe ob der Filter-Wert im Basket-Wert enthalten ist
          // "EIX B" sollte in "EIX B US" gefunden werden
          // "EIX M" sollte in "EIX M US" gefunden werden
          matches = normalizedBasketValue.includes(normalizedFilter);
          
          // Falls nicht gefunden, prüfe auch Varianten ohne Leerzeichen oder mit Bindestrich
          if (!matches) {
            // Prüfe Varianten: "EIXB" oder "EIX-B" statt "EIX B"
            const filterNoSpace = normalizedFilter.replace(/\s+/g, "");
            const filterWithDash = normalizedFilter.replace(/\s+/g, "-");
            const basketNoSpace = normalizedBasketValue.replace(/\s+/g, "");
            const basketWithDash = normalizedBasketValue.replace(/\s+/g, "-");
            
            matches = basketNoSpace.includes(filterNoSpace) || 
                     basketWithDash.includes(filterWithDash) ||
                     normalizedBasketValue.startsWith(normalizedFilter + " ") ||
                     normalizedBasketValue.startsWith(normalizedFilter);
          }
          
          // Debug für erste paar Versuche wenn kein Match
          if (!matches && (matchCount + noBasketCount + emptyBasketCount) < 5) {
            console.log(`[GET /api/categories] Kein Match: Basket="${normalizedBasketValue}", Filter="${normalizedFilter}"`);
          }
        }
        
        if (matches) {
          matchCount++;
          // Debug: Zeige erste paar Treffer
          if (matchCount <= 3 && filter.basket) {
            console.log(`[GET /api/categories] Basket-Match ${matchCount}: "${basketValue}" enthält "${filter.basket}"`);
          }
        }
        
        return matches;
      });
      
      console.log(`[GET /api/categories] Filter-Statistik: ${matchCount} Matches, ${noBasketCount} ohne Basket-Key, ${emptyBasketCount} leere Basket-Werte`);
      console.log(`[GET /api/categories] Gefilterte Anzahl nach Basket-Filter: ${filteredData.length}`);
      
      // Setze die gefilterte Anzahl
      filteredCount = filteredData.length;
      
      // Wende Pagination nach dem Filter an
      if (filter.limit && filter.offset !== undefined) {
        const start = filter.offset;
        const end = start + filter.limit;
        filteredData = filteredData.slice(start, end);
      } else if (filter.limit) {
        filteredData = filteredData.slice(0, filter.limit);
      }
    }

    return NextResponse.json({
      data: filteredData,
      count: filteredCount,
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
