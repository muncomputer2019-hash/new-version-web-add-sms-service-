import React, { useState } from 'react';
import { BRAND } from '../assets/brand';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  logoSrc?: string | null;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showWordmark = true,
  logoSrc,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  const imgDimensions =
    size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-14 w-14' : 'h-9 w-9';

  return (
    <div className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      <div
        className={`${imgDimensions} rounded-md border border-neutral-200 dark:border-neutral-700 bg-white overflow-hidden flex items-center justify-center shrink-0`}
      >
        {!imgError ? (
          <img
            src={logoSrc || BRAND.logoPath}
            alt="MUN COMPUTER Logo"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-contain p-0.5"
          />
        ) : (
          <svg
            viewBox="0 0 36 36"
            className="h-full w-full p-1"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="32" height="32" rx="4" fill="#0A2E8A" />
            <path
              d="M8 25V11h4.2l5.8 8.2L23.8 11H28v14h-4v-7.5L18 25l-6-7.5V25H8z"
              fill="#FFFFFF"
            />
            <circle cx="29" cy="7" r="3" fill="#DC2626" />
          </svg>
        )}
      </div>

      {showWordmark && (
        <span
          className={`font-bold tracking-tight text-neutral-950 dark:text-white whitespace-nowrap ${
            size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-sm' : 'text-base'
          }`}
        >
          {BRAND.name}
        </span>
      )}
    </div>
  );
};
