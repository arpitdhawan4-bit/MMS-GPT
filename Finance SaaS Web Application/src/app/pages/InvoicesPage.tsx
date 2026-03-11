import { useState, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Plus, Send, Eye } from 'lucide-react';
import { useTheme } from 'next-themes';

interface Invoice {
  id: number;
  invoiceNumber: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  status: string;
  paymentMethod: string;
}

export function InvoicesPage() {
  const { theme } = useTheme();
  const [rowData] = useState<Invoice[]>([
    { id: 1, invoiceNumber: 'INV-2026-001', clientName: 'ABC Corporation', issueDate: '2026-03-01', dueDate: '2026-03-31', amount: 15000, status: 'Paid', paymentMethod: 'Bank Transfer' },
    { id: 2, invoiceNumber: 'INV-2026-002', clientName: 'XYZ Limited', issueDate: '2026-03-02', dueDate: '2026-04-01', amount: 22000, status: 'Pending', paymentMethod: 'Check' },
    { id: 3, invoiceNumber: 'INV-2026-003', clientName: 'Tech Solutions Inc', issueDate: '2026-03-03', dueDate: '2026-04-02', amount: 8500, status: 'Overdue', paymentMethod: 'Bank Transfer' },
    { id: 4, invoiceNumber: 'INV-2026-004', clientName: 'Global Enterprises', issueDate: '2026-03-05', dueDate: '2026-04-04', amount: 31000, status: 'Paid', paymentMethod: 'Wire Transfer' },
    { id: 5, invoiceNumber: 'INV-2026-005', clientName: 'Startup Ventures', issueDate: '2026-03-07', dueDate: '2026-04-06', amount: 12500, status: 'Pending', paymentMethod: 'Credit Card' },
    { id: 6, invoiceNumber: 'INV-2026-006', clientName: 'Prime Industries', issueDate: '2026-03-08', dueDate: '2026-04-07', amount: 19800, status: 'Sent', paymentMethod: 'Bank Transfer' },
    { id: 7, invoiceNumber: 'INV-2026-007', clientName: 'Metro Services', issueDate: '2026-03-10', dueDate: '2026-04-09', amount: 7200, status: 'Draft', paymentMethod: 'Check' },
  ]);

  const columnDefs: ColDef<Invoice>[] = useMemo(() => [
    { 
      field: 'invoiceNumber', 
      headerName: 'Invoice #',
      filter: true,
      checkboxSelection: true,
      headerCheckboxSelection: true,
    },
    { 
      field: 'clientName', 
      headerName: 'Client Name',
      filter: true,
      editable: true,
      flex: 1.5,
    },
    { 
      field: 'issueDate', 
      headerName: 'Issue Date',
      filter: 'agDateColumnFilter',
    },
    { 
      field: 'dueDate', 
      headerName: 'Due Date',
      filter: 'agDateColumnFilter',
    },
    { 
      field: 'amount', 
      headerName: 'Amount',
      filter: 'agNumberColumnFilter',
      editable: true,
      valueFormatter: (params) => {
        return params.value != null ? `$${params.value.toLocaleString()}` : '';
      },
    },
    { 
      field: 'status', 
      headerName: 'Status',
      filter: true,
      cellStyle: (params) => {
        switch (params.value) {
          case 'Paid':
            return { color: 'green', fontWeight: '500' };
          case 'Pending':
          case 'Sent':
            return { color: 'orange', fontWeight: '500' };
          case 'Overdue':
            return { color: 'red', fontWeight: '500' };
          case 'Draft':
            return { color: 'gray', fontWeight: '500' };
          default:
            return null;
        }
      },
    },
    { 
      field: 'paymentMethod', 
      headerName: 'Payment Method',
      filter: true,
      editable: true,
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
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Invoices</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Create and manage invoices</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Eye className="w-4 h-4" />
            Preview
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Send className="w-4 h-4" />
            Send
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" />
            New Invoice
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