import { useEffect, useState } from "react";
import { useStdout } from "ink";

export interface TerminalSize {
  cols: number;
  rows: number;
}

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>(() => ({
    cols: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  }));

  useEffect(() => {
    if (!stdout) return;

    const update = () => {
      setSize({
        cols: stdout.columns ?? 80,
        rows: stdout.rows ?? 24,
      });
    };

    update();
    stdout.on("resize", update);
    return () => {
      stdout.off("resize", update);
    };
  }, [stdout]);

  return size;
}
