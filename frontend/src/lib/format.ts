import { formatUnits, type Address } from "viem";

export function shortAddress(address?: Address | string, size = 4) {
  if (!address) return "—";
  return `${address.slice(0, size + 2)}…${address.slice(-size)}`;
}

export function formatToken(value: bigint, decimals: number, maximumFractionDigits = 2) {
  const raw = Number(formatUnits(value, decimals));
  if (!Number.isFinite(raw)) return formatUnits(value, decimals);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: raw > 0 && raw < 1 ? Math.min(maximumFractionDigits, 2) : 0,
  }).format(raw);
}

export function formatDate(timestamp: bigint) {
  if (timestamp === 0n) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Number(timestamp) * 1_000));
}

export function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { shortMessage?: string; message?: string };
    if (candidate.shortMessage) return candidate.shortMessage;
    if (candidate.message) return candidate.message.split("\n")[0];
  }
  return "Something went wrong. Please try again.";
}

export function chainName(chainId?: number) {
  const names: Record<number, string> = {
    1: "Ethereum",
    10: "Optimism",
    137: "Polygon",
    8453: "Base",
    42161: "Arbitrum",
    11155111: "Sepolia",
    31337: "Anvil",
  };
  return chainId ? names[chainId] ?? `Chain ${chainId}` : "No network";
}

export function explorerAddressUrl(chainId: number | undefined, address: string) {
  const explorers: Record<number, string> = {
    1: "https://etherscan.io/address/",
    10: "https://optimistic.etherscan.io/address/",
    137: "https://polygonscan.com/address/",
    8453: "https://basescan.org/address/",
    42161: "https://arbiscan.io/address/",
    11155111: "https://sepolia.etherscan.io/address/",
  };
  return chainId && explorers[chainId] ? `${explorers[chainId]}${address}` : undefined;
}
