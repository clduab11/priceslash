/**
 * Comprehensive Scraping Agent with Tool Layer
 *
 * Provides 17 tools across three API providers:
 * - Firecrawl: Web scraping, crawling, extraction
 * - Tavily: AI-powered web search
 * - Jina.ai: Content reading, search, reranking, embeddings
 *
 * Designed for agentic workflows with mandatory tool use enforcement.
 */

import { z } from 'zod';
import { zodToJsonSchema as convertZodToJsonSchema } from 'zod-to-json-schema';
import { ProductData } from '@/types';

// ============================================================================
// Tool Schema Definitions
// ============================================================================

/**
 * Base tool result interface
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    tokens?: number;
    credits?: number;
  };
}

/**
 * Tool definition interface following MCP-style schema
 */
export interface ToolDefinition {
  name: string;
  description: string;
  provider: 'firecrawl' | 'tavily' | 'jina';
  inputSchema: z.ZodSchema;
  execute: (input: unknown) => Promise<ToolResult>;
}

// ============================================================================
// Firecrawl Tools (6 tools)
// ============================================================================

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';

/**
 * Helper to make Firecrawl API requests
 */
async function firecrawlRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE' = 'POST',
  body?: Record<string, unknown>
): Promise<ToolResult<T>> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'Firecrawl API key not configured' };
  }

  try {
    const response = await fetch(`${FIRECRAWL_API_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    return { success: true, data: data as T };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Firecrawl request failed'
    };
  }
}

// Tool 1: Firecrawl Scrape
const firecrawlScrapeSchema = z.object({
  url: z.string().url().describe('The URL to scrape'),
  formats: z.array(z.enum(['markdown', 'html', 'rawHtml', 'links', 'screenshot', 'screenshot@fullPage']))
    .optional()
    .describe('Output formats (default: markdown)'),
  includeTags: z.array(z.string()).optional().describe('HTML tags to include'),
  excludeTags: z.array(z.string()).optional().describe('HTML tags to exclude'),
  onlyMainContent: z.boolean().optional().describe('Extract only main content (default: true)'),
  waitFor: z.number().optional().describe('Wait time in ms before scraping'),
  timeout: z.number().optional().describe('Request timeout in ms (default: 30000)'),
  mobile: z.boolean().optional().describe('Use mobile viewport'),
  skipTlsVerification: z.boolean().optional().describe('Skip TLS verification'),
  removeBase64Images: z.boolean().optional().describe('Remove base64 images (default: true)'),
  location: z.object({
    country: z.string().optional(),
    languages: z.array(z.string()).optional(),
  }).optional().describe('Geolocation settings'),
  actions: z.array(z.object({
    type: z.enum(['wait', 'click', 'scroll', 'type', 'press', 'screenshot']),
    selector: z.string().optional(),
    milliseconds: z.number().optional(),
    text: z.string().optional(),
    key: z.string().optional(),
    direction: z.enum(['up', 'down']).optional(),
    amount: z.number().optional(),
  })).optional().describe('Browser actions to perform'),
});

type FirecrawlScrapeInput = z.infer<typeof firecrawlScrapeSchema>;

interface FirecrawlScrapeResult {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  screenshot?: string;
  metadata?: {
    title?: string;
    description?: string;
    language?: string;
    keywords?: string;
    robots?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    sourceURL?: string;
    statusCode?: number;
  };
}

async function executeFirecrawlScrape(input: FirecrawlScrapeInput): Promise<ToolResult<FirecrawlScrapeResult>> {
  const result = await firecrawlRequest<{ success: boolean; data: FirecrawlScrapeResult }>('/scrape', 'POST', {
    url: input.url,
    formats: input.formats ?? ['markdown'],
    includeTags: input.includeTags,
    excludeTags: input.excludeTags,
    onlyMainContent: input.onlyMainContent ?? true,
    waitFor: input.waitFor,
    timeout: input.timeout ?? 30000,
    mobile: input.mobile,
    skipTlsVerification: input.skipTlsVerification,
    removeBase64Images: input.removeBase64Images ?? true,
    location: input.location,
    actions: input.actions,
  });
  return {
    success: result.success,
    data: result.data?.data,
    error: result.error,
  };
}

// Tool 2: Firecrawl Crawl
const firecrawlCrawlSchema = z.object({
  url: z.string().url().describe('Starting URL for the crawl'),
  maxDepth: z.number().optional().default(2).describe('Maximum crawl depth'),
  limit: z.number().optional().default(10).describe('Maximum pages to crawl'),
  includePaths: z.array(z.string()).optional().describe('URL patterns to include'),
  excludePaths: z.array(z.string()).optional().describe('URL patterns to exclude'),
  allowBackwardLinks: z.boolean().optional().describe('Allow crawling backward links'),
  allowExternalLinks: z.boolean().optional().describe('Allow crawling external links'),
  ignoreSitemap: z.boolean().optional().describe('Ignore sitemap.xml'),
  scrapeOptions: z.object({
    formats: z.array(z.enum(['markdown', 'html', 'rawHtml', 'links'])).optional(),
    onlyMainContent: z.boolean().optional(),
  }).optional().describe('Options for scraping each page'),
  webhook: z.string().url().optional().describe('Webhook URL for results'),
});

type FirecrawlCrawlInput = z.infer<typeof firecrawlCrawlSchema>;

interface FirecrawlCrawlResult {
  id: string;
  status: string;
  total?: number;
  completed?: number;
  creditsUsed?: number;
}

async function executeFirecrawlCrawl(input: FirecrawlCrawlInput): Promise<ToolResult<FirecrawlCrawlResult>> {
  const result = await firecrawlRequest<{ success: boolean; id: string }>('/crawl', 'POST', {
    url: input.url,
    maxDepth: input.maxDepth,
    limit: input.limit,
    includePaths: input.includePaths,
    excludePaths: input.excludePaths,
    allowBackwardLinks: input.allowBackwardLinks,
    allowExternalLinks: input.allowExternalLinks,
    ignoreSitemap: input.ignoreSitemap,
    scrapeOptions: input.scrapeOptions,
    webhook: input.webhook,
  });
  return {
    success: result.success,
    data: result.data ? { id: result.data.id, status: 'started' } : undefined,
    error: result.error,
  };
}

// Tool 3: Firecrawl Crawl Status
const firecrawlCrawlStatusSchema = z.object({
  crawlId: z.string().describe('The crawl job ID to check'),
});

type FirecrawlCrawlStatusInput = z.infer<typeof firecrawlCrawlStatusSchema>;

interface FirecrawlCrawlStatusResult {
  status: 'scraping' | 'completed' | 'failed' | 'cancelled';
  total: number;
  completed: number;
  creditsUsed: number;
  expiresAt: string;
  data?: FirecrawlScrapeResult[];
  next?: string;
}

async function executeFirecrawlCrawlStatus(input: FirecrawlCrawlStatusInput): Promise<ToolResult<FirecrawlCrawlStatusResult>> {
  return firecrawlRequest<FirecrawlCrawlStatusResult>(`/crawl/${input.crawlId}`, 'GET');
}

// Tool 4: Firecrawl Map
const firecrawlMapSchema = z.object({
  url: z.string().url().describe('The URL to map'),
  search: z.string().optional().describe('Search term to filter URLs'),
  ignoreSitemap: z.boolean().optional().describe('Ignore sitemap.xml'),
  sitemapOnly: z.boolean().optional().describe('Only use sitemap URLs'),
  includeSubdomains: z.boolean().optional().describe('Include subdomains'),
  limit: z.number().optional().default(5000).describe('Maximum URLs to return'),
});

type FirecrawlMapInput = z.infer<typeof firecrawlMapSchema>;

interface FirecrawlMapResult {
  links: string[];
}

async function executeFirecrawlMap(input: FirecrawlMapInput): Promise<ToolResult<FirecrawlMapResult>> {
  const result = await firecrawlRequest<{ success: boolean; links: string[] }>('/map', 'POST', {
    url: input.url,
    search: input.search,
    ignoreSitemap: input.ignoreSitemap,
    sitemapOnly: input.sitemapOnly,
    includeSubdomains: input.includeSubdomains,
    limit: input.limit,
  });
  return {
    success: result.success,
    data: result.data ? { links: result.data.links } : undefined,
    error: result.error,
  };
}

// Tool 5: Firecrawl Extract (LLM extraction)
const firecrawlExtractSchema = z.object({
  urls: z.array(z.string().url()).describe('URLs to extract data from'),
  prompt: z.string().optional().describe('Extraction prompt'),
  schema: z.record(z.unknown()).optional().describe('JSON schema for extraction'),
  systemPrompt: z.string().optional().describe('System prompt for extraction'),
  allowExternalLinks: z.boolean().optional().describe('Allow external link extraction'),
});

type FirecrawlExtractInput = z.infer<typeof firecrawlExtractSchema>;

interface FirecrawlExtractResult {
  id: string;
  status: string;
}

async function executeFirecrawlExtract(input: FirecrawlExtractInput): Promise<ToolResult<FirecrawlExtractResult>> {
  const result = await firecrawlRequest<{ success: boolean; id: string }>('/extract', 'POST', {
    urls: input.urls,
    prompt: input.prompt,
    schema: input.schema,
    systemPrompt: input.systemPrompt,
    allowExternalLinks: input.allowExternalLinks,
  });
  return {
    success: result.success,
    data: result.data ? { id: result.data.id, status: 'processing' } : undefined,
    error: result.error,
  };
}

// Tool 6: Firecrawl Batch Scrape
const firecrawlBatchScrapeSchema = z.object({
  urls: z.array(z.string().url()).describe('URLs to scrape'),
  formats: z.array(z.enum(['markdown', 'html', 'rawHtml', 'links'])).optional().default(['markdown']),
  onlyMainContent: z.boolean().optional().default(true),
  webhook: z.string().url().optional().describe('Webhook URL for results'),
});

type FirecrawlBatchScrapeInput = z.infer<typeof firecrawlBatchScrapeSchema>;

interface FirecrawlBatchScrapeResult {
  id: string;
  status: string;
}

async function executeFirecrawlBatchScrape(input: FirecrawlBatchScrapeInput): Promise<ToolResult<FirecrawlBatchScrapeResult>> {
  const result = await firecrawlRequest<{ success: boolean; id: string }>('/batch/scrape', 'POST', {
    urls: input.urls,
    formats: input.formats,
    onlyMainContent: input.onlyMainContent,
    webhook: input.webhook,
  });
  return {
    success: result.success,
    data: result.data ? { id: result.data.id, status: 'processing' } : undefined,
    error: result.error,
  };
}

// ============================================================================
// Tavily Tools (4 tools)
// ============================================================================

const TAVILY_API_URL = 'https://api.tavily.com';

/**
 * Helper to make Tavily API requests
 */
async function tavilyRequest<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<ToolResult<T>> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'Tavily API key not configured' };
  }

  try {
    const response = await fetch(`${TAVILY_API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ api_key: apiKey, ...body }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    return { success: true, data: data as T };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tavily request failed'
    };
  }
}

