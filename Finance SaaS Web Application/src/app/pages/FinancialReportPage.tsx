import { useState, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Download, Calendar } from 'lucide-react';
import { useTheme } from 'next-themes';

interface FinancialReportData {
  category: string;
  january: number;
  february: number;
  march: number;
  q1Total: number;
  percentage: number;
}

export function FinancialReportPage() {
  const { theme } = useTheme();
  const [rowData] = useState<FinancialReportData[]>([
    { category: 'Revenue', january: 125000, february: 138000, march: 145000, q1Total: 408000, percentage: 100 },
    { category: 'Cost of Goods Sold', january: 45000, february: 48000, march: 52000, q1Total: 145000, percentage: 35.5 },
    { category: 'Gross Profit', january: 80000, february: 90000, march: 93000, q1Total: 263000, percentage: 64.5 },
    { category: 'Operating Expenses', january: 35000, february: 36000, march: 38000, q1Total: 109000, percentage: 26.7 },
    { category: 'Salaries & Wages', january: 45000, february: 45000, march: 45000, q1Total: 135000, percentage: 33.1 },
    { category: 'Marketing', january: 8000, february: 9000, march: 12000, q1Total: 29000, percentage: 7.1 },
    { category: 'Utilities', january: 3000, february: 3200, march: 3500, q1Total: 9700, percentage: 2.4 },
    { category: 'Insurance', january: 2500, february: 2500, march: 2500, q1Total: 7500, percentage: 1.8 },
    { category: 'Net Income', january: -13500, february: -5700, march: -8000, q1Total: -27200, percentage: -6.7 },
  ]);

  const columnDefs: ColDef<FinancialReportData>[] = useMemo(() => [
    { 
      field: 'category', 
      headerName: 'Category',
      filter: true,
      pinned: 'left',
      flex: 1.5,
      cellStyle: (params) => {
        if (['Revenue', 'Gross Profit', 'Net Income'].includes(params.value)) {
          return { fontWeight: 'bold', backgroundColor: '#f9fafb' };
        }
        return null;
      },
    },
    { 
      field: 'january', 
      headerName: 'January',
      filter: 'agNumberColumnFilter',
      valueFormatter: (params) => {
        return params.value != null ? `$${params.value.toLocaleString()}` : '';
      },
      cellStyle: (params) => {
        if (params.value < 0) {
          return { color: 'red' };
        }
        return null;
      },
    },
    { 
      field: 'february', 
      headerName: 'February',
      filter: 'agNumberColumnFilter',
      valueFormatter: (params) => {
        return params.value != null ? `$${params.value.toLocaleString()}` : '';
      },
      cellStyle: (params) => {
        if (params.value < 0) {
          return { color: 'red' };
        }
        return null;
      },
    },
    { 
      field: 'march', 
      headerName: 'March',
      filter: 'agNumberColumnFilter',
      valueFormatter: (params) => {
        return params.value != null ? `$${params.value.toLocaleString()}` : '';
      },
      cellStyle: (params) => {
        if (params.value < 0) {
          return { color: 'red' };
        }
        return null;
      },
    },
    { 
      field: 'q1Total', 
      headerName: 'Q1 Total',
      filter: 'agNumberColumnFilter',
      valueFormatter: (params) => {
        return params.value != null ? `$${params.value.toLocaleString()}` : '';
      },
      cellStyle: (params) => {
        const style: any = { fontWeight: '600' };
        if (params.value < 0) {
          style.color = 'red';
        }
        return style;
      },
    },
    { 
      field: 'percentage', 
      headerName: '% of Revenue',
      filter: 'agNumberColumnFilter',
      valueFormatter: (params) => {
        return params.value != null ? `${params.value.toFixed(1)}%` : '';
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
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Financial Report</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Q1 2026 Income Statement</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Calendar className="w-4 h-4" />
            Change Period
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Download className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-sm text-gray-600 dark:text-gray-400">Total Revenue</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">$408,000</p>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">+16% from Q4</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-sm text-gray-600 dark:text-gray-400">Gross Profit</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">$263,000</p>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">64.5% margin</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-sm text-gray-600 dark:text-gray-400">Net Income</h3>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">-$27,200</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">-6.7% of revenue</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className={theme === 'dark' ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'} style={{ height: '600px', width: '100%' }}>
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