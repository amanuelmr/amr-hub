"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Columns3,
  IterationCw,
  Code2,
  Megaphone,
  Server,
  Palette,
  Settings2,
  Briefcase,
  LifeBuoy,
  FlaskConical,
} from "lucide-react";
import { authClient } from "../../lib/auth-client";
import {
  keyFromOrganizationName,
  organizationOnboardingSchema,
  slugFromOrganizationName,
} from "../../server/organizationSchemas";
import {
  AuthAlert,
  AuthHeading,
  AuthLoading,
  AuthPage,
} from "../components/auth/AuthCard";
import { AuthField, SubmitButton } from "../components/auth/AuthFields";

type Step = "workspace" | "work" | "project";
type BoardType = "SCRUM" | "KANBAN";

const STEPS: { id: Step; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "work", label: "Your work" },
  { id: "project", label: "First project" },
];

const WORK_TYPES = [
  { id: "software", label: "Software development", icon: Code2 },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "it", label: "IT support", icon: Server },
  { id: "design", label: "Design", icon: Palette },
  { id: "operations", label: "Operations", icon: Settings2 },
  { id: "product", label: "Product management", icon: Briefcase },
  { id: "service", label: "Customer service", icon: LifeBuoy },
  { id: "research", label: "Research", icon: FlaskConical },
] as const;

const TEMPLATES: {
  id: BoardType;
  title: string;
  description: string;
  icon: typeof Columns3;
}[] = [
  {
    id: "SCRUM",
    title: "Scrum",
    description:
      "Plan work in sprints from a backlog. Best for teams shipping on a regular cadence.",
    icon: IterationCw,
  },
  {
    id: "KANBAN",
    title: "Kanban",
    description:
      "Visualize a continuous flow of work on a board and limit work in progress.",
    icon: Columns3,
  },
];

const WORK_TYPE_STORAGE_KEY = "amr-hub:onboarding-work-types";
const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/;