// Tool 7: Tavily Search
const tavilySearchSchema = z.object({
  query: z.string().describe('The search query'),
  searchDepth: z.enum(['basic', 'advanced']).optional()
    .describe('Search depth (basic is faster, advanced is more thorough). Default: basic'),
  topic: z.enum(['general', 'news', 'finance']).optional()
    .describe('Topic category for search. Default: general'),
  maxResults: z.number().min(1).max(20).optional()
    .describe('Maximum number of results. Default: 5'),
  includeDomains: z.array(z.string()).optional()
    .describe('Domains to include in search'),
  excludeDomains: z.array(z.string()).optional()
    .describe('Domains to exclude from search'),
  includeAnswer: z.boolean().optional()
    .describe('Include AI-generated answer. Default: false'),
  includeRawContent: z.boolean().optional()
    .describe('Include raw page content. Default: false'),
  includeImages: z.boolean().optional()
    .describe('Include image results. Default: false'),
  days: z.number().optional()
    .describe('Only return results from the past N days'),
});

type TavilySearchInput = z.infer<typeof tavilySearchSchema>;

interface TavilySearchResult {
  query: string;
  answer?: string;
  images?: Array<{ url: string; description?: string }>;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    publishedDate?: string;
    rawContent?: string;
  }>;
  responseTime: number;
}

