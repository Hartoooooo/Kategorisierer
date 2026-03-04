# Vercel Umgebungsvariablen - Key & Value Liste

## Für Vercel Project Settings → Environment Variables

### 🔴 ERFORDERLICH (Muss gesetzt werden):

| Key | Value |
|-----|-------|
| `FINNHUB_SECRET` | `d5qbt61r01qhn30enodgd5qbt61r01qhn30enoe0` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ywxqivbcjwgxriuojvfi.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_iJ5VWPdVAvfS3Z7UR0KG9Q_F76nztUw` |

### 🟡 OPTIONAL (Haben Standardwerte):

| Key | Value |
|-----|-------|
| `FINNHUB_SECRET_2` | *(zweiter API-Key für höhere Geschwindigkeit)* |
| `FINNHUB_SECRET_3` | *(dritter API-Key für höhere Geschwindigkeit)* |
| `FINNHUB_BASE_URL` | `https://finnhub.io/api/v1` |
| `FINNHUB_CONCURRENCY_LIMIT` | `17` |
| `APP_MAX_UPLOAD_MB` | `10` |

---

## Copy-Paste für Vercel:

### Erforderliche Variablen:

```
FINNHUB_SECRET=d5qbt61r01qhn30enodgd5qbt61r01qhn30enoe0
NEXT_PUBLIC_SUPABASE_URL=https://ywxqivbcjwgxriuojvfi.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_iJ5VWPdVAvfS3Z7UR0KG9Q_F76nztUw
```

### Optionale Variablen:

```
FINNHUB_SECRET_2=zweiter_finnhub_api_key_hier
FINNHUB_SECRET_3=dritter_finnhub_api_key_hier
FINNHUB_BASE_URL=https://finnhub.io/api/v1
FINNHUB_CONCURRENCY_LIMIT=17
APP_MAX_UPLOAD_MB=10
```

---

## Anleitung für Vercel:

1. Gehe zu deinem Projekt auf Vercel
2. Klicke auf **Settings** → **Environment Variables**
3. Füge jede Variable einzeln hinzu:
   - Klicke auf **Add New**
   - Trage den **Key** ein
   - Trage den **Value** ein
   - Wähle die Environments: ✅ Production, ✅ Preview, ✅ Development
   - Klicke auf **Save**
4. Nach dem Hinzufügen aller Variablen: **Redeploy** das Projekt

---

## Wichtig:

- Die `FINNHUB_SECRET` Variable ist **NICHT** öffentlich sichtbar (läuft nur serverseitig)
- Die `NEXT_PUBLIC_*` Variablen sind im Frontend sichtbar (das ist bei Supabase so gewollt)
- Setze alle Variablen für alle drei Environments (Production, Preview, Development)
