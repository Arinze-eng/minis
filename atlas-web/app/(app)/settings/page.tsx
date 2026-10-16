import type { Metadata } from "next";
import Link from "next/link";
import {
  Bell, CheckSquare, ChevronRight, Layers, Plane, Radio, Shield,
} from "lucide-react";
import { AppearanceControl } from "@/components/ThemeToggle";
import { principalFromCookies } from "@/lib/server/identity";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings hub (iOS Settings pattern: inset grouped lists, colored icon
 * tiles, chevrons). On phones it is the fifth tab, so every screen that is
 * not a tab stays one tap away instead of hiding behind a "More" drawer.
 */

const GROUPS = [
  {
    header: "Connections",
    footer: "Atlas reads only the sources you connect, and only read-only.",
    rows: [{ href: "/sources", label: "Sources", detail: "Gmail", icon: Radio, tint: "#34c759" }],
  },
  {
    header: "Privacy",
    rows: [
      { href: "/settings/privacy", label: "Privacy & data", icon: Shield, tint: "#0071e3" },
      { href: "/settings/preferences", label: "Notifications", detail: "Quiet hours", icon: Bell, tint: "#ff3b30" },
    ],
  },
  {
    header: "Also in Atlas",
    rows: [
      { href: "/looks", label: "Looks", icon: Layers, tint: "#af52de" },
      { href: "/travel", label: "Travel", icon: Plane, tint: "#ff9500" },
      { href: "/tasks", label: "Tasks", icon: CheckSquare, tint: "#5856d6" },
    ],
  },
];

export default async function SettingsPage() {
  await principalFromCookies(); // signed-out visitors go to sign-in

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <h1>Settings</h1>
      </div>

      <section className="grouped" aria-labelledby="appearance-h">
        <h2 id="appearance-h" className="section-header">Appearance</h2>
        <div className="grouped-list p-3">
          <AppearanceControl />
        </div>
        <p className="section-footer">System follows your device’s light or dark setting.</p>
      </section>

      {GROUPS.map((group) => (
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
          {group.footer && <p className="section-footer">{group.footer}</p>}
        </section>
      ))}
    </div>
  );
}
