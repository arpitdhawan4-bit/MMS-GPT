interface Props {
  columns: string[];
  rows: string[][];
}

export default function ResultTable({ columns, rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-700 bg-gray-900 px-6 py-8 text-center text-gray-500 text-sm">
        Query returned 0 rows.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2">
        <span className="text-xs font-semibold text-gray-300">
          Results
        </span>
        <span className="text-xs text-gray-500">
          {rows.length} row{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 border-b border-gray-700">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-4 py-2.5 text-left font-semibold text-gray-300 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={ri % 2 === 0 ? "bg-gray-900" : "bg-gray-950"}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-4 py-2.5 text-gray-200 border-b border-gray-800 whitespace-nowrap font-mono text-xs"
                  >
                    {cell ?? <span className="text-gray-600 italic">null</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
