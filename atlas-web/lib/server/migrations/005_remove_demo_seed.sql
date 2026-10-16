-- Earlier builds seeded synthetic "(demo merchant)" findings into every real
-- account, inflating Money Guard totals. Remove them and everything derived
-- from them (signal/notification dedup keys embed the finding id).

DELETE FROM notifications n
  USING money_findings f
  WHERE f.dedup_key LIKE 'seed:%'
    AND n.principal_id = f.principal_id
    AND n.dedup_key LIKE '%' || f.id || '%';

DELETE FROM signals s
  USING money_findings f
  WHERE f.dedup_key LIKE 'seed:%'
    AND s.principal_id = f.principal_id
    AND s.dedup_key LIKE '%' || f.id || '%';

DELETE FROM money_findings WHERE dedup_key LIKE 'seed:%';
