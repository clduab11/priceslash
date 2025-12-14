# Admin Dashboard

This repo currently exposes admin operations via API endpoints.

## Maintenance Endpoint

- `GET /api/admin/maintenance`: database health + table stats
- `POST /api/admin/maintenance`: run cleanup tasks (price history, job runs, audit logs, API usage)

Protect these endpoints by setting `ADMIN_SECRET` (Bearer token).

## Next Steps (UI)

If you want a UI admin panel, a natural extension is:
- Create `src/app/admin/page.tsx`
- Call the maintenance endpoints from the UI
- Add role checks using Clerk (org/roles) before allowing access

