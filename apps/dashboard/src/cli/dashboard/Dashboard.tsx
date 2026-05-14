import React, { useEffect, useState } from "react";
import { Box, Text, render, useInput, useStdout } from "ink";

import { PROJECTS } from "./config";
import { useHealthCheck } from "./hooks";
import {
  TitledBox,
  WelcomeSection,
  InfoPanel,
  ProjectRow,
  PortsQuickRef,
  ContextViewer,
} from "./components";
import { ProjectStatus } from "./types";
import { StatusDot } from "./components/StatusDot";

type View = "home" | "context";

const DEFAULT_STATUS: ProjectStatus = {
  client: "checking",
  server: "checking",
};

// Breakpoints - like CSS media queries
const BP = {
  XL: 120,  // Full layout
  L: 100,   // 2 columns, full features
  M: 80,    // Single column, condensed
  S: 60,    // Minimal, no glossary
};

function Dashboard() {
  const { statuses, lastChecked, isChecking, onlineCount } =
    useHealthCheck(PROJECTS);
  const { stdout } = useStdout();
  const [terminalWidth, setTerminalWidth] = useState(stdout?.columns ?? 80);
  const [view, setView] = useState<View>("home");

  useInput((input) => {
    if (view === "home" && (input === "c" || input === "C")) {
      setView("context");
    }
  });

  if (view === "context") {
    return <ContextViewer onExit={() => setView("home")} />;
  }

  useEffect(() => {
    if (!stdout) return;

    const updateWidth = () => {
      setTerminalWidth(stdout.columns ?? 80);
    };

    updateWidth();
    stdout.on("resize", updateWidth);

    return () => {
      stdout.off("resize", updateWidth);
    };
  }, [stdout]);

  // Responsive flags
  const isXL = terminalWidth >= BP.XL;
  const isL = terminalWidth >= BP.L;
  const isM = terminalWidth >= BP.M;
  const isS = terminalWidth >= BP.S;

  // Too small - show minimal message
  if (!isS) {
    return (
      <Box flexDirection="column" width={terminalWidth} padding={1}>
        <Text color="cyan" bold>Questurian</Text>
        <Box marginTop={1}>
          <Text color={onlineCount > 0 ? "green" : "yellow"}>
            {onlineCount}/{PROJECTS.length} online
          </Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          {PROJECTS.map((p) => {
            const s = statuses.get(p.name) || DEFAULT_STATUS;
            return (
              <Box key={p.name}>
                <StatusDot status={s.server === "online" ? "online" : s.client} />
                <Text> {p.name}</Text>
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Resize for full view</Text>
        </Box>
        <Box>
          <Text dimColor>Press </Text>
          <Text color="cyan">c</Text>
          <Text dimColor> for CONTEXT</Text>
        </Box>
      </Box>
    );
  }

  // Small layout (60-79) - compact single column, no glossary
  if (!isM) {
    return (
      <Box flexDirection="column" width={terminalWidth} padding={1}>
        <TitledBox title="Questurian" borderColor="cyan" paddingX={1} paddingY={1}>
          <Box justifyContent="space-between">
            <Text color="cyan" bold>Dashboard</Text>
            <Text color={onlineCount > 0 ? "green" : "yellow"}>
              {onlineCount}/{PROJECTS.length} services
            </Text>
          </Box>
        </TitledBox>

        <Box marginTop={1}>
          <TitledBox title="Services" borderColor="green" paddingX={1} paddingY={1}>
            <Box flexDirection="column">
              {PROJECTS.map((project) => (
                <Box key={project.name} marginBottom={1}>
                  <Box>
                    <Text bold>{project.name}</Text>
                  </Box>
                  <Box marginLeft={1}>
                    {project.client && (
                      <Box marginRight={2}>
                        <StatusDot status={(statuses.get(project.name) || DEFAULT_STATUS).client} />
                        <Text dimColor> :{project.client.port}</Text>
                      </Box>
                    )}
                    {project.server && (
                      <Box>
                        <StatusDot status={(statuses.get(project.name) || DEFAULT_STATUS).server} />
                        <Text dimColor> :{project.server.port}</Text>
                      </Box>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </TitledBox>
        </Box>

        <Box marginTop={1}>
          <TitledBox title="Quick" borderColor="yellow" paddingX={1} paddingY={1}>
            <Text color="cyan">turbo dev</Text>
            <Text dimColor> | </Text>
            <Text color="green">turbo dev:clean</Text>
          </TitledBox>
        </Box>

        <Box marginTop={1} justifyContent="center">
          <Text color="cyan">c</Text>
          <Text dimColor> CONTEXT · Ctrl+C exit</Text>
        </Box>
      </Box>
    );
  }

  // Medium layout (80-99) - single column, condensed sections
  if (!isL) {
    return (
      <Box flexDirection="column" width={terminalWidth} paddingX={1} paddingY={1}>
        <TitledBox title="Questurian Dashboard" borderColor="cyan" paddingX={2} paddingY={1}>
          <Box flexDirection="column">
            <Box justifyContent="space-between" alignItems="center">
              <Text color="cyan" bold>Travel Media Company</Text>
              <Text color={onlineCount > 0 ? "green" : "yellow"}>
                {onlineCount}/{PROJECTS.length} services online
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Run: </Text>
              <Text color="cyan">turbo dev</Text>
              <Text dimColor> · Clean: </Text>
              <Text color="green">turbo dev:clean</Text>
            </Box>
          </Box>
        </TitledBox>

        <Box marginTop={1}>
          <TitledBox title="Services" borderColor="green" paddingX={2} paddingY={1}>
            <Box flexDirection="column">
              {PROJECTS.map((project) => (
                <ProjectRow
                  key={project.name}
                  project={project}
                  status={statuses.get(project.name) || DEFAULT_STATUS}
                  indent={2}
                  compact={true}
                />
              ))}
            </Box>
          </TitledBox>
        </Box>

        <Box marginTop={1} justifyContent="center">
          <Text color="cyan">c</Text>
          <Text dimColor> CONTEXT · Ctrl+C exit</Text>
        </Box>
      </Box>
    );
  }

  // Large layout (100-119) - two columns, most features
  if (!isXL) {
    const projectSplitIndex = Math.ceil(PROJECTS.length / 2);

    return (
      <Box flexDirection="column" width={terminalWidth} paddingX={1} paddingY={1}>
        <TitledBox title="Questurian Dashboard v0.0.1" borderColor="cyan" paddingX={2} paddingY={1}>
          <Box flexDirection="row">
            <Box flexDirection="column" width="60%">
              <WelcomeSection onlineCount={onlineCount} total={PROJECTS.length} showArt={false} />
            </Box>
            <Box flexDirection="column" width="40%">
              <InfoPanel title="Quick Start" paddingX={1} paddingY={1} marginBottom={1}>
                <Text dimColor>Run: </Text>
                <Text color="cyan">turbo dev</Text>
                <Box marginTop={1}>
                  <Text dimColor>Clean: </Text>
                  <Text color="green">turbo dev:clean</Text>
                </Box>
              </InfoPanel>
              <InfoPanel title="Status" paddingX={1} paddingY={1}>
                {isChecking ? (
                  <Text color="yellow">Checking...</Text>
                ) : (
                  <Text dimColor>Updated {lastChecked.toLocaleTimeString()}</Text>
                )}
              </InfoPanel>
            </Box>
          </Box>
        </TitledBox>

        <Box marginTop={1}>
          <TitledBox title="Services" borderColor="green" paddingX={2} paddingY={1}>
            <Box flexDirection="row">
              <Box flexDirection="column" width="50%">
                {PROJECTS.slice(0, projectSplitIndex).map((project) => (
                  <ProjectRow
                    key={project.name}
                    project={project}
                    status={statuses.get(project.name) || DEFAULT_STATUS}
                    indent={2}
                  />
                ))}
              </Box>
              <Box flexDirection="column" width="50%">
                {PROJECTS.slice(projectSplitIndex).map((project) => (
                  <ProjectRow
                    key={project.name}
                    project={project}
                    status={statuses.get(project.name) || DEFAULT_STATUS}
                    indent={2}
                  />
                ))}
              </Box>
            </Box>
          </TitledBox>
        </Box>

        <Box marginTop={1} justifyContent="center">
          <Text color="cyan">c</Text>
          <Text dimColor> CONTEXT browser · Ctrl+C to exit</Text>
        </Box>
      </Box>
    );
  }

  // XL layout (120+) - full layout with plane art
  const projectSplitIndex = Math.ceil(PROJECTS.length / 2);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} width={terminalWidth}>
      <TitledBox title="Questurian Dashboard v0.0.1" borderColor="cyan" paddingX={2} paddingY={1}>
        <Box flexDirection="row">
          <Box flexDirection="column" width="65%">
            <WelcomeSection onlineCount={onlineCount} total={PROJECTS.length} showArt={true} />
          </Box>
          <Box flexDirection="column" width="35%">
            <InfoPanel title="Quick Start" paddingX={1} paddingY={1} marginBottom={1}>
              <Text dimColor>Run all (normal):</Text>
              <Text color="cyan">turbo run dev</Text>
              <Box marginTop={1} />
              <Text dimColor>Run all (clean start):</Text>
              <Text color="green">turbo run dev:clean</Text>
              <Box marginTop={1} />
              <Text dimColor>Filter one package:</Text>
              <Text color="cyan">turbo dev --filter=PKG</Text>
            </InfoPanel>

            <InfoPanel title="Recent Activity" paddingX={1} paddingY={1} marginBottom={1}>
              <Box>
                {isChecking ? (
                  <Text color="yellow">Checking services...</Text>
                ) : (
                  <Text dimColor>Last checked: {lastChecked.toLocaleTimeString()}</Text>
                )}
              </Box>
            </InfoPanel>

            <InfoPanel title="Ports" paddingX={1} paddingY={1}>
              <PortsQuickRef />
            </InfoPanel>
          </Box>
        </Box>
      </TitledBox>

      <Box marginTop={2}>
        <TitledBox title="Services" borderColor="green" paddingX={2} paddingY={1}>
          <Box flexDirection="row">
            <Box flexDirection="column" width="50%">
              {PROJECTS.slice(0, projectSplitIndex).map((project) => (
                <ProjectRow
                  key={project.name}
                  project={project}
                  status={statuses.get(project.name) || DEFAULT_STATUS}
                  indent={2}
                />
              ))}
            </Box>
            <Box flexDirection="column" width="50%">
              {PROJECTS.slice(projectSplitIndex).map((project) => (
                <ProjectRow
                  key={project.name}
                  project={project}
                  status={statuses.get(project.name) || DEFAULT_STATUS}
                  indent={2}
                />
              ))}
            </Box>
          </Box>
        </TitledBox>
      </Box>

      <Box marginTop={2} justifyContent="center" paddingY={1}>
        <Text dimColor>API: </Text>
        <Text color="cyan">http://localhost:3000</Text>
        <Text dimColor> │ Press </Text>
        <Text color="cyan">c</Text>
        <Text dimColor> for CONTEXT browser │ </Text>
        <Text color="#3B82F6">Ctrl+C</Text>
        <Text dimColor> to exit</Text>
      </Box>
    </Box>
  );
}

let inkInstance: ReturnType<typeof render> | null = null;

export function renderInkDashboard() {
  if (inkInstance) {
    return inkInstance;
  }

  process.stdout.write("\x1b[?1049h");
  process.stdout.write("\x1b[H");

  const cleanup = () => {
    process.stdout.write("\x1b[?1049l");
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  inkInstance = render(<Dashboard />, {
    patchConsole: false,
  });

  return inkInstance;
}

export default Dashboard;
