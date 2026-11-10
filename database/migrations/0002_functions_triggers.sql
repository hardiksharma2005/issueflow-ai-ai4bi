-- IssueFlow AI — 0002: helper functions, business-rule triggers, activity + audit logging
-- All SECURITY DEFINER functions pin search_path = '' and fully qualify every object.

-- ---------------------------------------------------------------------------
-- Authorization helpers (used by RLS policies in 0003)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_project_member(p_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin()
      or exists (select 1 from public.project_members
                 where project_id = p_project and user_id = auth.uid())
$$;

-- Admins manage everything; managers manage the projects they belong to.
create or replace function public.can_manage_project(p_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin()
      or (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'manager')
        and exists (select 1 from public.project_members
                    where project_id = p_project and user_id = auth.uid())
      )
$$;

-- Safe text -> uuid cast for storage paths (returns null instead of raising).
create or replace function public.try_uuid(p text)
returns uuid
language plpgsql immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generic updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.imports
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.comments
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.issue_drafts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.automation_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles: created automatically on sign-up. The very first user becomes admin.
-- Roles are NEVER taken from user-supplied metadata.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.app_role := 'member';
begin
  if not exists (select 1 from public.profiles) then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
                  split_part(coalesce(new.email, ''), '@', 1)), 120),
    v_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.protect_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Profile id is immutable' using errcode = '42501';
  end if;

  if auth.uid() is not null then
    if new.role is distinct from old.role and not public.is_admin() then
      raise exception 'Only admins can change roles' using errcode = '42501';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Email is managed by authentication' using errcode = '42501';
    end if;
  end if;

  if old.role = 'admin' and new.role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'At least one admin is required' using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger protect_profile_update before update on public.profiles
  for each row execute function public.protect_profile_update();

-- ---------------------------------------------------------------------------
-- Issues: numbering, permissions, resolved_at
-- Triggers fire alphabetically, so prefixes control ordering.
-- ---------------------------------------------------------------------------
create or replace function public.issues_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.projects
     set issue_counter = issue_counter + 1
   where id = new.project_id
  returning issue_counter into new.number;

  if new.number is null then
    raise exception 'Project not found' using errcode = '23503';
  end if;

  new.created_by := coalesce(new.created_by, auth.uid());

  if new.assignee_id is not null and not exists (
       select 1 from public.project_members
        where project_id = new.project_id and user_id = new.assignee_id
     ) and not exists (
       select 1 from public.profiles where id = new.assignee_id and role = 'admin'
     ) then
    raise exception 'Assignee must be a member of the project' using errcode = '23514';
  end if;

  if new.status in ('resolved', 'closed') then
    new.resolved_at := coalesce(new.resolved_at, now());
  end if;
  return new;
end;
$$;

create trigger a_issues_before_insert before insert on public.issues
  for each row execute function public.issues_before_insert();

create or replace function public.issues_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Immutable columns, for everyone.
  if new.project_id <> old.project_id then
    raise exception 'Issues cannot be moved between projects' using errcode = '42501';
  end if;
  new.number := old.number;
  new.created_by := old.created_by;
  new.created_at := old.created_at;

  -- Members (non-managers) may only change the status of issues assigned to them.
  if auth.uid() is not null and not public.can_manage_project(old.project_id) then
    if (new.title, new.description, new.category, new.priority, new.assignee_id,
        new.due_date, new.reporter_id, new.reporter_name, new.source, new.import_id)
       is distinct from
       (old.title, old.description, old.category, old.priority, old.assignee_id,
        old.due_date, old.reporter_id, old.reporter_name, old.source, old.import_id) then
      raise exception 'Members can only change the status of issues assigned to them'
        using errcode = '42501';
    end if;
  end if;

  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null
     and not exists (select 1 from public.project_members
                      where project_id = new.project_id and user_id = new.assignee_id)
     and not exists (select 1 from public.profiles where id = new.assignee_id and role = 'admin') then
    raise exception 'Assignee must be a member of the project' using errcode = '23514';
  end if;

  if new.status in ('resolved', 'closed') then
    new.resolved_at := coalesce(old.resolved_at, now());
  else
    new.resolved_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger a_issues_before_update before update on public.issues
  for each row execute function public.issues_before_update();

