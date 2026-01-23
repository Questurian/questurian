import React, { memo } from "react";
import { Box, Text } from "ink";
import { ProjectConfig, ProjectStatus } from "../types";
import { StatusDot } from "./StatusDot";

interface ProjectRowProps {
  project: ProjectConfig;
  status: ProjectStatus;
}

export const ProjectRow = memo(function ProjectRow({ project, status }: ProjectRowProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="white" bold>
          {project.name}
        </Text>
      </Box>
      <Box marginLeft={2}>
        <StatusDot status={status.client} />
        <Text dimColor> Client </Text>
        <Text dimColor>{project.client?.url || "—"}</Text>
      </Box>
      <Box marginLeft={2}>
        <StatusDot status={status.server} />
        <Text dimColor> Server </Text>
        <Text dimColor>{project.server?.url || "—"}</Text>
      </Box>
    </Box>
  );
}, (prev, next) =>
  prev.project.name === next.project.name &&
  prev.status.client === next.status.client &&
  prev.status.server === next.status.server
);
