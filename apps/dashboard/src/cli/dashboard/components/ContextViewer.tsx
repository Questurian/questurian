import React, { useMemo, useState } from "react";
import fs from "node:fs";
import { Box, Text, useInput } from "ink";

import { CONTEXT_FILES, ContextFile } from "../config";
import { useTerminalSize } from "../hooks";
import { TitledBox } from "./TitledBox";

interface ContextViewerProps {
  onExit: () => void;
}

type Mode = "list" | "view";

function loadFile(file: ContextFile): { content: string; error?: string } {
  try {
    const content = fs.readFileSync(file.absolutePath, "utf8");
    return { content };
  } catch (err) {
    return {
      content: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function ContextViewer({ onExit }: ContextViewerProps) {
  const { rows: terminalHeight } = useTerminalSize();

  const [mode, setMode] = useState<Mode>("list");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const current = CONTEXT_FILES[selectedIndex];
  const loaded = useMemo(() => {
    if (mode !== "view" || !current) return { content: "", error: undefined as string | undefined };
    return loadFile(current);
  }, [mode, current]);

  const lines = useMemo(() => loaded.content.split("\n"), [loaded.content]);

  // Reserve space for chrome (title, border, footer)
  const viewportHeight = Math.max(5, terminalHeight - 8);

  useInput((input, key) => {
    if (mode === "list") {
      if (key.escape || input === "q" || input === "b") {
        onExit();
        return;
      }
      if (key.upArrow || input === "k") {
        setSelectedIndex((i) => (i - 1 + CONTEXT_FILES.length) % CONTEXT_FILES.length);
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex((i) => (i + 1) % CONTEXT_FILES.length);
        return;
      }
      if (key.return || input === " ") {
        setScrollOffset(0);
        setMode("view");
        return;
      }
      if (input === "s") {
        // Shuffle: jump to a random file
        const next = Math.floor(Math.random() * CONTEXT_FILES.length);
        setSelectedIndex(next);
        return;
      }
      return;
    }

    // view mode
    if (key.escape || input === "q" || input === "b") {
      setMode("list");
      return;
    }
    if (key.upArrow || input === "k") {
      setScrollOffset((o) => Math.max(0, o - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setScrollOffset((o) => Math.min(Math.max(0, lines.length - viewportHeight), o + 1));
      return;
    }
    if (key.pageUp) {
      setScrollOffset((o) => Math.max(0, o - viewportHeight));
      return;
    }
    if (key.pageDown) {
      setScrollOffset((o) => Math.min(Math.max(0, lines.length - viewportHeight), o + viewportHeight));
      return;
    }
    if (key.rightArrow || input === "n" || input === "l") {
      setSelectedIndex((i) => (i + 1) % CONTEXT_FILES.length);
      setScrollOffset(0);
      return;
    }
    if (key.leftArrow || input === "p" || input === "h") {
      setSelectedIndex((i) => (i - 1 + CONTEXT_FILES.length) % CONTEXT_FILES.length);
      setScrollOffset(0);
      return;
    }
    if (input === "s") {
      const next = Math.floor(Math.random() * CONTEXT_FILES.length);
      setSelectedIndex(next);
      setScrollOffset(0);
      return;
    }
  });

  if (mode === "list") {
    // Window the list so it fits on screen
    const listViewport = Math.max(5, terminalHeight - 8);
    let start = 0;
    if (CONTEXT_FILES.length > listViewport) {
      start = Math.min(
        Math.max(0, selectedIndex - Math.floor(listViewport / 2)),
        CONTEXT_FILES.length - listViewport,
      );
    }
    const end = Math.min(CONTEXT_FILES.length, start + listViewport);

    return (
      <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
        <TitledBox title="CONTEXT.md Browser" borderColor="cyan" paddingX={2} paddingY={1}>
          <Box flexDirection="column">
            <Box>
              <Text dimColor>
                {selectedIndex + 1}/{CONTEXT_FILES.length}
              </Text>
              <Text dimColor> · </Text>
              <Text color="cyan">{CONTEXT_FILES[selectedIndex]?.label}</Text>
            </Box>
            <Box marginTop={1} flexDirection="column">
              {CONTEXT_FILES.slice(start, end).map((file, i) => {
                const actualIndex = start + i;
                const isSelected = actualIndex === selectedIndex;
                return (
                  <Box key={file.relativePath}>
                    <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                      {isSelected ? "▶ " : "  "}
                      {file.label}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </TitledBox>

        <Box marginTop={1} justifyContent="center">
          <Text dimColor>↑↓ navigate · </Text>
          <Text color="green">Enter</Text>
          <Text dimColor> view · </Text>
          <Text color="yellow">s</Text>
          <Text dimColor> shuffle · </Text>
          <Text color="#3B82F6">q/Esc</Text>
          <Text dimColor> home</Text>
        </Box>
      </Box>
    );
  }

  // view mode
  const visible = lines.slice(scrollOffset, scrollOffset + viewportHeight);
  const maxScroll = Math.max(0, lines.length - viewportHeight);

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <TitledBox
        title={`${current?.label ?? ""} (${selectedIndex + 1}/${CONTEXT_FILES.length})`}
        borderColor="green"
        paddingX={2}
        paddingY={1}
      >
        <Box flexDirection="column">
          <Box>
            <Text dimColor>{current?.relativePath}</Text>
          </Box>
          <Box marginTop={1} flexDirection="column" height={viewportHeight}>
            {loaded.error ? (
              <Text color="red">Error: {loaded.error}</Text>
            ) : (
              visible.map((line, i) => (
                <Text key={`${scrollOffset}-${i}`}>{line.length ? line : " "}</Text>
              ))
            )}
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              line {Math.min(lines.length, scrollOffset + 1)}-
              {Math.min(lines.length, scrollOffset + viewportHeight)} / {lines.length}
              {maxScroll > 0 ? ` · scroll ${Math.round((scrollOffset / maxScroll) * 100)}%` : ""}
            </Text>
          </Box>
        </Box>
      </TitledBox>

      <Box marginTop={1} justifyContent="center">
        <Text dimColor>↑↓ scroll · </Text>
        <Text color="cyan">←/→</Text>
        <Text dimColor> prev/next · </Text>
        <Text color="yellow">s</Text>
        <Text dimColor> shuffle · </Text>
        <Text color="#3B82F6">q/Esc/b</Text>
        <Text dimColor> back</Text>
      </Box>
    </Box>
  );
}
