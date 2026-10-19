"use client";

import { useQuery } from "convex/react";
import { BarChart3, Bell, Camera, CheckSquare, ChevronRight, Plane, Radio, Shield, Wallet } from "lucide-react";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import { AppearanceControl } from "@/components/ThemeToggle";
import { api } from "@/convex/_generated/api";

/** iOS Settings pattern: inset grouped lists with tinted icons, every screen one tap away on phones. */
export default function SettingsPage() {
  const me = useQuery(api.users.me);
  const groups = [
    {
      header: "You",
      rows: [
        { href: "/settings/photos", label: "Your photos", detail: "For try-ons", icon: Camera, tint: "#af52de" },
        { href: "/settings/preferences", label: "Style & notifications", icon: Bell, tint: "#ff3b30" },
      ],
    },
    {
      header: "Connections",
      footer: "Atlas reads only the sources you connect, and only read-only.",
      rows: [{ href: "/sources", label: "Sources", detail: "Gmail, Tasks", icon: Radio, tint: "#34c759" }],
    },
    {
      header: "Also in Atlas",
      rows: [
        { href: "/money", label: "Money", icon: Wallet, tint: "#30b0c7" },
        { href: "/travel", label: "Travel", icon: Plane, tint: "#ff9500" },
        { href: "/tasks", label: "Tasks", icon: CheckSquare, tint: "#5856d6" },
      ],
    },
    {
      header: "Privacy",
      rows: [
        { href: "/settings/privacy", label: "Privacy & data", detail: "Permissions, export, delete", icon: Shield, tint: "#0071e3" },
        ...(me?.role === "admin" ? [{ href: "/admin", label: "AI usage", detail: "Admin", icon: BarChart3, tint: "#8e8e93" }] : []),
      ],
    },
  ];

  return (
    <div className="page page-narrow">
      <PageHead title="Settings" sub={me?.email} />

      <section className="grouped" aria-labelledby="appearance-h">
        <h2 id="appearance-h" className="section-header">
          Appearance
        </h2>
        <div className="grouped-list p-3">
          <AppearanceControl />
        </div>
        <p className="section-footer">System follows your device’s light or dark setting.</p>
      </section>

      {groups.map((group) => (
        <section key={group.header} className="grouped" aria-label={group.header}>
          <h2 className="section-header">{group.header}</h2>
          <ul className="grouped-list">
            {group.rows.map(({ href, label, detail, icon: Icon, tint }) => (
              <li key={href}>
                <Link href={href} className="grouped-row">
                  <span className="grouped-icon" style={{ background: tint }} aria-hidden="true">
                    <Icon size={17} strokeWidth={2.2} />
                  </span>
                  <span className="grouped-label">{label}</span>
                  {detail && <span className="grouped-detail">{detail}</span>}
                  <ChevronRight size={18} className="grouped-chevron" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {"footer" in group && group.footer && <p className="section-footer">{group.footer}</p>}
        </section>
      ))}
    </div>
  );
}
