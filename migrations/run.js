// Applies schema.js explicitly via `npm run migrate`. Previously these
// CREATE TABLE statements ran as a side effect of importing db.js — meaning
// every process that touched the DB module re-ran DDL on every boot.
import { pool, query } from '../db/pool.js';
import { statements } from './schema.js';

async function main() {
  for (const sql of statements) {
    try {
      await query(sql);
      console.log('Applied:', sql.trim().split('\n')[0]);
    } catch (err) {
      // 1060 = duplicate column, 1061 = duplicate key name. Plain MySQL has
      // no IF NOT EXISTS form for ADD COLUMN or ADD CONSTRAINT ... UNIQUE,
      // so this tolerance is what actually makes the whole file re-runnable
      // — not just a defensive fallback.
      if (err.errno === 1060 || err.errno === 1061) {
        console.log('Skipped (already applied):', sql.trim().split('\n')[0]);
        continue;
      }
      throw err;
    }
  }
  await pool.end();
  console.log('Migrations complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