async function executeTavilySearch(input: TavilySearchInput): Promise<ToolResult<TavilySearchResult>> {
  return tavilyRequest<TavilySearchResult>('/search', {
    query: input.query,
    search_depth: input.searchDepth ?? 'basic',
    topic: input.topic ?? 'general',
    max_results: input.maxResults ?? 5,
    include_domains: input.includeDomains,
    exclude_domains: input.excludeDomains,
    include_answer: input.includeAnswer ?? false,
    include_raw_content: input.includeRawContent ?? false,
    include_images: input.includeImages ?? false,
    days: input.days,
  });
}

// Tool 8: Tavily Search Context (optimized for RAG)
const tavilySearchContextSchema = z.object({
  query: z.string().describe('The search query'),
  searchDepth: z.enum(['basic', 'advanced']).optional().default('advanced'),
  topic: z.enum(['general', 'news', 'finance']).optional().default('general'),
  maxResults: z.number().min(1).max(20).optional().default(5),
  maxTokens: z.number().optional().default(4000)
    .describe('Maximum tokens in response'),
  includeDomains: z.array(z.string()).optional(),
  excludeDomains: z.array(z.string()).optional(),
});

type TavilySearchContextInput = z.infer<typeof tavilySearchContextSchema>;

async function executeTavilySearchContext(input: TavilySearchContextInput): Promise<ToolResult<string>> {
  return tavilyRequest<string>('/search/context', {
    query: input.query,
    search_depth: input.searchDepth,
    topic: input.topic,
    max_results: input.maxResults,
    max_tokens: input.maxTokens,
    include_domains: input.includeDomains,
    exclude_domains: input.excludeDomains,
  });
}

// Tool 9: Tavily Search Q&A
const tavilySearchQnASchema = z.object({
  query: z.string().describe('The question to answer'),
  searchDepth: z.enum(['basic', 'advanced']).optional().default('advanced'),
  topic: z.enum(['general', 'news', 'finance']).optional().default('general'),
  maxResults: z.number().min(1).max(20).optional().default(5),
  includeDomains: z.array(z.string()).optional(),
  excludeDomains: z.array(z.string()).optional(),
});

type TavilySearchQnAInput = z.infer<typeof tavilySearchQnASchema>;

async function executeTavilySearchQnA(input: TavilySearchQnAInput): Promise<ToolResult<string>> {
  return tavilyRequest<string>('/search/qna', {
    query: input.query,
    search_depth: input.searchDepth,
    topic: input.topic,
    max_results: input.maxResults,
    include_domains: input.includeDomains,
    exclude_domains: input.excludeDomains,
  });
}

// Tool 10: Tavily Extract
const tavilyExtractSchema = z.object({
  urls: z.array(z.string().url()).describe('URLs to extract content from'),
});

type TavilyExtractInput = z.infer<typeof tavilyExtractSchema>;

interface TavilyExtractResult {
  results: Array<{
    url: string;
    rawContent: string;
  }>;
  failedResults: Array<{
    url: string;
    error: string;
  }>;
}

async function executeTavilyExtract(input: TavilyExtractInput): Promise<ToolResult<TavilyExtractResult>> {
  return tavilyRequest<TavilyExtractResult>('/extract', {
    urls: input.urls,
  });
}

// ============================================================================
// Jina.ai Tools (7 tools)
// ============================================================================

const JINA_READER_URL = 'https://r.jina.ai';
const JINA_SEARCH_URL = 'https://s.jina.ai';
const JINA_GROUNDING_URL = 'https://g.jina.ai';
const JINA_API_URL = 'https://api.jina.ai';
const JINA_SEGMENT_URL = 'https://segment.jina.ai';

/**
 * Helper to make Jina API requests
 */
async function jinaRequest<T>(
  baseUrl: string,
  endpoint: string,
  options: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {}
): Promise<ToolResult<T>> {
  const apiKey = process.env.JINA_API_KEY;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(options.headers || {}),
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    return { success: true, data: data as T, usage: data.usage };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Jina request failed'
    };
  }
}

