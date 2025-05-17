#!/usr/bin/env node

import { startServer } from '../src/web/server.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Determine directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');

// Debug: Show environment and file paths information
console.log('----------------------------------------');
console.log('SERVER STARTING UP');
console.log('----------------------------------------');
console.log('Node Environment:', process.env.NODE_ENV);
console.log('Vercel Environment:', process.env.VERCEL ? 'Yes' : 'No');
console.log('Project Root:', projectRoot);
console.log('Current Working Directory:', process.cwd());
console.log('Data Directory:', dataDir);

// Verify data directory and content
async function checkDataDirectory() {
  try {
    console.log('Checking if data directory exists...');
    const stats = await fs.stat(dataDir);
    console.log('Data directory exists:', stats.isDirectory());
    
    if (stats.isDirectory()) {
      const files = await fs.readdir(dataDir);
      console.log('Files in data directory:', files);
      
      // Check for registry file
      if (files.includes('repo-registry.json')) {
        const registryPath = path.join(dataDir, 'repo-registry.json');
        const content = await fs.readFile(registryPath, 'utf8');
        console.log('Registry content:', content);
      } else {
        console.log('WARNING: No repo-registry.json found!');
      }
    }
  } catch (error) {
    console.error('Error checking data directory:', error.message);
  }
}

// Run checks and start server
async function run() {
  await checkDataDirectory();
  
  // Default port from environment variables or 3000
  const port = process.env.PORT || 3000;
  
  // Start the server
  startServer({ port });
  
  console.log(`Greptile changelog server running on port ${port}`);
}

run().catch(err => {
  console.error('Server initialization error:', err);
}); 