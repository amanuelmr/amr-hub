"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { BellRing, CircleUser, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { authClient } from "../../../lib/auth-client";
import { THEME_STORAGE_KEY } from "../ThemeToggle";

function currentTheme(): "light" | "dark" {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

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
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  const userName = session?.user.name ?? "Workspace member";
  const email = session?.user.email ?? "";
  const role =
    activeMember?.role === "owner"
      ? "Workspace owner"
      : activeMember?.role === "viewer"
        ? "Workspace viewer"
        : "Workspace member";

  const toggleTheme = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable; the switch still applies to this tab.
    }
    setTheme(next);
  };

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <DropdownMenu.Root onOpenChange={(open) => open && setTheme(currentTheme())}>
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
          <DropdownMenu.Item
            className="shell-menu-item"
            onSelect={(event) => {
              event.preventDefault();
              toggleTheme();
            }}
          >
            {theme === "dark" ? (
              <Sun size={15} aria-hidden="true" />
            ) : (
              <Moon size={15} aria-hidden="true" />
            )}
            {theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          </DropdownMenu.Item>
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
