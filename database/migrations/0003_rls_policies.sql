-- IssueFlow AI — 0003: Row Level Security
-- Authorization is enforced HERE, in the database, not only in the UI.
--   admin   : everything
--   manager : manage projects they are a member of (issues, members, imports, drafts)
--   member  : read projects they belong to, update status of issues assigned to them,
--             comment, upload evidence

-- Helper used by issue-scoped tables.
create or replace function public.can_view_issue(p_issue uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.is_project_member(project_id) from public.issues where id = p_issue), false)
$$;

create or replace function public.can_manage_issue(p_issue uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.can_manage_project(project_id) from public.issues where id = p_issue), false)
$$;

-- Creators are automatically members of the projects they create.
create or replace function public.projects_add_creator()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.project_members (project_id, user_id, added_by)
    values (new.id, new.created_by, new.created_by)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger projects_add_creator after insert on public.projects
  for each row execute function public.projects_add_creator();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.imports enable row level security;
alter table public.source_messages enable row level security;
alter table public.issues enable row level security;
alter table public.issue_source_messages enable row level security;
alter table public.comments enable row level security;
alter table public.attachments enable row level security;
alter table public.issue_drafts enable row level security;
alter table public.issue_activity enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.automation_logs enable row level security;
alter table public.audit_logs enable row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.current_app_role() in ('admin', 'manager')
    or exists (
      select 1
        from public.project_members mine
        join public.project_members theirs on theirs.project_id = mine.project_id
       where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
-- inserts: only via handle_new_user trigger; deletes: via auth admin API (cascade)

-- projects ------------------------------------------------------------------
create policy projects_select on public.projects for select to authenticated
  using (public.is_project_member(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());
create policy projects_update on public.projects for update to authenticated
  using (public.can_manage_project(id)) with check (public.can_manage_project(id));
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_admin());

-- project_members -----------------------------------------------------------
create policy project_members_select on public.project_members for select to authenticated
  using (public.is_project_member(project_id));
create policy project_members_insert on public.project_members for insert to authenticated
  with check (public.can_manage_project(project_id));
create policy project_members_delete on public.project_members for delete to authenticated
  using (public.can_manage_project(project_id));

-- imports -------------------------------------------------------------------
create policy imports_select on public.imports for select to authenticated
  using (public.is_project_member(project_id));
create policy imports_insert on public.imports for insert to authenticated
  with check (public.can_manage_project(project_id) and created_by = auth.uid());
create policy imports_update on public.imports for update to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
create policy imports_delete on public.imports for delete to authenticated
  using (public.can_manage_project(project_id));

-- source_messages (immutable originals) -------------------------------------
create policy source_messages_select on public.source_messages for select to authenticated
  using (public.is_project_member(project_id));
create policy source_messages_insert on public.source_messages for insert to authenticated
  with check (public.can_manage_project(project_id));
create policy source_messages_delete on public.source_messages for delete to authenticated
  using (public.can_manage_project(project_id));

-- issues --------------------------------------------------------------------
create policy issues_select on public.issues for select to authenticated
  using (public.is_project_member(project_id));
create policy issues_insert on public.issues for insert to authenticated
  with check (public.can_manage_project(project_id));
-- Members may update issues assigned to them; the a_issues_before_update trigger
-- restricts them to status changes only.
create policy issues_update on public.issues for update to authenticated
  using (public.can_manage_project(project_id)
         or (assignee_id = auth.uid() and public.is_project_member(project_id)))
  with check (public.can_manage_project(project_id)
         or (assignee_id = auth.uid() and public.is_project_member(project_id)));
create policy issues_delete on public.issues for delete to authenticated
  using (public.can_manage_project(project_id));

-- issue_source_messages -----------------------------------------------------
create policy ism_select on public.issue_source_messages for select to authenticated
  using (public.can_view_issue(issue_id));
create policy ism_insert on public.issue_source_messages for insert to authenticated
  with check (public.can_manage_issue(issue_id));
create policy ism_delete on public.issue_source_messages for delete to authenticated
  using (public.can_manage_issue(issue_id));

-- comments ------------------------------------------------------------------
create policy comments_select on public.comments for select to authenticated
  using (public.can_view_issue(issue_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_view_issue(issue_id));
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.can_manage_issue(issue_id));

-- attachments ---------------------------------------------------------------
create policy attachments_select on public.attachments for select to authenticated
  using (public.is_project_member(project_id));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.is_project_member(project_id)
    and (issue_id is null or public.can_view_issue(issue_id))
  );
create policy attachments_update on public.attachments for update to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
create policy attachments_delete on public.attachments for delete to authenticated
  using (uploaded_by = auth.uid() or public.can_manage_project(project_id));

-- issue_drafts (AI output; review is a manager task) --------------------------
create policy drafts_select on public.issue_drafts for select to authenticated
  using (public.can_manage_project(project_id));
create policy drafts_insert on public.issue_drafts for insert to authenticated
  with check (public.can_manage_project(project_id));
create policy drafts_update on public.issue_drafts for update to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
create policy drafts_delete on public.issue_drafts for delete to authenticated
  using (public.can_manage_project(project_id));

-- issue_activity (written by SECURITY DEFINER triggers only) ------------------
create policy activity_select on public.issue_activity for select to authenticated
  using (public.can_view_issue(issue_id));

-- automation ----------------------------------------------------------------
create policy automation_jobs_select on public.automation_jobs for select to authenticated
  using (true);
create policy automation_jobs_update on public.automation_jobs for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Logs can contain cross-project data, so they are admin-only. Inserts happen
-- server-side with the service role after an authorization check.
create policy automation_logs_select on public.automation_logs for select to authenticated
  using (public.is_admin());

-- audit_logs ----------------------------------------------------------------
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Function privileges: nothing is callable anonymously.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
