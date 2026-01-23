import React from "react";
import { Box, Text } from "ink";

interface InfoPanelProps {
  title: string;
  children: React.ReactNode;
}

export function InfoPanel({ title, children }: InfoPanelProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      marginBottom={1}
    >
      <Text color="#FF6B35" bold>
        {title}
      </Text>
      <Box flexDirection="column" marginTop={0}>
        {children}
      </Box>
    </Box>
  );
}
