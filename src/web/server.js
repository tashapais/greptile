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
      const changelogs = await getChangelogs();
      res.render('index', { changelogs });
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
  
  app.get('/changelog/:id', async (req, res) => {
    try {
      const changelogs = await getChangelogs();
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
      
      res.render('changelog', { changelog });
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
 * Get all changelogs
 */
async function getChangelogs() {
  try {
    const changelogsPath = path.join(dataDir, 'changelogs.json');
    
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
    console.error(chalk.red('Error reading changelogs:'), error.message);
    return [];
  }
} 