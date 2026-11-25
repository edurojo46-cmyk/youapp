import { PluginOption } from 'vite';
import { FederatedPersonSearch } from './src/lib/search/FederatedPersonSearch';
import { QueryIntentParser } from './src/lib/search/UniversalQueryModel';
import express from 'express';

// Express router for backend search
const apiRouter = express.Router();
apiRouter.use(express.json());

apiRouter.post('/federated-search', async (req, res) => {
  try {
    const { name, profession, location_filter, mode = 'ALL_SOURCES', isAdmin = true } = req.body;
    
    // Parse query intent
    const queryToParse = `${name || ''} ${profession || ''} ${location_filter || ''}`.trim();
    const intent = QueryIntentParser.parse(queryToParse);
    
    const filters = {
      name,
      profession,
      location_filter,
      query_intent: intent
    };
    
    const federatedSearch = new FederatedPersonSearch();
    const results = await federatedSearch.search(filters, mode, isAdmin);
    
    res.json(results);
  } catch (err) {
    console.error('Federated Search Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export function BackendSearchPlugin(): PluginOption {
  return {
    name: 'backend-search-plugin',
    configureServer(server) {
      server.middlewares.use('/api', apiRouter);
    }
  };
}
