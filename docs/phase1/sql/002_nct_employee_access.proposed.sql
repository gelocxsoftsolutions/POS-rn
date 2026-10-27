-- PROPOSED ONLY; NOT APPLIED. Employees UI uses public.users (LegacyUser),
-- not the separate public.employees customer-feedback directory.
-- Existing users MUST be explicitly linked after human identity review.
-- Do not auto-link by name or copy credentials from the OMS login database.
BEGIN;
CREATE TABLE pos.employee_pos_access (
  pos_user_id text PRIMARY KEY REFERENCES pos.pos_users(id) ON DELETE CASCADE,
  employee_id integer NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT
);
COMMIT;
-- Example, for review only:
-- INSERT INTO pos.employee_pos_access(pos_user_id, employee_id)
-- VALUES ('<existing-pos-user-uuid>', <verified-employee-id>);
