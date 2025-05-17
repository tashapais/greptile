# Deploying Greptile to Vercel

This guide will help you deploy the Greptile web interface to Vercel.

## Prerequisites

1. A [Vercel](https://vercel.com) account
2. [Vercel CLI](https://vercel.com/docs/cli) installed (optional for CLI deployment)
3. An OpenAI API key

## Deployment Steps

### Option 1: Deploy with Vercel CLI (Recommended)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy the project:
   ```bash
   vercel
   ```

4. Follow the prompts to configure your project.

5. When asked about environment variables, add the following:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `GREPTILE_API_KEY`: (Optional) Your Greptile API key
   - `GITHUB_TOKEN`: (Optional) Your GitHub personal access token

6. Deploy to production when ready:
   ```bash
   vercel --prod
   ```

### Option 2: Deploy with Vercel Dashboard

1. Push your project to a GitHub repository.

2. Go to the [Vercel Dashboard](https://vercel.com/dashboard).

3. Click "New Project" and import your GitHub repository.

4. Configure the project settings:
   - Framework Preset: Choose "Other"
   - Root Directory: Keep as default (project root)
   - Build Command: `npm run vercel-build`
   - Output Directory: Keep empty

5. Add environment variables:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `GREPTILE_API_KEY`: (Optional) Your Greptile API key
   - `GITHUB_TOKEN`: (Optional) Your GitHub personal access token

6. Click "Deploy" to start the deployment process.

## Post-Deployment Setup

### Generating Sample Changelogs

Since the deployed version doesn't have access to your local Git repository, you'll need to generate changelogs manually through the CLI on your local machine, and they will show up on the deployed site.

1. Generate changelogs locally using:
   ```bash
   greptile generate --since "2 weeks ago"
   ```

2. Push the generated data files to your GitHub repository.

3. Redeploy your Vercel project to include the generated changelogs.

## Limitations of Deployment

When deployed to Vercel:

1. The application can only display pre-generated changelogs, as it doesn't have direct access to your Git repositories.
2. The CLI commands for generating changelogs won't work in the deployed environment.
3. You'll need to manually update changelogs by generating them locally and pushing the data files.

## Keeping Changelogs Updated

To keep your changelogs updated on Vercel:

1. Set up a GitHub Action workflow that:
   - Runs on a schedule or when commits are pushed
   - Generates changelogs using the CLI tool
   - Commits the updated data files to your repository
   - Triggers a redeployment on Vercel

This will automate the process of keeping your changelogs up to date on the deployed web interface.

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [GitHub Actions Documentation](https://docs.github.com/en/actions) 