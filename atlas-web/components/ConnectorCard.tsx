"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

export type ConnectorStatus = "connected" | "disconnected" | "coming_soon";

interface ConnectorCardProps {
  name: string;
  description: string;
  icon: LucideIcon;
  /** Brand/accent color for the icon background (CSS value). Defaults to accent. */
  iconColor?: string;
  status: ConnectorStatus;
  onConnect?: () => void;
  connectHref?: string;
  onDisconnect?: () => void;
  children?: ReactNode;
}

const statusLabel: Record<ConnectorStatus, string> = {
  connected: "Connected",
  disconnected: "Not connected",
  coming_soon: "Coming soon",
};

export function ConnectorCard({
  name,
  description,
  icon: Icon,
  iconColor,
  status,
  onConnect,
  connectHref,
  onDisconnect,
  children,
}: ConnectorCardProps) {
  return (
    <div
      className={`connector-card connector-card--${status}`}
      data-status={status}
    >
      <div className="connector-card-header">
        <div
          className="connector-icon"
          style={iconColor ? { background: iconColor } : undefined}
          aria-hidden="true"
        >
          <Icon size={20} strokeWidth={1.8} />
        </div>
        <div className="connector-card-meta">
          <span className="connector-name">{name}</span>
          <span className={`connector-status connector-status--${status}`}>
            {statusLabel[status]}
          </span>
        </div>
      </div>

      <p className="connector-description">{description}</p>

      {children}

      {status !== "coming_soon" && (
        <div className="connector-card-action">
          {status === "disconnected" && (
            <>
              {connectHref ? (
                <Link href={connectHref} className="btn-primary connector-btn">
                  Connect
                </Link>
              ) : onConnect ? (
                <button
                  type="button"
                  className="btn-primary connector-btn"
                  onClick={onConnect}
                >
                  Connect
                </button>
              ) : null}
            </>
          )}
          {status === "connected" && onDisconnect && (
            <button
              type="button"
              className="btn-secondary connector-btn"
              onClick={onDisconnect}
            >
              Disconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
