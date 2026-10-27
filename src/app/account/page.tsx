"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  BellRing,
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  MailPlus,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { authClient } from "../../lib/auth-client";
import PasskeySettings from "../components/PasskeySettings";
import RecoveryCodeSettings from "../components/RecoveryCodeSettings";
import SecurityActivity from "../components/SecurityActivity";
import SessionManager from "../components/SessionManager";
import TwoFactorSettings from "../components/TwoFactorSettings";

type WorkspaceAccess = {
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
    role: string;
    expiresAt: string;
    createdAt: string;
    invitedBy: string;
  }>;
};

function roleLabel(role: string) {
  if (role === "OWNER") return "Owner";
  if (role === "VIEWER") return "Viewer";
  return "Member";
}

export default function AccountPage() {
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const { data: activeMember } = authClient.useActiveMember();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [workspaceAccess, setWorkspaceAccess] =
    useState<WorkspaceAccess | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "viewer">("member");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const refreshWorkspaceAccess = async () => {
    const response = await fetch("/api/invitations", { cache: "no-store" });
    if (!response.ok) {
      setInviteStatus("Workspace access could not be loaded.");
      return;
    }
    setWorkspaceAccess((await response.json()) as WorkspaceAccess);
  };

  useEffect(() => {
    if (activeMember?.role !== "owner") return;

    let active = true;
    fetch("/api/invitations", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Workspace access unavailable");
        return response.json() as Promise<WorkspaceAccess>;
      })
      .then((access) => {
        if (active) setWorkspaceAccess(access);
      })
      .catch(() => {
        if (active) setInviteStatus("Workspace access could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, [activeMember?.role]);

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordStatus(null);

    if (newPassword.length < 12) {
      setPasswordStatus("Use at least 12 characters for the new password.");
      return;
    }
    if (newPassword !== confirmation) {
      setPasswordStatus("Password confirmation does not match.");
      return;
    }

    setIsChangingPassword(true);
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setIsChangingPassword(false);

    if (result.error) {
      setPasswordStatus("The current password is incorrect.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmation("");
    setPasswordStatus("Password updated and other sessions signed out.");
  };

  const createInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviteStatus(null);
    setInviteUrl(null);
    setCopiedInvite(false);
    setIsInviting(true);

    const response = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
      inviteUrl?: string;
    } | null;
    setIsInviting(false);

    if (!response.ok || !result?.inviteUrl) {
      setInviteStatus(result?.error ?? "Invitation could not be created.");
      return;
    }

    const invitedEmail = inviteEmail.trim();
    setInviteUrl(result.inviteUrl);
    setInviteEmail("");
    setInviteRole("member");
    setInviteStatus(
      `Invitation sent to ${invitedEmail}. You can also copy the link below to share it directly.`,
    );
    await refreshWorkspaceAccess();
  };

  const copyInvitation = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopiedInvite(true);
  };

  const revokePendingInvitation = async (id: string) => {
    setRevokingInviteId(id);
    setInviteStatus(null);
    const response = await fetch(`/api/invitations/${id}`, {
      method: "DELETE",
    });
    setRevokingInviteId(null);

    if (!response.ok) {
      setInviteStatus("The invitation could not be revoked.");
      return;
    }

    setInviteStatus("Invitation revoked.");
    await refreshWorkspaceAccess();
  };

  const removeMember = async (user: WorkspaceAccess["users"][number]) => {
    if (
      !window.confirm(
        `Remove ${user.name} from this workspace? Their active workspace sessions will be revoked immediately.`,
      )
    ) {
      return;
    }

    setRemovingMemberId(user.id);
    setInviteStatus(null);
    const response = await fetch(`/api/members/${user.id}`, {
      method: "DELETE",
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    setRemovingMemberId(null);

    if (!response.ok) {
      setInviteStatus(result?.error ?? "The member could not be removed.");
      return;
    }

    setInviteStatus(`${user.name} no longer has workspace access.`);
    await refreshWorkspaceAccess();
  };

  const isOwner = activeMember?.role === "owner";

  return (
    <div className="page account-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Personal settings</p>
          <h1>Account and access</h1>
          <p className="page-description">
            Manage your password, signed-in devices, and workspace members.
          </p>
        </div>
      </header>

      <div className="account-grid">
        <section className="account-profile">
          <span className="account-avatar">
            {session?.user.name
              ?.split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase() ?? "AR"}
          </span>
          <div>
            <strong>{session?.user.name ?? "Workspace owner"}</strong>
            <span>{session?.user.email}</span>
          </div>
          <span className="role-badge">
            <ShieldCheck size={14} aria-hidden="true" />
            {activeMember?.role === "owner" ? "Owner" : "Member"}
          </span>
        </section>

        <section className="account-section">
          <header>
            <span>
              <BellRing size={17} aria-hidden="true" />
            </span>
            <div>
              <h2>Personal settings</h2>
              <p>
                Your homepage, auto-watch, which updates reach you in app and by email,
                digests and filter subscriptions.
              </p>
            </div>
          </header>
          <Link className="secondary-button" href="/account/notifications">
            Open personal settings
          </Link>
        </section>

        <section className="account-section">
          <header>
            <span>
              <KeyRound size={17} aria-hidden="true" />
            </span>
            <div>
              <h2>Change password</h2>
              <p>Other signed-in devices will be disconnected.</p>
            </div>
          </header>
          <form className="account-form" onSubmit={changePassword}>
            <label className="form-field">
              <span>Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <div className="form-grid">
              <label className="form-field">
                <span>New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <label className="form-field">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
            </div>
            <div className="account-actions">
              {passwordStatus && (
                <p role="status">{passwordStatus}</p>
              )}
              <button
                className="primary-button"
                type="submit"
                disabled={
                  isChangingPassword ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmation
                }
              >
                {isChangingPassword && (
                  <LoaderCircle
                    className="spinning-icon"
                    size={15}
                    aria-hidden="true"
                  />
                )}
                Update password
              </button>
            </div>
          </form>
        </section>

        <TwoFactorSettings
          enabled={session?.user.twoFactorEnabled === true}
          onStatusChange={async () => {
            await refetchSession();
          }}
        />

        <PasskeySettings />

        <RecoveryCodeSettings />

        <SessionManager
          currentSessionToken={session?.session.token ?? null}
        />

        <SecurityActivity />

        {isOwner && (
          <section className="account-section team-access-section">
            <header>
              <span>
                <UsersRound size={17} aria-hidden="true" />
              </span>
              <div>
                <h2>Team access</h2>
                <p>Invite trusted workspace members by email.</p>
              </div>
            </header>

            <form className="team-invite-form" onSubmit={createInvitation}>
              <label className="form-field">
                <span>Member email</span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="member@example.com"
                  required
                />
              </label>
              <label className="form-field">
                <span>Access level</span>
                <select
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(event.target.value as "member" | "viewer")
                  }
                >
                  <option value="member">Member — can create and edit</option>
                  <option value="viewer">Viewer — read only</option>
                </select>
              </label>
              <button
                className="primary-button"
                type="submit"
                disabled={isInviting || !inviteEmail.trim()}
              >
                {isInviting ? (
                  <LoaderCircle
                    className="spinning-icon"
                    size={15}
                    aria-hidden="true"
                  />
                ) : (
                  <MailPlus size={15} aria-hidden="true" />
                )}
                Send invite
              </button>
            </form>

            {inviteUrl && (
              <div className="invite-link-result">
                <input
                  aria-label="Backup invitation link"
                  value={inviteUrl}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => void copyInvitation()}
                  aria-label="Copy invitation link"
                  title="Copy invitation link"
                >
                  {copiedInvite ? (
                    <Check size={16} aria-hidden="true" />
                  ) : (
                    <Copy size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
            )}

            {inviteStatus && (
              <p className="account-status" role="status">
                {inviteStatus}
              </p>
            )}

            <div className="team-access-group">
              <div className="team-access-heading">
                <strong>Members</strong>
                <span>{workspaceAccess?.users.length ?? 0}</span>
              </div>
              <div className="team-access-list">
                {workspaceAccess?.users.map((user) => (
                  <div className="team-access-row" key={user.id}>
                    <span className="team-member-avatar">
                      {user.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <span className="team-access-identity">
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                    </span>
                    <span className="team-role">{roleLabel(user.role)}</span>
                    {user.role !== "OWNER" && (
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={() => void removeMember(user)}
                        disabled={removingMemberId === user.id}
                        aria-label={`Remove ${user.name} from the workspace`}
                        title="Remove workspace access"
                      >
                        {removingMemberId === user.id ? (
                          <LoaderCircle
                            className="spinning-icon"
                            size={15}
                            aria-hidden="true"
                          />
                        ) : (
                          <Trash2 size={15} aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {(workspaceAccess?.invitations.length ?? 0) > 0 && (
              <div className="team-access-group">
                <div className="team-access-heading">
                  <strong>Invitations</strong>
                  <span>{workspaceAccess?.invitations.length}</span>
                </div>
                <div className="team-access-list">
                  {workspaceAccess?.invitations.map((invitation) => (
                    <div className="team-access-row" key={invitation.id}>
                      <span className="team-member-avatar pending">
                        <MailPlus size={15} aria-hidden="true" />
                      </span>
                      <span className="team-access-identity">
                        <strong>{invitation.email}</strong>
                        <span>
                          Created by {invitation.invitedBy} on{" "}
                          {new Date(
                            invitation.createdAt,
                          ).toLocaleDateString()}
                        </span>
                      </span>
                      <span className="team-role">
                        {roleLabel(invitation.role)}
                      </span>
                      <span
                        className={`invitation-status invitation-${invitation.status.toLowerCase()}`}
                      >
                        {invitation.status.toLowerCase()}
                      </span>
                      {invitation.status === "PENDING" && (
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={() =>
                            void revokePendingInvitation(invitation.id)
                          }
                          disabled={revokingInviteId === invitation.id}
                          aria-label={`Revoke invitation for ${invitation.email}`}
                          title="Revoke invitation"
                        >
                          {revokingInviteId === invitation.id ? (
                            <LoaderCircle
                              className="spinning-icon"
                              size={15}
                              aria-hidden="true"
                            />
                          ) : (
                            <Trash2 size={15} aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
