import { useState } from 'react';
import { 
  ChevronRight, 
  ChevronLeft,
  Home,
  FolderTree,
  FileText,
  BarChart3,
  LayoutDashboard,
  Building2
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: (path: string, label: string) => void;
}

interface TreeNode {
  id: string;
  label: string;
  path?: string;
  icon?: React.ReactNode;
  children?: TreeNode[];
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['data-management', 'reports', 'dashboards']));

  const treeData: TreeNode[] = [
    {
      id: 'home',
      label: 'Dashboard',
      path: '/',
      icon: <Home className="w-4 h-4" />,
    },
    {
      id: 'data-management',
      label: 'Data Management',
      icon: <FolderTree className="w-4 h-4" />,
      children: [
        {
          id: 'accounts',
          label: 'Accounts',
          path: '/accounts',
          icon: <Building2 className="w-4 h-4" />,
        },
        {
          id: 'transactions',
          label: 'Transactions',
          path: '/transactions',
          icon: <FileText className="w-4 h-4" />,
        },
        {
          id: 'invoices',
          label: 'Invoices',
          path: '/invoices',
          icon: <FileText className="w-4 h-4" />,
        },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: <BarChart3 className="w-4 h-4" />,
      children: [
        {
          id: 'financial-report',
          label: 'Financial Report',
          path: '/reports/financial',
        },
        {
          id: 'analytics-report',
          label: 'Analytics Report',
          path: '/reports/analytics',
        },
      ],
    },
    {
      id: 'dashboards',
      label: 'Dashboards',
      icon: <LayoutDashboard className="w-4 h-4" />,
      children: [
        {
          id: 'budget-dashboard',
          label: 'Budget Overview',
          path: '/dashboards/budget',
        },
        {
          id: 'cashflow-dashboard',
          label: 'Cash Flow',
          path: '/dashboards/cashflow',
        },
      ],
    },
  ];

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const renderTreeNode = (node: TreeNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300 ${
            level > 0 ? 'pl-' + (level * 4 + 4) : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 16}px` }}
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
              {isExpanded ? (
                <ChevronRight className="w-4 h-4 rotate-90 transition-transform" />
              ) : (
                <ChevronRight className="w-4 h-4 transition-transform" />
              )}
            </span>
          )}
          {!hasChildren && <span className="w-4" />}
          {node.icon && <span className="flex-shrink-0">{node.icon}</span>}
          {!collapsed && <span className="text-sm truncate">{node.label}</span>}
        </div>
        {hasChildren && isExpanded && !collapsed && (
          <div>
            {node.children!.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 ${
      collapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Logo Area */}
      <div className="h-16 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white font-bold">F</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">FinanceSaaS</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center mx-auto">
            <span className="text-white font-bold">F</span>
          </div>
        )}
      </div>

      {/* Tree Navigation */}
      <div className="flex-1 overflow-y-auto py-2">
        {treeData.map(node => renderTreeNode(node))}
      </div>

      {/* Toggle Button */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
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