import { useState, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { TrendingUp, Download } from 'lucide-react';
import { useTheme } from 'next-themes';

interface AnalyticsData {
  metric: string;
  current: number;
  previous: number;
  change: number;
  trend: string;
  target: number;
  achievement: number;
}

export function AnalyticsReportPage() {
  const { theme } = useTheme();
  const [rowData] = useState<AnalyticsData[]>([
    { metric: 'Customer Acquisition', current: 234, previous: 198, change: 18.2, trend: 'up', target: 250, achievement: 93.6 },
    { metric: 'Average Transaction Value', current: 1847, previous: 1652, change: 11.8, trend: 'up', target: 2000, achievement: 92.4 },
    { metric: 'Monthly Recurring Revenue', current: 125000, previous: 118000, change: 5.9, trend: 'up', target: 150000, achievement: 83.3 },
    { metric: 'Customer Retention Rate', current: 94.5, previous: 92.3, change: 2.4, trend: 'up', target: 95, achievement: 99.5 },
    { metric: 'Operating Margin', current: 15.2, previous: 13.8, change: 10.1, trend: 'up', target: 20, achievement: 76.0 },
    { metric: 'Payment Collection Time', current: 28, previous: 35, change: -20.0, trend: 'down', target: 25, achievement: 112.0 },
    { metric: 'Invoice Processing Time', current: 2.5, previous: 3.2, change: -21.9, trend: 'down', target: 2, achievement: 125.0 },
    { metric: 'Expense Ratio', current: 68.5, previous: 72.1, change: -5.0, trend: 'down', target: 65, achievement: 105.4 },
  ]);

  const columnDefs: ColDef<AnalyticsData>[] = useMemo(() => [
    { 
      field: 'metric', 
      headerName: 'Metric',
      filter: true,
      pinned: 'left',
      flex: 1.5,
      cellStyle: { fontWeight: '500' },
    },
    { 
      field: 'current', 
      headerName: 'Current Value',
      filter: 'agNumberColumnFilter',
      valueFormatter: (params) => {
        const metric = params.data?.metric;
        if (metric?.includes('Rate') || metric?.includes('Margin') || metric?.includes('Ratio')) {
          return `${params.value}%`;
        } else if (metric?.includes('Revenue') || metric?.includes('Value')) {
          return `$${params.value.toLocaleString()}`;
        } else if (metric?.includes('Time')) {
          return `${params.value} days`;
        }
        return params.value.toLocaleString();
      },
    },
    { 
      field: 'previous', 
      headerName: 'Previous Period',
      filter: 'agNumberColumnFilter',
      valueFormatter: (params) => {
        const metric = params.data?.metric;
        if (metric?.includes('Rate') || metric?.includes('Margin') || metric?.includes('Ratio')) {
          return `${params.value}%`;
        } else if (metric?.includes('Revenue') || metric?.includes('Value')) {
          return `$${params.value.toLocaleString()}`;
        } else if (metric?.includes('Time')) {
          return `${params.value} days`;
        }
        return params.value.toLocaleString();
      },
    },
    { 
      field: 'change', 
      headerName: 'Change %',
      filter: 'agNumberColumnFilter',
      valueFormatter: (params) => {
        const sign = params.value >= 0 ? '+' : '';
        return `${sign}${params.value.toFixed(1)}%`;
      },
      cellStyle: (params) => {
        const trend = params.data?.trend;
        const value = params.value;
        
        if ((trend === 'up' && value > 0) || (trend === 'down' && value < 0)) {
          return { color: 'green', fontWeight: '600' };
        } else if ((trend === 'up' && value < 0) || (trend === 'down' && value > 0)) {
          return { color: 'red', fontWeight: '600' };
        }
        return { fontWeight: '600' };
      },
    },
    { 
      field: 'target', 
      headerName: 'Target',
      filter: 'agNumberColumnFilter',
      valueFormatter: (params) => {
        const metric = params.data?.metric;
        if (metric?.includes('Rate') || metric?.includes('Margin') || metric?.includes('Ratio')) {
          return `${params.value}%`;
        } else if (metric?.includes('Revenue') || metric?.includes('Value')) {
          return `$${params.value.toLocaleString()}`;
        } else if (metric?.includes('Time')) {
          return `${params.value} days`;
        }
        return params.value.toLocaleString();
      },
    },
    { 
      field: 'achievement', 
      headerName: 'Target Achievement',
      filter: 'agNumberColumnFilter',
      valueFormatter: (params) => {
        return `${params.value.toFixed(1)}%`;
      },
      cellStyle: (params) => {
        if (params.value >= 100) {
          return { color: 'green', fontWeight: '600' };
        } else if (params.value >= 80) {
          return { color: 'orange', fontWeight: '600' };
        }
        return { color: 'red', fontWeight: '600' };
      },
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    flex: 1,
  }), []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Analytics Report</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Key performance indicators and trends</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm text-gray-600 dark:text-gray-400">Revenue Growth</h3>
            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">+5.9%</p>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">Above target</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm text-gray-600 dark:text-gray-400">Customer Retention</h3>
            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">94.5%</p>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">+2.4% increase</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm text-gray-600 dark:text-gray-400">New Customers</h3>
            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">234</p>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">+18.2% growth</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm text-gray-600 dark:text-gray-400">Avg Transaction</h3>
            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">$1,847</p>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">+11.8% increase</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className={theme === 'dark' ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'} style={{ height: '500px', width: '100%' }}>
          <AgGridReact
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            animateRows={true}
          />
        </div>
      </div>
    </div>
  );
}