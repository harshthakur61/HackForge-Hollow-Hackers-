import React from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import Skeleton from "./Skeleton";
import EmptyState from "./EmptyState";

export interface Column<T> {
  id: string;
  label: string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  width?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (columnId: string) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  sortColumn,
  sortDirection,
  onSort,
  isLoading = false,
  emptyMessage = "No records found.",
  onRowClick,
  selectedKey,
  className = "",
}: DataTableProps<T>) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Data Table container"
      className={`w-full overflow-x-auto border border-border-subtle rounded-md bg-surface focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary ${className}`}
    >
      <table className="w-full text-left text-xs text-text-primary border-collapse">
        <thead className="bg-subtle/80 text-text-secondary uppercase text-2xs tracking-wider sticky top-0 z-10 border-b border-border-subtle">
          <tr>
            {columns.map((col) => {
              const isSorted = sortColumn === col.id;
              const alignClass =
                col.align === "right"
                  ? "text-right"
                  : col.align === "center"
                  ? "text-center"
                  : "text-left";

              return (
                <th
                  key={col.id}
                  scope="col"
                  style={{ width: col.width }}
                  aria-sort={
                    isSorted
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={`px-3.5 py-2.5 font-semibold whitespace-nowrap ${alignClass}`}
                >
                  {col.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.id)}
                      className="inline-flex items-center gap-1 hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary rounded-xs"
                    >
                      <span>{col.label}</span>
                      {isSorted ? (
                        sortDirection === "asc" ? (
                          <ChevronUp className="w-3.5 h-3.5 text-accent-primary" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-accent-primary" aria-hidden="true" />
                        )
                      ) : (
                        <ChevronsUpDown className="w-3 h-3 text-text-muted" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    <span>{col.label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, rIdx) => (
              <tr key={`skel-${rIdx}`}>
                {columns.map((col) => (
                  <td key={col.id} className="px-3.5 py-3">
                    <Skeleton height={16} />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8">
                <EmptyState
                  title="No data available"
                  description={emptyMessage}
                />
              </td>
            </tr>
          ) : (
            data.map((row, index) => {
              const key = keyExtractor(row, index);
              const isSelected = selectedKey === key;

              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onRowClick(row);
                    }
                  }}
                  className={`transition-colors duration-100 ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${
                    isSelected
                      ? "bg-accent-subtle/40 hover:bg-accent-subtle/60"
                      : "hover:bg-subtle/50"
                  }`}
                >
                  {columns.map((col) => {
                    const alignClass =
                      col.align === "right"
                        ? "text-right tabular-nums"
                        : col.align === "center"
                        ? "text-center"
                        : "text-left";

                    return (
                      <td
                        key={col.id}
                        className={`px-3.5 py-2.5 whitespace-nowrap text-text-primary ${alignClass}`}
                      >
                        {col.render ? col.render(row, index) : row[col.id] ?? "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
