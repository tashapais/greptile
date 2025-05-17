#!/usr/bin/env node

import { startServer } from '../src/web/server.js';

// Default port from environment variables or 3000
const port = process.env.PORT || 3000;

// Start the server
startServer({ port });

// Let Vercel know we're running
console.log(`Greptile changelog server running on port ${port}`); 