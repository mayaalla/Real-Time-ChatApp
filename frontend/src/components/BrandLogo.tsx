interface BrandLogoProps {
  compact?: boolean;
}

export function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <div className={`brand-logo${compact ? " brand-logo--compact" : ""}`}>
      <span className="brand-logo__name">Hadra<span className="brand-logo__dot">.</span></span>
      <span className="brand-logo__arabic" lang="ar" dir="rtl">هدرة</span>
    </div>
  );
}
