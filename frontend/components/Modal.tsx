import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  maxWidthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const SIZE_MAP = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  description,
  size = 'md',
  maxWidthClass,
  children,
  footer,
}) => {
  const onCloseRef = useRef(onClose);
  const backdropMouseDownRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;
  const subText = subtitle ?? description;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onMouseDown={(e) => {
        backdropMouseDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const shouldClose = backdropMouseDownRef.current && e.target === e.currentTarget;
        backdropMouseDownRef.current = false;
        if (shouldClose) onCloseRef.current();
      }}
    >
      <div
        className={`w-full ${maxWidthClass ?? SIZE_MAP[size]} bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-lg overflow-hidden transition-transform duration-150`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div>
            <h2 id="modal-title" className="text-base font-semibold text-neutral-950 dark:text-neutral-100">
              {title}
            </h2>
            {subText && (
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{subText}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 max-h-[72vh] overflow-y-auto text-neutral-900 dark:text-neutral-100">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2.5 px-6 py-3.5 bg-neutral-50 dark:bg-neutral-950/60 border-t border-neutral-200 dark:border-neutral-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
