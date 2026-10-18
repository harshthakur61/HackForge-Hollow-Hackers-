/**
 * useQueries.ts: TanStack Query hooks for REST proxies (/api/nights, /api/kpis, /api/decisions, /api/config).
 * Polling is disabled; queries are refetched upon "settlement" events.
 */

import { useQuery } from "@tanstack/react-query";
import {
  NightsResponseSchema,
  KpisResponseSchema,
  DecisionsResponseSchema,
  HealthResponseSchema,
  NightsResponse,
  KpisResponse,
  DecisionsResponse,
  ConfigResponse,
  HealthResponse,
  SleeveConfigResponseSchema,
  SleevePathResponseSchema,
  SleeveCompareResponseSchema,
  SleeveConfigResponse,
  SleevePathResponse,
  SleeveCompareResponse,
  SleeveWeights,
} from "../contract";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function fetchJson<T>(url: string, schema: { parse: (val: unknown) => T }): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`REST error [${resp.status}] ${url}: ${await resp.text()}`);
  }
  const data = await resp.json();
  return schema.parse(data);
}

export function useHealthQuery() {
  return useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: () => fetchJson(`${API_URL}/api/health`, HealthResponseSchema),
    refetchInterval: 10000,
  });
}

export function useNightsQuery() {
  return useQuery<NightsResponse>({
    queryKey: ["nights"],
    queryFn: () => fetchJson(`${API_URL}/api/nights`, NightsResponseSchema),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useKpisQuery(through?: string) {
  const queryParam = through ? `?through=${through}` : "";
  return useQuery<KpisResponse>({
    queryKey: ["kpis", through],
    queryFn: () => fetchJson(`${API_URL}/api/kpis${queryParam}`, KpisResponseSchema),
    refetchOnWindowFocus: false,
  });
}

export function useDecisionsQuery(limit: number = 50, strategy?: string, before?: string) {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (strategy) params.set("strategy", strategy);
  if (before) params.set("before", before);

  return useQuery<DecisionsResponse>({
    queryKey: ["decisions", limit, strategy, before],
    queryFn: () =>
      fetchJson(`${API_URL}/api/decisions?${params.toString()}`, DecisionsResponseSchema),
    refetchOnWindowFocus: false,
  });
}

export function useConfigQuery() {
  return useQuery<ConfigResponse>({
    queryKey: ["config"],
    queryFn: async () => {
      return {
        pool_usd: 100000000.0,
        accrual: "overnight_1d",
        policy_mode: "zero_overdraft",
        model_for_policy: "B1",
        default_haircut_pct: 0.5,
        default_overdraft_apr_pct: 12.0,
        q_star_zero_overdraft: 0.9783,
        q_star_cost_optimal: 0.7477,
      };
    },
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useSleeveConfigQuery() {
  return useQuery<SleeveConfigResponse>({
    queryKey: ["sleeve-config"],
    queryFn: () => fetchJson(`${API_URL}/api/sleeve/config`, SleeveConfigResponseSchema),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useSleevePathQuery(preset?: string, weights?: SleeveWeights, sleeveUsd?: number) {
  const params = new URLSearchParams();
  if (preset) params.set("preset", preset);
  if (weights) {
    params.set("weights", `repo=${weights.repo},bonds=${weights.bonds},equity=${weights.equity}`);
  }
  if (sleeveUsd) params.set("sleeve_usd", sleeveUsd.toString());

  return useQuery<SleevePathResponse>({
    queryKey: ["sleeve-path", preset, weights, sleeveUsd],
    queryFn: () => fetchJson(`${API_URL}/api/sleeve/path?${params.toString()}`, SleevePathResponseSchema),
    refetchOnWindowFocus: false,
  });
}

export function useSleeveCompareQuery(through?: string) {
  const queryParam = through ? `?through=${through}` : "";
  return useQuery<SleeveCompareResponse>({
    queryKey: ["sleeve-compare", through],
    queryFn: () => fetchJson(`${API_URL}/api/sleeve/compare${queryParam}`, SleeveCompareResponseSchema),
    refetchOnWindowFocus: false,
  });
}

