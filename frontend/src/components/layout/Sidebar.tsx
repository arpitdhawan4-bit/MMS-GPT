import { useState, useEffect } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Home,
  FolderTree,
  FileText,
  BarChart3,
  LayoutDashboard,
  Building2,
  FlaskConical,
  Ticket,
  Monitor,
  HardDrive,
  type LucideIcon,
} from "lucide-react";

// ── Icon lookup map ──────────────────────────────────────────────────────────
// Maps the icon_key string stored in planning.nav_items to the Lucide component.
// Add new entries here whenever a new icon_key is introduced in the DB.
const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  FolderTree,
  FileText,
  BarChart3,
  LayoutDashboard,
  Building2,
  FlaskConical,
  Ticket,
  Monitor,
  HardDrive,
};

// ── API base URL ─────────────────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8001";

// ── Types ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: (path: string, label: string) => void;
}

/** Shape used internally by the render tree. */
interface TreeNode {
  id: string;
  label: string;
  path?: string;
  icon?: React.ReactNode;
  children?: TreeNode[];
}

/** Shape returned by GET /api/nav (mirrors planning.nav_items + nested children). */
interface NavApiItem {
  nav_id: number;
  parent_id: number | null;
  label: string;
  path: string | null;
  icon_key: string | null;
  sort_order: number;
  children: NavApiItem[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function apiToTreeNode(item: NavApiItem): TreeNode {
  const Icon: LucideIcon | undefined = item.icon_key ? ICON_MAP[item.icon_key] : undefined;
  return {
    id: String(item.nav_id),
    label: item.label,
    path: item.path ?? undefined,
    icon: Icon ? <Icon className="w-4 h-4" /> : undefined,
    children:
      item.children && item.children.length > 0
        ? item.children.map(apiToTreeNode)
        : undefined,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  // "2" = Support Tickets (nav_id = 2) — expanded by default to match original UX
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["2"]));
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch nav tree from the API on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/nav`)
      .then((res) => {
        if (!res.ok) throw new Error(`GET /api/nav returned ${res.status}`);
        return res.json() as Promise<NavApiItem[]>;
      })
      .then((items) => setTreeData(items.map(apiToTreeNode)))
      .catch((err) => console.error("[Sidebar] Failed to load nav items:", err))
      .finally(() => setLoading(false));
  }, []);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const renderTreeNode = (node: TreeNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
          style={{ paddingLeft: `${level * 16 + 16}px`, paddingRight: "12px" }}
          onClick={() => {
            if (hasChildren) {
              toggleNode(node.id);
            } else if (node.path) {
              onNavigate(node.path, node.label);
            }
          }}
        >
          {hasChildren && (
            <span className="flex-shrink-0">
              <ChevronRight
                className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              />
            </span>
          )}
          {!hasChildren && <span className="w-4 flex-shrink-0" />}
          {node.icon && <span className="flex-shrink-0">{node.icon}</span>}
          {!collapsed && <span className="text-sm truncate">{node.label}</span>}
        </div>

        {hasChildren && isExpanded && !collapsed && (
          <div>{node.children!.map((child) => renderTreeNode(child, level + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className="h-16 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white text-sm">
              MMS-GPT
            </span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center mx-auto">
            <span className="text-white font-bold text-sm">M</span>
          </div>
        )}
      </div>

      {/* Tree Navigation */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          /* Skeleton shimmer while the DB response arrives */
          <div className="px-4 py-2 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
                style={{ width: `${60 + (i % 3) * 15}%` }}
              />
            ))}
          </div>
        ) : (
          treeData.map((node) => renderTreeNode(node))
        )}
      </div>

      {/* Collapse / Expand toggle */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          )}
        </button>
      </div>
    </div>
  );
}

export type { TreeNode };
