import pg from "pg";
import dotenv from "dotenv";

dotenv.config(); // ✅ .env підхопиться ДО створення Pool

const { Pool } = pg;

// Підтримка різних назв змінних (щоб не ламалось)
const DB_HOST = process.env.DB_HOST || process.env.PGHOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || process.env.PGPORT || 5432);
const DB_NAME = process.env.DB_NAME || process.env.PGDATABASE || "postgres";
const DB_USER = process.env.DB_USER || process.env.PGUSER || "postgres";

// ✅ ГОЛОВНЕ: password має бути string (інакше pg падає як у тебе)
const DB_PASSWORD_RAW =
  process.env.DB_PASSWORD ||
  process.env.PGPASSWORD ||
  process.env.DB_PASS ||
  process.env.POSTGRES_PASSWORD;

const DB_PASSWORD = String(DB_PASSWORD_RAW ?? "");

// Якщо ти використовуєш connection string (не обов'язково)
const CONNECTION_STRING = process.env.DATABASE_URL || process.env.DB_URL || "";

// Лог без пароля (щоб ти бачив, що реально підхопилось)
console.log("🗄️ DB config:", {
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  passwordIsSet: DB_PASSWORD.length > 0,
  usingConnectionString: Boolean(CONNECTION_STRING),
});

const pool = CONNECTION_STRING
  ? new Pool({ connectionString: CONNECTION_STRING })
  : new Pool({
      host: DB_HOST,
      port: DB_PORT,
      database: DB_NAME,
      user: DB_USER,
      password: DB_PASSWORD,
    });

export default {
  query: (text, params) => pool.query(text, params),
  pool,
};