-- ---------------------------------------------------------------------------
-- Issue activity history
-- ---------------------------------------------------------------------------
create or replace function public.profile_label(p_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(nullif(full_name, ''), email) from public.profiles where id = p_id
$$;

create or replace function public.issues_activity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_fields text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into public.issue_activity (issue_id, actor_id, action, to_value)
    values (new.id, coalesce(v_actor, new.created_by), 'created', new.source);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.issue_activity (issue_id, actor_id, action, from_value, to_value)
    values (new.id, v_actor, 'status_changed', old.status::text, new.status::text);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.issue_activity (issue_id, actor_id, action, from_value, to_value)
    values (new.id, v_actor, 'priority_changed', old.priority::text, new.priority::text);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.issue_activity (issue_id, actor_id, action, from_value, to_value)
    values (new.id, v_actor, 'assigned',
            public.profile_label(old.assignee_id), public.profile_label(new.assignee_id));
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.issue_activity (issue_id, actor_id, action, from_value, to_value)
    values (new.id, v_actor, 'due_date_changed', old.due_date::text, new.due_date::text);
  end if;

  if new.title is distinct from old.title then v_fields := v_fields || 'title'; end if;
  if new.description is distinct from old.description then v_fields := v_fields || 'description'; end if;
  if new.category is distinct from old.category then v_fields := v_fields || 'category'; end if;
  if array_length(v_fields, 1) > 0 then
    insert into public.issue_activity (issue_id, actor_id, action, to_value)
    values (new.id, v_actor, 'updated', array_to_string(v_fields, ', '));
  end if;
  return null;
end;
$$;

create trigger issues_activity after insert or update on public.issues
  for each row execute function public.issues_activity();

create or replace function public.comments_activity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.issue_activity (issue_id, actor_id, action)
  values (new.issue_id, coalesce(auth.uid(), new.author_id), 'commented');
  return null;
end;
$$;

create trigger comments_activity after insert on public.comments
  for each row execute function public.comments_activity();

create or replace function public.attachments_activity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.issue_id is not null
     and (tg_op = 'INSERT' or old.issue_id is distinct from new.issue_id) then
    insert into public.issue_activity (issue_id, actor_id, action, to_value)
    values (new.issue_id, coalesce(auth.uid(), new.uploaded_by), 'attachment_added', new.file_name);
  end if;
  return null;
end;
$$;

create trigger attachments_activity after insert or update of issue_id on public.attachments
  for each row execute function public.attachments_activity();

-- ---------------------------------------------------------------------------
-- Audit logging (generic row-change trigger). Large free-text fields are
-- recorded as "changed" rather than copied, and no secrets are ever stored.
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_rec jsonb;
  v_old jsonb;
  v_details jsonb := '{}';
  v_changed jsonb;
  v_entity_id text;
  v_project uuid;
  v_redacted text[] := array['description', 'body', 'raw_output', 'parse_warnings', 'result'];
  v_ignored text[] := array['updated_at', 'issue_counter'];
begin
  if tg_op = 'DELETE' then
    v_rec := to_jsonb(old);
  else
    v_rec := to_jsonb(new);
  end if;

  v_entity_id := coalesce(v_rec ->> 'id', (v_rec ->> 'project_id') || ':' || (v_rec ->> 'user_id'));
  v_project := case
    when tg_table_name = 'projects' then (v_rec ->> 'id')::uuid
    else public.try_uuid(v_rec ->> 'project_id')
  end;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    select jsonb_object_agg(
             n.key,
             case when n.key = any (v_redacted) then to_jsonb('changed'::text)
                  else jsonb_build_object('from', v_old -> n.key, 'to', n.value) end)
      into v_changed
      from jsonb_each(v_rec) n
     where n.value is distinct from v_old -> n.key
       and not (n.key = any (v_ignored));
    if v_changed is null then
      return null; -- nothing meaningful changed (e.g. only issue_counter)
    end if;
    v_details := jsonb_build_object('changed', v_changed);
  else
    -- snapshot without large free-text columns
    v_details := v_rec - v_redacted;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, project_id, details)
  values (auth.uid(), tg_table_name || '.' || lower(tg_op), tg_table_name, v_entity_id, v_project, v_details);
  return null;
end;
$$;

create trigger audit after insert or update or delete on public.projects
  for each row execute function public.audit_row_change();
create trigger audit after insert or delete on public.project_members
  for each row execute function public.audit_row_change();
create trigger audit after insert or update or delete on public.issues
  for each row execute function public.audit_row_change();
create trigger audit after delete on public.comments
  for each row execute function public.audit_row_change();
create trigger audit after insert or update of status or delete on public.imports
  for each row execute function public.audit_row_change();
