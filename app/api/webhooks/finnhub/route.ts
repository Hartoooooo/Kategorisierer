import { NextRequest, NextResponse } from "next/server";

/**
 * Webhook-Endpoint für Finnhub-Events
 * 
 * WICHTIG: Gibt sofort 2xx zurück (ACK), bevor die Logik ausgeführt wird,
 * um Timeouts zu vermeiden. Die Payload-Verarbeitung erfolgt asynchron.
 */
export async function POST(request: NextRequest) {
  // Sofort 200 zurückgeben (ACK)
  const response = NextResponse.json({ received: true }, { status: 200 });

  // Asynchrone Verarbeitung (fire-and-forget)
  request
    .json()
    .then((payload) => {
      // Sanitized Logging (keine Secrets)
      console.log("[Finnhub Webhook] Event empfangen:", {
        timestamp: new Date().toISOString(),
        hasPayload: !!payload,
        payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
      });

      // Hier könnte weitere Verarbeitung erfolgen:
      // - In Queue einreihen
      // - In Datenbank persistieren
      // - Andere Services benachrichtigen
      // etc.
    })
    .catch((error) => {
      console.error("[Finnhub Webhook] Fehler bei Payload-Verarbeitung:", error);
    });

  return response;
}
