import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import * as schema from './schema.js';

const { Pool } = pkg;

// Verificamos que la variable de entorno exista (Buena práctica de seguridad)
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

// Creamos la conexión
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Exportamos la instancia de la base de datos con el esquema
export const db = drizzle(pool, { schema });