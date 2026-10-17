const GO_TO: Record<string, string | ((projectId: string | null) => string | null)> = {
  w: "/your-work",
  o: "/dashboard",
  d: "/dashboards",
  p: "/projects",
  i: "/issues",
  f: "/filters",
  b: (projectId) => (projectId ? `/projects/${projectId}/board` : null),
  l: (projectId) => (projectId ? `/projects/${projectId}/backlog` : null),
  s: (projectId) => (projectId ? `/projects/${projectId}` : null),
};

export function isTypingTarget(target: EventTarget | null) {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const element = target as HTMLElement;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT" ||
    element.isContentEditable ||
    !!element.closest("[contenteditable='true'], [role='dialog'], [role='menu'], [role='listbox']")
  );
}

/** Issue key when on /issues/<key> (not /issues/new). */
export function issueIdFromPath(pathname: string) {
  const match = /^\/issues\/([^/]+)$/.exec(pathname);
  return match && match[1] !== "new" ? decodeURIComponent(match[1]) : null;
}

export function goToDestination(key: string, activeProjectId: string | null) {
  const destination = GO_TO[key.toLowerCase()];
  if (!destination) return null;
  return typeof destination === "function" ? destination(activeProjectId) : destination;
}
