import React from "react";

export interface BadgeProps {
  children?: React.ReactNode;
  variant?: "success" | "neutral" | "warning";
  className?: string;
  onClick?: () => void;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "success",
  className = "",
  onClick,
}) => {
  const variantStyles = {
    success:
      "bg-brand-primary-light dark:bg-dark-primary-light text-brand-primary border border-brand-primary/20",
    neutral:
      "bg-black/5 dark:bg-white/5 text-brand-text-secondary dark:text-dark-text-secondary border border-brand-border dark:border-dark-border",
    warning:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20",
  };

  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${variantStyles[variant]} ${onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""} ${className}`}
    >
      {variant === "success" && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-primary"></span>
        </span>
      )}
      {children}
    </span>
  );
};
