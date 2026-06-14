-- ============================================================================
-- add_league_score: PUBLIC/anon EXECUTE 완전 회수
-- (anon은 PUBLIC grant 상속으로 REVOKE anon만으로는 남을 수 있음)
-- ============================================================================

REVOKE ALL ON FUNCTION public.add_league_score(int, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_league_score(int, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_league_score(int, text) TO authenticated;
