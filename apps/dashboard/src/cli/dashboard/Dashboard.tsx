import React, { useState } from "react";
import { Box, Text, render, useInput } from "ink";

import { PROJECTS, BP, BP_H } from "./config";
import { useHealthCheck, useTerminalSize } from "./hooks";
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

function Dashboard() {
  const { statuses, lastChecked, isChecking, onlineCount } =
    useHealthCheck(PROJECTS);
  const { cols, rows } = useTerminalSize();
  const [view, setView] = useState<View>("home");

  useInput((input) => {
    if (view === "home" && (input === "c" || input === "C")) {
      setView("context");
    }
  });

  if (view === "context") {
    return <ContextViewer onExit={() => setView("home")} />;
  }

  // Mobile-first capability flags. Each tier ADDS, never removes.
  const hasS = cols >= BP.S;
  const hasM = cols >= BP.M;
  const hasL = cols >= BP.L;
  const hasXL = cols >= BP.XL;
  const hasVerticalRoom = rows >= BP_H.TALL;
  const showArt = hasXL && hasVerticalRoom;
  const showSidePanels = hasL;
  const showGlossary = hasXL;
  const showTwoColumnServices = hasL;

  // Below minimum: ultra-condensed bail-out (still fully reactive).
  if (!hasS) {
    return (
      <Box flexDirection="column" width="100%" padding={1}>
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

  // Header section adapts to width.
  const header = (
    <TitledBox
      title={hasM ? "Questurian Dashboard v0.0.1" : "Questurian"}
      borderColor="cyan"
      paddingX={hasM ? 2 : 1}
      paddingY={1}
    >
      {hasL ? (
        <Box flexDirection="row">
          <Box flexDirection="column" width={showArt ? "65%" : "60%"}>
            <WelcomeSection
              onlineCount={onlineCount}
              total={PROJECTS.length}
              showArt={showArt}
            />
          </Box>
          <Box flexDirection="column" width={showArt ? "35%" : "40%"}>
            <InfoPanel title="Quick Start" paddingX={1} paddingY={1} marginBottom={1}>
              <Text dimColor>Run all:</Text>
              <Text color="cyan">turbo run dev</Text>
              <Box marginTop={1} />
              <Text dimColor>Clean start:</Text>
              <Text color="green">turbo run dev:clean</Text>
              {hasXL && (
                <>
                  <Box marginTop={1} />
                  <Text dimColor>Filter:</Text>
                  <Text color="cyan">turbo dev --filter=PKG</Text>
                </>
              )}
            </InfoPanel>
            <InfoPanel title="Status" paddingX={1} paddingY={1} marginBottom={showGlossary ? 1 : 0}>
              {isChecking ? (
                <Text color="yellow">Checking...</Text>
              ) : (
                <Text dimColor>Updated {lastChecked.toLocaleTimeString()}</Text>
              )}
            </InfoPanel>
            {showGlossary && (
              <InfoPanel title="Ports" paddingX={1} paddingY={1} marginBottom={0}>
                <PortsQuickRef />
              </InfoPanel>
            )}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box justifyContent="space-between" alignItems="center">
            <Text color="cyan" bold>Travel Media Company</Text>
            <Text color={onlineCount > 0 ? "green" : "yellow"}>
              {onlineCount}/{PROJECTS.length} {hasM ? "services online" : "services"}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Run: </Text>
            <Text color="cyan">turbo dev</Text>
            <Text dimColor> · Clean: </Text>
            <Text color="green">turbo dev:clean</Text>
          </Box>
        </Box>
      )}
    </TitledBox>
  );

  // Services section: two-column at L+, single-column otherwise.
  const splitIndex = Math.ceil(PROJECTS.length / 2);
  const services = (
    <TitledBox
      title="Services"
      borderColor="green"
      paddingX={hasM ? 2 : 1}
      paddingY={1}
    >
      {showTwoColumnServices ? (
        <Box flexDirection="row">
          <Box flexDirection="column" width="50%">
            {PROJECTS.slice(0, splitIndex).map((project) => (
              <ProjectRow
                key={project.name}
                project={project}
                status={statuses.get(project.name) || DEFAULT_STATUS}
                indent={2}
              />
            ))}
          </Box>
          <Box flexDirection="column" width="50%">
            {PROJECTS.slice(splitIndex).map((project) => (
              <ProjectRow
                key={project.name}
                project={project}
                status={statuses.get(project.name) || DEFAULT_STATUS}
                indent={2}
              />
            ))}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          {PROJECTS.map((project) => (
            <ProjectRow
              key={project.name}
              project={project}
              status={statuses.get(project.name) || DEFAULT_STATUS}
              indent={2}
              compact={!hasM}
            />
          ))}
        </Box>
      )}
    </TitledBox>
  );

  const footer = hasXL ? (
    <Box marginTop={2} justifyContent="center" paddingY={1}>
      <Text dimColor>API: </Text>
      <Text color="cyan">http://localhost:3000</Text>
      <Text dimColor> │ Press </Text>
      <Text color="cyan">c</Text>
      <Text dimColor> for CONTEXT browser │ </Text>
      <Text color="#3B82F6">Ctrl+C</Text>
      <Text dimColor> to exit</Text>
    </Box>
  ) : (
    <Box marginTop={1} justifyContent="center">
      <Text color="cyan">c</Text>
      <Text dimColor> CONTEXT · Ctrl+C exit</Text>
    </Box>
  );

  return (
    <Box
      flexDirection="column"
      width="100%"
      paddingX={1}
      paddingY={1}
    >
      {header}
      <Box marginTop={hasXL ? 2 : 1}>{services}</Box>
      {footer}
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
