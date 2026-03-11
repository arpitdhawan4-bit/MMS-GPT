import { useState, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Plus, Download, Filter } from 'lucide-react';
import { useTheme } from 'next-themes';

interface Transaction {
  id: number;
  transactionId: string;
  date: string;
  description: string;
  category: string;
  account: string;
  debit: number | null;
  credit: number | null;
  balance: number;
  status: string;
}

export function TransactionsPage() {
  const { theme } = useTheme();
  const [rowData] = useState<Transaction[]>([
    { id: 1, transactionId: 'TXN-001', date: '2026-03-10', description: 'Client Payment - ABC Corp', category: 'Income', account: 'ACC-001', debit: null, credit: 15000, balance: 140000, status: 'Completed' },
    { id: 2, transactionId: 'TXN-002', date: '2026-03-09', description: 'Office Rent Payment', category: 'Expense', account: 'ACC-001', debit: 5000, credit: null, balance: 125000, status: 'Completed' },
    { id: 3, transactionId: 'TXN-003', date: '2026-03-08', description: 'Salary Payment - March', category: 'Payroll', account: 'ACC-003', debit: 45000, credit: null, balance: 85000, status: 'Completed' },
    { id: 4, transactionId: 'TXN-004', date: '2026-03-07', description: 'Software Subscription', category: 'Expense', account: 'ACC-001', debit: 299, credit: null, balance: 130000, status: 'Completed' },
    { id: 5, transactionId: 'TXN-005', date: '2026-03-06', description: 'Investment Return', category: 'Income', account: 'ACC-004', debit: null, credit: 8500, balance: 508500, status: 'Completed' },
    { id: 6, transactionId: 'TXN-006', date: '2026-03-05', description: 'Tax Payment - Q1', category: 'Tax', account: 'ACC-005', debit: 12000, credit: null, balance: 150000, status: 'Completed' },
    { id: 7, transactionId: 'TXN-007', date: '2026-03-04', description: 'Client Payment - XYZ Ltd', category: 'Income', account: 'ACC-001', debit: null, credit: 22000, balance: 130299, status: 'Completed' },
    { id: 8, transactionId: 'TXN-008', date: '2026-03-03', description: 'Equipment Purchase', category: 'Asset', account: 'ACC-001', debit: 3500, credit: null, balance: 108299, status: 'Pending' },
  ]);

  const columnDefs: ColDef<Transaction>[] = useMemo(() => [
    { 
      field: 'transactionId', 
      headerName: 'Transaction ID',
      filter: true,
      checkboxSelection: true,
      headerCheckboxSelection: true,
    },
    { 
      field: 'date', 
      headerName: 'Date',
      filter: 'agDateColumnFilter',
      sort: 'desc',
    },
    { 
      field: 'description', 
      headerName: 'Description',
      filter: true,
      editable: true,
      flex: 2,
    },
    { 
      field: 'category', 
      headerName: 'Category',
      filter: true,
      editable: true,
    },
    { 
      field: 'account', 
      headerName: 'Account',
      filter: true,
    },
    { 
      field: 'debit', 
      headerName: 'Debit',
      filter: 'agNumberColumnFilter',
      editable: true,
      valueFormatter: (params) => {
        return params.value != null ? `$${params.value.toLocaleString()}` : '-';
      },
      cellStyle: { color: 'red' },
    },
    { 
      field: 'credit', 
      headerName: 'Credit',
      filter: 'agNumberColumnFilter',
      editable: true,
      valueFormatter: (params) => {
        return params.value != null ? `$${params.value.toLocaleString()}` : '-';
      },
      cellStyle: { color: 'green' },
    },
    { 
      field: 'balance', 
      headerName: 'Balance',
      filter: 'agNumberColumnFilter',
      valueFormatter: (params) => {
        return params.value != null ? `$${params.value.toLocaleString()}` : '';
      },
    },
    { 
      field: 'status', 
      headerName: 'Status',
      filter: true,
      cellStyle: (params) => {
        if (params.value === 'Completed') {
          return { color: 'green', fontWeight: '500' };
        } else if (params.value === 'Pending') {
          return { color: 'orange', fontWeight: '500' };
        }
        return null;
      },
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
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Transactions</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">View and manage all transactions</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Filter className="w-4 h-4" />
            Filter
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" />
            New Transaction
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