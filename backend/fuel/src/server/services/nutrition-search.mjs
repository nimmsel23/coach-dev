import http from "http";
import https from "https";
import { WGER_API_URL, WGER_API_TOKEN, OFF_API_URL, WGER_MIN_RESULTS } from "../../shared/config/constants.mjs";

async function searchWger(query, limit) {
  return new Promise((resolve) => {
    const url = `${WGER_API_URL}/ingredient/?format=json&limit=${limit}&name__search=${encodeURIComponent(query)}`;
    const req = http.get(url, { headers: { "Authorization": `Token ${WGER_API_TOKEN}` } }, (r) => {
      let raw = "";
      r.on("data", (c) => (raw += c));
      r.on("end", () => {
        try {
          const data = JSON.parse(raw);
          const results = (data.results || [])
            .filter((i) => i.name && i.energy != null)
            .map((i) => ({
              name: i.name.trim(),
              brand: i.brand || "",
              kcal: Math.round((i.energy ?? 0) * 10) / 10,
              kh: Math.round((parseFloat(i.carbohydrates) ?? 0) * 10) / 10,
              fett: Math.round((parseFloat(i.fat) ?? 0) * 10) / 10,
              ew: Math.round((parseFloat(i.protein) ?? 0) * 10) / 10,
              _src: "wger",
            }));
          resolve(results);
        } catch {
          resolve([]);
        }
      });
    });
    req.on("error", () => resolve([]));
    req.setTimeout(3000, () => { req.destroy(); resolve([]); });
  });
}

async function searchOFF(query, limit) {
  return new Promise((resolve) => {
    const url = `${OFF_API_URL}?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${limit}`;
    const req = https.get(url, { headers: { "User-Agent": "fuel-dev/2.0" } }, (r) => {
      let raw = "";
      r.on("data", (c) => (raw += c));
      r.on("end", () => {
        try {
          const data = JSON.parse(raw);
          const results = (data.products || [])
            .filter((p) => p.product_name && p.nutriments?.["energy-kcal_100g"] != null)
            .map((p) => ({
              name: p.product_name,
              brand: p.brands || "",
              kcal: Math.round((p.nutriments["energy-kcal_100g"] ?? 0) * 10) / 10,
              kh: Math.round((p.nutriments.carbohydrates_100g ?? 0) * 10) / 10,
              fett: Math.round((p.nutriments.fat_100g ?? 0) * 10) / 10,
              ew: Math.round((p.nutriments.proteins_100g ?? 0) * 10) / 10,
              _src: "off",
            }));
          resolve(results);
        } catch {
          resolve([]);
        }
      });
    });
    req.on("error", () => resolve([]));
    req.setTimeout(8000, () => { req.destroy(); resolve([]); });
  });
}

async function searchByBarcode(barcode) {
  return new Promise((resolve) => {
    const url = `${OFF_API_URL}/product/${encodeURIComponent(barcode)}.json`;
    const req = https.get(url, { headers: { "User-Agent": "fuel-dev/2.0" } }, (r) => {
      let raw = "";
      r.on("data", (c) => (raw += c));
      r.on("end", () => {
        try {
          const data = JSON.parse(raw);
          if (data.status === 1 && data.product) {
            const p = data.product;
            if (p.product_name && p.nutriments?.["energy-kcal_100g"] != null) {
              resolve([{
                name: p.product_name,
                brand: p.brands || "",
                kcal: Math.round((p.nutriments["energy-kcal_100g"] ?? 0) * 10) / 10,
                kh: Math.round((p.nutriments.carbohydrates_100g ?? 0) * 10) / 10,
                fett: Math.round((p.nutriments.fat_100g ?? 0) * 10) / 10,
                ew: Math.round((p.nutriments.proteins_100g ?? 0) * 10) / 10,
                barcode: p.code,
                _src: "off_barcode",
              }]);
            }
          }
          resolve([]);
        } catch {
          resolve([]);
        }
      });
    });
    req.on("error", () => resolve([]));
    req.setTimeout(8000, () => { req.destroy(); resolve([]); });
  });
}

export async function searchNutrition(query, limit = 20) {
  // Check if query looks like a barcode (13 or 12 digits)
  if (/^\d{12,13}$/.test(query)) {
    const barcodeResults = await searchByBarcode(query);
    if (barcodeResults.length > 0) return barcodeResults;
  }

  // Try wger first, fall back to OFF if not enough results
  const wgerResults = await searchWger(query, limit);
  if (wgerResults.length >= WGER_MIN_RESULTS) {
    return wgerResults;
  }
  const offResults = await searchOFF(query, limit);
  return offResults.length > 0 ? offResults : wgerResults;
}
