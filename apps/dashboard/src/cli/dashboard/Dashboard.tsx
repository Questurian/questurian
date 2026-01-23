import React, { useEffect, useRef } from "react";
import { Box, Text, render, useStdout } from "ink";
import Spinner from "ink-spinner";

import { PROJECTS } from "./config";
import { useHealthCheck } from "./hooks";
import {
  TitledBox,
  WelcomeSection,
  InfoPanel,
  ProjectRow,
} from "./components";
import { ProjectStatus } from "./types";

const DEFAULT_STATUS: ProjectStatus = { client: "checking", server: "checking" };

function Dashboard() {
  const { statuses, lastChecked, isChecking, onlineCount } = useHealthCheck(PROJECTS);
  const { stdout } = useStdout();
  const hasClearedRef = useRef(false);

  // Clear screen once on first render to avoid stacking
  useEffect(() => {
    if (!hasClearedRef.current && stdout) {
      stdout.write("\x1b[2J\x1b[H");
      hasClearedRef.current = true;
    }
  }, [stdout]);

  return (
    <Box flexDirection="column">
      <TitledBox title="Questurian Dashboard v0.0.1" borderColor="gray">
        <Box>
          {/* Left Panel */}
          <Box flexDirection="column" width="50%">
            <WelcomeSection
              devName="Alan"
              onlineCount={onlineCount}
              total={PROJECTS.length}
            />
          </Box>

          {/* Right Panel */}
          <Box flexDirection="column" width="50%" paddingLeft={1}>
            <InfoPanel title="Quick Start">
              <Text dimColor>Run project with </Text>
              <Text color="cyan">nx serve [project]</Text>
            </InfoPanel>

            <InfoPanel title="Recent Activity">
              <Box>
                {isChecking ? (
                  <Box>
                    <Text color="yellow">
                      <Spinner type="dots" />
                    </Text>
                    <Text dimColor> Checking services...</Text>
                  </Box>
                ) : (
                  <Text dimColor>Last checked: {lastChecked.toLocaleTimeString()}</Text>
                )}
              </Box>
            </InfoPanel>
          </Box>
        </Box>
      </TitledBox>

      {/* Projects List */}
      <Box marginTop={1}>
        <TitledBox title="Projects" borderColor="gray">
          <Box flexDirection="row" flexWrap="wrap">
            <Box flexDirection="column" width="50%">
              {PROJECTS.slice(0, 2).map((project) => (
                <ProjectRow
                  key={project.name}
                  project={project}
                  status={statuses.get(project.name) || DEFAULT_STATUS}
                />
              ))}
            </Box>
            <Box flexDirection="column" width="50%">
              {PROJECTS.slice(2).map((project) => (
                <ProjectRow
                  key={project.name}
                  project={project}
                  status={statuses.get(project.name) || DEFAULT_STATUS}
                />
              ))}
            </Box>
          </Box>
        </TitledBox>
      </Box>

      {/* Footer */}
      <Box marginTop={1} justifyContent="center" width="100%">
        <Text dimColor>API: </Text>
        <Text color="cyan">http://localhost:3000</Text>
        <Text dimColor> │ </Text>
        <Text dimColor>Press </Text>
        <Text color="#FF6B35">Ctrl+C</Text>
        <Text dimColor> to exit</Text>
      </Box>
    </Box>
  );
}

let inkInstance: ReturnType<typeof render> | null = null;

export function renderInkDashboard() {
  // Prevent multiple instances
  if (inkInstance) {
    return inkInstance;
  }

  // Clear and position cursor at top before Ink takes over
  process.stdout.write("\x1b[2J\x1b[H");

  // Use Ink's fullscreen-like mode by disabling patchConsole
  inkInstance = render(<Dashboard />, {
    patchConsole: false,
  });

  return inkInstance;
}

export default Dashboard;
