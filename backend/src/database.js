const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required for APPA PostgreSQL."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  // Keep the per-instance pool deliberately small in
  // serverless environments. Multiple Vercel instances can
  // exist concurrently and share the upstream database limit.
  max: Number(
    process.env.DATABASE_POOL_MAX || 2
  ),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", error => {
  console.error(
    "Unexpected PostgreSQL pool error:",
    error.message
  );
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function one(text, params = []) {
  const result = await pool.query(
    text,
    params
  );

  return result.rows[0] || null;
}

async function many(text, params = []) {
  const result = await pool.query(
    text,
    params
  );

  return result.rows;
}

async function execute(text, params = []) {
  const result = await pool.query(
    text,
    params
  );

  return {
    rowCount: result.rowCount,
    rows: result.rows,
  };
}

async function transaction(callback) {
  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");

    const tx = {
      query: (
        text,
        params = []
      ) => client.query(
        text,
        params
      ),

      one: async (
        text,
        params = []
      ) => {
        const result =
          await client.query(
            text,
            params
          );

        return result.rows[0] || null;
      },

      many: async (
        text,
        params = []
      ) => {
        const result =
          await client.query(
            text,
            params
          );

        return result.rows;
      },

      execute: async (
        text,
        params = []
      ) => {
        const result =
          await client.query(
            text,
            params
          );

        return {
          rowCount: result.rowCount,
          rows: result.rows,
        };
      },
    };

    const result =
      await callback(tx);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    try {
      await client.query(
        "ROLLBACK"
      );
    } catch (rollbackError) {
      console.error(
        "PostgreSQL rollback failed:",
        rollbackError.message
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

async function healthCheck() {
  const result = await pool.query(`
    SELECT
      current_database() AS database,
      current_timestamp AS server_time
  `);

  return result.rows[0];
}

async function close() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  one,
  many,
  execute,
  transaction,
  healthCheck,
  close,
};
