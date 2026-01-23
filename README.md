# Questurian

Nx monorepo for Questurian projects.

## Running Projects

```bash
# Run all servers
nx run-many --target=serve

# Run all in dev/watch mode
nx run-many --target=dev

# Run specific projects
nx run-many --target=serve --projects=dashboard,api

# Run single project
nx serve dashboard
```
