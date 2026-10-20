import type { Form } from "@prisma/client";
import prisma from "../../prisma/client";
import { visibleProjectWhere, type AccessUser } from "./projectAccess";
import {
  defaultFormFields,
  type FormAnswers,
  type FormWorkType,
  type IntakeForm,
} from "../app/components/forms/formModel";
import type { IssueKind, IssuePriority } from "../app/data/issues";
import { buildSubmission, parseStoredFields, type CreateFormInput, type UpdateFormInput } from "./formSchemas";
import { createIssue, type WorkspaceActor } from "./issues";

export class FormInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormInputError";
  }
}

export class FormSubmissionError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string> = {},
    readonly status = 400,
  ) {
    super(message);
    this.name = "FormSubmissionError";
  }
}

const BUILT_IN_WORK_TYPES: FormWorkType[] = [
  { key: "TASK", name: "Task" },
  { key: "STORY", name: "Story" },
  { key: "BUG", name: "Bug" },
  { key: "EPIC", name: "Epic" },
];

/** Work types a form may create: the project's types, minus sub-task level ones (they need a parent). */
export async function listFormWorkTypes(projectId: string): Promise<FormWorkType[]> {
  const configured = await prisma.issueTypeConfig.findMany({
    where: { projectId, level: { gte: 0 } },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { key: true, name: true },
  });
  return configured.length > 0 ? configured : BUILT_IN_WORK_TYPES;
}

function serializeForm(form: Form, workTypes: FormWorkType[]): IntakeForm {
  const fields = parseStoredFields(form.fields);
  return {
    id: form.id,
    name: form.name,
    description: form.description ?? "",
    issueType: form.issueType,
    issueTypeName:
      workTypes.find((type) => type.key === form.issueType)?.name ?? form.issueType,
    fields: fields.length > 0 ? fields : defaultFormFields(),
    isActive: form.isActive,
    submissions: form.submissions,
    projectId: form.projectId,
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
  };
}

async function findProject(projectId: string, organizationId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    select: { id: true, key: true, name: true },
  });
}

async function assertWorkType(projectId: string, issueType: string) {
  const types = await listFormWorkTypes(projectId);
  if (!types.some((type) => type.key === issueType)) {
    throw new FormInputError("Choose a work type from this project");
  }
  return types;
}

export async function listForms(projectId: string, organizationId: string) {
  const project = await findProject(projectId, organizationId);
  if (!project) return null;
  const [forms, workTypes] = await Promise.all([
    prisma.form.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    listFormWorkTypes(projectId),
  ]);
  return forms.map((form) => serializeForm(form, workTypes));
}

export async function getProjectForm(projectId: string, formId: string, organizationId: string) {
  const project = await findProject(projectId, organizationId);
  if (!project) return null;
  const form = await prisma.form.findFirst({ where: { id: formId, projectId } });
  if (!form) return null;
  const workTypes = await listFormWorkTypes(projectId);
  return { form: serializeForm(form, workTypes), workTypes };
}

export async function createForm(
  projectId: string,
  input: CreateFormInput,
  organizationId: string,
) {
  const project = await findProject(projectId, organizationId);
  if (!project) return null;
  const workTypes = await assertWorkType(projectId, input.issueType);
  const form = await prisma.form.create({
    data: {
      projectId,
      name: input.name,
      description: input.description || null,
      issueType: input.issueType,
      fields: JSON.stringify(input.fields ?? defaultFormFields()),
    },
  });
  return serializeForm(form, workTypes);
}

export async function updateForm(
  projectId: string,
  formId: string,
  input: UpdateFormInput,
  organizationId: string,
) {
  const project = await findProject(projectId, organizationId);
  if (!project) return null;
  const existing = await prisma.form.findFirst({ where: { id: formId, projectId } });
  if (!existing) return null;
  const workTypes = input.issueType
    ? await assertWorkType(projectId, input.issueType)
    : await listFormWorkTypes(projectId);
  const form = await prisma.form.update({
    where: { id: formId },
    data: {
      name: input.name,
      description: input.description === undefined ? undefined : input.description || null,
      issueType: input.issueType,
      fields: input.fields ? JSON.stringify(input.fields) : undefined,
      isActive: input.isActive,
    },
  });
  return serializeForm(form, workTypes);
}

export async function deleteForm(projectId: string, formId: string, organizationId: string) {
  const project = await findProject(projectId, organizationId);
  if (!project) return false;
  const result = await prisma.form.deleteMany({ where: { id: formId, projectId } });
  return result.count > 0;
}

/** Loads a form for the fill page: any member of the form's workspace may open it. */
export async function getFormForFill(
  formId: string,
  organizationId: string,
  viewer?: AccessUser,
) {
  const form = await prisma.form.findFirst({
    where: {
      id: formId,
      project: viewer
        ? visibleProjectWhere(viewer, organizationId)
        : { organizationId, deletedAt: null, archivedAt: null },
    },
    include: { project: { select: { id: true, key: true, name: true } } },
  });
  if (!form) return null;
  const workTypes = await listFormWorkTypes(form.projectId);
  return { form: serializeForm(form, workTypes), project: form.project };
}

export async function submitForm(formId: string, answers: FormAnswers, actor: WorkspaceActor) {
  const loaded = await getFormForFill(formId, actor.organizationId);
  if (!loaded) return null;
  const { form } = loaded;
  if (!form.isActive) {
    throw new FormSubmissionError("This form isn't accepting responses right now", {}, 409);
  }

  const result = buildSubmission(form.fields, answers);
  if (!result.ok) {
    throw new FormSubmissionError("Some answers need attention", result.errors);
  }

  const workTypes = await listFormWorkTypes(form.projectId);
  const kind = workTypes.some((type) => type.key === form.issueType) ? form.issueType : "TASK";

  const issue = await createIssue(
    {
      title: result.title,
      description: result.description,
      priority: (result.priority ?? "MEDIUM") as IssuePriority,
      kind: kind as IssueKind,
      assigneeId: null,
      dueDate: null,
      estimate: null,
      cycleId: null,
      labelIds: [],
      projectId: form.projectId,
    },
    actor,
  );

  await prisma.form.update({
    where: { id: form.id },
    data: { submissions: { increment: 1 } },
  });

  return { issue: { id: issue.id, title: issue.title, projectId: issue.projectId } };
}
