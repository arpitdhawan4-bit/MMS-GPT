import { useLocation, Link } from 'react-router';
import { ChevronRight, Home } from 'lucide-react';

const routeLabels: Record<string, string> = {
  '': 'Dashboard',
  'accounts': 'Accounts',
  'transactions': 'Transactions',
  'invoices': 'Invoices',
  'reports': 'Reports',
  'financial': 'Financial Report',
  'analytics': 'Analytics Report',
  'dashboards': 'Dashboards',
  'budget': 'Budget Overview',
  'cashflow': 'Cash Flow',
};

export function Breadcrumbs() {
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean);

  const breadcrumbs = pathSegments.map((segment, index) => {
    const path = '/' + pathSegments.slice(0, index + 1).join('/');
    const label = routeLabels[segment] || segment;
    return { path, label };
  });

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/" className="flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
          <Home className="w-4 h-4" />
        </Link>
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.path} className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-600" />
            {index === breadcrumbs.length - 1 ? (
              <span className="text-gray-900 dark:text-gray-100 font-medium">{crumb.label}</span>
            ) : (
              <Link to={crumb.path} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                {crumb.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}