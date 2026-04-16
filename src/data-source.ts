import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

// Load .env before anything else — this file runs outside NestJS
// so ConfigService is not available.
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // Never let the CLI mutate the schema — migrations do that.
  synchronize: false,

  // Glob patterns are resolved relative to the project root at runtime.
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
