import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  
  // Use Render's PORT environment variable
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Helper: Truncate text for AI
  function truncateForAI(text: string, maxLength: number = 900000): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '\n\n...[Content truncated due to length]...';
  }

  // ✅ FIXED: Robust JSON fetch that handles responses correctly
  async function safeJsonFetch(url: string, options?: RequestInit) {
    const res = await fetch(url, options);
    
    if (!res.ok) {
      const text = await res.text();
      console.error(`[Fetch Error] HTTP ${res.status}: ${text.substring(0, 200)}`);
      throw new Error(`API returned ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    return { data, status: res.status, ok: true };
  }

  // ============================================
  // MULTIPLE API KEYS WITH FALLBACK
  // ============================================
  
  // Collect all available API keys
  const API_KEYS = [
    process.env.OPENROUTER_API_KEY_1,
    process.env.OPENROUTER_API_KEY_2,
    process.env.OPENROUTER_API_KEY_3,
    process.env.OPENROUTER_API_KEY_4,
    process.env.OPENROUTER_API_KEY_5,
    process.env.Smartlinker_api
  ].filter(key => key && key.trim() !== '');

  console.log(`[API] Loaded ${API_KEYS.length} API keys for fallback`);

  async function callAIWithFallback(prompt: string, content: string) {
    const truncatedContent = truncateForAI(content || '', 40000);
    
    for (let i = 0; i < API_KEYS.length; i++) {
      const apiKey = API_KEYS[i];
      try {
        console.log(`[AI] Trying key ${i + 1}/${API_KEYS.length}`);
        
        const payload = {
          model: 'qwen/qwen-plus',
          messages: [{ role: 'user', content: `${prompt}\n\nCONTENT:\n${truncatedContent}` }],
          temperature: 0.1,
          max_tokens: 4000
        };

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${apiKey}`, 
            'Content-Type': 'application/json', 
            'X-Title': 'SmartScraper' 
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const data = await response.json();
          const aiResponse = data.choices?.[0]?.message?.content;
          if (aiResponse) {
            console.log(`[AI] ✅ Success with key ${i + 1}`);
            return { success: true, analysis: aiResponse };
          }
        } else {
          const errorText = await response.text();
          console.log(`[AI] Key ${i + 1} failed: ${response.status} - ${errorText.substring(0, 100)}`);
        }
      } catch (err: any) {
        console.log(`[AI] Key ${i + 1} error: ${err.message}`);
      }
    }
    
    return { success: false, error: 'All API keys exhausted or failed' };
  }

  // --- Scraper Proxy Endpoints ---
  app.get('/api/proxy/beautifulsoup', async (req, res) => {
    console.log(`[Proxy] BeautifulSoup Request: ${req.query.url}`);
    try {
      const { url } = req.query;
      if (!url) return res.status(400).json({ error: 'URL is required' });
      const response = await axios.get(url as string, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 20000
      });
      const $ = cheerio.load(response.data);
      $('script, style, nav, footer, header').remove();
      const content = $('body').text().replace(/\s+/g, ' ').trim();
      res.json({ content, markdown: content });
    } catch (err: any) {
      res.status(500).json({ error: `BeautifulSoup failed: ${err.message}` });
    }
  });

  app.post('/api/proxy/crawl4ai', async (req, res) => {
    console.log(`[Proxy] Crawl4AI Request: ${req.body.url}`);
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required' });
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Crawl4AI-Parser/1.0' },
        timeout: 20000
      });
      const $ = cheerio.load(response.data);
      $('nav, footer, script, style, .ads, .social').remove();
      const title = $('title').text();
      const body = $('main, article, #content, .post-content').first().text() || $('body').text();
      const cleanText = body.replace(/\s+/g, ' ').trim();
      res.json({ markdown: `# ${title}\n\n${cleanText}`, metadata: { title } });
    } catch (err: any) {
      res.status(500).json({ error: `Crawl4AI failed: ${err.message}` });
    }
  });

  app.get('/api/proxy/playwright', async (req, res) => {
    console.log(`[Proxy] Playwright Request: ${req.query.url}`);
    try {
      const { url } = req.query;
      if (!url) return res.status(400).json({ error: 'URL is required' });
      const response = await axios.get(url as string, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Playwright/Rendering-Engine)' },
        timeout: 30000
      });
      const $ = cheerio.load(response.data);
      const content = $('body').text().replace(/\s+/g, ' ').trim();
      res.json({ html: response.data, content });
    } catch (err: any) {
      res.status(500).json({ error: `Playwright simulation failed: ${err.message}` });
    }
  });

  // --- Crawler Engine Endpoint ---
  app.post('/api/crawl', async (req, res) => {
    console.log('[API] /api/crawl hit');
    try {
      let { url, max_pages = 3, use_js = false } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required' });

      if (!url.startsWith('http')) url = 'https://' + url;

      const baseCrawlUrl = "https://crawlee-3-jqtc.onrender.com";
      console.log(`[Crawler] Starting: ${url} (Pages: ${max_pages})`);
      
      const { data: startData, status: startStatus, ok: startOk } = await safeJsonFetch(`${baseCrawlUrl}/crawl`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; SmartScraper/1.0)'
        },
        body: JSON.stringify({ url: url, max_pages: Number(max_pages), use_js: false })
      });

      if (!startOk) {
        console.error('[Crawler] API Error:', startData);
        throw new Error(startData.detail ? JSON.stringify(startData.detail) : `API ${startStatus}`);
      }

      const taskId = startData.job_id || startData.request_id;
      if (!taskId) {
        console.error('[Crawler] No ID found in:', startData);
        throw new Error('No job_id or request_id returned from crawler API');
      }

      const maxWait = 150000;
      const interval = 5000;
      let elapsed = 0;
      let rawLinks: any[] = [];

      while (elapsed < maxWait) {
        try {
          const { data: pollData, status: pollStatus, ok: pollOk } = await safeJsonFetch(`${baseCrawlUrl}/results/${taskId}`);
          if (pollOk) {
            const status = (pollData.status || '').toLowerCase();
            console.log(`[Crawler] Poll Status: ${status || 'Checking...'}`);
            const results = pollData.links || pollData.results || pollData.data?.links || (Array.isArray(pollData) ? pollData : null);

            if (status === 'completed' || status === 'finished' || status === 'success') {
              rawLinks = results || [];
              if (rawLinks.length > 0) break;
              else throw new Error('Crawl reported success but returned an empty link set.');
            } 
            
            if (status === 'failed' || status === 'error') {
              throw new Error(`Crawl job failed on server: ${pollData.message || 'The crawler encountered an internal error.'}`);
            }

            if (!status && Array.isArray(results) && results.length > 0) {
              rawLinks = results;
              break;
            }
          }
        } catch (e: any) { 
          if (e.message?.includes('failed on server') || e.message?.includes('reported success')) throw e;
          console.error('[Crawler] Poll heartbeat error:', e.message);
        }
        
        await new Promise(r => setTimeout(r, interval));
        elapsed += interval;
      }

      if (rawLinks.length === 0) {
        throw new Error('Crawl timed out or yielded no results.');
      }

      const cleanedData: { url: string; asin: string; type: 'product' | 'general' }[] = [];
      const seenUrls = new Set<string>();
      const productPattern = /\/(?:dp|product|gp\/product)\/([A-Z0-9]{10})/;

      for (let item of rawLinks) {
        let link = typeof item === 'string' ? item : (item.url || item.link || item.href);
        if (!link || typeof link !== 'string') continue;
        
        if (link.startsWith('http://')) link = 'https://' + link.slice(7);
        else if (!link.startsWith('http')) link = 'https://' + link;

        const baseUrlOnly = link.split('?')[0].split('#')[0].replace(/\/$/, "");
        if (seenUrls.has(baseUrlOnly)) continue;

        const match = baseUrlOnly.match(productPattern);
        if (match) {
          cleanedData.push({ url: baseUrlOnly, asin: match[1], type: 'product' });
        } else {
          cleanedData.push({ url: baseUrlOnly, asin: 'N/A', type: 'general' });
        }
        seenUrls.add(baseUrlOnly);
      }

      if (cleanedData.length === 0) {
        throw new Error('Zero valid links could be extracted from the crawl stream.');
      }

      cleanedData.sort((a,b) => (a.type === 'product' ? -1 : 1));
      res.json({ success: true, links: cleanedData });

    } catch (err: any) {
      console.error('[Crawler] ERROR:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // AI ANALYSIS ENDPOINT WITH MULTIPLE API FALLBACK
  // ============================================
  app.post('/api/analyze', async (req, res) => {
    console.log('[API] /api/analyze hit');
    try {
      const { prompt, content } = req.body;
      
      if (!prompt && !content) {
        return res.status(400).json({ error: 'Prompt or content is required' });
      }

      if (API_KEYS.length === 0) {
        console.error('[AI] No API keys configured');
        return res.status(500).json({ error: 'AI API Key missing. Please add OPENROUTER_API_KEY_1, OPENROUTER_API_KEY_2, etc. in Render environment variables.' });
      }

      const result = await callAIWithFallback(prompt || 'Summarize this content', content || '');
      
      if (!result.success) {
        console.error('[AI] All keys failed:', result.error);
        return res.status(503).json({ error: result.error || 'AI service unavailable. Please try again later.' });
      }

      res.json({ analysis: result.analysis });
      
    } catch (err: any) {
      console.error('[AI] Handler Exception:', err.message);
      res.status(500).json({ error: `AI integration failed: ${err.message}` });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`✅ Loaded ${API_KEYS.length} API keys for fallback`);
  });
}

startServer();
