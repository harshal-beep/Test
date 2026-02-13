import { NavLink } from "react-router-dom";

const PUCHO_LOGO =
  "https://cdn.prod.website-files.com/690ec911550adb97c4a56495/69399fa4c6253325791cd9ce_pucho%20logo.webp";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/workflows", label: "Workflows" },
  { to: "/connections", label: "Connections" },
];

export default function Sidebar() {
  return (
    <aside className="w-60 min-h-screen flex flex-col bg-sidebar-bg">
      {/* Header with gradient */}
      <div
        className="p-4 flex items-center gap-3"
        style={{
          background: "linear-gradient(135deg, #5922c6, #af3db8)",
        }}
      >
        <img src={PUCHO_LOGO} alt="Pucho" className="h-8" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block px-4 py-2.5 text-sm font-body transition-colors ${
                isActive
                  ? "text-pucho-violet font-medium border-l-3 border-pucho-violet bg-white/50"
                  : "text-black/70 hover:text-violet-blossom hover:bg-white/30"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
