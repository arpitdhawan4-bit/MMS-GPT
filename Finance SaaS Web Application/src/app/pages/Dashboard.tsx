import { TrendingUp, DollarSign, Users, FileText } from 'lucide-react';

export function Dashboard() {
  const stats = [
    {
      label: 'Total Revenue',
      value: '$1,245,680',
      change: '+12.5%',
      icon: <DollarSign className="w-6 h-6" />,
      color: 'bg-green-100 text-green-600',
    },
    {
      label: 'Active Accounts',
      value: '2,847',
      change: '+8.2%',
      icon: <Users className="w-6 h-6" />,
      color: 'bg-blue-100 text-blue-600',
    },
    {
      label: 'Pending Invoices',
      value: '156',
      change: '-3.1%',
      icon: <FileText className="w-6 h-6" />,
      color: 'bg-orange-100 text-orange-600',
    },
    {
      label: 'Growth Rate',
      value: '24.3%',
      change: '+5.4%',
      icon: <TrendingUp className="w-6 h-6" />,
      color: 'bg-purple-100 text-purple-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Welcome to your finance overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`${stat.color} p-3 rounded-lg`}>
                {stat.icon}
              </div>
              <span className={`text-sm font-medium ${
                stat.change.startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {stat.change}
              </span>
            </div>
            <h3 className="text-gray-600 dark:text-gray-400 text-sm">{stat.label}</h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left">
            <h3 className="font-medium text-gray-900 dark:text-white">Create Invoice</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Generate a new invoice</p>
          </button>
          <button className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left">
            <h3 className="font-medium text-gray-900 dark:text-white">Add Transaction</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Record a new transaction</p>
          </button>
          <button className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left">
            <h3 className="font-medium text-gray-900 dark:text-white">View Reports</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Access financial reports</p>
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h2>
        <div className="space-y-3">
          {[
            { action: 'New transaction added', time: '5 minutes ago', user: 'John Doe' },
            { action: 'Invoice #1234 paid', time: '1 hour ago', user: 'Jane Smith' },
            { action: 'Budget report generated', time: '2 hours ago', user: 'System' },
            { action: 'Account created', time: '3 hours ago', user: 'Mike Johnson' },
          ].map((activity, index) => (
            <div key={index} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{activity.action}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">by {activity.user}</p>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">{activity.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}