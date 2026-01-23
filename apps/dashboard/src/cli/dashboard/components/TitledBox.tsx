import React from "react";
import { Box, Text, useStdout } from "ink";

interface TitledBoxProps {
  title: string;
  borderColor?: string;
  children: React.ReactNode;
}

export function TitledBox({
  title,
  borderColor = "gray",
  children,
}: TitledBoxProps) {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;
  // Account for outer padding (1 on each side = 2 total)
  const boxWidth = terminalWidth - 2;

  // Border: ╭─ Title ─────╮ = 2 (corners) + title.length + 3 (─ and spaces)
  const titleWithDash = `─ ${title} `;
  const topBorderLength = boxWidth - 2 - titleWithDash.length; // -2 for ╭ and ╮
  const bottomBorderLength = boxWidth - 2; // -2 for ╰ and ╯

  return (
    <Box flexDirection="column">
      {/* Top border */}
      <Text color={borderColor}>
        ╭{titleWithDash}{"─".repeat(Math.max(0, topBorderLength))}╮
      </Text>

      {/* Content */}
      <Box>
        <Text color={borderColor}>│</Text>
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          {children}
        </Box>
        <Text color={borderColor}>│</Text>
      </Box>

      {/* Bottom border */}
      <Text color={borderColor}>
        ╰{"─".repeat(Math.max(0, bottomBorderLength))}╯
      </Text>
    </Box>
  );
}
