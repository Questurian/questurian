import React from "react";
import { Box, Text } from "ink";

interface InfoPanelProps {
  title: string;
  children: React.ReactNode;
  paddingX?: number;
  paddingY?: number;
  marginBottom?: number;
}

export function InfoPanel({
  title,
  children,
  paddingX = 1,
  paddingY = 1,
  marginBottom = 1,
}: InfoPanelProps) {
  return (
    <Box
      flexDirection="column"
      marginBottom={marginBottom}
      paddingX={paddingX}
      paddingY={paddingY}
      borderStyle="single"
      borderColor="gray"
      borderDimColor
    >
      <Text color="#3B82F6" bold>
        {title}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}
