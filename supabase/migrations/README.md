# Supabase migrations

## CLI vs manual SQL

Supabase CLI (`supabase db push`) only applies files matching `<timestamp>_name.sql`.

These files are **reference / manual SQL Editor** scripts (not tracked by CLI):

1. Run [`../schema.sql`](../schema.sql) first (marketplace base schema + RLS + storage).
2. Then run in order:
   - `fix_card_count.sql`
   - `ranking_system.sql` → `ranking_system_ux_fixes.sql` → `ranking_system_ties_and_likes.sql`
   - `dev_mode_config.sql` (+ `INSERT INTO admin_config`)
   - `official_templates.sql`
   - `profile_avatar_and_cloud_reset.sql`
   - `push_notifications.sql` → `push_notifications_overtake_fix.sql`
   - `bug_reports.sql`
   - `ranking_user_moderation.sql`
   - `ranking_opt_in.sql`
3. Timestamped migrations in this folder apply via **`supabase db push --linked`** (new changes only).

**Do not rely on filename sort** for legacy files. `20260614000001_security_hardening.sql` was designed to run **after** all manual scripts above.

## Timestamped migrations (CLI)

| File | Purpose |
|------|---------|
| `20260614000001_security_hardening.sql` | Pass 1 DB hardening |
| `20260614120000_fix_ranking_leaderboard_filters.sql` | ranking_hidden + ranking_opt_in on all leaderboard RPCs |
| `20260614140000_revoke_anon_add_league_score.sql` | Revoke anon from add_league_score |
| `20260614150000_revoke_public_add_league_score.sql` | Revoke PUBLIC from add_league_score |

## Commands

```bash
supabase migration list
supabase db push --linked
supabase db query --linked "SELECT 1"
```

Linked project: **Revibe Marketplace** (`lrpjuvmdshyrpknrpeel`).
