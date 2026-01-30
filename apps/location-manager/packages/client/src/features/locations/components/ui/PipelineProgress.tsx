import { Check, Loader2, X, Circle } from "lucide-react";

export interface PipelineStep {
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  detail?: string;
}

interface PipelineProgressProps {
  steps: PipelineStep[];
}

function StepIcon({ status }: { status: PipelineStep["status"] }) {
  switch (status) {
    case "completed":
      return (
        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      );
    case "running":
      return (
        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
          <Loader2 className="w-3 h-3 text-white animate-spin" />
        </div>
      );
    case "failed":
      return (
        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
          <X className="w-3 h-3 text-white" />
        </div>
      );
    default:
      return (
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center">
          <Circle className="w-2 h-2 text-gray-300" />
        </div>
      );
  }
}

export function PipelineProgress({ steps }: PipelineProgressProps) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <div key={index} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <StepIcon status={step.status} />
            {index < steps.length - 1 && (
              <div
                className={`w-0.5 h-6 mt-1 ${
                  step.status === "completed" ? "bg-green-500" : "bg-gray-200"
                }`}
              />
            )}
          </div>
          <div className="flex-1 pt-0.5">
            <p
              className={`text-sm font-medium ${
                step.status === "running"
                  ? "text-blue-600"
                  : step.status === "completed"
                  ? "text-green-600"
                  : step.status === "failed"
                  ? "text-red-600"
                  : "text-gray-500"
              }`}
            >
              {step.label}
            </p>
            {step.detail && (
              <p className="text-xs text-gray-500 mt-0.5">{step.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
