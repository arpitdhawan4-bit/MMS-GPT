import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react';

export function CashFlowDashboard() {
  const cashFlowData = [
    { month: 'Sep', inflow: 145000, outflow: 132000, net: 13000 },
    { month: 'Oct', inflow: 158000, outflow: 125000, net: 33000 },
    { month: 'Nov', inflow: 142000, outflow: 138000, net: 4000 },
    { month: 'Dec', inflow: 175000, outflow: 145000, net: 30000 },
    { month: 'Jan', inflow: 168000, outflow: 152000, net: 16000 },
    { month: 'Feb', inflow: 182000, outflow: 148000, net: 34000 },
    { month: 'Mar', inflow: 195000, outflow: 155000, net: 40000 },
  ];

  const cumulativeData = cashFlowData.map((item, index) => {
    const cumulative = cashFlowData
      .slice(0, index + 1)
      .reduce((sum, d) => sum + d.net, 0);
    return {
      ...item,
      cumulative,
    };
  });

  const currentMonth = cashFlowData[cashFlowData.length - 1];
  const previousMonth = cashFlowData[cashFlowData.length - 2];
  const cashFlowTrend = currentMonth.net > previousMonth.net ? 'up' : 'down';
  const cashFlowChange = ((currentMonth.net - previousMonth.net) / previousMonth.net * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Cash Flow Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Monitor cash inflows and outflows</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-green-100 text-green-600 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-sm text-gray-600 dark:text-gray-400">Total Inflow (Mar)</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">${currentMonth.inflow.toLocaleString()}</p>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">+7.1% from Feb</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-red-100 text-red-600 p-3 rounded-lg">
              <TrendingDown className="w-6 h-6" />
            </div>
            <h3 className="text-sm text-gray-600 dark:text-gray-400">Total Outflow (Mar)</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">${currentMonth.outflow.toLocaleString()}</p>
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">+4.7% from Feb</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`${cashFlowTrend === 'up' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'} p-3 rounded-lg`}>
              <DollarSign className="w-6 h-6" />
            </div>
            <h3 className="text-sm text-gray-600 dark:text-gray-400">Net Cash Flow</h3>
          </div>
          <p className={`text-2xl font-bold ${cashFlowTrend === 'up' ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
            ${currentMonth.net.toLocaleString()}
          </p>
          <p className={`text-sm ${cashFlowTrend === 'up' ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'} mt-1`}>
            {cashFlowTrend === 'up' ? '+' : ''}{cashFlowChange}% from Feb
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-100 text-blue-600 p-3 rounded-lg">
              <Activity className="w-6 h-6" />
            </div>
            <h3 className="text-sm text-gray-600 dark:text-gray-400">Cumulative Balance</h3>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            ${cumulativeData[cumulativeData.length - 1].cumulative.toLocaleString()}
          </p>
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">Last 7 months</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6">
        {/* Cash Flow Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cash Flow Trend</h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={cashFlowData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip 
                formatter={(value: any) => `$${value.toLocaleString()}`}
              />
              <Legend />
              <Line type="monotone" dataKey="inflow" stroke="#10b981" name="Inflow" strokeWidth={2} />
              <Line type="monotone" dataKey="outflow" stroke="#ef4444" name="Outflow" strokeWidth={2} />
              <Line type="monotone" dataKey="net" stroke="#3b82f6" name="Net Cash Flow" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cumulative Cash Flow */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cumulative Cash Flow</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={cumulativeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip 
                formatter={(value: any) => `$${value.toLocaleString()}`}
              />
              <Area type="monotone" dataKey="cumulative" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Cumulative Balance" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Details */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Monthly Cash Flow Details</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Month</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Cash Inflow</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Cash Outflow</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Net Cash Flow</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Operating Ratio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {cashFlowData.map((item) => {
                const ratio = ((item.outflow / item.inflow) * 100).toFixed(1);
                const isHealthy = item.net > 0;
                
                return (
                  <tr key={item.month}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.month} 2026</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 dark:text-green-400 font-medium">${item.inflow.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 dark:text-red-400 font-medium">${item.outflow.toLocaleString()}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${isHealthy ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      ${item.net.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">{ratio}%</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        isHealthy ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {isHealthy ? 'Positive' : 'Negative'}
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