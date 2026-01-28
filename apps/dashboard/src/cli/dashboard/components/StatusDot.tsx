import React from "react";
import { Text } from "ink";
import { ServiceStatus } from "../types";

interface StatusDotProps {
  status: ServiceStatus;
}

export function StatusDot({ status }: StatusDotProps) {
  switch (status) {
    case "checking":
      return <Text color="yellow">○</Text>;
    case "starting":
      return <Text color="#FFA500">◐</Text>;
    case "online":
      return <Text color="greenBright">●</Text>;
    case "offline":
    default:
      return <Text color="red">●</Text>;
  }
}
