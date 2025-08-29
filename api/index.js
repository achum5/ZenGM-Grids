// Vercel serverless function entry point
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let app;

export default async function handler(req, res) {
  if (!app) {
    try {
      // Import the built server
      const serverPath = path.join(__dirname, '..', 'dist', 'index.js');
      const { default: createServer } = await import(serverPath);
      app = createServer;
    } catch (error) {
      console.error('Error loading server:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  return app(req, res);
}