// Tool 11: Jina Reader
const jinaReaderSchema = z.object({
  url: z.string().url().describe('The URL to read'),
  format: z.enum(['markdown', 'html', 'text', 'screenshot', 'pageshot'])
    .optional().default('markdown')
    .describe('Output format'),
  withGeneratedAlt: z.boolean().optional()
    .describe('Generate alt text for images'),
  withLinksSummary: z.boolean().optional()
    .describe('Include summary of all links'),
  withImagesSummary: z.boolean().optional()
    .describe('Gather all images at the end'),
  withIframe: z.boolean().optional()
    .describe('Keep iframe content'),
  withShadowDom: z.boolean().optional()
    .describe('Create shadow DOM for extraction'),
  targetSelector: z.string().optional()
    .describe('CSS selector to target specific elements'),
  waitForSelector: z.string().optional()
    .describe('Wait for specific element to load'),
  timeout: z.number().optional()
    .describe('Timeout in seconds'),
  proxyUrl: z.string().url().optional()
    .describe('Proxy URL to use'),
});

type JinaReaderInput = z.infer<typeof jinaReaderSchema>;

interface JinaReaderResult {
  code: number;
  status: number;
  data: {
    title: string;
    description: string;
    url: string;
    content: string;
    usage: {
      tokens: number;
    };
  };
}

async function executeJinaReader(input: JinaReaderInput): Promise<ToolResult<JinaReaderResult>> {
  const headers: Record<string, string> = {
    'X-Return-Format': input.format || 'markdown',
  };

  if (input.withGeneratedAlt) headers['X-With-Generated-Alt'] = 'true';
  if (input.withLinksSummary) headers['X-With-Links-Summary'] = 'true';
  if (input.withImagesSummary) headers['X-With-Images-Summary'] = 'true';
  if (input.withIframe) headers['X-With-Iframe'] = 'true';
  if (input.withShadowDom) headers['X-With-Shadow-Dom'] = 'true';
  if (input.targetSelector) headers['X-Target-Selector'] = input.targetSelector;
  if (input.waitForSelector) headers['X-Wait-For-Selector'] = input.waitForSelector;
  if (input.timeout) headers['X-Timeout'] = input.timeout.toString();
  if (input.proxyUrl) headers['X-Proxy-Url'] = input.proxyUrl;

  return jinaRequest<JinaReaderResult>(JINA_READER_URL, `/${input.url}`, {
    method: 'POST',
    headers,
  });
}

// Tool 12: Jina Search
const jinaSearchSchema = z.object({
  query: z.string().describe('The search query'),
  withImages: z.boolean().optional()
    .describe('Include images in results'),
  count: z.number().min(1).max(10).optional()
    .describe('Number of results'),
});

type JinaSearchInput = z.infer<typeof jinaSearchSchema>;

interface JinaSearchResult {
  code: number;
  status: number;
  data: Array<{
    title: string;
    url: string;
    content: string;
    description?: string;
  }>;
}

async function executeJinaSearch(input: JinaSearchInput): Promise<ToolResult<JinaSearchResult>> {
  const encodedQuery = encodeURIComponent(input.query);
  const headers: Record<string, string> = {};

  if (input.withImages) headers['X-With-Images'] = 'true';
  if (input.count) headers['X-Max-Results'] = input.count.toString();

  return jinaRequest<JinaSearchResult>(JINA_SEARCH_URL, `/${encodedQuery}`, {
    headers,
  });
}

// Tool 13: Jina Grounding (Fact-checking)
const jinaGroundingSchema = z.object({
  statement: z.string().describe('The statement to fact-check'),
  references: z.array(z.string().url()).optional()
    .describe('Optional reference URLs to check against'),
});

type JinaGroundingInput = z.infer<typeof jinaGroundingSchema>;

interface JinaGroundingResult {
  code: number;
  status: number;
  data: {
    factuality: number;
    result: boolean;
    reason: string;
    references: Array<{
      url: string;
      keyQuote: string;
      isSupportive: boolean;
    }>;
  };
}

async function executeJinaGrounding(input: JinaGroundingInput): Promise<ToolResult<JinaGroundingResult>> {
  const encodedStatement = encodeURIComponent(input.statement);
  const headers: Record<string, string> = {};

  if (input.references && input.references.length > 0) {
    headers['X-References'] = input.references.join(',');
  }

  return jinaRequest<JinaGroundingResult>(JINA_GROUNDING_URL, `/${encodedStatement}`, {
    headers,
  });
}

// Tool 14: Jina Reranker
const jinaRerankSchema = z.object({
  query: z.string().describe('The query to rank documents against'),
  documents: z.array(z.string()).describe('Documents to rerank'),
  model: z.enum([
    'jina-reranker-v2-base-multilingual',
    'jina-reranker-v1-base-en',
    'jina-reranker-v1-turbo-en',
    'jina-reranker-v1-tiny-en',
    'jina-colbert-v1-en',
  ]).optional().default('jina-reranker-v2-base-multilingual')
    .describe('Reranker model to use'),
  topN: z.number().optional()
    .describe('Return top N results'),
});

type JinaRerankInput = z.infer<typeof jinaRerankSchema>;

interface JinaRerankResult {
  model: string;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
  };
  results: Array<{
    index: number;
    document: { text: string };
    relevance_score: number;
  }>;
}

async function executeJinaRerank(input: JinaRerankInput): Promise<ToolResult<JinaRerankResult>> {
  return jinaRequest<JinaRerankResult>(JINA_API_URL, '/v1/rerank', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      model: input.model,
      query: input.query,
      documents: input.documents,
      top_n: input.topN ?? input.documents.length,
    },
  });
}

// Tool 15: Jina Segmenter
const jinaSegmentSchema = z.object({
  content: z.string().describe('The content to segment'),
  tokenizer: z.enum(['cl100k_base', 'o200k_base', 'p50k_base', 'r50k_base', 'p50k_edit', 'gpt2'])
    .optional().default('cl100k_base')
    .describe('Tokenizer to use'),
  returnTokens: z.boolean().optional().default(false)
    .describe('Return token IDs'),
  returnChunks: z.boolean().optional().default(true)
    .describe('Return text chunks'),
  maxChunkLength: z.number().optional()
    .describe('Maximum chunk length in tokens'),
});

