# Supabase-Diagnose und Tabellenstruktur

## Tabellenstruktur: `categorized_assets`

Die Tabelle sollte folgende Struktur haben:

```sql
CREATE TABLE categorized_assets (
  id UUID PRIMARY KEY,
  isin TEXT NOT NULL UNIQUE,  -- WICHTIG: Dieses Feld wird für die Prüfung verwendet
  name TEXT,
  wkn TEXT,
  category TEXT NOT NULL,
  unterkategorie_typ TEXT,
  rohstoff_typ TEXT,
  rohstoff_art TEXT,
  direction TEXT,
  hebel_hoehe TEXT,
  sub_category TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  original_row_data JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

## Wichtige Punkte für die ISIN-Prüfung:

1. **ISIN-Feld**: Das Feld `isin` ist UNIQUE und wird für die Prüfung verwendet
2. **ISIN-Format**: ISINs werden normalisiert (Großbuchstaben, keine Leerzeichen) für den Vergleich
3. **RLS-Policies**: Die Tabelle benötigt Policies für SELECT-Zugriff

## Diagnose-Queries für Supabase SQL-Editor:

### 1. Prüfe ob Tabelle existiert und wie viele Einträge vorhanden sind:
```sql
SELECT COUNT(*) as total_count FROM categorized_assets;
```

### 2. Zeige erste 10 Einträge:
```sql
SELECT isin, category, name, created_at 
FROM categorized_assets 
ORDER BY created_at DESC 
LIMIT 10;
```

### 3. Prüfe ob eine spezifische ISIN vorhanden ist:
```sql
-- Ersetze 'DE0001234567' mit einer echten ISIN aus deiner Excel-Datei
SELECT * FROM categorized_assets WHERE isin = 'DE0001234567';
```

### 4. Prüfe ISIN-Format (sollte keine Leerzeichen haben):
```sql
SELECT isin, LENGTH(isin) as isin_length, LENGTH(TRIM(isin)) as trimmed_length
FROM categorized_assets 
LIMIT 10;
```

### 5. Prüfe RLS-Policies:
```sql
SELECT * FROM pg_policies WHERE tablename = 'categorized_assets';
```

## Häufige Probleme:

1. **RLS blockiert Abfragen**: Stelle sicher, dass die SELECT-Policy existiert
2. **ISIN-Format unterschiedlich**: ISINs werden normalisiert (Großbuchstaben, keine Leerzeichen)
3. **Tabelle leer**: Prüfe ob Daten tatsächlich gespeichert wurden
4. **Falscher Tabellenname**: Stelle sicher, dass die Tabelle `categorized_assets` heißt

## Test-Abfrage für die Anwendung:

Die Anwendung prüft ISINs mit folgender Query:
```sql
SELECT * FROM categorized_assets WHERE isin IN ('ISIN1', 'ISIN2', 'ISIN3', ...);
```

Die ISINs werden dabei normalisiert (trim + uppercase) für den Vergleich.
