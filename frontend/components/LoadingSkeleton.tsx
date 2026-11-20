import React from 'react';

interface LoadingSkeletonProps {
  rows?: number;
}

export const TableSkeleton: React.FC<LoadingSkeletonProps> = ({ rows = 5 }) => {
  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-800" aria-busy="true" aria-label="Loading records">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="flex items-center gap-4 px-4 py-3.5 animate-pulse">
          <div className="h-4 w-24 bg-neutral-100 dark:bg-neutral-800 rounded" />
          <div className="h-4 w-40 bg-neutral-100 dark:bg-neutral-800 rounded flex-1" />
          <div className="h-4 w-28 bg-neutral-100 dark:bg-neutral-800 rounded hidden sm:block" />
          <div className="h-4 w-20 bg-neutral-100 dark:bg-neutral-800 rounded" />
          <div className="h-4 w-16 bg-neutral-100 dark:bg-neutral-800 rounded" />
        </div>
      ))}
    </div>
  );
};

export const KpiSkeletonGrid: React.FC = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 animate-pulse"
        >
          <div className="h-3.5 w-28 bg-neutral-100 dark:bg-neutral-800 rounded" />
          <div className="mt-3 h-7 w-24 bg-neutral-100 dark:bg-neutral-800 rounded" />
          <div className="mt-2 h-3 w-36 bg-neutral-100 dark:bg-neutral-800 rounded" />
        </div>
      ))}
    </div>
  );
};
