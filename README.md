# ISIN Kategorisierung

Eine Next.js Web-Anwendung zur Kategorisierung von ISINs über die Finnhub API.

## Features

- **Excel-Upload**: Drag & Drop Upload von Excel-Dateien (.xlsx, .xls)
- **ISIN-Extraktion**: Automatische Extraktion von ISIN, Name und WKN aus Excel-Dateien
- **ISIN-Validierung**: Validierung der ISIN-Formate vor der Verarbeitung
- **Finnhub-Integration**: Serverseitige Kategorisierung über Finnhub API
- **Kategorisierung**:
  - Aktien vs. Rohstoffe
  - Rohstoff-Unterkategorien: Gold, Silber, Platin, Andere
  - Long/Short Erkennung
- **Excel-Export**: 
  - Gesamtdatei (ein Sheet)
  - Pro Kategorie (mehrere Sheets)

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Sprache**: TypeScript
- **Styling**: Tailwind CSS
- **Excel**: xlsx
- **Validierung**: zod
- **Upload**: react-dropzone

## Setup

### 1. Abhängigkeiten installieren

```bash
npm install
```

### 2. Umgebungsvariablen konfigurieren

Kopiere `.env.example` zu `.env` und fülle die Werte aus:

```bash
cp .env.example .env
```

Bearbeite `.env` und setze deinen Finnhub Secret:

```
FINNHUB_BASE_URL=https://finnhub.io/api/v1
FINNHUB_SECRET=dein_finnhub_secret_hier
APP_MAX_UPLOAD_MB=10
```

**WICHTIG**: 
- Der `FINNHUB_SECRET` wird **NIE** im Frontend verwendet
- Der Secret wird **NIE** im Repository gespeichert
- Alle Finnhub-Requests laufen ausschließlich serverseitig

### 3. Entwicklungsserver starten

```bash
npm run dev
```

Die Anwendung läuft dann auf [http://localhost:3000](http://localhost:3000)

### 4. Produktions-Build

```bash
npm run build
npm start
```

## Verwendung

1. **Excel hochladen**: Ziehe eine Excel-Datei in die Dropzone oder klicke zum Auswählen
2. **Vorschau prüfen**: Die extrahierten ISINs, Namen und WKN werden angezeigt
3. **ISINs prüfen**: Klicke auf "ISINs prüfen" um die Kategorisierung zu starten
4. **Ergebnisse herunterladen**: 
   - "Gesamt (1 Sheet)" für eine Datei mit allen Daten
   - "Pro Kategorie (Sheets)" für eine Datei mit separaten Sheets pro Kategorie

## Excel-Format

Die Excel-Datei sollte folgende Spalten enthalten:
- **ISIN** (oder ähnliche Bezeichnungen wie "ISIN Code")
- **Name** (oder "Bezeichnung", "Titel", "Instrument Name")
- **WKN** (oder "Wertpapierkennnummer")

Die Spaltennamen werden flexibel erkannt (case-insensitive, Leerzeichen werden ignoriert).

## API Endpoints

### `POST /api/upload`
Lädt eine Excel-Datei hoch und extrahiert ISIN, Name, WKN.

**Request**: `multipart/form-data` mit `file` Field

**Response**:
```json
{
  "jobId": "string",
  "rows": [...],
  "errors": [...]
}
```

### `POST /api/check`
Prüft ISINs über Finnhub API und kategorisiert sie.

**Request**:
```json
{
  "jobId": "string",
  "rows": [...]
}
```

**Response**:
```json
{
  "summary": { "Aktie": 10, "Rohstoff_Gold": 5, ... },
  "rows": [...],
  "errors": [...]
}
```

### `GET /api/download`
Lädt die kategorisierten Daten als Excel herunter.

**Query Parameters**:
- `jobId`: Job-ID
- `mode`: `singleSheet` oder `sheetsByCategory`

### `POST /api/webhooks/finnhub` (Optional)
Webhook-Endpoint für Finnhub-Events. Gibt sofort 2xx zurück (ACK) und verarbeitet die Payload asynchron.

## Sicherheit

- ✅ Keine Secrets im Frontend-Code
- ✅ Keine Secrets im Repository
- ✅ Alle Finnhub-Requests laufen serverseitig
- ✅ Finnhub Secret wird ausschließlich aus Umgebungsvariablen geladen
- ✅ Header `X-Finnhub-Secret` wird nur serverseitig gesetzt

## Produktions-Hinweise

### Job Store

Die aktuelle Implementierung verwendet einen **In-Memory Store** (`lib/store/jobStore.ts`). 

**Für Produktion** sollte dies durch eine persistente Datenbank ersetzt werden:
- PostgreSQL
- MongoDB
- Redis
- etc.

### Secret Rotation

Der `FINNHUB_SECRET` sollte regelmäßig rotiert werden:
1. Neuen Secret in Finnhub generieren
2. `.env` aktualisieren
3. Anwendung neu starten
4. Alten Secret in Finnhub deaktivieren

### Rate Limiting & Performance

Die Anwendung implementiert mehrere Performance-Optimierungen:

**Aktuelle Optimierungen:**
- **ISIN-Caching**: Bereits geprüfte ISINs werden 24 Stunden gecacht (in-memory)
- **Concurrency-Limit**: 17 parallele Requests (konfigurierbar via `FINNHUB_CONCURRENCY_LIMIT`)
- **Retry-Logik**: Exponential Backoff bei Rate Limits oder Server-Fehlern
- **Timeout**: 7 Sekunden pro Request (optimiert von 10s)
- **Frühe Exit-Strategie**: Wenn Schritt 1 erfolgreich ist, werden keine weiteren API-Calls gemacht

**Konfiguration:**
```bash
# Concurrency-Limit anpassen (Standard: 17)
FINNHUB_CONCURRENCY_LIMIT=20
```

**Weitere Optimierungsmöglichkeiten für höhere Volumina:**
- Redis-basiertes Caching (statt in-memory)
- Queue-System (z.B. Bull, BullMQ) für sehr große Batches
- Rate Limiting auf API-Ebene mit Token-Bucket
- Batch-API-Endpoints nutzen (falls verfügbar)

## Lizenz

MIT
