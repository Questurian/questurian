import React from 'react';
import { Box, Text } from 'ink';

interface TitledBoxProps {
  title: string;
  borderColor?: string;
  children: React.ReactNode;
  paddingX?: number;
  paddingY?: number;
}

export function TitledBox({
  title,
  borderColor = 'gray',
  children,
  paddingX = 1,
  paddingY = 1,
}: TitledBoxProps) {
  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={paddingX}
      paddingY={paddingY}
    >
      {/* Title */}
      <Text color={borderColor} bold>
        {title}
      </Text>

      {/* Spacer */}
      <Box marginTop={1} />

      {/* Content */}
      <Box flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}
