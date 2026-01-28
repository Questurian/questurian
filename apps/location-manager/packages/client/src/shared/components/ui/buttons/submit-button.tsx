import type { ButtonProps } from "@client/components/ui";
import { Button } from "@client/components/ui";
import { cn } from "@client/shared/lib/utils";
import type { ReactNode } from "react";

type SubmitButtonProps = Omit<ButtonProps, "type"> & {
  isLoading?: boolean;
  submitText?: string;
  submittingText?: string;
  children?: ReactNode;
};

export function SubmitButton({
  isLoading,
  submitText,
  submittingText = "Submitting...",
  className,
  disabled,
  children,
  ...buttonProps
}: SubmitButtonProps) {
  const fallbackSubmitText = submitText ?? "Submit";
  const label = isLoading ? submittingText : children ?? fallbackSubmitText;

  return (
    <Button
      {...buttonProps}
      type="submit"
      disabled={disabled || isLoading}
      className={cn("min-w-[160px] justify-center", className)}
    >
      {label}
    </Button>
  );
}
