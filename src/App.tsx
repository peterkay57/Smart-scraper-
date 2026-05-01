import { useState, useEffect } from 'react';
import { 
  Search, 
  Trash2, 
  Copy, 
  Globe, 
  Terminal, 
  Check, 
  Code2, 
  Loader2,
  Github,
  Settings2,
  AlertCircle,
  Clock,
  History,
  X,
  Sparkles,
  Layers,
  ArrowRight,
  AlertTriangle,
  Table,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type TabType = 'results' | 'json' | 'analysis' | 'csv';

interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  strategy: string;
}

interface HistoryItem {
  id: string;
  url: string;
  timestamp: string;
  results: ScrapeResult[];
}

export default function App() {
  const [urlInput, setUrlInput] = useState('');
  const [instruction, setInstruction] = useState('');
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('results');
  const [results, setResults] = useState<ScrapeResult[]>([]);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [csvResult, setCsvResult] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('Provide a structured summary and key highlights of this web content.');
  const [generatingCsv, setGeneratingCsv] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [scrapingProgress, setScrapingProgress] = useState({ current: 0, total: 0 });
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Crawler State
  const [crawlerEnabled, setCrawlerEnabled] = useState(false);
  const [seedUrl, setSeedUrl] = useState('');
  const [maxPages, setMaxPages] = useState(3);
  const [crawlDepth, setCrawlDepth] = useState(1);
  const [crawling, setCrawling] = useState(false);
  const [discoveredLinks, setDiscoveredLinks] = useState<{url: string, asin: string, type?: 'product' | 'general'}[]>([]);

  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [selectedApis, setSelectedApis] = useState<string[]>(['beautifulsoup', 'crawl4ai', 'playwright']);

  const SCRAPER_OPTIONS = [
    { id: 'beautifulsoup', name: 'BeautifulSoup', description: 'Fast, static HTML extraction' },
    { id: 'crawl4ai', name: 'Crawl4AI', description: 'Clean markdown for LLMs' },
    { id: 'playwright', name: 'Playwright', description: 'Headless JS rendering' }
  ];

  const examples = [
    { name: 'BBC News Headlines', url: 'https://www.bbc.com/news' },
    { name: 'Hacker News Stories', url: 'https://news.ycombinator.com' },
    { name: 'Wikipedia Summary', url: 'https://en.wikipedia.org/wiki/Web_scraping' },
    { name: 'GitHub Trending', url: 'https://github.com/trending' }
  ];

  useEffect(() => {
    const saved = localStorage.getItem('smartscraper-history');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('smartscraper-history', JSON.stringify(history));
  }, [history]);

  const handleApiToggle = (apiId: string) => {
    if (mode === 'single') {
      setSelectedApis([apiId]);
    } else {
      setSelectedApis(prev => 
        prev.includes(apiId) ? prev.filter(id => id !== apiId) : [...prev, apiId]
      );
    }
  };

  const handleModeChange = (newMode: 'single' | 'multi') => {
    setMode(newMode);
    if (newMode === 'single' && selectedApis.length > 1) {
      setSelectedApis([selectedApis[0]]);
    }
  };

  const isValidUrl = (url: string) => {
    if (!url) return true; // Don't show error for empty input
    try {
      const urlToTest = url.startsWith('http') ? url : `https://${url}`;
      const parsed = new URL(urlToTest);
      return parsed.hostname.includes('.') && parsed.hostname.length > 3;
    } catch {
      return false;
    }
  };

  const safeFetch = async (url: string, options?: RequestInit) => {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type');
    
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`[App Fetch Error] URL: ${url} | Content-Type: ${contentType} | Status: ${response.status}. Body:`, text.substring(0, 500));
      throw new Error(`Endpoint ${url} returned non-JSON response (${response.status}). The service route may be missing or blocked.`);
    }
    
    const data = await response.json();
    return { data, ok: response.ok, status: response.status };
  };

  const executeCrawl = async () => {
    if (!seedUrl || !isValidUrl(seedUrl) || crawling) return;
    setCrawling(true);
    setStatus('Crawler Booting... (Est. 30-90s)');
    setDiscoveredLinks([]);
    
    try {
      const { data, ok } = await safeFetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: seedUrl, 
          max_pages: Number(maxPages),
          use_js: true 
        })
      });
      
      if (!ok) throw new Error(data.error || 'Crawl failed');
      
      const links = data.links || [];
      setDiscoveredLinks(links);
      
      const products = links.filter((l: any) => l.type === 'product');
      if (products.length > 0) {
        setStatus(`Success: Discovered ${products.length} Products.`);
        setUrlInput(products[0].url);
      } else if (links.length > 0) {
        setStatus(`Found ${links.length} Links (No Amazon Products detected).`);
        setUrlInput(links[0].url);
      } else {
        throw new Error('Zero links parsed from stream.');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Unknown crawl error';
      setStatus(`Crawl Failed: ${errorMessage.substring(0, 50)}...`);
      console.error('Crawl Error:', err);
    } finally {
      setCrawling(false);
    }
  };

  const handleResearchAll = async () => {
    if (discoveredLinks.length === 0 || loading) return;
    
    setLoading(true);
    setBatchMode(true);
    setResults([]);
    setAnalysisResult('');
    setScrapingProgress({ current: 0, total: discoveredLinks.length });
    setActiveTab('results');

    const apisToRun = mode === 'multi' ? selectedApis : [selectedApis[0] || 'beautifulsoup'];
    const allBatchResults: ScrapeResult[] = [];

    for (let i = 0; i < discoveredLinks.length; i++) {
      const link = discoveredLinks[i];
      setScrapingProgress({ current: i + 1, total: discoveredLinks.length });
      setStatus(`Scraping ${i + 1} of ${discoveredLinks.length}: ${link.url.substring(0, 30)}...`);

      try {
        for (const api of apisToRun) {
          const endpoint = api === 'crawl4ai' ? '/api/proxy/crawl4ai' : `/api/proxy/${api}?url=${encodeURIComponent(link.url)}`;
          const method = api === 'crawl4ai' ? 'POST' : 'GET';
          const body = api === 'crawl4ai' ? JSON.stringify({ url: link.url }) : undefined;

          const { data, ok } = await safeFetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body
          });

          if (ok) {
            const result: ScrapeResult = {
              url: link.url,
              title: data.metadata?.title || `Extracted: ${link.asin || 'Resource'}`,
              content: data.markdown || data.content || 'No content found.',
              strategy: api.toUpperCase()
            };
            allBatchResults.push(result);
            // Append to state in real-time
            setResults(prev => [...prev, result]);
          }
        }
      } catch (err) {
        console.error(`Failed to scrape ${link.url}:`, err);
        // Continue to next link
      }
    }

    if (allBatchResults.length > 0) {
      const historyItem: HistoryItem = {
        id: crypto.randomUUID(),
        url: `Batch Research: ${discoveredLinks.length} URLs`,
        timestamp: new Date().toLocaleTimeString(),
        results: allBatchResults
      };
      setHistory(prev => [historyItem, ...prev.slice(0, 19)]);
    }

    setStatus(`Research complete! Processed ${discoveredLinks.length} links.`);
    setLoading(false);
    setBatchMode(false);
  };

  const executeScrape = async () => {
    if (!urlInput || !isValidUrl(urlInput) || loading) return;
    
    setLoading(true);
    setStatus('Initializing extraction engine...');
    setResults([]);
    setAnalysisResult('');

    try {
      const apisToRun = mode === 'multi' ? selectedApis : [selectedApis[0] || 'beautifulsoup'];
      const batchResults: ScrapeResult[] = [];

      for (const api of apisToRun) {
        setStatus(`Running ${api} protocol...`);
        const endpoint = api === 'crawl4ai' ? '/api/proxy/crawl4ai' : `/api/proxy/${api}?url=${encodeURIComponent(urlInput)}`;
        const method = api === 'crawl4ai' ? 'POST' : 'GET';
        const body = api === 'crawl4ai' ? JSON.stringify({ url: urlInput }) : undefined;

        const { data, ok } = await safeFetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body
        });

        if (ok) {
          batchResults.push({
            url: urlInput,
            title: data.metadata?.title || 'Extracted Resource',
            content: data.markdown || data.content || 'No content found.',
            strategy: api.toUpperCase()
          });
        }
      }

      setResults(batchResults);
      if (batchResults.length > 0) {
        const historyItem: HistoryItem = {
          id: crypto.randomUUID(),
          url: urlInput,
          timestamp: new Date().toLocaleTimeString(),
          results: batchResults
        };
        setHistory(prev => [historyItem, ...prev.slice(0, 19)]);
      }
      setStatus('Extraction complete!');
      setActiveTab('results');
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (results.length === 0 || analyzing) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setStatus('AI is synthesizing content...');
    setActiveTab('analysis');

    try {
      const combinedContent = results.map(r => `[Source: ${r.strategy}]\n${r.content}`).join('\n\n---\n\n');
      const { data, ok } = await safeFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: aiPrompt || instruction || 'Provide a structured summary and key highlights of this web content.',
          content: combinedContent 
        })
      });

      if (ok) {
        setAnalysisResult(data.analysis);
        setStatus('AI Analysis Complete');
      } else {
        const errorMsg = data.error || 'Failed to generate analysis. This may be due to token limits or API issues.';
        setAnalysisError(errorMsg);
        setStatus(`AI Error: ${errorMsg.substring(0, 50)}...`);
      }
    } catch (err: any) {
      const errorMsg = `Connection failed: ${err.message}`;
      setAnalysisError(errorMsg);
      setStatus(`AI Alert: ${errorMsg}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerateCSV = async () => {
    if (results.length === 0 || generatingCsv) return;
    setGeneratingCsv(true);
    setStatus('AI is formatting CSV data...');
    setActiveTab('csv');

    try {
      const combinedContent = results.map(r => `[Source: ${r.strategy}]\n${r.content}`).join('\n\n---\n\n');
      const { data, ok } = await safeFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: 'Analyse and organise this data, remove all unwanted text/HTML, and output it strictly in a pure CSV format with no talking or markdown code blocks.',
          content: combinedContent 
        })
      });

      if (ok) {
        setCsvResult(data.analysis);
        setStatus('CSV Generation Complete');
      } else {
        throw new Error(data.error || 'CSV generation failed');
      }
    } catch (err: any) {
      setStatus(`CSV generation failed: ${err.message}`);
    } finally {
      setGeneratingCsv(false);
    }
  };

  const handleResetAll = () => {
    setUrlInput('');
    setInstruction('');
    setStatus('');
    setLoading(false);
    setActiveTab('results');
    setResults([]);
    setAnalysisResult('');
    setAnalysisError(null);
    setCsvResult('');
    setAnalyzing(false);
    setAiPrompt('Provide a structured summary and key highlights of this web content.');
    setGeneratingCsv(false);
    setBatchMode(false);
    setScrapingProgress({ current: 0, total: 0 });
    setCrawlerEnabled(false);
    setSeedUrl('');
    setMaxPages(3);
    setCrawlDepth(1);
    setCrawling(false);
    setDiscoveredLinks([]);
    setMode('single');
    setSelectedApis(['beautifulsoup', 'crawl4ai', 'playwright']);
    setShowResetConfirm(false);
  };

  return (
    <div className="min-h-screen bg-[#0c0c16] text-gray-200 font-sans p-4 md:p-8 flex flex-col items-center">
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/20 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-5xl space-y-12 relative z-10">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-lg shrink-0">
              <Code2 className="w-7 h-7 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase italic flex items-center gap-2 overflow-hidden whitespace-nowrap">
                Smart<span className="text-white">Scraper</span>
              </h1>
              <p className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-widest truncate">Professional Data Extraction Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end sm:justify-start">
            {showResetConfirm ? (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                <button 
                  onClick={handleResetAll}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 border border-red-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Yes, Clear All
                </button>
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  className="p-2 bg-white/5 hover:bg-white/10 text-gray-500 rounded-xl border border-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 border border-white/10 hover:border-red-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all group"
              >
                <RefreshCw className="w-3.5 h-3.5 transition-transform group-hover:rotate-180 duration-500" />
                <span className="hidden sm:inline">New Scraping</span>
              </button>
            )}
            <button onClick={() => setShowHistory(true)} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all">
              <Clock className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </header>

        {/* Crawler Section (Conditional) */}
        <div className="flex items-center gap-3 bg-white/5 p-4 rounded-3xl border border-white/10">
          <div className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${crawlerEnabled ? 'bg-blue-600' : 'bg-gray-700'}`} onClick={() => setCrawlerEnabled(!crawlerEnabled)}>
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${crawlerEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
          <span className="text-xs font-black uppercase tracking-widest text-gray-300">Enable Crawler Engine</span>
        </div>

        <AnimatePresence>
          {crawlerEnabled && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white/[0.03] border border-white/10 rounded-[32px] p-6 md:p-10 backdrop-blur-3xl shadow-2xl space-y-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                    <Loader2 className={`w-6 h-6 text-blue-400 ${crawling ? 'animate-spin' : ''}`} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight uppercase italic flex items-center gap-2">
                      Crawler<span className="text-white">Engine</span>
                    </h2>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Professional Link Discovery</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="relative group">
                    <Globe className={`absolute left-5 top-5 w-5 h-5 transition-colors ${!isValidUrl(seedUrl) && seedUrl ? 'text-red-500' : 'text-gray-500 group-focus-within:text-white'}`} />
                    <input 
                      value={seedUrl}
                      onChange={(e) => setSeedUrl(e.target.value)}
                      placeholder="Enter seed website URL to start crawling from..."
                      className={`w-full bg-white/5 border rounded-2xl py-4 pl-14 pr-12 text-sm font-medium focus:bg-white/[0.08] transition-all outline-none ${!isValidUrl(seedUrl) && seedUrl ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-white/30'}`}
                    />
                    {!isValidUrl(seedUrl) && seedUrl && (
                      <AlertCircle className="absolute right-5 top-5 w-5 h-5 text-red-500 animate-pulse" />
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">
                        Pages to crawl
                      </div>
                      <input 
                        type="range" min="1" max="10" step="1"
                        value={maxPages}
                        onChange={(e) => setMaxPages(parseInt(e.target.value))}
                        className="w-full accent-blue-600"
                      />
                      <div className="flex justify-between text-[10px] font-bold text-gray-500">
                        <span>1 Page</span>
                        <span className="text-blue-400">{maxPages} Pages Selected</span>
                        <span>10 Pages</span>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-purple-400">
                        Crawl Depth
                      </div>
                      <div className="flex gap-2">
                        {[1, 2, 3].map(d => (
                          <button 
                            key={d} 
                            onClick={() => setCrawlDepth(d)}
                            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${crawlDepth === d ? 'bg-purple-600 border-purple-500 text-white' : 'bg-white/5 border-white/10 text-gray-500'}`}
                          >
                            Lvl {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button 
                    onClick={executeCrawl}
                    disabled={crawling || !seedUrl || !isValidUrl(seedUrl)}
                    className="w-full flex items-center justify-center gap-3 bg-white text-[#0c0c16] p-5 rounded-2xl text-xs font-black uppercase tracking-[0.3em] transition-all disabled:opacity-50"
                  >
                    {crawling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Layers className="w-5 h-5" />}
                    Start Crawling
                  </button>
                  <button 
                    onClick={handleResearchAll}
                    disabled={crawling || discoveredLinks.length === 0 || loading}
                    className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white p-5 rounded-2xl text-xs font-black uppercase tracking-[0.3em] transition-all disabled:opacity-50 shadow-xl shadow-blue-600/20"
                  >
                    {loading && batchMode ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    Research All
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Console Input */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/[0.03] border border-white/10 rounded-[32px] p-6 md:p-10 backdrop-blur-3xl shadow-2xl space-y-8"
        >
          <div className="space-y-6">
            <div className="relative group">
              <Globe className="absolute left-5 top-5 w-5 h-5 text-gray-500 group-focus-within:text-white transition-colors" />
              {discoveredLinks.length > 0 ? (
                <select 
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-sm font-medium focus:border-white/30 focus:bg-white/[0.08] transition-all outline-none appearance-none"
                >
                  {discoveredLinks.map((link, idx) => (
                    <option key={idx} value={link.url} className="bg-[#0c0c16]">
                      [{link.type === 'product' ? 'PRODUCT' : 'LINK'}] {link.url}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="relative group">
                  <Globe className={`absolute left-5 top-5 w-5 h-5 transition-colors ${!isValidUrl(urlInput) && urlInput ? 'text-red-500' : 'text-gray-500 group-focus-within:text-white'}`} />
                  <input 
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="Enter website URL..."
                    className={`w-full bg-white/5 border rounded-2xl py-4 pl-14 pr-12 text-sm font-medium focus:bg-white/[0.08] transition-all outline-none ${!isValidUrl(urlInput) && urlInput ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-white/30'}`}
                  />
                  {!isValidUrl(urlInput) && urlInput && (
                    <AlertCircle className="absolute right-5 top-5 w-5 h-5 text-red-500 animate-pulse" />
                  )}
                </div>
              )}
              {discoveredLinks.length > 0 && (
                <div className="absolute right-5 top-4 px-3 py-1 bg-blue-600 rounded-full text-[10px] font-black text-white">
                  {discoveredLinks.length} Discovered
                </div>
              )}
            </div>
            <div className="relative group">
              <Terminal className="absolute left-5 top-5 w-5 h-5 text-gray-500 group-focus-within:text-white transition-colors" />
              <input 
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Extraction notes (optional)..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-sm font-medium focus:border-white/30 focus:bg-white/[0.08] transition-all outline-none"
              />
            </div>
          </div>

          {/* Config Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-white/[0.02] border border-white/10 rounded-3xl">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">
                <Settings2 className="w-3.5 h-3.5" /> Scraper selection
              </div>
              <div className="flex flex-col gap-3">
                {SCRAPER_OPTIONS.map(api => (
                  <label key={api.id} className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input 
                        type="checkbox" 
                        className="peer sr-only"
                        checked={selectedApis.includes(api.id)}
                        onChange={() => handleApiToggle(api.id)}
                      />
                      <div className="w-5 h-5 border-2 border-white/10 rounded-lg group-hover:border-white/30 peer-checked:border-blue-500 peer-checked:bg-blue-500 transition-all" />
                      <Check className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-gray-300 group-hover:text-white transition-all">{api.name}</span>
                      <span className="text-[9px] text-gray-500 font-medium uppercase tracking-tighter">{api.description}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-purple-400">
                <Layers className="w-3.5 h-3.5" /> Execution protocol
              </div>
              <div className="flex flex-col gap-4">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input type="radio" checked={mode === 'single'} onChange={() => handleModeChange('single')} className="peer sr-only" />
                  <div className="w-5 h-5 border-2 border-white/10 rounded-full group-hover:border-white/30 peer-checked:border-purple-500 peer-checked:bg-purple-500 transition-all" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-300 group-hover:text-white">Single Source Mode</span>
                    <span className="text-[9px] text-gray-500 font-medium">Fastest path, routed to primary scraper</span>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input type="radio" checked={mode === 'multi'} onChange={() => handleModeChange('multi')} className="peer sr-only" />
                  <div className="w-5 h-5 border-2 border-white/10 rounded-full group-hover:border-white/30 peer-checked:border-purple-500 peer-checked:bg-purple-500 transition-all" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-300 group-hover:text-white">Parallel Source Mode</span>
                    <span className="text-[9px] text-gray-500 font-medium">Dual-protocol, redundant data fusion</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={executeScrape}
              disabled={loading || !urlInput || !isValidUrl(urlInput)}
              className="flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white p-5 rounded-2xl text-xs font-black uppercase tracking-[0.3em] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-blue-600/20"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              Research
            </button>
            <button 
              onClick={() => { setUrlInput(''); setResults([]); setStatus(''); }}
              className="flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white p-5 rounded-2xl text-xs font-black uppercase tracking-[0.3em] transition-all border border-white/5"
            >
              <Trash2 className="w-5 h-5" /> Clear
            </button>
          </div>
        </motion.div>

        {/* Examples */}
        <section className="space-y-6">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-gray-500">Quick Examples</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {examples.map((ex, i) => (
              <button 
                key={i} 
                onClick={() => setUrlInput(ex.url)}
                className="p-5 text-left bg-white/5 hover:bg-white/[0.08] border border-white/5 rounded-2xl transition-all group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <FileTextIcon className="w-4 h-4 text-blue-400" />
                  <span className="text-[10px] font-black uppercase tracking-tight text-gray-200 group-hover:text-blue-400 transition-colors">{ex.name}</span>
                </div>
                <p className="text-[10px] text-gray-600 font-medium truncate">{ex.url}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Output Panel */}
        <AnimatePresence>
          {(results.length > 0 || status) && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white/[0.03] border border-white/10 rounded-[32px] overflow-hidden backdrop-blur-3xl"
            >
              <div className="flex border-b border-white/5">
                <button onClick={() => setActiveTab('results')} className={`flex-1 py-5 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'results' ? 'text-white bg-white/5 border-b-2 border-blue-500' : 'text-gray-500'}`}>Target Output</button>
                <button onClick={() => setActiveTab('analysis')} className={`flex-1 py-5 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'analysis' ? 'text-white bg-white/5 border-b-2 border-purple-500' : 'text-gray-500'}`}>AI Intelligence</button>
                <button onClick={() => setActiveTab('csv')} className={`flex-1 py-5 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'csv' ? 'text-white bg-white/5 border-b-2 border-pink-500' : 'text-gray-500'}`}>CSV Source</button>
                <button onClick={() => setActiveTab('json')} className={`flex-1 py-5 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'json' ? 'text-white bg-white/5 border-b-2 border-orange-500' : 'text-gray-500'}`}>JSON View</button>
              </div>

              <div className="p-8">
                {activeTab === 'results' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                          {batchMode ? `Scraping ${scrapingProgress.current} of ${scrapingProgress.total}...` : status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={handleAnalyze} disabled={analyzing} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-purple-600/20 disabled:opacity-50">
                          {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Smart Analysis
                        </button>
                        <button onClick={handleGenerateCSV} disabled={generatingCsv} className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-pink-600/20 disabled:opacity-50">
                          {generatingCsv ? <Loader2 className="w-3 h-3 animate-spin" /> : <Table className="w-3 h-3" />} Smart CSV
                        </button>
                      </div>
                    </div>
                    <div className="space-y-6">
                      {results.map((res, i) => (
                        <div key={i} className="p-6 bg-white/5 border border-white/5 rounded-2xl space-y-4 relative group">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-blue-400">{res.title}</h4>
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => { navigator.clipboard.writeText(res.content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                title="Copy content"
                              >
                                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <span className="text-[9px] font-black bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded uppercase">{res.strategy}</span>
                            </div>
                          </div>
                          <div className="text-xs text-gray-400 font-medium leading-relaxed font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto pr-4 scrollbar-hide">
                            {res.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'analysis' && (
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-purple-400">
                          <Sparkles className="w-3.5 h-3.5" /> AI Analysis Configuration
                        </div>
                        {analysisResult && !analyzing && (
                          <button 
                            onClick={handleAnalyze}
                            className="text-[10px] font-black uppercase tracking-widest text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-2"
                          >
                            <ArrowRight className="w-3 h-3" /> Regenerate Analysis
                          </button>
                        )}
                      </div>
                      <textarea 
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="Describe how you want the AI to analyze this data..."
                        className="w-full h-24 bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-medium focus:border-purple-500/50 focus:bg-white/[0.08] transition-all outline-none resize-none"
                      />
                    </div>

                    <div className="h-px bg-white/5" />

                    {analyzing ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-500 animate-pulse">Running Neural Synthesis...</p>
                      </div>
                    ) : analysisError ? (
                      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
                        <AlertTriangle className="w-12 h-12 text-red-500/50" />
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-red-500">Analysis Engine Error</p>
                          <p className="text-xs font-medium text-gray-500 mt-3 max-w-sm">{analysisError}</p>
                        </div>
                        <button 
                          onClick={handleAnalyze}
                          className="mt-4 px-6 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                          Retry Neural Synthesis
                        </button>
                      </div>
                    ) : analysisResult ? (
                      <div className="relative group">
                        <div className="absolute top-4 right-4 z-20">
                          <button 
                            onClick={() => { navigator.clipboard.writeText(analysisResult); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                            className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                          >
                            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            {copied ? 'Copied' : 'Copy Report'}
                          </button>
                        </div>
                        <div className="p-8 bg-white/5 rounded-2xl border border-white/5 prose prose-invert prose-sm max-w-none text-gray-300 font-medium leading-relaxed">
                          {analysisResult.split('\n').map((l, i) => <p key={i} className="mb-2">{l}</p>)}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 opacity-20 gap-4">
                        <Sparkles className="w-12 h-12 text-purple-500" />
                        <p className="text-[10px] font-black uppercase">Ready for Neural Synthesis</p>
                        <button 
                          onClick={handleAnalyze} 
                          className="mt-4 px-8 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                          Perform Analysis
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'csv' && (
                  <div className="space-y-6">
                    {generatingCsv ? (
                      <div className="flex flex-col items-center justify-center p-20 gap-4">
                        <Loader2 className="w-10 h-10 animate-spin text-pink-500" />
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-500 animate-pulse">Constructing CSV Pipeline...</p>
                      </div>
                    ) : csvResult ? (
                      <div className="relative group">
                        <button 
                          onClick={() => { navigator.clipboard.writeText(csvResult); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                          className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <textarea 
                          readOnly
                          value={csvResult}
                          className="w-full h-[400px] p-8 bg-black/40 border border-white/10 rounded-2xl text-[11px] font-mono text-pink-300 overflow-auto resize-none outline-none"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-20 opacity-20 gap-4">
                        <Table className="w-12 h-12" />
                        <p className="text-[10px] font-black uppercase">No CSV Data Formatted</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'json' && (
                  <div className="relative group">
                    <button 
                      onClick={() => { navigator.clipboard.writeText(JSON.stringify(results, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <pre className="p-8 bg-black/40 border border-white/10 rounded-2xl text-[11px] font-mono text-blue-300 overflow-x-auto max-h-[500px]">
                      {JSON.stringify(results, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="pt-20 pb-10 flex flex-col md:flex-row items-center justify-between gap-6 opacity-30 border-t border-white/5">
          <div className="flex flex-col md:flex-row items-center gap-8 text-[9px] font-black uppercase tracking-[0.4em] text-gray-500">
            <span className="flex items-center gap-2"><Code2 className="w-4 h-4" /> v2.5 Stable</span>
            <span className="flex items-center gap-2"><Globe className="w-4 h-4" /> Direct Scrape Protocol</span>
            <div className="hidden md:block w-px h-3 bg-white/10" />
            <div className="flex items-center gap-6">
              <a href="/privacy.html" className="hover:text-white transition-colors">Privacy</a>
              <a href="/terms.html" className="hover:text-white transition-colors">Terms</a>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Github className="w-5 h-5 hover:text-white transition-colors cursor-pointer" />
          </div>
        </footer>
      </div>

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHistory(false)} className="fixed inset-0 bg-black/80 backdrop-blur-md z-40" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed top-0 right-0 h-full w-full max-w-[400px] bg-[#0c0c16] border-l border-white/10 z-50 p-6 flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-black uppercase tracking-widest text-white italic">Run History</h2>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/5 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full opacity-20">
                    <History className="w-12 h-12 mb-4" />
                    <p className="text-xs font-black uppercase">No task history</p>
                  </div>
                ) : (
                  history.map(item => (
                    <div key={item.id} className="p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-white/20 transition-all cursor-pointer" onClick={() => { setResults(item.results); setUrlInput(item.url); setShowHistory(false); setStatus('Restored from history'); }}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[9px] font-black uppercase text-gray-500">{item.timestamp}</span>
                        <button onClick={(e) => { e.stopPropagation(); setHistory(h => h.filter(i => i.id !== item.id)); }} className="text-gray-600 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <p className="text-xs font-bold text-blue-400 truncate">{item.url}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 13h6"/><path d="M9 17h6"/>
    </svg>
  );
}
