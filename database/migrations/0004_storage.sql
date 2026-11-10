-- IssueFlow AI — 0004: private storage bucket for evidence (screenshots, chat exports, documents)
-- Object paths always start with the project id:  {project_id}/...
-- so access can be checked against project membership.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  26214400, -- 25 MB per file
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain', 'text/csv',
    'application/zip', 'application/x-zip-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'video/mp4', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/opus'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy evidence_select on storage.objects for select to authenticated
  using (bucket_id = 'evidence'
         and public.is_project_member(public.try_uuid((storage.foldername(name))[1])));

create policy evidence_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence'
              and public.is_project_member(public.try_uuid((storage.foldername(name))[1])));

create policy evidence_delete on storage.objects for delete to authenticated
  using (bucket_id = 'evidence'
         and public.can_manage_project(public.try_uuid((storage.foldername(name))[1])));
