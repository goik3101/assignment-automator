import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  secondary: "bg-raised text-foreground hover:bg-border-strong",
  ghost: "text-muted hover:bg-raised hover:text-foreground",
  danger: "bg-danger/10 text-danger hover:bg-danger/20",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-full px-3.5 text-[13px]",
  md: "h-10 gap-2 rounded-full px-5 text-sm",
  lg: "h-12 gap-2 rounded-full px-7 text-[15px]",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra = "") {
  return [
    "inline-flex shrink-0 items-center justify-center font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
    VARIANT[variant],
    SIZE[size],
    extra,
  ].join(" ");
}

export default function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}
