-- ============================================================================
-- add_league_score: anon EXECUTE 회수 (hardening §2 보완)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.add_league_score(int, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_league_score(int, text) TO authenticated;
