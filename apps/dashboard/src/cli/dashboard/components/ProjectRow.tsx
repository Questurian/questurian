import React, { memo } from "react";
import { Box, Text } from "ink";
import { ProjectConfig, ProjectStatus } from "../types";
import { StatusDot } from "./StatusDot";

interface ProjectRowProps {
  project: ProjectConfig;
  status: ProjectStatus;
  indent?: number;
  showCommands?: boolean;
  compact?: boolean;
}

export const ProjectRow = memo(function ProjectRow({
  project,
  status,
  indent = 2,
  showCommands = false,
  compact = false,
}: ProjectRowProps) {
  // Compact: inline status dots, no description
  if (compact) {
    return (
      <Box marginBottom={1}>
        <Text color="white" bold>{project.name}</Text>
        <Box marginLeft={2}>
          {project.client && (
            <Box marginRight={2}>
              <StatusDot status={status.client} />
              <Text dimColor> :{project.client.port}</Text>
            </Box>
          )}
          {project.server && (
            <Box>
              <StatusDot status={status.server} />
              <Text dimColor> :{project.server.port}</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="white" bold>
          {project.name}
        </Text>
      </Box>
      <Box marginLeft={indent}>
        <Text dimColor italic>
          {project.description}
        </Text>
      </Box>
      {project.client && (
        <Box marginLeft={indent}>
          <StatusDot status={status.client} />
          <Text dimColor> Client </Text>
          <Text color="gray">:{project.client.port}</Text>
          <Text dimColor> ({project.client.type})</Text>
        </Box>
      )}
      {project.server && (
        <Box marginLeft={indent}>
          <StatusDot status={status.server} />
          <Text dimColor> Server </Text>
          <Text color="gray">:{project.server.port}</Text>
          <Text dimColor> ({project.server.type})</Text>
        </Box>
      )}
      {showCommands && (
        <Box marginLeft={indent} marginTop={1} flexDirection="column">
          <Text color="yellow">dev:clean: </Text>
          <Text color="cyan">{project.commands.devClean.cmd}</Text>
        </Box>
      )}
    </Box>
  );
}, (prev, next) =>
  prev.project.name === next.project.name &&
  prev.status.client === next.status.client &&
  prev.status.server === next.status.server &&
  prev.showCommands === next.showCommands &&
  prev.compact === next.compact
);
