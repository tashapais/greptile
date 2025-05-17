# Greptile Data Directory

This directory contains the generated changelog data files for the Greptile application.

## File Structure

- `repo-registry.json`: Registry of all repositories with changelogs
- `[repository-name].json`: Individual repository changelog files

## Adding Changelogs

To add changelogs to this directory:

1. Run the CLI tool locally:
   ```
   greptile generate --since "2 weeks ago"
   ```

2. Push the generated data files to your repository.

3. Redeploy your application if needed.

## Important Notes

- When deploying to platforms like Vercel, this directory needs to be included in your repository.
- The CI/CD pipeline can be configured to automatically update changelogs (see GitHub Actions workflow).
- Always ensure this directory is tracked in git (not in .gitignore) for web deployments. 