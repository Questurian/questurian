import React from "react";
import { Box, Text } from "ink";
import { ALL_PORTS } from "../config";

const typeColors: Record<string, string> = {
  python: "yellow",
  bun: "magenta",
  node: "green",
  vite: "cyan",
  next: "white",
  payload: "blue",
};

export function PortsQuickRef() {
  return (
    <Box flexDirection="column">
      {ALL_PORTS.sort((a, b) => a.port - b.port).map((p) => (
        <Box key={p.port}>
          <Text color={typeColors[p.type] || "gray"}>{String(p.port).padEnd(6)}</Text>
          <Text dimColor>{p.name.replace(" Server", "").replace(" Client", " UI")}</Text>
        </Box>
      ))}
    </Box>
  );
}
