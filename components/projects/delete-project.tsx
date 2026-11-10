"use client";

import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { deleteProject } from "@/lib/actions/projects";

export function DeleteProjectButton({ projectId, projectKey, trigger }: { projectId: string; projectKey: string; trigger: React.ReactNode }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger={trigger}
      title="Delete this project?"
      description="All issues, comments, imports, source messages and stored files in this project will be permanently deleted. This cannot be undone."
      confirmLabel="Delete project"
      requireText={projectKey}
      onConfirm={(typed) => deleteProject(projectId, typed)}
      onDone={() => router.push("/projects")}
    />
  );
}
