import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// ВАЖЛИВО: дефолт DB_NAME = plantdb (бо в тебе саме вона)
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 5432);
const DB_NAME = process.env.DB_NAME || "plantdb";
const DB_USER = process.env.DB_USER || "postgres";
const DB_PASSWORD = process.env.DB_PASSWORD ?? ""; // string

const CONNECTION_STRING = process.env.DATABASE_URL || "";

const config = CONNECTION_STRING
  ? { connectionString: CONNECTION_STRING }
  : {
      host: DB_HOST,
      port: DB_PORT,
      database: DB_NAME,
      user: DB_USER,
      password: String(DB_PASSWORD),
    };

console.log("🗄️ DB config:", {
  host: config.host || "(from connectionString)",
  port: config.port || "(from connectionString)",
  database: config.database || "(from connectionString)",
  user: config.user || "(from connectionString)",
  passwordIsSet: Boolean(DB_PASSWORD),
  usingConnectionString: Boolean(CONNECTION_STRING),
});

const pool = new Pool(config);

export default {
  query: (text, params) => pool.query(text, params),
  pool,
};
