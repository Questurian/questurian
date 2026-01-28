import type { ButtonProps } from "@client/components/ui";
import { Button } from "@client/components/ui";
import { cn } from "@client/shared/lib/utils";
import type { ReactNode } from "react";

type DeleteButtonProps = Omit<ButtonProps, "variant"> & {
  isLoading?: boolean;
  deleteText?: string;
  deletingText?: string;
  children?: ReactNode;
};

export function DeleteButton({
  isLoading,
  deleteText,
  deletingText = "Deleting...",
  className,
  disabled,
  children,
  ...buttonProps
}: DeleteButtonProps) {
  const fallbackDeleteText = deleteText ?? "Delete";
  const label = isLoading ? deletingText : children ?? fallbackDeleteText;

  return (
    <Button
      {...buttonProps}
      variant="destructive"
      disabled={disabled || isLoading}
      className={cn("min-w-[140px] justify-center", className)}
    >
      {label}
    </Button>
  );
}
