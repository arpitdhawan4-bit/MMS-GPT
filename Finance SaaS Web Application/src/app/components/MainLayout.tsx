import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Sidebar } from './Sidebar';
import { Breadcrumbs } from './Breadcrumbs';
import { AskAIButton } from './AskAIButton';
import { ThemeToggle } from './ThemeToggle';
import { X } from 'lucide-react';

export interface Tab {
  id: string;
  label: string;
  path: string;
}

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([{ id: 'home', label: 'Dashboard', path: '/' }]);
  const [activeTabId, setActiveTabId] = useState('home');
  const location = useLocation();
  const navigate = useNavigate();

  // Sync active tab with current route
  useEffect(() => {
    const currentTab = tabs.find(tab => tab.path === location.pathname);
    if (currentTab) {
      setActiveTabId(currentTab.id);
    }
  }, [location.pathname, tabs]);

  const handleNavigate = (path: string, label: string) => {
    const existingTab = tabs.find(tab => tab.path === path);
    
    if (existingTab) {
      setActiveTabId(existingTab.id);
      navigate(path);
    } else {
      const newTab: Tab = {
        id: `tab-${Date.now()}`,
        label,
        path,
      };
      setTabs([...tabs, newTab]);
      setActiveTabId(newTab.id);
      navigate(path);
    }
  };

  const handleTabClick = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      navigate(tab.path);
    }
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    const newTabs = tabs.filter(t => t.id !== tabId);
    
    if (newTabs.length === 0) {
      return;
    }
    
    setTabs(newTabs);
    
    if (activeTabId === tabId) {
      const newActiveTab = newTabs[Math.max(0, tabIndex - 1)];
      setActiveTabId(newActiveTab.id);
      navigate(newActiveTab.path);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onNavigate={handleNavigate}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-r border-gray-200 dark:border-gray-700 cursor-pointer transition-colors ${
                activeTabId === tab.id
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-b-2 border-b-blue-600'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-sm whitespace-nowrap text-gray-900 dark:text-gray-100">{tab.label}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="hover:bg-gray-200 dark:hover:bg-gray-600 rounded p-0.5"
                >
                  <X className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                </button>
              )}
            </div>
          ))}
          <div className="ml-auto p-2">
            <ThemeToggle />
          </div>
        </div>

        {/* Breadcrumbs */}
        <Breadcrumbs />

        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </div>

      <AskAIButton />
    </div>
  );
}