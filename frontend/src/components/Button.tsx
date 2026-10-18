import type { ButtonHTMLAttributes } from "react";
import styles from "./ui.module.css";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger";
  /**
   * While true the button is disabled and shows `busyLabel`, so a slow save
   * can't be submitted twice.
   */
  busy?: boolean;
  busyLabel?: string;
}

export function Button({
  variant = "default",
  busy = false,
  busyLabel,
  disabled,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const variantClass = variant === "default" ? "" : styles[variant];
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={[styles.button, variantClass, className].filter(Boolean).join(" ")}
    >
      {busy && <span className={styles.spinner} aria-hidden="true" />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
