import { BRAND } from '@/config/brand';

/** Logotipo original de Rounded Desktop: cuatro formas redondeadas (una por aplicación). */
export function Logo({ size = 34, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={BRAND.suiteName}>
      <rect width="64" height="64" rx="18" fill="#4f46e5" />
      <rect x="12" y="12" width="18" height="18" rx="7" fill="#93c5fd" />
      <rect x="34" y="12" width="18" height="18" rx="9" fill="#6ee7b7" />
      <rect x="12" y="34" width="18" height="18" rx="9" fill="#fdba74" />
      <rect x="34" y="34" width="18" height="18" rx="7" fill="#fda4af" />
    </svg>
  );
}
