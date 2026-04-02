## Plan: Update project to v3.20.0

The v3.20.0 package uses custom `/api/admin` endpoints and `authClient`. Since this project runs on Lovable Cloud (Supabase), I'll copy over all the UI/page logic from v3.20.0 and adapt the data layer to use Supabase directly.

### Steps:

1. **Create `src/lib/authClient.ts`** — A Supabase-compatible shim that exports `getToken()` and `authClient` using the existing Supabase client, so all page imports work without changes.

2. **Sync all page files** from v3.20.0 — Copy over all pages that have UI/logic improvements. Pages that use `fetch(/api/admin/...)` will be adapted to use Supabase queries directly.

3. **Update `useDatabase.ts`** — Keep our current Supabase-based version (the v3.20.0 one uses external API calls which won't work here).

4. **Sync component files** — Update AdminSidebar, AdminLayout, and other components from v3.20.0.

5. **Sync hooks** — Update useBranding, useMissingFeatures from v3.20.0 (adapting any API calls).

6. **Fix runtime errors** — The current "json parse" error is from dead `/api/admin` endpoints returning HTML instead of JSON.

### Files to update (~30 files):
- All pages in `src/pages/`
- `src/components/AdminSidebar.tsx`, `AdminLayout.tsx`
- `src/hooks/useBranding.ts`, `useMissingFeatures.ts`
- New: `src/lib/authClient.ts` (Supabase shim)