type JinaSegmentInput = z.infer<typeof jinaSegmentSchema>;

interface JinaSegmentResult {
  num_tokens: number;
  tokenizer: string;
  usage: {
    tokens: number;
  };
  chunks?: string[];
  tokens?: number[];
}

async function executeJinaSegment(input: JinaSegmentInput): Promise<ToolResult<JinaSegmentResult>> {
  return jinaRequest<JinaSegmentResult>(JINA_SEGMENT_URL, '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      content: input.content,
      tokenizer: input.tokenizer,
      return_tokens: input.returnTokens,
      return_chunks: input.returnChunks,
      max_chunk_length: input.maxChunkLength,
    },
  });
}

// Tool 16: Jina Classifier
const jinaClassifySchema = z.object({
  input: z.array(z.string()).describe('Texts to classify'),
  labels: z.array(z.string()).describe('Classification labels'),
  model: z.enum([
    'jina-embeddings-v3',
    'jina-embeddings-v2-base-en',
    'jina-embeddings-v2-small-en',
  ]).optional().default('jina-embeddings-v3')
    .describe('Embedding model for classification'),
});

type JinaClassifyInput = z.infer<typeof jinaClassifySchema>;

interface JinaClassifyResult {
  model: string;
  usage: {
    total_tokens: number;
  };
  data: Array<{
    object: string;
    index: number;
    prediction: string;
    score: number;
  }>;
}

async function executeJinaClassify(input: JinaClassifyInput): Promise<ToolResult<JinaClassifyResult>> {
  return jinaRequest<JinaClassifyResult>(JINA_API_URL, '/v1/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      model: input.model,
      input: input.input,
      labels: input.labels,
    },
  });
}

// Tool 17: Jina Embeddings
const jinaEmbedSchema = z.object({
  input: z.array(z.string()).describe('Texts to embed'),
  model: z.enum([
    'jina-embeddings-v3',
    'jina-embeddings-v2-base-en',
    'jina-embeddings-v2-base-de',
    'jina-embeddings-v2-base-es',
    'jina-embeddings-v2-base-code',
    'jina-embeddings-v2-small-en',
    'jina-clip-v1',
  ]).optional().default('jina-embeddings-v3')
    .describe('Embedding model'),
  task: z.enum([
    'retrieval.query',
    'retrieval.passage',
    'text-matching',
    'classification',
    'separation',
  ]).optional()
    .describe('Task type for optimized embeddings'),
  dimensions: z.number().optional()
    .describe('Output embedding dimensions'),
  late_chunking: z.boolean().optional()
    .describe('Enable late chunking'),
});

type JinaEmbedInput = z.infer<typeof jinaEmbedSchema>;

interface JinaEmbedResult {
  model: string;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
  };
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
}

async function executeJinaEmbed(input: JinaEmbedInput): Promise<ToolResult<JinaEmbedResult>> {
  return jinaRequest<JinaEmbedResult>(JINA_API_URL, '/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      model: input.model,
      input: input.input,
      task: input.task,
      dimensions: input.dimensions,
      late_chunking: input.late_chunking,
    },
  });
}

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * Complete registry of all 17 tools
 */
