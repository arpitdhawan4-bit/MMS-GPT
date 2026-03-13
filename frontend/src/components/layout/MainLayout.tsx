import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Breadcrumbs } from "./Breadcrumbs";
import { AskAIButton } from "./AskAIButton";
import { ThemeToggle } from "./ThemeToggle";

export interface Tab {
  id: string;
  label: string;
  path: string;
}

/** The top-level shell: sidebar + tab bar + breadcrumbs + page content */
export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([
    { id: "home", label: "Ask MMS-GPT", path: "/" },
  ]);
  const [activeTabId, setActiveTabId] = useState("home");
  const location = useLocation();
  const navigate = useNavigate();

  // Keep active tab in sync with browser navigation (back/forward buttons)
  useEffect(() => {
    const current = tabs.find((t) => t.path === location.pathname);
    if (current) setActiveTabId(current.id);
  }, [location.pathname, tabs]);

  const handleNavigate = (path: string, label: string) => {
    const existing = tabs.find((t) => t.path === path);
    if (existing) {
      setActiveTabId(existing.id);
      navigate(path);
    } else {
      const newTab: Tab = { id: `tab-${Date.now()}`, label, path };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
      navigate(path);
    }
  };

  const handleTabClick = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      navigate(tab.path);
    }
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return; // always keep at least one tab
    const index = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);
    if (activeTabId === tabId) {
      const next = newTabs[Math.max(0, index - 1)];
      setActiveTabId(next.id);
      navigate(next.path);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        onNavigate={handleNavigate}
      />

      {/* ── Main area ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar + theme toggle */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-2 overflow-x-auto flex-shrink-0">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-r border-gray-200 dark:border-gray-700 cursor-pointer transition-colors select-none ${
                activeTabId === tab.id
                  ? "bg-blue-50 dark:bg-blue-900/30 border-b-2 border-b-blue-600"
                  : "hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              <span className="text-sm whitespace-nowrap text-gray-900 dark:text-gray-100">
                {tab.label}
              </span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="hover:bg-gray-200 dark:hover:bg-gray-600 rounded p-0.5 transition-colors"
                  aria-label={`Close ${tab.label} tab`}
                >
                  <X className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                </button>
              )}
            </div>
          ))}
          <div className="ml-auto p-2 flex-shrink-0">
            <ThemeToggle />
          </div>
        </div>

        {/* Breadcrumbs */}
        <Breadcrumbs />

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      {/* Floating Ask AI button */}
      <AskAIButton />
    </div>
  );
}
