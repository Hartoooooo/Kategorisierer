# Vercel Deployment - Umgebungsvariablen Setup

## Schritt-für-Schritt Anleitung

### 1. Projekt auf Vercel importieren
1. Gehe zu [vercel.com](https://vercel.com) und logge dich ein
2. Klicke auf "Add New..." → "Project"
3. Importiere das GitHub-Repository: `Hartoooooo/Kategorisierer`
4. Vercel erkennt automatisch Next.js und konfiguriert das Projekt

### 2. Umgebungsvariablen hinzufügen

Gehe zu **Project Settings** → **Environment Variables** und füge folgende Variablen hinzu:

#### 🔴 **ERFORDERLICH** (Muss gesetzt werden):

| Variable Name | Wert | Beschreibung |
|--------------|------|--------------|
| `FINNHUB_SECRET` | `d5qbt61r01qhn30enodgd5qbt61r01qhn30enoe0` | Dein Finnhub API-Key (aus `.env.local`) |
| `FINNHUB_SECRET_2` | *(optional)* | Zweiter API-Key für höhere Geschwindigkeit (Round-Robin) |
| `FINNHUB_SECRET_3` | *(optional)* | Dritter API-Key für höhere Geschwindigkeit (Round-Robin) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ywxqivbcjwgxriuojvfi.supabase.co` | Deine Supabase Projekt-URL (aus `.env.local`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_iJ5VWPdVAvfS3Z7UR0KG9Q_F76nztUw` | Dein Supabase Anon/Public Key (aus `.env.local`) |

#### 🟡 **OPTIONAL** (Haben Standardwerte, können angepasst werden):

| Variable Name | Standardwert | Beschreibung |
|--------------|--------------|--------------|
| `FINNHUB_BASE_URL` | `https://finnhub.io/api/v1` | Finnhub API Base URL (normalerweise nicht ändern) |
| `FINNHUB_CONCURRENCY_LIMIT` | `17` | Parallele Requests pro Key (skaliert mit Anzahl der Keys) |
| `APP_MAX_UPLOAD_MB` | `10` | Maximale Upload-Größe in MB |

### 3. Wichtige Einstellungen bei Vercel

#### Environment für jede Variable:
- ✅ **Production** (für Live-Deployment)
- ✅ **Preview** (für Pull-Request Previews)
- ✅ **Development** (optional, für lokale Entwicklung)

**Tipp:** Setze alle Variablen für alle drei Environments, damit alles funktioniert.

### 4. Nach dem Hinzufügen der Variablen

1. **Redeploy auslösen**: Gehe zu "Deployments" → Wähle den letzten Deployment → "Redeploy"
   - Oder pushe einen neuen Commit zu GitHub (Vercel deployed automatisch)

2. **Prüfen ob alles funktioniert**:
   - Öffne die Vercel-URL deines Projekts
   - Teste die ISIN-Kategorisierung
   - Prüfe ob Supabase-Verbindung funktioniert

### 5. Sicherheitshinweise

⚠️ **WICHTIG:**
- Die `FINNHUB_SECRET` Variable ist **NICHT** öffentlich sichtbar (läuft nur serverseitig)
- Die `NEXT_PUBLIC_*` Variablen sind im Frontend sichtbar (das ist bei Supabase so gewollt)
- **NIEMALS** den `FINNHUB_SECRET` im Frontend-Code verwenden (wird bereits korrekt gehandhabt)

### 6. Troubleshooting

**Problem:** "FINNHUB_SECRET ist nicht gesetzt"
- Lösung: Prüfe ob die Variable in Vercel gesetzt ist und für "Production" aktiviert ist
- Redeploy nach dem Hinzufügen der Variable

**Problem:** Supabase-Verbindung funktioniert nicht
- Lösung: Prüfe ob `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` korrekt sind
- Prüfe Supabase Dashboard → Settings → API → ob die Keys stimmen

**Problem:** Upload-Limit zu niedrig
- Lösung: Erhöhe `APP_MAX_UPLOAD_MB` in Vercel (z.B. auf `20`)

---

## Quick Copy-Paste Liste für Vercel:

```
FINNHUB_SECRET=d5qbt61r01qhn30enodgd5qbt61r01qhn30enoe0
NEXT_PUBLIC_SUPABASE_URL=https://ywxqivbcjwgxriuojvfi.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_iJ5VWPdVAvfS3Z7UR0KG9Q_F76nztUw
FINNHUB_BASE_URL=https://finnhub.io/api/v1
APP_MAX_UPLOAD_MB=10
```

**Hinweis:** Kopiere diese Werte einzeln in Vercel, nicht als Block!
