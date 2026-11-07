import fs from "node:fs/promises";

const endpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];
const query = `[out:json][timeout:180];
area["name"~"^(Crete|Κρήτη)$"]["boundary"="administrative"]->.crete;
(
  nwr["tourism"~"^(hotel|guest_house|hostel|motel|apartment|resort|chalet)$"](area.crete);
);
out center tags;`;

let response;
let lastError;
for (const endpoint of endpoints) {
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "TEMO-TRAVEL-hotel-import/1.0 (https://travel.temo1.gr)"
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(210000)
    });
    if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
    break;
  } catch (error) {
    lastError = error;
    response = null;
  }
}
if (!response) throw lastError || new Error("All Overpass endpoints failed");
const payload = await response.json();
const hotels = (payload.elements || []).map(item => {
  const t = item.tags || {};
  const center = item.center || item;
  const type = t.tourism || "";
  const website = t.website || t["contact:website"] || "";
  return {
    id: `${item.type}/${item.id}`,
    name: t.name || t["name:en"] || t["name:el"] || "",
    type,
    city: t["addr:city"] || t["addr:town"] || t["addr:village"] || t["addr:place"] || "",
    address: [t["addr:street"], t["addr:housenumber"], t["addr:postcode"]].filter(Boolean).join(" "),
    phone: t.phone || t["contact:phone"] || "",
    website: website && (/^https?:\/\//i.test(website) ? website : `https://${website}`),
    stars: t.stars || "",
    lat: center.lat ?? null,
    lon: center.lon ?? null
  };
}).filter(h => h.name).sort((a,b) => a.name.localeCompare(b.name, "el"));
const unique = [...new Map(hotels.map(h => [h.id,h])).values()];
await fs.mkdir("data", { recursive: true });
await fs.writeFile("data/hotels-crete.json", JSON.stringify({
  source: "© OpenStreetMap contributors",
  license: "ODbL",
  updated: new Date().toISOString(),
  osmTimestamp: payload.osm3s?.timestamp_osm_base || null,
  total: unique.length,
  hotels: unique
}, null, 2) + "\n");
console.log(`Saved ${unique.length} Crete accommodation records.`);