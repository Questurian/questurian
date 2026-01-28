
## Development Guidelines

### Feature Development
- When adding new features, follow the established pattern:
  ```
  features/
    NewFeature/
      components/
      hooks/
      pages/
      types/
      lib/
      index.ts
  ```
- Always export through the feature's `index.ts` file
- Keep feature-specific logic contained within the feature

### Component Organization
- Shared UI components go in `/components/shared/`
- Feature-specific components stay within their feature folder
- Use descriptive, consistent naming for all components and files
