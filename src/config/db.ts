import mysql from 'mysql2/promise';
import type { Pool, PoolOptions } from 'mysql2/promise';

try {
  process.loadEnvFile();
} catch {
  // .env is optional if environment variables are provided externally
}

const dbPort = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

export const dbConfig: PoolOptions = {
  host: process.env.DB_HOST || 'localhost',
  port: Number.isNaN(dbPort) ? 3306 : dbPort,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kanchan_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

export const pool: Pool = mysql.createPool(dbConfig);

/**
 * Safely tests the MySQL connection pool by attempting to acquire a connection
 * and execute a ping query.
 * 
 * Does not throw unhandled exceptions or crash the application if the database
 * is unreachable, unconfigured, or credentials are invalid.
 * 
 * @returns {Promise<boolean>} true if the connection was successful, false otherwise.
 */
export async function testDbConnection(): Promise<boolean> {
  // If database credentials/host are not configured in environment, skip gracefully
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
    console.warn('[Database] Database configuration is incomplete. Set DB_HOST, DB_USER, and DB_NAME in environment.');
    return false;
  }

  try {
    const connection = await pool.getConnection();
    try {
      await connection.query('SELECT 1');
      console.log('[Database] MySQL connection established successfully.');
      return true;
    } finally {
      connection.release();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Database] Connection test failed: ${message}`);
    return false;
  }
}

/**
 * Gracefully closes all connections in the database pool.
 */
export async function closeDbPool(): Promise<void> {
  try {
    await pool.end();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Database] Error closing pool: ${message}`);
  }
}

export default pool;

