import type { ComponentProps, MouseEvent } from "react";
import styles from "./ui.module.css";

/** All native button props, including `ref` (a regular prop in React 19). */
interface ButtonProps extends ComponentProps<"button"> {
  variant?: "default" | "primary" | "danger";
  /**
   * While true the button shows `busyLabel` and ignores clicks, so a slow save
   * can't be submitted twice.
   *
   * It uses aria-disabled rather than the native `disabled` attribute: a
   * focused element that becomes disabled loses focus, which strands keyboard
   * users (verified in e2e/keyboard.spec.ts). Screen readers still announce
   * the button as unavailable.
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
  onClick,
  type = "button",
  ...rest
}: ButtonProps) {
  const variantClass = variant === "default" ? "" : styles[variant];
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      event.preventDefault(); // also stops a busy submit button from submitting again
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      onClick={handleClick}
      className={[styles.button, variantClass, className].filter(Boolean).join(" ")}
    >
      {busy && <span className={styles.spinner} aria-hidden="true" />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
