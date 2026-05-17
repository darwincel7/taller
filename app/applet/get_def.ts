import { Client } from 'pg';

async function run() {
  const connectionString = process.env.DATABASE_URL || "postgres://postgres.ruwcektpadeqovwtdixd:super_admin_pass!@aws-0-us-west-1.pooler.supabase.com:6543/postgres";
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    const res = await client.query(`
      SELECT prosrc 
      FROM pg_proc 
      WHERE proname = 'get_payments_unified';
    `);
    console.log(res.rows[0]?.prosrc);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