create trigger audit after update of status on public.issue_drafts
  for each row execute function public.audit_row_change();
create trigger audit after update of role on public.profiles
  for each row execute function public.audit_row_change();
create trigger audit after insert or update of status on public.automation_logs
  for each row execute function public.audit_row_change();
create trigger audit after update on public.automation_jobs
  for each row execute function public.audit_row_change();

-- Explicit events from the application (login, logout, exports...).
-- Only a fixed allow-list of actions may be written, always as the current user.
create or replace function public.log_audit_event(p_action text, p_details jsonb default '{}')
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_action not in ('auth.login', 'auth.logout', 'auth.password_reset', 'report.export',
                      'import.ai_processed', 'import.parsed') then
    raise exception 'Unsupported audit action' using errcode = '22023';
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, project_id, details)
  values (auth.uid(), p_action, split_part(p_action, '.', 1), p_details ->> 'entity_id',
          public.try_uuid(p_details ->> 'project_id'), coalesce(p_details, '{}'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Draft review workflow (SECURITY INVOKER: RLS applies to every statement)
-- ---------------------------------------------------------------------------
create or replace function public.refresh_import_status(p_import uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.imports
     set status = 'completed', completed_at = now()
   where id = p_import
     and status = 'review'
     and not exists (select 1 from public.issue_drafts where import_id = p_import and status = 'pending');
end;
$$;

create or replace function public.approve_issue_draft(
  p_draft_id uuid,
  p_title text,
  p_description text,
  p_category public.issue_category,
  p_priority public.issue_priority,
  p_assignee_id uuid default null,
  p_due_date date default null
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  d public.issue_drafts;
  v_issue uuid;
begin
  select * into d from public.issue_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft not found' using errcode = 'P0002';
  end if;
  if not public.can_manage_project(d.project_id) then
    raise exception 'You do not have permission to review this import' using errcode = '42501';
  end if;
  if d.status <> 'pending' then
    raise exception 'This draft has already been reviewed' using errcode = '23514';
  end if;

  insert into public.issues (project_id, title, description, category, priority,
                             reporter_name, assignee_id, due_date, source, import_id, created_by)
  values (d.project_id, p_title, coalesce(p_description, ''), p_category, p_priority,
          d.reported_by, p_assignee_id, p_due_date, 'whatsapp_import', d.import_id, auth.uid())
  returning id into v_issue;

  insert into public.issue_source_messages (issue_id, source_message_id)
  select v_issue, sm.id
    from public.source_messages sm
   where sm.id = any (d.source_message_ids) and sm.project_id = d.project_id
  on conflict do nothing;

  update public.attachments
     set issue_id = v_issue
   where id = any (d.attachment_ids) and project_id = d.project_id;

  update public.issue_drafts
     set status = 'approved', approved_issue_id = v_issue,
         title = p_title, description = coalesce(p_description, ''),
         category = p_category, priority = p_priority,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = d.id;

  perform public.refresh_import_status(d.import_id);
  return v_issue;
end;
$$;

create or replace function public.reject_issue_draft(p_draft_id uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  d public.issue_drafts;
begin
  select * into d from public.issue_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft not found' using errcode = 'P0002';
  end if;
  if not public.can_manage_project(d.project_id) then
    raise exception 'You do not have permission to review this import' using errcode = '42501';
  end if;
  if d.status <> 'pending' then
    raise exception 'This draft has already been reviewed' using errcode = '23514';
  end if;
  update public.issue_drafts
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
   where id = d.id;
  perform public.refresh_import_status(d.import_id);
end;
$$;

-- Link a draft to an EXISTING issue (duplicate / follow-up): evidence moves to
-- the issue and the draft text is preserved as a comment.
create or replace function public.merge_draft_into_issue(p_draft_id uuid, p_issue_id uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  d public.issue_drafts;
  v_project uuid;
begin
  select * into d from public.issue_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft not found' using errcode = 'P0002';
  end if;
  if not public.can_manage_project(d.project_id) then
    raise exception 'You do not have permission to review this import' using errcode = '42501';
  end if;
  if d.status <> 'pending' then
    raise exception 'This draft has already been reviewed' using errcode = '23514';
  end if;
  select project_id into v_project from public.issues where id = p_issue_id;
  if v_project is null or v_project <> d.project_id then
    raise exception 'Issue not found in this project' using errcode = 'P0002';
  end if;

  insert into public.issue_source_messages (issue_id, source_message_id)
  select p_issue_id, sm.id
    from public.source_messages sm
   where sm.id = any (d.source_message_ids) and sm.project_id = d.project_id
  on conflict do nothing;

  update public.attachments
     set issue_id = p_issue_id
   where id = any (d.attachment_ids) and project_id = d.project_id;

  insert into public.comments (issue_id, author_id, body)
  values (p_issue_id, auth.uid(),
          left('Linked follow-up from WhatsApp import'
               || coalesce(' (reported by ' || d.reported_by || ')', '') || E':\n\n'
               || d.title || E'\n\n' || d.description, 10000));

  update public.issue_drafts
     set status = 'merged', merged_into_issue_id = p_issue_id,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = d.id;

  perform public.refresh_import_status(d.import_id);
end;
$$;

-- Merge one pending draft into another pending draft from the same import.
create or replace function public.merge_drafts(p_keep_id uuid, p_merge_id uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  k public.issue_drafts;
  m public.issue_drafts;
begin
  if p_keep_id = p_merge_id then
    raise exception 'Cannot merge a draft into itself' using errcode = '22023';
  end if;
  select * into k from public.issue_drafts where id = p_keep_id for update;
  select * into m from public.issue_drafts where id = p_merge_id for update;
  if k.id is null or m.id is null then
    raise exception 'Draft not found' using errcode = 'P0002';
  end if;
  if k.import_id <> m.import_id then
    raise exception 'Drafts must belong to the same import' using errcode = '22023';
  end if;
  if not public.can_manage_project(k.project_id) then
    raise exception 'You do not have permission to review this import' using errcode = '42501';
  end if;
  if k.status <> 'pending' or m.status <> 'pending' then
    raise exception 'Both drafts must be pending' using errcode = '23514';
  end if;

  update public.issue_drafts
     set source_message_ids = (select coalesce(array_agg(distinct x), '{}')
                                 from unnest(k.source_message_ids || m.source_message_ids) x),
         attachment_ids = (select coalesce(array_agg(distinct x), '{}')
                             from unnest(k.attachment_ids || m.attachment_ids) x),
         description = left(k.description || E'\n\n---\nMerged from: ' || m.title || E'\n'
                            || m.description, 20000),
         priority = least(k.priority, m.priority), -- enum order: critical < high < medium < low
         confidence = greatest(k.confidence, m.confidence)
   where id = k.id;

  update public.issue_drafts
     set status = 'merged', merged_into_draft_id = k.id,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = m.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Global search (SECURITY INVOKER: only returns rows the caller can see)
-- ---------------------------------------------------------------------------
create or replace function public.search_all(p_query text, p_limit integer default 20)
returns table (
  kind text,
  id uuid,
  project_id uuid,
  issue_id uuid,
  import_id uuid,
  title text,
  snippet text,
  created_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  with q as (
    select '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  (select 'project', p.id, p.id, null::uuid, null::uuid, p.name,
          coalesce(p.client_name, left(p.description, 160)), p.created_at
     from public.projects p, q
    where p.name ilike q.pat or p.client_name ilike q.pat or p.key ilike q.pat
       or p.description ilike q.pat
    order by p.created_at desc
    limit p_limit)
  union all
  (select 'issue', i.id, i.project_id, i.id, i.import_id,
          pr.key || '-' || i.number || ' · ' || i.title, left(i.description, 160), i.created_at
     from public.issues i
     join public.projects pr on pr.id = i.project_id, q
    where i.title ilike q.pat or i.description ilike q.pat
       or (pr.key || '-' || i.number) ilike q.pat
    order by i.created_at desc
    limit p_limit)
  union all
  (select 'comment', c.id, i.project_id, i.id, null::uuid,
          pr.key || '-' || i.number || ' · ' || i.title, left(c.body, 160), c.created_at
     from public.comments c
     join public.issues i on i.id = c.issue_id
     join public.projects pr on pr.id = i.project_id, q
    where c.body ilike q.pat
    order by c.created_at desc
    limit p_limit)
  union all
  (select 'message', sm.id, sm.project_id,
          (select x.issue_id from public.issue_source_messages x
            where x.source_message_id = sm.id limit 1),
          sm.import_id, coalesce(sm.sender, 'Unknown sender'), left(sm.body, 160),
          coalesce(sm.sent_at, sm.created_at)
     from public.source_messages sm, q
    where sm.body ilike q.pat and not sm.is_system
    order by sm.created_at desc
    limit p_limit)
$$;
