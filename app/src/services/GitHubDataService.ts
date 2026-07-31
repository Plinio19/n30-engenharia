import type { IDataService } from './IDataService';
import type { DataResult, GitHubConfig } from '../types';

const LS_CONFIG = 'n30eng_config_v1';
const DEFAULTS: Partial<GitHubConfig> = {
  owner:  'Plinio19',
  repo:   'n30-engenharia',
  branch: 'master',
};

const CACHE_MAP: Record<string, string> = {
  'data/obras.json':             'n30_obras',
  'data/lancamentos.json':       'n30_lanc',
  'data/etapas.json':            'n30_etapas',
  'data/modelos.json':           'n30_modelos',
  'data/clientes.json':          'n30_clientes',
  'data/prestadores.json':       'n30_prestadores',
  'data/funcionarios.json':      'n30_funcionarios',
  'data/materiais_catalogo.json':'n30_materiais_cat',
  'data/socios.json':            'n30_socios',
};

function cacheKey(path: string): string {
  return CACHE_MAP[path] ?? `cbx_${path.replace(/[^a-z0-9]/gi, '_')}`;
}

function getConfig(): GitHubConfig | null {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_CONFIG) || '{}');
    const cfg = { ...DEFAULTS, ...stored } as GitHubConfig;
    return cfg.token ? cfg : null;
  } catch {
    return null;
  }
}

function apiBase(cfg: GitHubConfig, path: string): string {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${cfg.branch}`;
}

function headers(cfg: GitHubConfig): HeadersInit {
  return {
    Authorization: `token ${cfg.token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

export class GitHubDataService implements IDataService {
  isConfigured(): boolean {
    const cfg = getConfig();
    return !!(cfg?.token && cfg?.owner && cfg?.repo);
  }

  async getCollection<T>(path: string): Promise<DataResult<T>> {
    const cfg = getConfig();
    const key = cacheKey(path);

    // Sem config: tenta cache local (compartilhado com sistema legado)
    if (!cfg) {
      const cached = localStorage.getItem(key);
      if (cached) return { lista: JSON.parse(cached), sha: null };
      throw new Error('GitHub não configurado. Acesse Configurações.');
    }

    const res = await fetch(apiBase(cfg, path), { headers: headers(cfg) });

    if (res.status === 404) return { lista: [], sha: null };

    if (!res.ok) {
      // Fallback para cache local
      const cached = localStorage.getItem(key);
      if (cached) return { lista: JSON.parse(cached), sha: null };
      throw new Error(`GitHub ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    const sha: string = json.sha;
    // decodeURIComponent(escape(...)) desfaz o btoa(unescape(encodeURIComponent(...))) do sistema legado
    const raw = atob(json.content.replace(/\n/g, ''));
    const lista: T[] = JSON.parse(decodeURIComponent(escape(raw)));

    localStorage.setItem(key, JSON.stringify(lista));
    return { lista, sha };
  }

  async saveCollection<T>(
    path: string,
    data: T[],
    sha: string | null,
    message = 'Atualização N30 Engenharia',
  ): Promise<string> {
    const cfg = getConfig();
    if (!cfg) throw new Error('GitHub não configurado.');

    // Busca sha fresco para evitar 409
    let freshSha = sha;
    try {
      const check = await fetch(apiBase(cfg, path), { headers: headers(cfg) });
      if (check.ok) freshSha = (await check.json()).sha;
    } catch { /* usa sha atual */ }

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const body: Record<string, unknown> = { message, content, branch: cfg.branch };
    if (freshSha) body.sha = freshSha;

    const res = await fetch(
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: headers(cfg),
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `GitHub ${res.status}`);
    }

    const newSha: string = (await res.json()).content.sha;
    localStorage.setItem(cacheKey(path), JSON.stringify(data));
    return newSha;
  }
}

export const dataService: IDataService = new GitHubDataService();
