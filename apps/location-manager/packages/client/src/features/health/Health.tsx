export function Health() {
  return (
    <div className="p-5 font-mono">
      <pre>{JSON.stringify({ status: 'ok', service: 'location-manager-client' }, null, 2)}</pre>
    </div>
  );
}
