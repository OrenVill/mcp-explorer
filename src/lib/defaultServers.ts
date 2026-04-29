import type { ServerEntry } from '../types';

type Seed = Pick<ServerEntry, 'id' | 'name' | 'url' | 'description'>;

const seeds: Seed[] = [
  {
    id: 'unified-mcp',
    name: 'Unified MCP',
    url: 'http://localhost:8000/mcp',
    description: 'Aggregates every server below + search_tools meta-tool.',
  },
  {
    id: 'open-meteo',
    name: 'Open-Meteo',
    url: 'http://localhost:3500/mcp',
    description: 'Weather, geocoding, current conditions, forecasts.',
  },
  {
    id: 'rest-countries',
    name: 'REST Countries',
    url: 'http://localhost:3501/mcp',
    description: 'Country lookups by name, code, region, capital.',
  },
  {
    id: 'hacker-news',
    name: 'Hacker News',
    url: 'http://localhost:3502/mcp',
    description: 'Top stories, items, comments, Algolia search.',
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    url: 'http://localhost:3503/mcp',
    description: 'Article search, summaries, full extracts.',
  },
  {
    id: 'arxiv',
    name: 'arXiv',
    url: 'http://localhost:3504/mcp',
    description: 'Search research papers, fetch by ID, list recent.',
  },
  {
    id: 'open-library',
    name: 'Open Library',
    url: 'http://localhost:3505/mcp',
    description: 'Books, ISBN/work/author lookup.',
  },
  {
    id: 'nominatim',
    name: 'Nominatim (OSM)',
    url: 'http://localhost:3506/mcp',
    description: 'Forward and reverse geocoding via OpenStreetMap.',
  },
  {
    id: 'dictionary',
    name: 'Dictionary',
    url: 'http://localhost:3507/mcp',
    description: 'Definitions, synonyms, phonetics.',
  },
  {
    id: 'frankfurter',
    name: 'Frankfurter (FX)',
    url: 'http://localhost:3508/mcp',
    description: 'ECB FX rates, conversion, historical, time series.',
  },
  {
    id: 'usgs-earthquake',
    name: 'USGS Earthquakes',
    url: 'http://localhost:3509/mcp',
    description: 'Query the USGS Earthquake Catalog.',
  },
  {
    id: 'spacex',
    name: 'SpaceX',
    url: 'http://localhost:3510/mcp',
    description: 'Launches, rockets, latest/next launch.',
  },
  {
    id: 'github-public',
    name: 'GitHub (public)',
    url: 'http://localhost:3511/mcp',
    description: 'Public repos, users, issues, releases, search.',
  },
  {
    id: 'mdn-compat',
    name: 'MDN',
    url: 'http://localhost:3512/mcp',
    description: 'MDN search, doc fetch, browser-compat extract.',
  },
  {
    id: 'datamuse',
    name: 'Datamuse',
    url: 'http://localhost:3513/mcp',
    description: 'Rhymes, synonyms, means-like, sounds-like, suggest.',
  },
  {
    id: 'trivia',
    name: 'Open Trivia DB',
    url: 'http://localhost:3514/mcp',
    description: 'Trivia questions, categories, counts.',
  },
  {
    id: 'crossref',
    name: 'Crossref',
    url: 'http://localhost:3515/mcp',
    description: 'DOI metadata, scholarly works and journals.',
  },
];

export function buildDefaultServers(): ServerEntry[] {
  return seeds.map((s) => ({ ...s, status: 'disconnected' as const }));
}
