/**
 * Tests for Scraping Agent with 17 Tools
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SCRAPING_TOOLS,
  getTool,
  getAvailableTools,
  executeTool,
  getToolSchemas,
  ScrapingAgent,
  MandatoryToolUseError,
  createProductDiscoveryAgent,
  createPriceMonitoringAgent,
  createDealVerificationAgent,
} from './scraping-agent';

describe('Scraping Agent Tool Registry', () => {
  it('should have exactly 17 tools registered', () => {
    expect(SCRAPING_TOOLS).toHaveLength(17);
  });

  it('should have 6 Firecrawl tools', () => {
    const firecrawlTools = SCRAPING_TOOLS.filter(t => t.provider === 'firecrawl');
    expect(firecrawlTools).toHaveLength(6);
    expect(firecrawlTools.map(t => t.name)).toEqual([
      'firecrawl_scrape',
      'firecrawl_crawl',
      'firecrawl_crawl_status',
      'firecrawl_map',
      'firecrawl_extract',
      'firecrawl_batch_scrape',
    ]);
  });

  it('should have 4 Tavily tools', () => {
    const tavilyTools = SCRAPING_TOOLS.filter(t => t.provider === 'tavily');
    expect(tavilyTools).toHaveLength(4);
    expect(tavilyTools.map(t => t.name)).toEqual([
      'tavily_search',
      'tavily_search_context',
      'tavily_search_qna',
      'tavily_extract',
    ]);
  });

  it('should have 7 Jina tools', () => {
    const jinaTools = SCRAPING_TOOLS.filter(t => t.provider === 'jina');
    expect(jinaTools).toHaveLength(7);
    expect(jinaTools.map(t => t.name)).toEqual([
      'jina_reader',
      'jina_search',
      'jina_grounding',
      'jina_rerank',
      'jina_segment',
      'jina_classify',
      'jina_embed',
    ]);
  });

  it('should get tool by name', () => {
    const tool = getTool('firecrawl_scrape');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('firecrawl_scrape');
    expect(tool?.provider).toBe('firecrawl');
  });

  it('should return undefined for unknown tool', () => {
    const tool = getTool('unknown_tool');
    expect(tool).toBeUndefined();
  });

  it('should filter available tools by enabled list', () => {
    const enabledTools = ['firecrawl_scrape', 'jina_reader'];
    const tools = getAvailableTools(enabledTools);
    expect(tools).toHaveLength(2);
    expect(tools.map(t => t.name)).toEqual(['firecrawl_scrape', 'jina_reader']);
  });

  it('should return all tools when no filter provided', () => {
    const tools = getAvailableTools();
    expect(tools).toHaveLength(17);
  });
});

describe('Tool Schema Generation', () => {
  it('should generate OpenAI-compatible tool schemas', () => {
    const schemas = getToolSchemas(['firecrawl_scrape']);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].type).toBe('function');
    expect(schemas[0].function.name).toBe('firecrawl_scrape');
    expect(schemas[0].function.description).toBeDefined();
    expect(schemas[0].function.parameters).toHaveProperty('type', 'object');
    expect(schemas[0].function.parameters).toHaveProperty('properties');
  });

  it('should include required fields in schema', () => {
    const schemas = getToolSchemas(['firecrawl_scrape']);
    const params = schemas[0].function.parameters as Record<string, unknown>;
    expect(params.required).toContain('url');
  });
});

describe('Tool Execution', () => {
  it('should return error for unknown tool', async () => {
    const result = await executeTool('unknown_tool', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  it('should validate input against schema', async () => {
    const result = await executeTool('firecrawl_scrape', { url: 'not-a-valid-url' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid input');
  });

  it('should return API key error when not configured', async () => {
    const originalKey = process.env.FIRECRAWL_API_KEY;
    delete process.env.FIRECRAWL_API_KEY;

    const result = await executeTool('firecrawl_scrape', { url: 'https://example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('API key not configured');

    if (originalKey) {
      process.env.FIRECRAWL_API_KEY = originalKey;
    }
  });
});

describe('Scraping Agent', () => {
  let agent: ScrapingAgent;

  beforeEach(() => {
    agent = new ScrapingAgent({
      maxIterations: 5,
      mandatoryToolUse: true,
    });
  });

  it('should initialize with correct default state', () => {
    const state = agent.getState();
    expect(state.messages).toHaveLength(0);
    expect(state.iteration).toBe(0);
    expect(state.totalToolCalls).toBe(0);
    expect(state.isComplete).toBe(false);
  });

  it('should add user message to state', () => {
    agent.addUserMessage('Find me a deal on electronics');
    const state = agent.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe('user');
    expect(state.messages[0].content).toBe('Find me a deal on electronics');
  });

  it('should throw MandatoryToolUseError when no tools called', async () => {
    await expect(agent.step([])).rejects.toThrow(MandatoryToolUseError);
  });

  it('should allow step without tools when mandatory use is disabled', async () => {
    const permissiveAgent = new ScrapingAgent({
      mandatoryToolUse: false,
    });

    const result = await permissiveAgent.step([]);
    expect(result.shouldContinue).toBe(true);
    expect(result.toolCalls).toHaveLength(0);
  });

  it('should track tool call history', async () => {
    // This will fail due to no API key, but should still track the call
    const result = await agent.step([
      {
        id: 'call-1',
        name: 'firecrawl_scrape',
        arguments: { url: 'https://example.com' },
      },
    ]);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('firecrawl_scrape');

    const state = agent.getState();
    expect(state.iteration).toBe(1);
    expect(state.totalToolCalls).toBe(1);
    expect(state.toolCallHistory).toHaveLength(1);
    expect(state.toolCallHistory[0].toolName).toBe('firecrawl_scrape');
  });

  it('should stop after max iterations', async () => {
    // Run 6 iterations (max is 5)
    for (let i = 0; i < 6; i++) {
      try {
        await agent.step([
          {
            id: `call-${i}`,
            name: 'firecrawl_scrape',
            arguments: { url: 'https://example.com' },
          },
        ]);
      } catch {
        // Ignore errors from API calls
      }
    }

    const state = agent.getState();
    expect(state.isComplete).toBe(true);
    expect(state.error).toContain('Max iterations');
  });

  it('should calculate stats correctly', async () => {
    // Make a couple of tool calls
    await agent.step([
      {
        id: 'call-1',
        name: 'firecrawl_scrape',
        arguments: { url: 'https://example.com' },
      },
    ]);

    await agent.step([
      {
        id: 'call-2',
        name: 'jina_reader',
        arguments: { url: 'https://example.com' },
      },
    ]);

    const stats = agent.getStats();
    expect(stats.totalIterations).toBe(2);
    expect(stats.totalToolCalls).toBe(2);
    expect(stats.toolUsageBreakdown).toHaveProperty('firecrawl_scrape', 1);
    expect(stats.toolUsageBreakdown).toHaveProperty('jina_reader', 1);
  });

  it('should reset state', async () => {
    agent.addUserMessage('Test');
    await agent.step([
      {
        id: 'call-1',
        name: 'firecrawl_scrape',
        arguments: { url: 'https://example.com' },
      },
    ]);

    agent.reset();
    const state = agent.getState();
    expect(state.messages).toHaveLength(0);
    expect(state.iteration).toBe(0);
    expect(state.totalToolCalls).toBe(0);
  });

  it('should mark agent as complete', () => {
    agent.complete('Task finished successfully');
    const state = agent.getState();
    expect(state.isComplete).toBe(true);
    expect(state.messages[state.messages.length - 1].content).toBe('Task finished successfully');
  });
});

describe('Pre-configured Agents', () => {
  it('should create product discovery agent with correct tools', () => {
    const agent = createProductDiscoveryAgent();
    const tools = agent.getEnabledTools();
    expect(tools.map(t => t.name)).toContain('firecrawl_scrape');
    expect(tools.map(t => t.name)).toContain('tavily_search');
    expect(tools.map(t => t.name)).toContain('jina_reader');
    expect(tools.map(t => t.name)).toContain('jina_rerank');
  });

  it('should create price monitoring agent with correct tools', () => {
    const agent = createPriceMonitoringAgent();
    const tools = agent.getEnabledTools();
    expect(tools.map(t => t.name)).toContain('firecrawl_batch_scrape');
    expect(tools.map(t => t.name)).toContain('jina_grounding');
  });

  it('should create deal verification agent with correct tools', () => {
    const agent = createDealVerificationAgent();
    const tools = agent.getEnabledTools();
    expect(tools.map(t => t.name)).toContain('jina_grounding');
    expect(tools.map(t => t.name)).toContain('tavily_search_qna');
  });
});
