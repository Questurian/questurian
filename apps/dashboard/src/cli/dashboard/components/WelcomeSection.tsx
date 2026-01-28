import React from "react";
import { Box, Text } from "ink";
import { ASCII_ART } from "../config";

interface WelcomeSectionProps {
  onlineCount: number;
  total: number;
  showArt?: boolean;
}

// ANSI escape codes
const ANSI_BLUE = "\x1b[38;2;59;130;246m";
const ANSI_YELLOW = "\x1b[38;2;250;204;21m";
const ANSI_WHITE = "\x1b[38;2;255;255;255m";
const ANSI_RESET = "\x1b[0m";

// Plane/text patterns - these should stay blue
const PLANE_PATTERNS = ["__|__", "---o--o", "o--o---", "Q U E S T U R I A N"];

// Find the engine line
const artLines = ASCII_ART.split("\n");
const ENGINE_LINE_INDEX = artLines.findIndex((line) =>
  line.includes("---o--o--(_)--o--o---")
);

// Build static plane art with yellow engines
function buildStaticPlaneArt(): string {
  return artLines
    .map((line, index) => {
      const isPlaneOrText = PLANE_PATTERNS.some((p) => line.includes(p));

      // Engine line: make "o" yellow, rest blue
      if (index === ENGINE_LINE_INDEX) {
        let coloredLine = "";
        for (const char of line) {
          if (char === "o") {
            coloredLine += `${ANSI_YELLOW}${char}${ANSI_RESET}`;
          } else {
            coloredLine += `${ANSI_BLUE}${char}${ANSI_RESET}`;
          }
        }
        return coloredLine;
      }

      // Plane and text in blue, clouds in white
      if (isPlaneOrText) {
        return `${ANSI_BLUE}${line}${ANSI_RESET}`;
      }
      return `${ANSI_WHITE}${line}${ANSI_RESET}`;
    })
    .join("\n");
}

// Memoized footer section
const FooterSection = React.memo(function FooterSection({
  onlineCount,
  total,
}: {
  onlineCount: number;
  total: number;
}) {
  return (
    <Box flexDirection="column" alignItems="center" marginTop={1}>
      <Box>
        <Text dimColor>Turbo Repo</Text>
        <Text dimColor> · </Text>
        <Text color={onlineCount > 0 ? "green" : "yellow"}>
          {onlineCount}/{total} services
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>~/Desktop/questurian</Text>
      </Box>
    </Box>
  );
});

// Memoized header
const Header = React.memo(function Header() {
  return (
    <Text color="cyan" bold>
      Travel Media Company
    </Text>
  );
});

// Static plane with yellow engines
const StaticPlane = React.memo(function StaticPlane() {
  return <Text>{buildStaticPlaneArt()}</Text>;
});

export function WelcomeSection({ onlineCount, total, showArt = true }: WelcomeSectionProps) {
  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Header />

      {showArt && (
        <Box marginY={1}>
          <StaticPlane />
        </Box>
      )}

      <FooterSection onlineCount={onlineCount} total={total} />
    </Box>
  );
}