export const SCRAPING_TOOLS: ToolDefinition[] = [
  // Firecrawl Tools (1-6)
  {
    name: 'firecrawl_scrape',
    description: 'Scrape a single URL with advanced options including stealth mode, JavaScript rendering, and browser actions. Returns markdown, HTML, or screenshots.',
    provider: 'firecrawl',
    inputSchema: firecrawlScrapeSchema,
    execute: (input) => executeFirecrawlScrape(input as FirecrawlScrapeInput),
  },
  {
    name: 'firecrawl_crawl',
    description: 'Start an asynchronous crawl job that discovers and scrapes multiple pages from a website. Returns a job ID for status checking.',
    provider: 'firecrawl',
    inputSchema: firecrawlCrawlSchema,
    execute: (input) => executeFirecrawlCrawl(input as FirecrawlCrawlInput),
  },
  {
    name: 'firecrawl_crawl_status',
    description: 'Check the status of an ongoing or completed crawl job. Returns progress and scraped data when available.',
    provider: 'firecrawl',
    inputSchema: firecrawlCrawlStatusSchema,
    execute: (input) => executeFirecrawlCrawlStatus(input as FirecrawlCrawlStatusInput),
  },
  {
    name: 'firecrawl_map',
    description: 'Get a sitemap of all URLs on a website. Useful for discovering product pages and category structures.',
    provider: 'firecrawl',
    inputSchema: firecrawlMapSchema,
    execute: (input) => executeFirecrawlMap(input as FirecrawlMapInput),
  },
  {
    name: 'firecrawl_extract',
    description: 'Extract structured data from URLs using LLM-powered extraction with custom schemas. Ideal for product data extraction.',
    provider: 'firecrawl',
    inputSchema: firecrawlExtractSchema,
    execute: (input) => executeFirecrawlExtract(input as FirecrawlExtractInput),
  },
  {
    name: 'firecrawl_batch_scrape',
    description: 'Scrape multiple URLs in a single batch operation. More efficient than individual scrapes for large lists.',
    provider: 'firecrawl',
    inputSchema: firecrawlBatchScrapeSchema,
    execute: (input) => executeFirecrawlBatchScrape(input as FirecrawlBatchScrapeInput),
  },

  // Tavily Tools (7-10)
  {
    name: 'tavily_search',
    description: 'AI-powered web search optimized for LLMs. Returns relevant results with content snippets, optionally with AI-generated answers.',
    provider: 'tavily',
    inputSchema: tavilySearchSchema,
    execute: (input) => executeTavilySearch(input as TavilySearchInput),
  },
  {
    name: 'tavily_search_context',
    description: 'Search optimized for RAG pipelines. Returns concatenated content suitable for context injection with token limits.',
    provider: 'tavily',
    inputSchema: tavilySearchContextSchema,
    execute: (input) => executeTavilySearchContext(input as TavilySearchContextInput),
  },
  {
    name: 'tavily_search_qna',
    description: 'Question-answering mode search. Returns a direct answer to the query based on web search results.',
    provider: 'tavily',
    inputSchema: tavilySearchQnASchema,
    execute: (input) => executeTavilySearchQnA(input as TavilySearchQnAInput),
  },
  {
    name: 'tavily_extract',
    description: 'Extract raw content from one or more URLs. Useful for getting full page content without search.',
    provider: 'tavily',
    inputSchema: tavilyExtractSchema,
    execute: (input) => executeTavilyExtract(input as TavilyExtractInput),
  },

  // Jina.ai Tools (11-17)
  {
    name: 'jina_reader',
    description: 'Read and transform any URL into LLM-friendly content. Supports markdown, HTML, text, and screenshot output with various extraction options.',
    provider: 'jina',
    inputSchema: jinaReaderSchema,
    execute: (input) => executeJinaReader(input as JinaReaderInput),
  },
  {
    name: 'jina_search',
    description: 'Web search via Jina Search API. Returns search results with content optimized for LLM consumption.',
    provider: 'jina',
    inputSchema: jinaSearchSchema,
    execute: (input) => executeJinaSearch(input as JinaSearchInput),
  },
  {
    name: 'jina_grounding',
    description: 'Fact-check statements against web sources. Returns factuality score and supporting/contradicting references.',
    provider: 'jina',
    inputSchema: jinaGroundingSchema,
    execute: (input) => executeJinaGrounding(input as JinaGroundingInput),
  },
  {
    name: 'jina_rerank',
    description: 'Rerank documents by relevance to a query using neural reranking models. Essential for improving retrieval quality.',
    provider: 'jina',
    inputSchema: jinaRerankSchema,
    execute: (input) => executeJinaRerank(input as JinaRerankInput),
  },
  {
    name: 'jina_segment',
    description: 'Segment text into tokens and chunks. Useful for understanding token usage and creating appropriately-sized chunks for embeddings.',
    provider: 'jina',
    inputSchema: jinaSegmentSchema,
    execute: (input) => executeJinaSegment(input as JinaSegmentInput),
  },
  {
    name: 'jina_classify',
    description: 'Zero-shot text classification. Classify texts into custom categories without training.',
    provider: 'jina',
    inputSchema: jinaClassifySchema,
    execute: (input) => executeJinaClassify(input as JinaClassifyInput),
  },
  {
    name: 'jina_embed',
    description: 'Generate embeddings for texts using state-of-the-art models. Supports multiple tasks and configurable dimensions.',
    provider: 'jina',
    inputSchema: jinaEmbedSchema,
    execute: (input) => executeJinaEmbed(input as JinaEmbedInput),
  },
];

// ============================================================================
// Scraping Agent with Mandatory Tool Use
// ============================================================================

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    toolCallId: string;
    result: ToolResult;
  }>;
}

export interface AgentConfig {
  /** Maximum iterations before forcing termination */
  maxIterations?: number;
  /** Require at least one tool call per iteration */
  mandatoryToolUse?: boolean;
  /** Available tools (defaults to all) */
  enabledTools?: string[];
  /** LLM model for agent reasoning */
  model?: string;
}

/**
 * Get tool by name
 */
export function getTool(name: string): ToolDefinition | undefined {
  return SCRAPING_TOOLS.find(t => t.name === name);
}

/**
 * Get all available tools
 */
export function getAvailableTools(enabledTools?: string[]): ToolDefinition[] {
  if (!enabledTools) return SCRAPING_TOOLS;
  return SCRAPING_TOOLS.filter(t => enabledTools.includes(t.name));
}

/**
 * Execute a tool by name
 */
