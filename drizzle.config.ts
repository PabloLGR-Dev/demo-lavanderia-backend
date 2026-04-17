<<<<<<< HEAD
import { config } from 'dotenv';
import { defineConfig } from "drizzle-kit";

// Forzamos a que lea el archivo .env desde la raíz
config({ path: '.env' });

=======
import 'dotenv/config';
import { defineConfig } from "drizzle-kit";

>>>>>>> a2605236b8d969cf5ab6119465d4c37c5d6a9a54
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in .env file');
}

export default defineConfig({
<<<<<<< HEAD
  schema: "./src/db/schema.ts",
=======
  schema: "./src/db/schema",
>>>>>>> a2605236b8d969cf5ab6119465d4c37c5d6a9a54
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  }
});