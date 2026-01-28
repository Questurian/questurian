export function Health() {
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <pre>{JSON.stringify({ status: 'ok', service: 'location-manager-client' }, null, 2)}</pre>
    </div>
  );
}
