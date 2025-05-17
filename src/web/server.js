import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = path.join(__dirname, '../../data');
const viewsDir = path.join(__dirname, 'views');
const publicDir = path.join(__dirname, 'public');

/**
 * Start the web server
 */
export async function startServer(options) {
  const port = options.port || process.env.PORT || 3000;
  
  const app = express();
  
  // Set up EJS as the view engine
  app.set('view engine', 'ejs');
  app.set('views', viewsDir);
  
  // Static files
  app.use(express.static(publicDir));
  
  // Routes
  app.get('/', async (req, res) => {
    try {
      const repositories = await getRepositories();
      
      if (repositories.length === 0) {
        return res.render('empty', {
          message: 'No repositories available yet',
          description: 'Generate your first changelog using the CLI tool.'
        });
      }
      
      // If only one repo exists or a specific repo is selected, redirect to that repo
      if (repositories.length === 1 || req.query.repo) {
        const repoName = req.query.repo || repositories[0].name;
        return res.redirect(`/repo/${repoName}`);
      }
      
      res.render('repositories', { repositories });
    } catch (error) {
      console.error('Error loading repositories:', error);
      res.status(500).render('error', { 
        message: 'Error loading repositories',
        error: {
          status: 500,
          stack: process.env.NODE_ENV === 'development' ? error.stack : ''
        }
      });
    }
  });
  
  app.get('/repo/:name', async (req, res) => {
    try {
      const repoName = req.params.name;
      const repositories = await getRepositories();
      const repository = repositories.find(r => r.name === repoName);
      
      if (!repository) {
        return res.status(404).render('error', { 
          message: 'Repository not found',
          error: {
            status: 404,
            stack: ''
          }
        });
      }
      
      const changelogs = await getChangelogsForRepo(repository.filename);
      
      res.render('index', { changelogs, repository, repositories });
    } catch (error) {
      console.error('Error loading changelogs:', error);
      res.status(500).render('error', { 
        message: 'Error loading changelogs',
        error: {
          status: 500,
          stack: process.env.NODE_ENV === 'development' ? error.stack : ''
        }
      });
    }
  });
  
  app.get('/repo/:name/changelog/:id', async (req, res) => {
    try {
      const repoName = req.params.name;
      const repositories = await getRepositories();
      const repository = repositories.find(r => r.name === repoName);
      
      if (!repository) {
        return res.status(404).render('error', { 
          message: 'Repository not found',
          error: {
            status: 404,
            stack: ''
          }
        });
      }
      
      const changelogs = await getChangelogsForRepo(repository.filename);
      const changelog = changelogs.find(c => c.id === req.params.id);
      
      if (!changelog) {
        return res.status(404).render('error', { 
          message: 'Changelog not found',
          error: {
            status: 404,
            stack: ''
          }
        });
      }
      
      res.render('changelog', { changelog, repository, repositories });
    } catch (error) {
      console.error('Error loading changelog:', error);
      res.status(500).render('error', { 
        message: 'Error loading changelog',
        error: {
          status: 500,
          stack: process.env.NODE_ENV === 'development' ? error.stack : ''
        }
      });
    }
  });
  
  // Download changelog as Markdown
  app.get('/repo/:name/changelog/:id/download', async (req, res) => {
    try {
      const repoName = req.params.name;
      const repositories = await getRepositories();
      const repository = repositories.find(r => r.name === repoName);
      
      if (!repository) {
        return res.status(404).render('error', { 
          message: 'Repository not found',
          error: {
            status: 404,
            stack: ''
          }
        });
      }
      
      const changelogs = await getChangelogsForRepo(repository.filename);
      const changelog = changelogs.find(c => c.id === req.params.id);
      
      if (!changelog) {
        return res.status(404).render('error', { 
          message: 'Changelog not found',
          error: {
            status: 404,
            stack: ''
          }
        });
      }
      
      // Generate markdown content
      let markdown = `# ${changelog.title}\n\n`;
      markdown += `${new Date(changelog.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;
      
      if (changelog.timeRange) {
        markdown += `Changes from ${changelog.timeRange.since} to ${changelog.timeRange.until}\n\n`;
      }
      
      if (changelog.entries && changelog.entries.length > 0) {
        for (const entry of changelog.entries) {
          markdown += `## ${entry.category}\n\n`;
          
          if (entry.items && entry.items.length > 0) {
            for (const item of entry.items) {
              markdown += `- ${item}\n`;
            }
            markdown += '\n';
          }
        }
      }
      
      // Send as downloadable file
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${repoName}-changelog-${changelog.id}.md"`);
      res.send(markdown);
    } catch (error) {
      console.error('Error downloading changelog:', error);
      res.status(500).render('error', { 
        message: 'Error downloading changelog',
        error: {
          status: 500,
          stack: process.env.NODE_ENV === 'development' ? error.stack : ''
        }
      });
    }
  });
  
  // Serve legacy links (redirect to first repository if exists)
  app.get('/changelog/:id', async (req, res) => {
    try {
      const repositories = await getRepositories();
      
      if (repositories.length > 0) {
        return res.redirect(`/repo/${repositories[0].name}/changelog/${req.params.id}`);
      } else {
        return res.status(404).render('error', { 
          message: 'No repositories available',
          error: {
            status: 404,
            stack: ''
          }
        });
      }
    } catch (error) {
      console.error('Error handling legacy link:', error);
      res.status(500).render('error', { 
        message: 'Error handling request',
        error: {
          status: 500,
          stack: process.env.NODE_ENV === 'development' ? error.stack : ''
        }
      });
    }
  });
  
  // API endpoints for AJAX updates
  app.get('/api/repositories', async (req, res) => {
    try {
      const repositories = await getRepositories();
      res.json(repositories);
    } catch (error) {
      console.error('Error fetching repositories:', error);
      res.status(500).json({ error: 'Error fetching repositories' });
    }
  });
  
  app.get('/api/repo/:name/changelogs', async (req, res) => {
    try {
      const repoName = req.params.name;
      const repositories = await getRepositories();
      const repository = repositories.find(r => r.name === repoName);
      
      if (!repository) {
        return res.status(404).json({ error: 'Repository not found' });
      }
      
      const changelogs = await getChangelogsForRepo(repository.filename);
      res.json(changelogs);
    } catch (error) {
      console.error('Error fetching changelogs:', error);
      res.status(500).json({ error: 'Error fetching changelogs' });
    }
  });
  
  // Error handling
  app.use((req, res) => {
    res.status(404).render('error', {
      message: 'Page not found',
      error: {
        status: 404,
        stack: ''
      }
    });
  });
  
  // Start server
  app.listen(port, () => {
    console.log(chalk.green(`Changelog web server started at http://localhost:${port}`));
    console.log(chalk.blue('Press Ctrl+C to stop'));
  });
}

/**
 * Get all repositories
 */
async function getRepositories() {
  try {
    const registryPath = path.join(dataDir, 'repo-registry.json');
    
    try {
      const data = await fs.readFile(registryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Try to check legacy changelog.json as fallback
        try {
          const legacyPath = path.join(dataDir, 'changelogs.json');
          await fs.access(legacyPath);
          
          // Create an entry for the legacy file
          const registry = [{
            name: 'default',
            filename: 'changelogs.json',
            lastUpdated: new Date().toISOString()
          }];
          
          // Save this registry for future use
          await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
          
          return registry;
        } catch {
          // No legacy file either
          return [];
        }
      }
      throw error;
    }
  } catch (error) {
    console.error(chalk.red('Error reading repository registry:'), error.message);
    return [];
  }
}

/**
 * Get changelogs for a specific repository
 */
async function getChangelogsForRepo(filename) {
  try {
    const changelogsPath = path.join(dataDir, filename);
    
    try {
      const data = await fs.readFile(changelogsPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist
        return [];
      }
      throw error;
    }
  } catch (error) {
    console.error(chalk.red(`Error reading changelogs from ${filename}:`), error.message);
    return [];
  }
} 