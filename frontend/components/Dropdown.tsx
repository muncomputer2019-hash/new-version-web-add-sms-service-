import React, { useEffect, useRef, useState } from 'react';

export interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  dividerAbove?: boolean;
}

interface DropdownProps {
  trigger: React.ReactNode;
  items?: DropdownMenuItem[];
  header?: React.ReactNode;
  customContent?: React.ReactNode;
  align?: 'left' | 'right';
  widthClass?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  items,
  header,
  customContent,
  align = 'right',
  widthClass = 'w-60',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <div
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="inline-flex"
      >
        {trigger}
      </div>

      {open && (
        <div
          className={`absolute z-40 mt-2 ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${widthClass} bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-lg py-1.5`}
          role="menu"
        >
          {header && (
            <div className="px-3.5 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
              {header}
            </div>
          )}

          {customContent ? (
            <div onClick={() => setOpen(false)}>{customContent}</div>
          ) : (
            items?.map((item) => (
              <React.Fragment key={item.id}>
                {item.dividerAbove && (
                  <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors cursor-pointer ${
                    item.danger
                      ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
                      : 'text-neutral-800 hover:bg-neutral-50 hover:text-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:hover:text-white'
                  }`}
                >
                  {item.icon && (
                    <span className="shrink-0 text-neutral-500 dark:text-neutral-400">{item.icon}</span>
                  )}
                  <span className="truncate">{item.label}</span>
                </button>
              </React.Fragment>
            ))
          )}
        </div>
      )}
    </div>
  );
};
