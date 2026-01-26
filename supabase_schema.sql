-- Supabase Tabellenstruktur für kategorisierte Assets
-- Diese SQL-Datei kann in der Supabase SQL-Editor ausgeführt werden

-- Tabelle für kategorisierte Assets
CREATE TABLE IF NOT EXISTS categorized_assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  isin TEXT NOT NULL UNIQUE,
  name TEXT,
  wkn TEXT,
  -- Hauptkategorisierung
  category TEXT NOT NULL, -- Oberkategorie: Aktie, ETP, Fund
  -- Unterkategorisierung
  unterkategorie_typ TEXT, -- Hebel oder Normal
  rohstoff_typ TEXT, -- Rohstoff oder kein_Rohstoff
  rohstoff_art TEXT, -- Gold, Silber, Platin, Kupfer, Öl, Gas, etc. (nur wenn rohstoff_typ = 'Rohstoff')
  direction TEXT, -- Long oder Short (nur bei Hebeln)
  hebel_hoehe TEXT, -- 2x, 3x, 5x, 10x, 20x, Andere (nur bei Hebeln)
  -- Legacy-Felder (für Rückwärtskompatibilität)
  sub_category TEXT, -- Alte Format: Rohstoff_Gold, Normal, etc.
  status TEXT NOT NULL,
  notes TEXT,
  original_row_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index für schnelle Suche nach ISIN
CREATE INDEX IF NOT EXISTS idx_categorized_assets_isin ON categorized_assets(isin);

-- Index für schnelle Suche nach Kategorie
CREATE INDEX IF NOT EXISTS idx_categorized_assets_category ON categorized_assets(category);

-- Index für schnelle Suche nach Sub-Kategorie
CREATE INDEX IF NOT EXISTS idx_categorized_assets_sub_category ON categorized_assets(sub_category);

-- Migration: Füge neue Spalten hinzu, falls die Tabelle bereits existiert (ohne diese Spalten)
DO $$ 
BEGIN
  -- Prüfe ob die Tabelle existiert
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'categorized_assets') THEN
    -- Füge neue Spalten hinzu, falls sie noch nicht existieren
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categorized_assets' AND column_name = 'unterkategorie_typ') THEN
      ALTER TABLE categorized_assets ADD COLUMN unterkategorie_typ TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categorized_assets' AND column_name = 'rohstoff_typ') THEN
      ALTER TABLE categorized_assets ADD COLUMN rohstoff_typ TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categorized_assets' AND column_name = 'rohstoff_art') THEN
      ALTER TABLE categorized_assets ADD COLUMN rohstoff_art TEXT;
    END IF;
  END IF;
END $$;

-- Index für schnelle Suche nach Unterkategorie-Typ
CREATE INDEX IF NOT EXISTS idx_categorized_assets_unterkategorie_typ ON categorized_assets(unterkategorie_typ);

-- Index für schnelle Suche nach Rohstoff-Typ
CREATE INDEX IF NOT EXISTS idx_categorized_assets_rohstoff_typ ON categorized_assets(rohstoff_typ);

-- Index für schnelle Suche nach Rohstoff-Art
CREATE INDEX IF NOT EXISTS idx_categorized_assets_rohstoff_art ON categorized_assets(rohstoff_art);

-- Index für schnelle Suche nach Direction
CREATE INDEX IF NOT EXISTS idx_categorized_assets_direction ON categorized_assets(direction);

-- Index für schnelle Suche nach Hebelhöhe
CREATE INDEX IF NOT EXISTS idx_categorized_assets_hebel_hoehe ON categorized_assets(hebel_hoehe);

-- Trigger für automatische updated_at Aktualisierung
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Erstelle Trigger nur wenn er noch nicht existiert
DROP TRIGGER IF EXISTS update_categorized_assets_updated_at ON categorized_assets;
CREATE TRIGGER update_categorized_assets_updated_at
  BEFORE UPDATE ON categorized_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Kommentare für Dokumentation
COMMENT ON TABLE categorized_assets IS 'Speichert kategorisierte Assets nach API-Prüfung';
COMMENT ON COLUMN categorized_assets.isin IS 'International Securities Identification Number (eindeutig)';
COMMENT ON COLUMN categorized_assets.category IS 'Hauptkategorie: Aktie, ETP, Fund';
COMMENT ON COLUMN categorized_assets.unterkategorie_typ IS 'Unterkategorie-Typ: Hebel oder Normal';
COMMENT ON COLUMN categorized_assets.rohstoff_typ IS 'Rohstoff-Typ: Rohstoff oder kein_Rohstoff';
COMMENT ON COLUMN categorized_assets.rohstoff_art IS 'Rohstoff-Art: Gold, Silber, Platin, Kupfer, Öl, Gas, etc. (nur wenn rohstoff_typ = Rohstoff)';
COMMENT ON COLUMN categorized_assets.direction IS 'Richtung: long oder short (nur bei Hebeln)';
COMMENT ON COLUMN categorized_assets.hebel_hoehe IS 'Hebelhöhe: 2x, 3x, 5x, 10x, 20x, Andere (nur bei Hebeln)';
COMMENT ON COLUMN categorized_assets.sub_category IS 'Legacy-Feld: Alte Formatierung (Rohstoff_Gold, Normal, etc.)';
COMMENT ON COLUMN categorized_assets.original_row_data IS 'Alle ursprünglichen Spalten aus der Excel-Datei als JSON';

-- RLS (Row Level Security) Policies
-- Erlaube Lese- und Schreibzugriff für alle (für Server-seitige Operationen)
-- In Produktion sollten hier spezifischere Policies gesetzt werden

ALTER TABLE categorized_assets ENABLE ROW LEVEL SECURITY;

-- Policy für SELECT (Lesen)
CREATE POLICY "Allow public read access" ON categorized_assets
  FOR SELECT
  USING (true);

-- Policy für INSERT (Einfügen)
CREATE POLICY "Allow public insert access" ON categorized_assets
  FOR INSERT
  WITH CHECK (true);

-- Policy für UPDATE (Aktualisieren)
CREATE POLICY "Allow public update access" ON categorized_assets
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policy für DELETE (Löschen) - optional, falls benötigt
-- CREATE POLICY "Allow public delete access" ON categorized_assets
--   FOR DELETE
--   USING (true);
