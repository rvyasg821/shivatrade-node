-- ============================================================================
-- PURGE soft-deleted employees and ALL their related data.
--
-- LOCAL / TEST DATABASES ONLY. Irreversible.
--
-- Scope: every user whose role = Employee AND deleted_at IS NOT NULL
--        (i.e. already soft-deleted via the admin controller).
-- Other soft-deleted users (Admin, Company Admin, etc.) are NOT touched.
-- ============================================================================

BEGIN;

-- Collect target employee IDs into a temp table for reuse.
-- Assumes the 'users' table uses `deleted_at` for soft delete (TypeORM default).
-- Adjust the role filter if your schema stores role differently.
DROP TABLE IF EXISTS _purge_employee_ids;
CREATE TEMP TABLE _purge_employee_ids AS
SELECT u.id
FROM   users u
LEFT   JOIN roles r ON r.id = u.role_id
WHERE  u.deleted_at IS NOT NULL
AND    (r.name ILIKE 'employee' OR u.role ILIKE 'employee');

-- Sanity check. Uncomment to preview before deleting.
-- SELECT COUNT(*) AS "to_purge" FROM _purge_employee_ids;
-- SELECT u.id, u.email, u.first_name, u.last_name, u.deleted_at
-- FROM users u JOIN _purge_employee_ids p ON p.id = u.id;

-- --------------------------------------------------------------------------
-- Child tables keyed by user_id (employee) -- delete first, in leaf-to-root order.
-- --------------------------------------------------------------------------

DELETE FROM attendance_breaks
WHERE  attendance_record_id IN (
  SELECT id FROM attendance_records WHERE user_id IN (SELECT id FROM _purge_employee_ids)
);

DELETE FROM attendance_records       WHERE user_id IN (SELECT id FROM _purge_employee_ids);

DELETE FROM leave_requests           WHERE user_id IN (SELECT id FROM _purge_employee_ids);
DELETE FROM leave_entitlements       WHERE user_id IN (SELECT id FROM _purge_employee_ids);

DELETE FROM shift_assignments        WHERE user_id IN (SELECT id FROM _purge_employee_ids);
DELETE FROM shift_swap_requests      WHERE requester_user_id IN (SELECT id FROM _purge_employee_ids)
                                        OR target_user_id    IN (SELECT id FROM _purge_employee_ids);

-- Employee-contracts: drop child field values first, then the contract itself.
DELETE FROM contract_field_values
WHERE  employee_contract_id IN (
  SELECT id FROM employee_contracts WHERE user_id IN (SELECT id FROM _purge_employee_ids)
);
DELETE FROM employee_contracts       WHERE user_id IN (SELECT id FROM _purge_employee_ids);

-- Payslips: drop line items first.
DELETE FROM payslip_line_items
WHERE  payslip_id IN (
  SELECT id FROM payslips WHERE user_id IN (SELECT id FROM _purge_employee_ids)
);
DELETE FROM payslips                 WHERE user_id IN (SELECT id FROM _purge_employee_ids);

DELETE FROM documents                WHERE user_id IN (SELECT id FROM _purge_employee_ids);
DELETE FROM cards                    WHERE user_id IN (SELECT id FROM _purge_employee_ids);

-- Compliance module
DELETE FROM rtw_checks                     WHERE user_id IN (SELECT id FROM _purge_employee_ids);
DELETE FROM immigration_records            WHERE user_id IN (SELECT id FROM _purge_employee_ids);
DELETE FROM compliance_events              WHERE user_id IN (SELECT id FROM _purge_employee_ids);
DELETE FROM compliance_notification_log    WHERE user_id IN (SELECT id FROM _purge_employee_ids);
DELETE FROM compliance_audit_log           WHERE user_id IN (SELECT id FROM _purge_employee_ids);

-- Assessment answers (if any).
DELETE FROM question_answers         WHERE user_id IN (SELECT id FROM _purge_employee_ids);

-- Messaging history referencing the employee (as recipient OR trigger).
DELETE FROM message_logs
WHERE  recipient_user_id    IN (SELECT id FROM _purge_employee_ids)
   OR  triggered_by_user_id IN (SELECT id FROM _purge_employee_ids);

-- Location assignments for the employee.
DELETE FROM employee_location_assignments WHERE employee_id IN (SELECT id FROM _purge_employee_ids);

-- --------------------------------------------------------------------------
-- Finally, the user rows themselves.
-- --------------------------------------------------------------------------
DELETE FROM users WHERE id IN (SELECT id FROM _purge_employee_ids);

-- Report summary
SELECT COUNT(*) AS "remaining_users_to_purge (should be 0)"
FROM   users u
WHERE  u.deleted_at IS NOT NULL
AND    u.id IN (SELECT id FROM _purge_employee_ids);

DROP TABLE _purge_employee_ids;

COMMIT;
