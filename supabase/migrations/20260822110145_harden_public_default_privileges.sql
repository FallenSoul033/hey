-- Secure-by-default posture for future objects created in the public schema.
-- Existing grants are intentionally left unchanged to avoid breaking the current app.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
