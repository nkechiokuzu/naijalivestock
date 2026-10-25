import fs from "node:fs";
import path from "node:path";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(import.meta.dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed the marketplace.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const profiles = [
  ["sample-seller-north", "Northern demo farm", "+2340000000001", "Sokoto", "Sokoto"],
  ["sample-seller-west", "Western demo farm", "+2340000000002", "Oyo", "Ibadan"],
  ["sample-seller-central", "Central demo farm", "+2340000000003", "Ogun", "Abeokuta"],
];
const listings = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    sellerId: profiles[0][0],
    category: "cattle",
    breed: "Bunaji yearling bull",
    ageMonths: 18,
    weightKg: 245,
    healthStatus: "vaccinated",
    priceNaira: 1250000,
    quantity: 2,
    state: "Sokoto",
    city: "Sokoto",
    fulfillment: "both",
    photos: ["/images/cattle.jpg"],
    featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    sellerId: profiles[1][0],
    category: "goats",
    breed: "Red Sokoto breeding buck",
    ageMonths: 14,
    weightKg: 42,
    healthStatus: "healthy",
    priceNaira: 180000,
    quantity: 4,
    state: "Oyo",
    city: "Ibadan",
    fulfillment: "pickup",
    photos: ["/images/goats.jpg"],
    featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    sellerId: profiles[2][0],
    category: "poultry",
    breed: "Noiler point-of-lay hens",
    ageMonths: 5,
    weightKg: 2.3,
    healthStatus: "vaccinated",
    priceNaira: 18500,
    quantity: 30,
    state: "Ogun",
    city: "Abeokuta",
    fulfillment: "both",
    photos: ["/images/poultry.jpg"],
    featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    sellerId: profiles[0][0],
    category: "sheep",
    breed: "Yankasa ram",
    ageMonths: 16,
    weightKg: 48,
    healthStatus: "healthy",
    priceNaira: 210000,
    quantity: 3,
    state: "Sokoto",
    city: "Sokoto",
    fulfillment: "pickup",
    photos: ["/images/sheep.jpg"],
    featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    sellerId: profiles[1][0],
    category: "fish",
    breed: "Table-size catfish",
    ageMonths: 8,
    weightKg: 1.2,
    healthStatus: "healthy",
    priceNaira: 4200,
    quantity: 200,
    state: "Oyo",
    city: "Ibadan",
    fulfillment: "both",
    photos: ["/images/fish.jpg"],
    featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    sellerId: profiles[2][0],
    category: "other",
    breed: "Rabbits, mixed grower group",
    ageMonths: 4,
    weightKg: 1.8,
    healthStatus: "healthy",
    priceNaira: 12000,
    quantity: 12,
    state: "Ogun",
    city: "Abeokuta",
    fulfillment: "pickup",
    photos: ["/images/other-livestock.jpg"],
    featured: false,
  },
];

const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const [userId, displayName, phone, state, city] of profiles) {
    await client.query(
      `INSERT INTO marketplace_profiles
        (user_id, role, display_name, phone, phone_verified, state, city, seller_verification)
       VALUES ($1, 'seller', $2, $3, false, $4, $5, 'pending')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, displayName, phone, state, city],
    );
  }
  for (const listing of listings) {
    await client.query(
      `INSERT INTO marketplace_listings
        (id, seller_id, category, breed, age_months, weight_kg, health_status,
         price_naira, quantity, state, city, fulfillment, photos, featured, is_sample, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, 'active')
       ON CONFLICT (id) DO UPDATE SET
         seller_id = EXCLUDED.seller_id,
         category = EXCLUDED.category,
         breed = EXCLUDED.breed,
         age_months = EXCLUDED.age_months,
         weight_kg = EXCLUDED.weight_kg,
         health_status = EXCLUDED.health_status,
         price_naira = EXCLUDED.price_naira,
         quantity = EXCLUDED.quantity,
         state = EXCLUDED.state,
         city = EXCLUDED.city,
         fulfillment = EXCLUDED.fulfillment,
         photos = EXCLUDED.photos,
         featured = EXCLUDED.featured,
         is_sample = true,
         status = 'active',
         updated_at = now()`,
      [
        listing.id,
        listing.sellerId,
        listing.category,
        listing.breed,
        listing.ageMonths,
        listing.weightKg,
        listing.healthStatus,
        listing.priceNaira,
        listing.quantity,
        listing.state,
        listing.city,
        listing.fulfillment,
        listing.photos,
        listing.featured,
      ],
    );
  }
  await client.query("COMMIT");
  console.info(`Seeded ${listings.length} clearly labeled sample listings.`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
