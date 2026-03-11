import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, TrendingUp, AlertCircle } from 'lucide-react';

export function BudgetDashboard() {
  const budgetData = [
    { category: 'Salaries', budgeted: 150000, actual: 145000, variance: 5000 },
    { category: 'Marketing', budgeted: 35000, actual: 42000, variance: -7000 },
    { category: 'Operations', budgeted: 45000, actual: 48000, variance: -3000 },
    { category: 'Technology', budgeted: 25000, actual: 22000, variance: 3000 },
    { category: 'Facilities', budgeted: 20000, actual: 19500, variance: 500 },
    { category: 'Travel', budgeted: 15000, actual: 12000, variance: 3000 },
  ];

  const expenseBreakdown = [
    { name: 'Salaries', value: 145000, color: '#3b82f6' },
    { name: 'Marketing', value: 42000, color: '#10b981' },
    { name: 'Operations', value: 48000, color: '#f59e0b' },
    { name: 'Technology', value: 22000, color: '#8b5cf6' },
    { name: 'Facilities', value: 19500, color: '#ef4444' },
    { name: 'Travel', value: 12000, color: '#ec4899' },
  ];

  const totalBudgeted = budgetData.reduce((sum, item) => sum + item.budgeted, 0);
  const totalActual = budgetData.reduce((sum, item) => sum + item.actual, 0);
  const totalVariance = totalBudgeted - totalActual;
  const variancePercentage = ((totalVariance / totalBudgeted) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Budget Overview</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Track budget vs actual spending</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-100 text-blue-600 p-3 rounded-lg">
              <DollarSign className="w-6 h-6" />
            </div>
            <h3 className="text-sm text-gray-600 dark:text-gray-400">Total Budgeted</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">${totalBudgeted.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-green-100 text-green-600 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-sm text-gray-600 dark:text-gray-400">Total Actual</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">${totalActual.toLocaleString()}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{((totalActual / totalBudgeted) * 100).toFixed(1)}% of budget</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`${totalVariance >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'} p-3 rounded-lg`}>
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm text-gray-600 dark:text-gray-400">Variance</h3>
          </div>
          <p className={`text-2xl font-bold ${totalVariance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {totalVariance >= 0 ? '+' : ''}${totalVariance.toLocaleString()}
          </p>
          <p className={`text-sm ${totalVariance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} mt-1`}>
            {totalVariance >= 0 ? '+' : ''}{variancePercentage}% from budget
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget vs Actual Bar Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Budget vs Actual by Category</h2>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={budgetData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip 
                formatter={(value: any) => `$${value.toLocaleString()}`}
              />
              <Legend />
              <Bar dataKey="budgeted" fill="#3b82f6" name="Budgeted" />
              <Bar dataKey="actual" fill="#10b981" name="Actual" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Expense Breakdown Pie Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Expense Breakdown</h2>
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie
                data={expenseBreakdown}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${((entry.value / totalActual) * 100).toFixed(1)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {expenseBreakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => `$${value.toLocaleString()}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Detailed Budget Analysis</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Budgeted</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actual</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Variance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">% of Budget</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {budgetData.map((item) => {
                const percentage = ((item.actual / item.budgeted) * 100).toFixed(1);
                const isOverBudget = item.actual > item.budgeted;
                
                return (
                  <tr key={item.category}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.category}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${item.budgeted.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${item.actual.toLocaleString()}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${item.variance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {item.variance >= 0 ? '+' : ''}${item.variance.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">{percentage}%</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        isOverBudget ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      }`}>
                        {isOverBudget ? 'Over Budget' : 'On Track'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}