function projectKeyFromName(name: string, fallback: string) {
  const words = name
    .trim()
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const initials = words.map((word) => word[0]).join("");
  const candidate =
    initials.length >= 2
      ? initials.slice(0, 6)
      : (words[0] ?? "").slice(0, 4);
  return PROJECT_KEY_PATTERN.test(candidate) ? candidate : fallback;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const [step, setStep] = useState<Step>("workspace");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [key, setKey] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugStatus, setSlugStatus] = useState<{
    tone: "ok" | "error" | "pending";
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [boardType, setBoardType] = useState<BoardType>("SCRUM");
  const [projectName, setProjectName] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const customSlug = useRef(false);
  const customKey = useRef(false);
  const customProjectKey = useRef(false);
  // The existing-organization redirect only applies when the page first
  // loads; once this flow creates the workspace, later session refreshes
  // must not bounce the user out of steps 2–3.
  const hasCheckedExisting = useRef(false);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (isSessionPending) return;
    if (!session) {
      if (!hasCheckedExisting.current) router.replace("/login");
      return;
    }
    if (hasCheckedExisting.current) return;
    hasCheckedExisting.current = true;

    // Not tied to this effect's cleanup: a session refresh (or a dev-mode
    // double run) re-runs the effect, but the one lookup must still land.
    authClient.organization
      .list()
      .then(async (result) => {
        if (!isMounted.current) return;
        const organization = result.data?.[0];
        if (organization) {
          await authClient.organization.setActive({
            organizationId: organization.id,
          });
          router.replace("/dashboard");
          router.refresh();
          return;
        }
        setIsChecking(false);
      })
      .catch(() => {
        if (isMounted.current) {
          setError("Workspace setup could not be loaded.");
          setIsChecking(false);
        }
      });
  }, [isSessionPending, router, session]);

  const updateName = (nextName: string) => {
    setName(nextName);
    if (!customSlug.current) setSlug(slugFromOrganizationName(nextName));
    if (!customKey.current) setKey(keyFromOrganizationName(nextName));
    setSlugStatus(null);
  };

  const checkSlug = async () => {
    if (!slug) return;
    const parsed = organizationOnboardingSchema.shape.slug.safeParse(slug);
    if (!parsed.success) {
      setSlugStatus({
        tone: "error",
        message: parsed.error.issues[0]?.message ?? "Invalid workspace URL",
      });
      return;
    }

    setSlugStatus({ tone: "pending", message: "Checking availability…" });
    const result = await authClient.organization.checkSlug({
      slug: parsed.data,
    });
    setSlugStatus(
      result.error
        ? { tone: "error", message: "This URL is already taken" }
        : { tone: "ok", message: "This URL is available" },
    );
  };

  const createWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const validation = organizationOnboardingSchema.safeParse({
      name,
      slug,
      key,
    });

    if (!validation.success) {
      setError(
        validation.error.issues[0]?.message ?? "Check the workspace details.",
      );
      return;
    }

    setIsSubmitting(true);
    const result = await authClient.organization.create(validation.data);

    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "The workspace URL or issue key is already in use. Choose another value.",
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setProjectName(validation.data.name);
    setProjectKey(
      PROJECT_KEY_PATTERN.test(validation.data.key)
        ? validation.data.key
        : projectKeyFromName(validation.data.name, "PROJ"),
    );
    setStep("work");
  };

  const toggleWorkType = (id: string) => {
    setWorkTypes((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const saveWorkTypes = (values: string[]) => {
    try {
      window.localStorage.setItem(
        WORK_TYPE_STORAGE_KEY,
        JSON.stringify(values),
      );
    } catch {
      // Preference is optional; ignore unavailable storage.
    }
    setStep("project");
  };

  const finishWithoutProject = () => {
    router.replace("/your-work");
    router.refresh();
  };

  const createFirstProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const normalizedKey = projectKey.trim().toUpperCase();
    if (projectName.trim().length < 2) {
      setError("Project name must be at least 2 characters.");
      return;
    }
    if (!PROJECT_KEY_PATTERN.test(normalizedKey)) {
      setError("Project key must be 2–6 letters or numbers, starting with a letter.");
      return;
    }

    setIsSubmitting(true);
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: normalizedKey,
        name: projectName.trim(),
        description: null,
        color: null,
        targetDate: null,
        boardType,
      }),
    });
    const result = (await response.json().catch(() => null)) as {
      id?: string;
      error?: string;
      fields?: Record<string, string[] | undefined>;
    } | null;

    if (!response.ok || !result?.id) {
      const fieldMessage = result?.fields
        ? Object.values(result.fields).flat().find(Boolean)
        : undefined;
      setError(
        fieldMessage ?? result?.error ?? "The project could not be created.",
      );
      setIsSubmitting(false);
      return;
    }

    router.replace(`/projects/${result.id}/board`);
    router.refresh();
  };

  if (isChecking || isSessionPending) {
    return <AuthLoading label="Preparing your workspace" />;
  }

  const stepIndex = STEPS.findIndex((item) => item.id === step);

  const progress = (
    <ol className="acct-progress" aria-label="Setup progress">
      {STEPS.map((item, index) => (
        <li
          key={item.id}
          className={
            index < stepIndex ? "done" : index === stepIndex ? "current" : ""
          }
          aria-current={index === stepIndex ? "step" : undefined}
        >
          <span className="acct-progress-dot">
            {index < stepIndex ? <Check size={12} aria-hidden="true" /> : index + 1}
          </span>
          <span className="acct-progress-label">{item.label}</span>
        </li>
      ))}
    </ol>
  );

  if (step === "workspace") {
    return (
      <AuthPage wide>
        {progress}
        <AuthHeading
          eyebrow={`Step 1 of ${STEPS.length}`}
          title="Welcome to AMR Hub"
          subtitle="Create your site — the private workspace where you and your team track work."
        />
        {error && <AuthAlert>{error}</AuthAlert>}
        <form className="acct-form" onSubmit={createWorkspace}>
          <AuthField
            label="Workspace name"
            type="text"
            value={name}
            onValueChange={updateName}
            autoComplete="organization"
            placeholder="Acme Product"
            minLength={2}
            maxLength={80}
            required
            autoFocus
          />

          <div className="acct-field">
            <label htmlFor="onboarding-slug">Your site</label>
            <span className="acct-prefixed">
              <span className="acct-prefix">amr-hub/</span>
              <input
                id="onboarding-slug"
                type="text"
                value={slug}
                onChange={(event) => {
                  customSlug.current = true;
                  setSlug(event.target.value.toLowerCase());
                  setSlugStatus(null);
                }}
                onBlur={() => void checkSlug()}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                minLength={3}
                maxLength={48}
                placeholder="acme-product"
                required
              />
            </span>
            <p
              className={`acct-field-hint${slugStatus ? ` acct-hint-${slugStatus.tone}` : ""}`}
              aria-live="polite"
            >
              {slugStatus?.tone === "ok" && <Check size={12} aria-hidden="true" />}
              {slugStatus?.message ??
                "Lowercase letters, numbers and hyphens. You can't change this later."}
            </p>
          </div>

          <AuthField
            label="Issue key"
            className="acct-code-input"
            type="text"
            value={key}
            onValueChange={(value) => {
              customKey.current = true;
              setKey(value.toUpperCase());
            }}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            minLength={2}
            maxLength={5}
            placeholder="ACME"
            required
            hint={`Issues will use identifiers such as ${key || "ACME"}-1.`}
          />

          <div className="acct-site-preview" aria-hidden="true">
            <span className="acct-avatar acct-avatar-org">
              {(key || "A").slice(0, 2)}
            </span>
            <span>
              <strong>{name.trim() || "Your workspace"}</strong>
              <small>amr-hub/{slug || "your-site"}</small>
            </span>
          </div>

          <SubmitButton
            busy={isSubmitting}
            busyLabel="Creating workspace"
            disabled={!name.trim() || !slug.trim() || !key.trim()}
          >
            Continue
          </SubmitButton>
        </form>
      </AuthPage>
    );
  }

  if (step === "work") {
    return (
      <AuthPage wide>
        {progress}
        <AuthHeading
          eyebrow={`Step 2 of ${STEPS.length}`}
          title="What kind of work do you do?"
          subtitle="This helps us suggest the right setup. Pick any that apply."
        />
        <div className="acct-chips" role="group" aria-label="Kinds of work">
          {WORK_TYPES.map(({ id, label, icon: Icon }) => {
            const selected = workTypes.includes(id);
            return (
              <button
                type="button"
                key={id}
                className={selected ? "acct-chip selected" : "acct-chip"}
                aria-pressed={selected}
                onClick={() => toggleWorkType(id)}
              >
                {selected ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Icon size={14} aria-hidden="true" />
                )}
                {label}
              </button>
            );
          })}
        </div>
        <div className="acct-actions">
          <button
            type="button"
            className="acct-link-button"
            onClick={() => setStep("project")}
          >
            Skip
          </button>
          <SubmitButton
            type="button"
            onClick={() => saveWorkTypes(workTypes)}
            disabled={workTypes.length === 0}
          >
            Continue
          </SubmitButton>
        </div>
      </AuthPage>
    );
  }

  return (
    <AuthPage wide>
      {progress}
      <AuthHeading
        eyebrow={`Step 3 of ${STEPS.length}`}
        title="Create your first project"
        subtitle="Choose a template. You can change the board type later in project settings."
      />
      {error && <AuthAlert>{error}</AuthAlert>}
      <form className="acct-form" onSubmit={createFirstProject}>
        <div
          className="acct-templates"
          role="radiogroup"
          aria-label="Project template"
        >
          {TEMPLATES.map(({ id, title, description, icon: Icon }) => (
            <label
              key={id}
              className={boardType === id ? "acct-template selected" : "acct-template"}
            >
              <input
                type="radio"
                name="boardType"
                value={id}
                checked={boardType === id}
                onChange={() => setBoardType(id)}
                className="sr-only"
              />
              <span className="acct-template-icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="acct-template-text">
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <span className="acct-template-check" aria-hidden="true">
                {boardType === id && <Check size={12} />}
              </span>
            </label>
          ))}
        </div>

        <AuthField
          label="Project name"
          type="text"
          value={projectName}
          onValueChange={(value) => {
            setProjectName(value);
            if (!customProjectKey.current) {
              setProjectKey(projectKeyFromName(value, projectKey || "PROJ"));
            }
          }}
          placeholder="Website relaunch"
          minLength={2}
          maxLength={80}
          required
          autoFocus
        />
        <AuthField
          label="Project key"
          className="acct-code-input"
          type="text"
          value={projectKey}
          onValueChange={(value) => {
            customProjectKey.current = true;
            setProjectKey(value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
          }}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          minLength={2}
          maxLength={6}
          required
          hint="2–6 characters, starting with a letter."
        />

        <div className="acct-actions">
          <button
            type="button"
            className="acct-link-button"
            onClick={finishWithoutProject}
            disabled={isSubmitting}
          >
            Skip for now
          </button>
          <SubmitButton
            busy={isSubmitting}
            busyLabel="Creating project"
            disabled={projectName.trim().length < 2 || !projectKey}
          >
            Create project
          </SubmitButton>
        </div>
      </form>
    </AuthPage>
  );
}
