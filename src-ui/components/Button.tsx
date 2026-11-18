import React, { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "secondary",
  size = "md",
  icon,
  className = "",
  disabled,
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center font-medium transition-colors duration-150 rounded-lg select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1";

  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1.5",
    md: "px-3.5 py-1.5 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2.5",
  };

  const variantClasses = {
    primary:
      "bg-brand-primary hover:bg-brand-primary-hover active:bg-[#3C563F] text-white shadow-subtle disabled:opacity-50 disabled:hover:bg-brand-primary",
    secondary:
      "bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border text-brand-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50",
    ghost:
      "bg-transparent text-brand-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50",
    danger:
      "bg-brand-danger/10 text-brand-danger hover:bg-brand-danger/20 border border-brand-danger/30 disabled:opacity-50",
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
};
