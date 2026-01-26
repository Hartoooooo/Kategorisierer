#!/usr/bin/env python3
"""
Python Script für Finnhub Company Profile 2 API
Wird von der Next.js API-Route aufgerufen
"""
import sys
import json
import os
import finnhub

def get_company_profile(isin=None, symbol=None, cusip=None):
    """Ruft Company Profile 2 von Finnhub ab"""
    try:
        # API Key aus Umgebungsvariable holen
        api_key = os.getenv("FINNHUB_SECRET")
        if not api_key:
            return {
                "error": "FINNHUB_SECRET ist nicht gesetzt",
                "success": False
            }

        # Finnhub Client initialisieren
        finnhub_client = finnhub.Client(api_key=api_key)

        # Parameter für API-Call vorbereiten
        params = {}
        if isin:
            params["isin"] = isin
        elif symbol:
            params["symbol"] = symbol
        elif cusip:
            params["cusip"] = cusip
        else:
            return {
                "error": "Kein Parameter (isin, symbol oder cusip) angegeben",
                "success": False
            }

        # Company Profile 2 abrufen
        result = finnhub_client.company_profile2(**params)
        
        return {
            "success": True,
            "data": result
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    # Parameter von stdin lesen (JSON)
    try:
        input_data = json.loads(sys.stdin.read())
        isin = input_data.get("isin")
        symbol = input_data.get("symbol")
        cusip = input_data.get("cusip")

        # API aufrufen
        result = get_company_profile(isin=isin, symbol=symbol, cusip=cusip)
        
        # Ergebnis als JSON ausgeben
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        error_result = {
            "success": False,
            "error": f"Fehler beim Verarbeiten der Eingabe: {str(e)}"
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)
