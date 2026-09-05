import { useQuery } from "@tanstack/react-query";
import { fetchGlobalCommands, fetchProjectHealth, fetchProjects } from "../lib/api";
import { Dot, Empty, ErrorNote, Loading, Panel } from "../components/primitives";
import { formatRelative } from "../lib/format";
import type { ProjectConfig, ServiceConfig, ServiceStatus } from "../../cli/dashboard/types";

/**
 * The terminal dashboard's job, in a browser.
 *
 * It asks the server for status rather than probing services itself: only the
 * server can run the `lsof` check that separates "starting" from "offline",
 * and duplicating the rule in the browser would give two answers.
 */

const STATUS_TONE: Record<ServiceStatus, "ok" | "warn" | "bad" | "idle"> = {
  online: "ok",
  starting: "warn",
  offline: "bad",
  checking: "idle",
};

function ServiceCell({
  role,
  service,
  status,
}: {
  role: "client" | "server";
  service: ServiceConfig | undefined;
  status: ServiceStatus | undefined;
}) {
  if (!service) {
    return (
      <div className="rounded border border-line-soft bg-surface-raised/40 px-2.5 py-2">
        <div className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">{role}</div>
        <div className="mt-1 text-[12px] text-ink-faint">not applicable</div>
      </div>
    );
  }

  const resolved = status ?? "checking";
  return (
    <div className="rounded border border-line-soft bg-surface-raised/40 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">{role}</span>
        <span className="flex items-center gap-1.5">
          <Dot tone={STATUS_TONE[resolved]} />
          <span className="text-[11px] text-ink-muted">{resolved}</span>
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <a
          href={service.url}
          target="_blank"
          rel="noreferrer"
          className="numeric text-[12px] text-accent hover:underline"
        >
          :{service.port}
        </a>
        <span className="text-[11px] text-ink-faint">{service.type}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] text-ink-faint">{service.description}</p>
    </div>
  );
}

function ProjectCard({
  project,
  statuses,
}: {
  project: ProjectConfig;
  statuses: Record<string, { client: ServiceStatus; server: ServiceStatus }> | undefined;
}) {
  const status = statuses?.[project.name];

  return (
    <article className="rounded-md border border-line bg-surface p-3">
      <header>
        <h3 className="text-[13px] font-semibold text-ink">{project.name}</h3>
        <p className="mt-0.5 text-[11px] text-ink-faint">{project.description}</p>
        <p className="numeric mt-1 text-[10px] text-ink-faint">{project.path}</p>
      </header>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <ServiceCell role="client" service={project.client} status={status?.client} />
        <ServiceCell role="server" service={project.server} status={status?.server} />
      </div>

      <div className="mt-2.5 border-t border-line-soft pt-2">
        <div className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">start</div>
        <code className="numeric mt-1 block overflow-x-auto whitespace-pre text-[11px] text-ink-muted">
          {project.commands.dev.cmd}
        </code>
      </div>
    </article>
  );
}

export function ServicesTab() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: fetchProjects, staleTime: Infinity });
  const health = useQuery({
    queryKey: ["project-health"],
    queryFn: fetchProjectHealth,
    // The server's own health rule fires every 30 s; matching it here keeps
    // the two faces of the dashboard from disagreeing by a poll interval.
    refetchInterval: projects.data?.healthCheckIntervalMs ?? 30_000,
  });
  const commands = useQuery({
    queryKey: ["global-commands"],
    queryFn: fetchGlobalCommands,
    staleTime: Infinity,
  });

  if (projects.isError) return <ErrorNote error={projects.error} />;
  if (projects.isLoading) return <Loading />;

  const rows = projects.data?.projects ?? [];
  const statuses = health.data?.statuses;
  const online = Object.values(statuses ?? {}).filter(
    (status) => status.client === "online" || status.server === "online",
  ).length;

  return (
    <div className="space-y-4">
      <Panel
        title="Services"
        note={`${online}/${rows.length} projects with something online`}
        actions={
          <span className="text-[11px] text-ink-faint">
            {health.isError
              ? "health check failed"
              : `checked ${formatRelative(health.data?.checkedAt)}`}
          </span>
        }
      >
        <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((project) => (
            <ProjectCard key={project.name} project={project} statuses={statuses} />
          ))}
        </div>
      </Panel>

      <Panel title="Ports">
        <div className="grid gap-x-6 gap-y-1 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {(projects.data?.ports ?? []).map((entry) => (
            <div
              key={`${entry.name}-${entry.port}`}
              className="flex items-baseline justify-between gap-3 border-b border-line-soft py-1"
            >
              <span className="text-[12px] text-ink-muted">{entry.name}</span>
              <span className="numeric text-[12px] text-ink">{entry.port}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Global commands">
        {commands.data?.commands.length ? (
          <div className="p-3">
            <table className="w-full border-collapse text-left">
              <tbody>
                {commands.data.commands.map((entry) => (
                  <tr key={entry.cmd} className="border-b border-line-soft last:border-0">
                    <td className="w-24 py-1.5 pr-3 align-top text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                      {entry.category}
                    </td>
                    <td className="numeric py-1.5 pr-3 align-top text-[12px] text-ink">
                      {entry.cmd}
                    </td>
                    <td className="py-1.5 align-top text-[11px] text-ink-faint">
                      {entry.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No global commands configured.</Empty>
        )}
      </Panel>
    </div>
  );
}
