-- IssueFlow AI — 0005: built-in automation job definitions (configuration, not demo data)
-- Schedules are UTC cron expressions and must match vercel.json.

insert into public.automation_jobs (id, name, description, schedule, config) values
  ('daily-overdue-check',
   'Daily overdue check',
   'Finds open issues whose due date has passed and produces an overdue report grouped by project and assignee.',
   '0 7 * * *', '{}'),
  ('weekly-project-summary',
   'Weekly project summary',
   'Summarises open, in-progress, blocked and resolved issues for every active project.',
   '0 8 * * 1', '{}'),
  ('stale-issue-detection',
   'Stale issue detection',
   'Flags unresolved issues that have not been updated for a configurable number of days.',
   '30 7 * * *', '{"stale_days": 7}'),
  ('import-failure-monitor',
   'Import failure monitoring',
   'Records WhatsApp imports that failed in the look-back window so administrators can investigate.',
   '0 9 * * *', '{"lookback_hours": 24}')
on conflict (id) do nothing;
