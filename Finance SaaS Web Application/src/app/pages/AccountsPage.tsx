import { useState, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';

interface Account {
  id: number;
  accountNumber: string;
  accountName: string;
  accountType: string;
  balance: number;
  currency: string;
  status: string;
  createdDate: string;
}

export function AccountsPage() {
  const { theme } = useTheme();
  const [rowData] = useState<Account[]>([
    { id: 1, accountNumber: 'ACC-001', accountName: 'Operating Account', accountType: 'Checking', balance: 125000, currency: 'USD', status: 'Active', createdDate: '2024-01-15' },
    { id: 2, accountNumber: 'ACC-002', accountName: 'Savings Reserve', accountType: 'Savings', balance: 350000, currency: 'USD', status: 'Active', createdDate: '2024-01-20' },
    { id: 3, accountNumber: 'ACC-003', accountName: 'Payroll Account', accountType: 'Checking', balance: 85000, currency: 'USD', status: 'Active', createdDate: '2024-02-01' },
    { id: 4, accountNumber: 'ACC-004', accountName: 'Investment Fund', accountType: 'Investment', balance: 500000, currency: 'USD', status: 'Active', createdDate: '2024-02-10' },
    { id: 5, accountNumber: 'ACC-005', accountName: 'Tax Reserve', accountType: 'Savings', balance: 150000, currency: 'USD', status: 'Active', createdDate: '2024-02-15' },
    { id: 6, accountNumber: 'ACC-006', accountName: 'Emergency Fund', accountType: 'Savings', balance: 200000, currency: 'USD', status: 'Active', createdDate: '2024-03-01' },
  ]);

  const columnDefs: ColDef<Account>[] = useMemo(() => [
    { 
      field: 'accountNumber', 
      headerName: 'Account Number',
      filter: true,
      checkboxSelection: true,
      headerCheckboxSelection: true,
    },
    { 
      field: 'accountName', 
      headerName: 'Account Name',
      filter: true,
      editable: true,
    },
    { 
      field: 'accountType', 
      headerName: 'Type',
      filter: true,
      editable: true,
    },
    { 
      field: 'balance', 
      headerName: 'Balance',
      filter: 'agNumberColumnFilter',
      editable: true,
      valueFormatter: (params) => {
        return params.value != null ? `$${params.value.toLocaleString()}` : '';
      },
    },
    { 
      field: 'currency', 
      headerName: 'Currency',
      filter: true,
    },
    { 
      field: 'status', 
      headerName: 'Status',
      filter: true,
      cellStyle: (params) => {
        if (params.value === 'Active') {
          return { color: 'green', fontWeight: '500' };
        }
        return { color: 'red', fontWeight: '500' };
      },
    },
    { 
      field: 'createdDate', 
      headerName: 'Created Date',
      filter: 'agDateColumnFilter',
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    flex: 1,
  }), []);

  const onCellValueChanged = useCallback((event: any) => {
    console.log('Cell value changed:', event);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Accounts</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your financial accounts</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" />
            New Account
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Edit className="w-4 h-4" />
            Edit
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className={theme === 'dark' ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'} style={{ height: '600px', width: '100%' }}>
          <AgGridReact
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            rowSelection="multiple"
            animateRows={true}
            pagination={true}
            paginationPageSize={10}
            onCellValueChanged={onCellValueChanged}
          />
        </div>
      </div>
    </div>
  );
}