export async function executeTool(
  name: string,
  input: unknown
): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) {
    return { success: false, error: `Unknown tool: ${name}` };
  }

  // Validate input against schema
  const parseResult = tool.inputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Invalid input: ${parseResult.error.message}`
    };
  }

  return tool.execute(parseResult.data);
}

/**
 * Generate tool schemas in OpenAI function calling format
 */
export function getToolSchemas(enabledTools?: string[]): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  const tools = getAvailableTools(enabledTools);

  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: convertZodToJsonSchema(tool.inputSchema) as Record<string, unknown>,
    },
  }));
}

// ============================================================================
// High-Level Scraping Functions
// ============================================================================

/**
 * Scrape a product URL using the best available method
 * Falls back through providers: Firecrawl -> Jina -> Tavily
 */
export async function scrapeProductUrl(url: string): Promise<ToolResult<{
  content: string;
  metadata?: Record<string, unknown>;
  provider: string;
}>> {
  // Try Firecrawl first (best for e-commerce)
  if (process.env.FIRECRAWL_API_KEY) {
    const result = await executeFirecrawlScrape({
      url,
      formats: ['markdown'],
      onlyMainContent: true,
    });

    if (result.success && result.data?.markdown) {
      return {
        success: true,
        data: {
          content: result.data.markdown,
          metadata: result.data.metadata,
          provider: 'firecrawl',
        },
      };
    }
  }

  // Fallback to Jina Reader
  if (process.env.JINA_API_KEY) {
    const result = await executeJinaReader({
      url,
      format: 'markdown',
      withLinksSummary: true,
    });

    if (result.success && result.data?.data?.content) {
      return {
        success: true,
        data: {
          content: result.data.data.content,
          metadata: {
            title: result.data.data.title,
            description: result.data.data.description,
          },
          provider: 'jina',
        },
        usage: { tokens: result.data.data.usage?.tokens },
      };
    }
  }

  // Final fallback to Tavily Extract
  if (process.env.TAVILY_API_KEY) {
    const result = await executeTavilyExtract({ urls: [url] });

    if (result.success && result.data?.results?.[0]) {
      return {
        success: true,
        data: {
          content: result.data.results[0].rawContent,
          provider: 'tavily',
        },
      };
    }
  }

  return { success: false, error: 'No scraping API configured or all methods failed' };
}

/**
 * Search for pricing information across the web
 */
export async function searchForPricing(query: string): Promise<ToolResult<{
  results: Array<{
    title: string;
    url: string;
    content: string;
    source: string;
  }>;
}>> {
  const results: Array<{
    title: string;
    url: string;
    content: string;
    source: string;
  }> = [];

  // Use Tavily for comprehensive search
  if (process.env.TAVILY_API_KEY) {
    const tavilyResult = await executeTavilySearch({
      query: `${query} price deal discount`,
      searchDepth: 'advanced',
      maxResults: 10,
      includeDomains: [
        'amazon.com', 'walmart.com', 'target.com', 'bestbuy.com',
        'costco.com', 'homedepot.com', 'lowes.com', 'newegg.com',
      ],
    });

    if (tavilyResult.success && tavilyResult.data?.results) {
      results.push(...tavilyResult.data.results.map(r => ({
        title: r.title,
        url: r.url,
        content: r.content,
        source: 'tavily',
      })));
    }
  }

  // Augment with Jina Search
  if (process.env.JINA_API_KEY) {
    const jinaResult = await executeJinaSearch({
      query: `${query} price`,
      count: 5,
    });

    if (jinaResult.success && jinaResult.data?.data) {
      results.push(...jinaResult.data.data.map(r => ({
        title: r.title,
        url: r.url,
        content: r.content,
        source: 'jina',
      })));
    }
  }

  if (results.length === 0) {
    return { success: false, error: 'No search results found' };
  }

  return { success: true, data: { results } };
}

/**
 * Extract product data from scraped content using LLM
 */
export async function extractProductData(
  content: string,
  sourceUrl: string
): Promise<ProductData[]> {
  // Use the existing extractor
  const { extractProductsFromMarkdown } = await import('./extractor');
  return extractProductsFromMarkdown(content, sourceUrl);
}

// ============================================================================
// Export Types
// ============================================================================

export type {
  FirecrawlScrapeInput,
  FirecrawlScrapeResult,
  FirecrawlCrawlInput,
  FirecrawlCrawlResult,
  FirecrawlCrawlStatusInput,
  FirecrawlCrawlStatusResult,
  FirecrawlMapInput,
  FirecrawlMapResult,
  FirecrawlExtractInput,
  FirecrawlExtractResult,
  FirecrawlBatchScrapeInput,
  FirecrawlBatchScrapeResult,
  TavilySearchInput,
  TavilySearchResult,
  TavilySearchContextInput,
  TavilySearchQnAInput,
  TavilyExtractInput,
  TavilyExtractResult,
  JinaReaderInput,
  JinaReaderResult,
  JinaSearchInput,
  JinaSearchResult,
  JinaGroundingInput,
  JinaGroundingResult,
  JinaRerankInput,
  JinaRerankResult,
  JinaSegmentInput,
  JinaSegmentResult,
  JinaClassifyInput,
  JinaClassifyResult,
  JinaEmbedInput,
  JinaEmbedResult,
};

// ============================================================================
// Agent Loop with Mandatory Tool Use
// ============================================================================

/**
 * Error thrown when mandatory tool use is violated
 */
export class MandatoryToolUseError extends Error {
  constructor(iteration: number) {
    super(`Mandatory tool use violated at iteration ${iteration}: Agent must call at least one tool per iteration`);
    this.name = 'MandatoryToolUseError';
  }
}

/**
 * Error thrown when attempting to use a disabled tool
 */
export class ToolNotEnabledError extends Error {
  constructor(toolName: string, iteration: number) {
    super(`Tool "${toolName}" is not enabled at iteration ${iteration}`);
    this.name = 'ToolNotEnabledError';
  }
}

/**
 * Agent execution state
 */
export interface AgentState {
  messages: AgentMessage[];
  iteration: number;
  totalToolCalls: number;
  toolCallHistory: Array<{
    iteration: number;
    toolName: string;
    success: boolean;
    duration: number;
  }>;
  isComplete: boolean;
  error?: string;
}

/**
 * Agent step result
 */
export interface AgentStepResult {
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    result: ToolResult;
    duration: number;
  }>;
  shouldContinue: boolean;
  response?: string;
}

/**
 * Scraping Agent class with mandatory tool use enforcement
 */
export class ScrapingAgent {
  private config: Required<AgentConfig>;
  private state: AgentState;

  constructor(config: AgentConfig = {}) {
    this.config = {
      maxIterations: config.maxIterations ?? 10,
      mandatoryToolUse: config.mandatoryToolUse ?? true,
      enabledTools: config.enabledTools ?? SCRAPING_TOOLS.map(t => t.name),
      model: config.model ?? 'deepseek/deepseek-chat',
    };

    this.state = {
      messages: [],
      iteration: 0,
      totalToolCalls: 0,
      toolCallHistory: [],
      isComplete: false,
    };
  }

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Get enabled tools
   */
  getEnabledTools(): ToolDefinition[] {
    return getAvailableTools(this.config.enabledTools);
  }

  /**
   * Add a user message to the conversation
   */
  addUserMessage(content: string): void {
    this.state.messages.push({ role: 'user', content });
  }

  /**
   * Execute a single agent step with mandatory tool use enforcement
   */
  async step(toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>): Promise<AgentStepResult> {
    this.state.iteration++;

    // Enforce mandatory tool use
    if (this.config.mandatoryToolUse && toolCalls.length === 0) {
      throw new MandatoryToolUseError(this.state.iteration);
    }

    // Check max iterations
    if (this.state.iteration > this.config.maxIterations) {
      this.state.isComplete = true;
      this.state.error = `Max iterations (${this.config.maxIterations}) exceeded`;
      return { toolCalls: [], shouldContinue: false };
    }

    // Validate that all requested tools are enabled
    for (const call of toolCalls) {
      if (!this.config.enabledTools.includes(call.name)) {
        throw new ToolNotEnabledError(call.name, this.state.iteration);
      }
    }

    // Execute all tool calls
    const results: AgentStepResult['toolCalls'] = [];

    for (const call of toolCalls) {
      const startTime = Date.now();
      
      // Validate tool is enabled before execution
      if (!this.config.enabledTools.includes(call.name)) {
        const duration = Date.now() - startTime;
        const result: ToolResult = {
          success: false,
          error: `Tool '${call.name}' is not enabled. Enabled tools: ${this.config.enabledTools.length > 0 ? this.config.enabledTools.join(', ') : 'none'}`
        };
        
        results.push({
          id: call.id,
          name: call.name,
          arguments: call.arguments,
          result,
          duration,
        });

        // Track in history
        this.state.toolCallHistory.push({
          iteration: this.state.iteration,
          toolName: call.name,
          success: false,
          duration,
        });

        this.state.totalToolCalls++;
        continue;
      }
      
      const result = await executeTool(call.name, call.arguments);
      const duration = Date.now() - startTime;

      results.push({
        id: call.id,
        name: call.name,
        arguments: call.arguments,
        result,
        duration,
      });

      // Track in history
      this.state.toolCallHistory.push({
        iteration: this.state.iteration,
        toolName: call.name,
        success: result.success,
        duration,
      });

      this.state.totalToolCalls++;
    }

    // Add tool results to messages
    this.state.messages.push({
      role: 'tool',
      content: '',
      toolResults: results.map(r => ({
        toolCallId: r.id,
        result: r.result,
      })),
    });

    return {
      toolCalls: results,
      shouldContinue: true,
    };
  }

  /**
   * Mark agent as complete
   */
  complete(response?: string): void {
    this.state.isComplete = true;
    if (response) {
      this.state.messages.push({ role: 'assistant', content: response });
    }
  }

  /**
   * Get statistics about tool usage
   */
  getStats(): {
    totalIterations: number;
    totalToolCalls: number;
    successRate: number;
    averageToolDuration: number;
    toolUsageBreakdown: Record<string, number>;
  } {
    const successfulCalls = this.state.toolCallHistory.filter(c => c.success).length;
    const totalDuration = this.state.toolCallHistory.reduce((sum, c) => sum + c.duration, 0);

    const toolUsageBreakdown: Record<string, number> = {};
    for (const call of this.state.toolCallHistory) {
      toolUsageBreakdown[call.toolName] = (toolUsageBreakdown[call.toolName] || 0) + 1;
    }

    return {
      totalIterations: this.state.iteration,
      totalToolCalls: this.state.totalToolCalls,
      successRate: this.state.totalToolCalls > 0 ? successfulCalls / this.state.totalToolCalls : 0,
      averageToolDuration: this.state.totalToolCalls > 0 ? totalDuration / this.state.totalToolCalls : 0,
      toolUsageBreakdown,
    };
  }

  /**
   * Reset agent state
   */
  reset(): void {
    this.state = {
      messages: [],
      iteration: 0,
      totalToolCalls: 0,
      toolCallHistory: [],
      isComplete: false,
    };
  }
}

/**
 * Create a pre-configured scraping agent for product discovery
 */
export function createProductDiscoveryAgent(): ScrapingAgent {
  return new ScrapingAgent({
    maxIterations: 15,
    mandatoryToolUse: true,
    enabledTools: [
      'firecrawl_scrape',
      'firecrawl_map',
      'firecrawl_extract',
      'tavily_search',
      'tavily_search_context',
      'jina_reader',
      'jina_search',
      'jina_rerank',
    ],
  });
}

/**
 * Create a pre-configured scraping agent for price monitoring
 */
export function createPriceMonitoringAgent(): ScrapingAgent {
  return new ScrapingAgent({
    maxIterations: 10,
    mandatoryToolUse: true,
    enabledTools: [
      'firecrawl_scrape',
      'firecrawl_batch_scrape',
      'jina_reader',
      'tavily_search',
      'jina_grounding',
    ],
  });
}

/**
 * Create a pre-configured scraping agent for deal verification
 */
export function createDealVerificationAgent(): ScrapingAgent {
  return new ScrapingAgent({
    maxIterations: 8,
    mandatoryToolUse: true,
    enabledTools: [
      'firecrawl_scrape',
      'jina_reader',
      'jina_grounding',
      'tavily_search',
      'tavily_search_qna',
      'jina_rerank',
    ],
  });
}
