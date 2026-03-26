import { NextRequest, NextResponse } from "next/server";
import { createApiClient } from "@/lib/superbase/api";

/**
 * Lädt alle Datensätze aus Supabase mit Pagination
 */
async function loadAllAssets(supabase: any): Promise<any[]> {
  const allAssets: any[] = [];
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("categorized_assets")
      .select("*")
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error(`[isin-search] Fehler beim Laden von Assets (offset ${offset}):`, error);
      break;
    }

    if (data && data.length > 0) {
      allAssets.push(...data);
      offset += pageSize;
      
      // Wenn weniger als pageSize zurückgegeben wurde, sind wir am Ende
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allAssets;
}

/**
 * Extrahiert Mnemonic aus original_row_data (gleiche Logik wie im Frontend)
 */
function extractMnemonicFromData(originalRowData: Record<string, unknown> | null | string): string | null {
  if (!originalRowData) return null;
  
  // Falls original_row_data ein JSON-String ist, parse ihn zuerst
  let data: Record<string, unknown> | null = null;
  if (typeof originalRowData === "string") {
    try {
      data = JSON.parse(originalRowData);
    } catch (e) {
      return null;
    }
  } else {
    data = originalRowData as Record<string, unknown>;
  }
  
  if (!data) return null;
  
  // Versuche zuerst direkt auf "Mnemonic" zuzugreifen
  let mnemonic = data["Mnemonic"];
  
  // Falls nicht gefunden, versuche case-insensitive Suche
  if (!mnemonic) {
    const keys = Object.keys(data);
    const mnemonicKey = keys.find(key => key.toLowerCase() === "mnemonic");
    if (mnemonicKey) {
      mnemonic = data[mnemonicKey];
    }
  }
  
  if (!mnemonic) return null;
  
  // Wenn es bereits ein String ist
  if (typeof mnemonic === "string") {
    let cleaned = mnemonic.trim();
    
    // Entferne alle Anführungszeichen am Anfang und Ende (auch verschachtelte)
    let previousLength = cleaned.length;
    while (true) {
      cleaned = cleaned.replace(/^["']+|["']+$/g, '');
      if (cleaned.length === previousLength) break;
      previousLength = cleaned.length;
    }
    
    return cleaned.trim() || null;
  }
  
  // Konvertiere zu String und entferne Anführungszeichen
  let cleaned = String(mnemonic).trim();
  let previousLength = cleaned.length;
  while (true) {
    cleaned = cleaned.replace(/^["']+|["']+$/g, '');
    if (cleaned.length === previousLength) break;
    previousLength = cleaned.length;
  }
  return cleaned || null;
}

/** Entfernt ILIKE-Wildcards aus der Nutzereingabe (verhindert absichtliche Pattern-Erweiterung). */
function sanitizeIlikeTerm(term: string): string {
  return term.replace(/%/g, "").replace(/_/g, "").trim();
}

/** Wie in parseExcel: Header normalisieren für Spalten-Matching */
function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/[_\s]/g, "");
}

/**
 * Spalten, deren Inhalt typischerweise Kennungen sind (nicht Anzeige-/Beschreibungstext aus der Excel-Zeile).
 */
function isIdentifierColumnKey(normalizedKey: string): boolean {
  const hints = [
    "isin",
    "wkn",
    "mnemonic",
    "basket",
    "sedol",
    "cusip",
    "valor",
    "lei",
    "ticker",
    "symbol",
    "bloomberg",
    "ric",
    "figi",
    "wpid",
  ];
  return hints.some((h) => normalizedKey === h || normalizedKey.includes(h));
}

function parseOriginalRowObject(
  originalRowData: Record<string, unknown> | null | string
): Record<string, unknown> | null {
  if (!originalRowData) return null;
  if (typeof originalRowData === "string") {
    try {
      const p = JSON.parse(originalRowData);
      return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof originalRowData === "object" && !Array.isArray(originalRowData)) {
    return originalRowData as Record<string, unknown>;
  }
  return null;
}

function valueToSearchableText(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") {
    const t = val.trim();
    return t.length ? t : null;
  }
  if (typeof val === "number" || typeof val === "boolean") {
    return String(val);
  }
  if (typeof val === "object") {
    try {
      const s = JSON.stringify(val);
      return s.length ? s : null;
    } catch {
      return null;
    }
  }
  return String(val);
}

/**
 * Sucht in allen Zellwerten der Originalzeile (beliebige Spaltenüberschrift), außer Kennungsspalten.
 */
function originalRowDataContainsNeedleInNonIdColumns(
  originalRowData: Record<string, unknown> | null | string,
  needleLower: string
): boolean {
  const data = parseOriginalRowObject(originalRowData);
  if (!data) return false;

  for (const key of Object.keys(data)) {
    const nk = normalizeHeaderKey(key);
    if (isIdentifierColumnKey(nk)) continue;
    const text = valueToSearchableText(data[key]);
    if (text && text.toLowerCase().includes(needleLower)) return true;
  }
  return false;
}

/** Wie im Frontend extractNameFromNotes — Abgleich mit angezeigtem Namen aus notes. */
function extractNameFragmentFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const nameIndex = notes.toLowerCase().indexOf("name:");
  if (nameIndex === -1) return null;
  let nameText = notes.substring(nameIndex + 5).trim();
  const pipeIndex = nameText.indexOf("|");
  if (pipeIndex !== -1) nameText = nameText.substring(0, pipeIndex).trim();
  nameText = nameText.replace(/^["']+|["']+$/g, "").trim();
  return nameText || null;
}

function assetMatchesNameSearch(item: any, needleLower: string): boolean {
  if (item?.name != null) {
    const n = String(item.name).trim().toLowerCase();
    if (n.includes(needleLower)) return true;
  }
  const fromNotes = extractNameFragmentFromNotes(item?.notes);
  if (fromNotes && fromNotes.toLowerCase().includes(needleLower)) return true;
  if (item?.notes && String(item.notes).toLowerCase().includes(needleLower)) return true;
  return originalRowDataContainsNeedleInNonIdColumns(item?.original_row_data, needleLower);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { isin, wkn, mnemonic, name: nameQuery } = body;

    // Namenssuche (Teilstring, case-insensitive) — kann mehrere Treffer liefern
    if (nameQuery !== undefined && nameQuery !== null) {
      if (typeof nameQuery !== "string") {
        return NextResponse.json({ error: "Ungültige Namenssuche" }, { status: 400 });
      }
      const sanitized = sanitizeIlikeTerm(nameQuery);
      if (sanitized.length < 2) {
        return NextResponse.json(
          { error: "Mindestens 2 Zeichen für die Namenssuche" },
          { status: 400 }
        );
      }
      const supabaseForName = createApiClient();
      const limit = Math.min(
        Math.max(1, parseInt(String(body.limit ?? "200"), 10) || 200),
        500
      );
      const offset = Math.max(0, parseInt(String(body.offset ?? "0"), 10) || 0);

      const needleLower = sanitized.toLowerCase();
      const allData = await loadAllAssets(supabaseForName);
      const matches = allData.filter((item: any) => assetMatchesNameSearch(item, needleLower));

      console.log(
        `[isin-search] Namenss (${allData.length} Zeilen, original_row + name/notes): ${matches.length} Treffer für "${sanitized}"`
      );

      const total = matches.length;
      const rows = matches.slice(offset, offset + limit);

      if (rows.length === 0) {
        return NextResponse.json({ found: false, data: [], multiple: true, count: 0 });
      }

      return NextResponse.json({
        found: true,
        data: rows,
        multiple: true,
        count: total,
      });
    }

    const searchValue = isin || wkn || mnemonic;
    const searchType = isin ? "isin" : (wkn ? "wkn" : "mnemonic");

    if (!searchValue || typeof searchValue !== "string") {
      return NextResponse.json(
        { error: "ISIN, WKN oder Mnemonic fehlt oder ist ungültig" },
        { status: 400 }
      );
    }

    // Normalisiere Suchwert (Großbuchstaben, keine Leerzeichen)
    const normalizedValue = searchValue.trim().toUpperCase();

    const supabase = createApiClient();

    // Suche nach ISIN, WKN oder Mnemonic in Supabase
    let query = supabase.from("categorized_assets").select("*");
    
    if (searchType === "isin") {
      // Validierung: ISIN muss mindestens 12 Zeichen haben
      if (normalizedValue.length < 12) {
        return NextResponse.json(
          { error: "ISIN muss mindestens 12 Zeichen lang sein" },
          { status: 400 }
        );
      }
      query = query.eq("isin", normalizedValue);
    } else if (searchType === "wkn") {
      // Validierung: WKN muss mindestens 6 Zeichen haben
      if (normalizedValue.length < 6) {
        return NextResponse.json(
          { error: "WKN muss mindestens 6 Zeichen lang sein" },
          { status: 400 }
        );
      }
      query = query.eq("wkn", normalizedValue);
    } else {
      // Suche nach Mnemonic NUR in original_row_data
      // Da JSONB-Suche in Supabase nicht zuverlässig funktioniert, laden wir alle Datensätze
      // mit Pagination und filtern in JavaScript
      const allData = await loadAllAssets(supabase);
      console.log(`[isin-search] Mnemonic-Suche: ${allData.length} Datensätze geladen, suche nach "${normalizedValue}" in original_row_data`);
      
      // Filtere nach Mnemonic in original_row_data
      const found = allData.find((item: any) => {
        // Prüfe NUR original_row_data
        if (!item.original_row_data) {
          return false;
        }
        
        // Extrahiere Mnemonic aus original_row_data
        const mnemonic = extractMnemonicFromData(item.original_row_data);
        if (mnemonic) {
          const normalizedMnemonic = mnemonic.toUpperCase();
          const matches = normalizedMnemonic === normalizedValue;
          if (matches) {
            console.log(`[isin-search] Mnemonic gefunden in original_row_data: "${mnemonic}" (normalisiert: "${normalizedMnemonic}") passt zu "${normalizedValue}"`);
          }
          return matches;
        }
        return false;
      });
      
      if (found) {
        console.log(`[isin-search] Mnemonic-Suche erfolgreich: Gefunden für "${normalizedValue}"`);
        // Stelle sicher, dass alle benötigten Felder zurückgegeben werden
        const result = {
          id: found.id,
          isin: found.isin,
          name: found.name,
          wkn: found.wkn,
          category: found.category,
          unterkategorie_typ: found.unterkategorie_typ,
          rohstoff_typ: found.rohstoff_typ,
          rohstoff_art: found.rohstoff_art,
          direction: found.direction,
          hebel_hoehe: found.hebel_hoehe,
          status: found.status,
          notes: found.notes,
          original_row_data: found.original_row_data,
          created_at: found.created_at,
          updated_at: found.updated_at,
          // Extrahiere Mnemonic für einfachen Zugriff
          mnemonic: extractMnemonicFromData(found.original_row_data),
        };
        
        return NextResponse.json({
          found: true,
          data: result,
        });
      }
      
      console.log(`[isin-search] Mnemonic-Suche: Kein Treffer für "${normalizedValue}" in original_row_data`);
      return NextResponse.json({
        found: false,
        data: null,
      });
    }
    
    const { data, error } = await query.limit(1).single();

    if (error) {
      // Wenn kein Eintrag gefunden wurde (PGRST116 = no rows returned)
      if (error.code === "PGRST116") {
        // Wenn ISIN oder WKN nicht gefunden wurde, versuche auch nach Mnemonic in original_row_data zu suchen
        if (searchType === "isin" || searchType === "wkn") {
          // Lade alle Datensätze mit Pagination und suche nach Mnemonic in original_row_data
          const allData = await loadAllAssets(supabase);
          
          if (allData.length > 0) {
            console.log(`[isin-search] Fallback Mnemonic-Suche: ${allData.length} Datensätze geladen, suche nach "${normalizedValue}" in original_row_data`);
            // Filtere in JavaScript nach Mnemonic in original_row_data
            const found = allData.find((item: any) => {
              if (!item.original_row_data) return false;
              const mnemonic = extractMnemonicFromData(item.original_row_data);
              return mnemonic && mnemonic.toUpperCase() === normalizedValue;
            });
            
            if (found) {
              console.log(`[isin-search] Fallback Mnemonic-Suche erfolgreich: Gefunden für "${normalizedValue}"`);
              // Stelle sicher, dass alle benötigten Felder zurückgegeben werden
              const result = {
                id: found.id,
                isin: found.isin,
                name: found.name,
                wkn: found.wkn,
                category: found.category,
                unterkategorie_typ: found.unterkategorie_typ,
                rohstoff_typ: found.rohstoff_typ,
                rohstoff_art: found.rohstoff_art,
                direction: found.direction,
                hebel_hoehe: found.hebel_hoehe,
                status: found.status,
                notes: found.notes,
                original_row_data: found.original_row_data,
                created_at: found.created_at,
                updated_at: found.updated_at,
                // Extrahiere Mnemonic für einfachen Zugriff
                mnemonic: extractMnemonicFromData(found.original_row_data),
              };
              
              return NextResponse.json({
                found: true,
                data: result,
              });
            }
          }
        }
        
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
      // Wenn ISIN oder WKN nicht gefunden wurde, versuche auch nach Mnemonic in original_row_data zu suchen
      if (searchType === "isin" || searchType === "wkn") {
        // Lade alle Datensätze mit Pagination und suche nach Mnemonic in original_row_data
        const allData = await loadAllAssets(supabase);
        
        if (allData.length > 0) {
          console.log(`[isin-search] Fallback Mnemonic-Suche: ${allData.length} Datensätze geladen, suche nach "${normalizedValue}" in original_row_data`);
          // Filtere in JavaScript nach Mnemonic in original_row_data
          const found = allData.find((item: any) => {
            if (!item.original_row_data) return false;
            const mnemonic = extractMnemonicFromData(item.original_row_data);
            return mnemonic && mnemonic.toUpperCase() === normalizedValue;
          });
          
          if (found) {
            console.log(`[isin-search] Fallback Mnemonic-Suche erfolgreich: Gefunden für "${normalizedValue}"`);
            // Stelle sicher, dass alle benötigten Felder zurückgegeben werden
            const result = {
              id: found.id,
              isin: found.isin,
              name: found.name,
              wkn: found.wkn,
              category: found.category,
              unterkategorie_typ: found.unterkategorie_typ,
              rohstoff_typ: found.rohstoff_typ,
              rohstoff_art: found.rohstoff_art,
              direction: found.direction,
              hebel_hoehe: found.hebel_hoehe,
              status: found.status,
              notes: found.notes,
              original_row_data: found.original_row_data,
              created_at: found.created_at,
              updated_at: found.updated_at,
              // Extrahiere Mnemonic für einfachen Zugriff
              mnemonic: extractMnemonicFromData(found.original_row_data),
            };
            
            return NextResponse.json({
              found: true,
              data: result,
            });
          }
        }
      }
      
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
