"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  BellRing,
  Check,
  ChevronRight,
  CircleUser,
  LogOut,
  Monitor,
  Moon,
  Sun,
  UserRound,
} from "lucide-react";
import { authClient } from "../../../lib/auth-client";
import { THEME_STORAGE_KEY } from "../ThemeToggle";

type ThemeChoice = "light" | "dark" | "system";

/** The saved choice; without one the page follows the browser setting. */
function currentThemeChoice(): ThemeChoice {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "dark" || attr === "light" ? attr : "system";
}

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match browser", icon: Monitor },
];

export function initialsOf(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "AR"
  );
}

export function ProfileMenu() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { data: activeMember } = authClient.useActiveMember();
  const [theme, setTheme] = useState<ThemeChoice | null>(null);

  const userName = session?.user.name ?? "Workspace member";
  const email = session?.user.email ?? "";
  const role =
    activeMember?.role === "owner"
      ? "Workspace owner"
      : activeMember?.role === "viewer"
        ? "Workspace viewer"
        : "Workspace member";

  const chooseTheme = (next: ThemeChoice) => {
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable; the choice still applies to this tab.
    }
    if (next === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
  };

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <DropdownMenu.Root onOpenChange={(open) => open && setTheme(currentThemeChoice())}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="shell-avatar-button"
          aria-label={`Your profile and settings (${userName})`}
          title={userName}
        >
          <span className="shell-user-avatar">{initialsOf(userName)}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="shell-menu shell-profile-menu" align="end" sideOffset={8}>
          <div className="shell-profile-head">
            <span className="shell-user-avatar shell-user-avatar-lg">{initialsOf(userName)}</span>
            <span>
              <strong>{userName}</strong>
              {email && <small>{email}</small>}
              <small>{role}</small>
            </span>
          </div>
          <DropdownMenu.Separator className="shell-menu-separator" />
          <DropdownMenu.Label className="shell-menu-label">Account</DropdownMenu.Label>
          {session?.user.id && (
            <DropdownMenu.Item
              className="shell-menu-item"
              onSelect={() => router.push(`/people/${session.user.id}`)}
            >
              <CircleUser size={15} aria-hidden="true" />
              Profile
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item className="shell-menu-item" onSelect={() => router.push("/account")}>
            <UserRound size={15} aria-hidden="true" />
            Account settings
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="shell-menu-item"
            onSelect={() => router.push("/account/notifications")}
          >
            <BellRing size={15} aria-hidden="true" />
            Personal settings
          </DropdownMenu.Item>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="shell-menu-item shell-menu-sub">
              {theme === "dark" ? (
                <Moon size={15} aria-hidden="true" />
              ) : theme === "light" ? (
                <Sun size={15} aria-hidden="true" />
              ) : (
                <Monitor size={15} aria-hidden="true" />
              )}
              Theme
              <ChevronRight size={14} aria-hidden="true" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className="shell-menu" sideOffset={6}>
                <DropdownMenu.RadioGroup
                  value={theme ?? "system"}
                  onValueChange={(value) => chooseTheme(value as ThemeChoice)}
                >
                  {THEME_OPTIONS.map((option) => (
                    <DropdownMenu.RadioItem
                      key={option.value}
                      value={option.value}
                      className="shell-menu-item"
                    >
                      <option.icon size={15} aria-hidden="true" />
                      {option.label}
                      <DropdownMenu.ItemIndicator className="shell-menu-check">
                        <Check size={14} aria-hidden="true" />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Separator className="shell-menu-separator" />
          <DropdownMenu.Item className="shell-menu-item" onSelect={() => void signOut()}>
            <LogOut size={15} aria-hidden="true" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
