import { useEffect, useRef, useState } from "react";
import { Button, type ButtonProps } from "@client/components/ui";
import { cn } from "@client/shared/lib/utils";

type CopyButtonProps = Omit<ButtonProps, "onClick"> & {
  textToCopy?: string;
  getCopyText?: () => string | Promise<string>;
  copyText?: string;
  copiedText?: string;
  resetMs?: number;
  onCopy?: (text: string) => void;
};

export function CopyButton({
  textToCopy,
  getCopyText,
  copyText = "Copy",
  copiedText = "Copied!",
  resetMs = 800,
  onCopy,
  className,
  ...buttonProps
}: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = async () => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }

    setIsCopied(true);

    let text = textToCopy ?? "";
    if (!text && getCopyText) {
      text = await getCopyText();
    }

    if (text) {
      try {
        await navigator.clipboard?.writeText(text);
        onCopy?.(text);
      } catch (error) {
        console.error("Failed to copy to clipboard:", error);
      }
    } else {
      console.warn("No copy text provided for CopyButton.");
    }

    resetTimeoutRef.current = setTimeout(() => {
      setIsCopied(false);
    }, resetMs);
  };

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Button
      {...buttonProps}
      onClick={handleCopy}
      className={cn(
        "min-w-[120px] justify-center transition-[background-color,color,box-shadow,transform] duration-300 ease-out cursor-pointer",
        isCopied
          ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-500"
          : "hover:scale-[1.02] active:scale-[0.98]",
        className
      )}
    >
      {isCopied ? copiedText : copyText}
    </Button>
  );
}
