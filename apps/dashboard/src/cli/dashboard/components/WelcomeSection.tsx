import React from "react";
import { Box, Text } from "ink";
import { ASCII_ART } from "../config";

interface WelcomeSectionProps {
  devName: string;
  onlineCount: number;
  total: number;
}

export function WelcomeSection({ devName, onlineCount, total }: WelcomeSectionProps) {
  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Text color="cyan" bold>
        Welcome back {devName}!
      </Text>

      <Box marginY={1}>
        <Text color="#FF6B35">{ASCII_ART}</Text>
      </Box>

      <Box flexDirection="column" alignItems="center" marginTop={1}>
        <Box>
          <Text dimColor>NX Monorepo</Text>
          <Text dimColor> · </Text>
          <Text color={onlineCount > 0 ? "green" : "yellow"}>
            {onlineCount}/{total} services
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>~/Desktop/questurian</Text>
        </Box>
      </Box>
    </Box>
  );
}
