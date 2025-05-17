# Deploying Greptile to Vercel Dashboard

This guide walks you through the process of deploying the Greptile application to Vercel using their web dashboard.

## Prerequisites

1. A GitHub account
2. A Vercel account linked to your GitHub (sign up at [vercel.com](https://vercel.com))
3. OpenAI API key (required)
4. Greptile API key (optional)
5. GitHub Token (optional)

## Step 1: Push your project to GitHub

1. Create a new GitHub repository if you haven't already.
2. Push your Greptile project to the repository.

## Step 2: Import your project in Vercel

1. Log in to your Vercel account at [vercel.com](https://vercel.com).
2. Click on the "Add New..." button and select "Project."
3. Connect to your GitHub account if not already connected.
4. Select the repository containing your Greptile project.
5. Vercel will automatically detect it as a Node.js project.

## Step 3: Configure project settings

In the configuration screen:

1. **Framework Preset**: Select "Other" or leave as auto-detected.
2. **Root Directory**: Leave as `.` (project root).
3. **Build Command**: Enter `npm run vercel-build`.
4. **Output Directory**: Leave as empty.
5. **Install Command**: Leave as `npm install`.

## Step 4: Set up environment variables

Add the following environment variables:

1. **Required**:
   - `OPENAI_API_KEY`: Your OpenAI API key

2. **Optional**:
   - `GREPTILE_API_KEY`: Your Greptile API key for enhanced code analysis
   - `GITHUB_TOKEN`: Your GitHub personal access token for repository access

## Step 5: Deploy

1. Click the "Deploy" button to start the deployment process.
2. Vercel will build and deploy your application.
3. Once complete, you'll receive a URL where your application is accessible.

## Step 6: Set up automatic deployments (optional)

For keeping your changelogs updated:

1. In your Vercel project dashboard, go to "Settings" > "Git".
2. Under "Deploy Hooks", create a new hook:
   - Name: "Update Changelogs"
   - Branch: "main"
3. Copy the generated URL.
4. Add this URL as a secret in your GitHub repository:
   - Go to your GitHub repository.
   - Go to "Settings" > "Secrets and variables" > "Actions".
   - Create a new repository secret:
     - Name: `VERCEL_DEPLOY_HOOK_URL`
     - Value: [paste the URL from step 3]

This will allow the GitHub Actions workflow to trigger a new deployment when changelogs are updated.

## Step 7: Test the deployment

1. Visit your deployed application using the URL provided by Vercel.
2. Generate some changelogs locally using the CLI tool.
3. Push the updated data files to GitHub.
4. Verify the changelogs appear on your deployed application.

## Troubleshooting

- **Missing changelogs**: Make sure you've generated changelogs locally and pushed the data directory to GitHub.
- **Environment variables**: Ensure all required environment variables are set correctly in the Vercel dashboard.
- **Build failures**: Check the build logs in the Vercel dashboard for specific error messages.

## Next Steps

- Set up a custom domain for your Greptile instance in the Vercel dashboard.
- Configure analytics to track usage of your changelog site.
- Set up GitHub Actions to automatically update your changelogs on a schedule. 