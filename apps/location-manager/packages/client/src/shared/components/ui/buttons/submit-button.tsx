import type { ButtonProps } from "@client/components/ui";
import { Button } from "@client/components/ui";
import { cn } from "@client/shared/lib/utils";
import { Loader2 } from "lucide-react";
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
      className={cn("min-w-[160px] justify-center gap-2", className)}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </Button>
  );
}
