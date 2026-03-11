import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

// __dirname replacement for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const rootDir = path.join(__dirname, "..");
const dataFile = path.join(rootDir, "data", "cities15000.txt");
const dbDir = path.join(rootDir, "db");
const dbFile = path.join(dbDir, "cities.db");

// Ensure ./db directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

// Validate input file
if (!fs.existsSync(dataFile)) {
  console.error("❌ cities15000.txt not found at:", dataFile);
  process.exit(1);
}

// Open database
const db = new Database(dbFile);

// Read GeoNames data
const citiesTxt = fs.readFileSync(dataFile, "utf-8");

// Recreate table + indexes
db.exec(`
  DROP TABLE IF EXISTS cities;

  CREATE TABLE cities (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL
  );

  CREATE INDEX idx_cities_name ON cities(name);
  CREATE INDEX idx_cities_country ON cities(country);
  CREATE INDEX idx_cities_name_country ON cities(name, country);
`);

// Prepare insert
const insert = db.prepare(`
  INSERT INTO cities (id, name, country, lat, lon)
  VALUES (?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((rows) => {
  for (const row of rows) insert.run(row);
});

// Parse and insert data
const rows = [];
const lines = citiesTxt.split("\n");

for (const line of lines) {
  if (!line.trim()) continue;

  const parts = line.split("\t");

  // GeoNames columns used:
  // 0 = geonameid
  // 1 = name
  // 4 = latitude
  // 5 = longitude
  // 8 = country code
  const id = Number(parts[0]);
  const name = parts[1];
  const lat = Number(parts[4]);
  const lon = Number(parts[5]);
  const country = parts[8];

  if (
    Number.isInteger(id) &&
    typeof name === "string" &&
    name.length > 0 &&
    typeof country === "string" &&
    country.length > 0 &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lon)
  ) {
    rows.push([id, name, country.toUpperCase(), lat, lon]);
  }
}

insertMany(rows);

console.log("✅ cities.db built successfully");
console.log(`📍 Cities inserted: ${rows.length}`);
console.log(`📂 Database location: ${dbFile}`);
