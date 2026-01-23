import React from "react";
import { Text } from "ink";
import Spinner from "ink-spinner";

interface StatusDotProps {
  status: "online" | "offline" | "checking";
}

export function StatusDot({ status }: StatusDotProps) {
  if (status === "checking") {
    return (
      <Text color="yellow">
        <Spinner type="dots" />
      </Text>
    );
  }
  return status === "online" ? (
    <Text color="greenBright">●</Text>
  ) : (
    <Text color="red">●</Text>
  );
}
