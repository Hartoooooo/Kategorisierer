export type Category = "Aktie" | "Rohstoff" | "ETP" | "Fund" | "Unbekannt/Fehler" | "Nicht geprüft";
export type SubCategory = 
  | "Gold" 
  | "Silber" 
  | "Platin" 
  | "Kupfer" 
  | "Öl" 
  | "Gas" 
  | "Blei" 
  | "Tin" 
  | "Andere" 
  | "Hebel" 
  | "Normal" 
  | "Rohstoff_Gold"
  | "Rohstoff_Silber"
  | "Rohstoff_Platin"
  | "Rohstoff_Kupfer"
  | "Rohstoff_Öl"
  | "Rohstoff_Gas"
  | "Rohstoff_Blei"
  | "Rohstoff_Tin"
  | "Rohstoff_Andere"
  | "Rohstoff_Hebel"
  | null;
export type Direction = "long" | "short" | null;
export type HebelHoehe = "2x" | "3x" | "5x" | "10x" | "20x" | "Andere" | null;
export type Status = "success" | "error" | "pending";

export interface ParsedRow {
  rowIndex: number;
  isin: string;
  name: string;
  wkn: string;
  validIsin: boolean;
  // Alle ursprünglichen Spalten aus der Excel-Datei
  originalRowData: Record<string, unknown>;
}

export interface CheckedRow extends ParsedRow {
  category: Category;
  subCategory: SubCategory;
  direction: Direction;
  hebelHoehe?: HebelHoehe;
  status: Status;
  notes?: string;
}

export interface JobData {
  parsedRows: ParsedRow[];
  checkedRows?: CheckedRow[];
  // Original-Header aus der Excel-Datei (für Export)
  originalHeaders?: string[];
  // ISINs, die noch über API geprüft werden müssen (nach Supabase-Prüfung)
  newIsinsToCheck?: Array<{ isin: string; name: string; rowIndices: number[]; originalRowData?: Record<string, unknown> }>;
}

export interface CheckSummary {
  [categoryKey: string]: number;
}

export interface UploadResponse {
  jobId: string;
  rows: ParsedRow[];
  headers: string[];
  errors: string[];
}

export interface CheckResponse {
  summary: CheckSummary;
  rows: CheckedRow[];
  errors: string[];
}

export interface FinnhubProfile {
  ticker?: string;
  name?: string;
  type?: string;
  description?: string;
  exchange?: string;
  assetClass?: string;
  [key: string]: unknown;
}
