/**
 * Purge soft-deleted employees + all related data.
 *
 * LOCAL / TEST DBs ONLY. Irreversible.
 *
 * Usage:
 *   node scripts/purge-soft-deleted-employees.js                # preview (dry-run)
 *   node scripts/purge-soft-deleted-employees.js --execute      # actually delete
 *   node scripts/purge-soft-deleted-employees.js --db=<dbname>  # override DB
 */

require('dotenv').config();
const { Client } = require('pg');

const DRY_RUN = !process.argv.includes('--execute');
const dbArg = process.argv.find((a) => a.startsWith('--db='));
const DB_NAME = dbArg ? dbArg.split('=')[1] : process.env.DATABASE_NAME;

const CFG = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT) || 5432,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: DB_NAME,
};

// Ordered child-to-parent. Each entry: [label, SQL using :ids placeholder].
const STEPS = [
  ['attendance_breaks',
    `DELETE FROM attendance_breaks WHERE attendance_record_id IN (SELECT _id FROM attendance_records WHERE user_id = ANY($1))`],
  ['attendance_records',         `DELETE FROM attendance_records WHERE user_id = ANY($1)`],
  ['leave_requests',             `DELETE FROM leave_requests WHERE user_id = ANY($1)`],
  ['leave_entitlements',         `DELETE FROM leave_entitlements WHERE user_id = ANY($1)`],
  ['shift_assignments',          `DELETE FROM shift_assignments WHERE user_id = ANY($1)`],
  ['shift_swap_requests',        `DELETE FROM shift_swap_requests WHERE requester_user_id = ANY($1) OR target_user_id = ANY($1)`],
  ['contract_field_values',
    `DELETE FROM contract_field_values WHERE employee_contract_id IN (SELECT _id FROM employee_contracts WHERE user_id = ANY($1))`],
  ['employee_contracts',         `DELETE FROM employee_contracts WHERE user_id = ANY($1)`],
  ['payslip_line_items',
    `DELETE FROM payslip_line_items WHERE payslip_id IN (SELECT _id FROM payslips WHERE user_id = ANY($1))`],
  ['payslips',                   `DELETE FROM payslips WHERE user_id = ANY($1)`],
  ['documents',                  `DELETE FROM documents WHERE user_id = ANY($1)`],
  ['cards',                      `DELETE FROM cards WHERE user_id = ANY($1)`],
  ['rtw_checks',                 `DELETE FROM rtw_checks WHERE user_id = ANY($1)`],
  ['immigration_records',        `DELETE FROM immigration_records WHERE user_id = ANY($1)`],
  ['compliance_events',          `DELETE FROM compliance_events WHERE user_id = ANY($1)`],
  ['compliance_notification_log',`DELETE FROM compliance_notification_log WHERE user_id = ANY($1)`],
  ['compliance_audit_log',       `DELETE FROM compliance_audit_log WHERE user_id = ANY($1)`],
  ['question_answers',           `DELETE FROM question_answers WHERE user_id = ANY($1)`],
  ['message_logs',               `DELETE FROM message_logs WHERE recipient_user_id = ANY($1) OR triggered_by_user_id = ANY($1)`],
  ['employee_location_assignments', `DELETE FROM employee_location_assignments WHERE employee_id = ANY($1)`],
  ['users (soft-deleted rows)',  `DELETE FROM users WHERE _id = ANY($1)`],
];

async function run() {
  const client = new Client(CFG);
  await client.connect();
  console.log(`\nConnected to: ${CFG.database}@${CFG.host}:${CFG.port}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (no changes)' : 'EXECUTE (deleting)'}\n`);

  // 1. Find target user IDs (all soft-deleted users)
  const { rows } = await client.query(
    `SELECT _id AS id, email, first_name, last_name, "deletedAt"
     FROM users
     WHERE "deletedAt" IS NOT NULL OR deleted = true`
  );
  if (rows.length === 0) {
    console.log('No soft-deleted users found. Nothing to do.');
    await client.end();
    return;
  }

  console.log(`Found ${rows.length} soft-deleted user(s):`);
  rows.forEach((r) => {
    const when = r.deletedAt ? r.deletedAt.toISOString() : '(deleted=true, no deletedAt)';
    console.log(`  - ${r.id}  ${r.email}  (${when})`);
  });
  console.log('');

  const ids = rows.map((r) => r.id);

  if (DRY_RUN) {
    console.log('Dry-run summary — row counts that WOULD be deleted:');
    for (const [label, sql] of STEPS) {
      const selectSql = sql
        .replace(/^DELETE FROM /, 'SELECT COUNT(*)::int AS cnt FROM ')
        .replace(/^SELECT /, 'SELECT '); // noop; keep structure
      try {
        const r = await client.query(selectSql, [ids]);
        console.log(`  ${label.padEnd(36)} ${r.rows[0].cnt}`);
      } catch (e) {
        console.log(`  ${label.padEnd(36)} SKIP (${e.message.split('\n')[0]})`);
      }
    }
    console.log('\nRe-run with --execute to actually delete.\n');
    await client.end();
    return;
  }

  // 2. EXECUTE: wrap in a transaction with a savepoint per step so one
  //    missing table/column doesn't abort the whole transaction.
  await client.query('BEGIN');
  try {
    for (const [label, sql] of STEPS) {
      await client.query('SAVEPOINT step');
      try {
        const res = await client.query(sql, [ids]);
        await client.query('RELEASE SAVEPOINT step');
        console.log(`  ${label.padEnd(36)} deleted: ${res.rowCount}`);
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT step');
        if (/relation .* does not exist|column .* does not exist/i.test(e.message)) {
          console.log(`  ${label.padEnd(36)} SKIP (${e.message.split('\n')[0]})`);
        } else {
          throw e;
        }
      }
    }
    await client.query('COMMIT');
    console.log('\nDone. Transaction committed.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nTransaction rolled back due to error:\n', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
