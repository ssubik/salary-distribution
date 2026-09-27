import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  isAddress,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hash,
} from "viem";
import { erc20Abi, salaryStreamAbi } from "../lib/contracts";
import { getErrorMessage } from "../lib/format";

export interface EmployeeData {
  registered: boolean;
  id: bigint;
  age: bigint;
  name: string;
  position: string;
  totalSalary: bigint;
  claimedSalary: bigint;
  startedAt: bigint;
  streamTill: bigint;
  interval: bigint;
  claimable: bigint;
}

export interface ContractData {
  owner: Address;
  tokenAddress: Address;
  tokenSymbol: string;
  tokenDecimals: number;
  walletBalance: bigint;
  allowance: bigint;
  paused: boolean;
  totalReserved: bigint;
  availableBalance: bigint;
  employee: EmployeeData;
}

const emptyEmployee: EmployeeData = {
  registered: false,
  id: 0n,
  age: 0n,
  name: "",
  position: "",
  totalSalary: 0n,
  claimedSalary: 0n,
  startedAt: 0n,
  streamTill: 0n,
  interval: 0n,
  claimable: 0n,
};

export function useSalaryStream(contractAddress: string) {
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [data, setData] = useState<ContractData>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const provider = useMemo(() => window.ethereum as EIP1193Provider | undefined, []);
  const address = useMemo(
    () => (isAddress(contractAddress) ? getAddress(contractAddress) : undefined),
    [contractAddress],
  );

  const publicClient = useMemo(
    () => (provider ? createPublicClient({ transport: custom(provider) }) : undefined),
    [provider],
  );

  const syncWallet = useCallback(async () => {
    if (!provider) return;
    const [accounts, currentChainId] = await Promise.all([
      provider.request({ method: "eth_accounts" }) as Promise<string[]>,
      provider.request({ method: "eth_chainId" }) as Promise<string>,
    ]);
    setAccount(accounts[0] && isAddress(accounts[0]) ? getAddress(accounts[0]) : undefined);
    setChainId(Number.parseInt(currentChainId, 16));
  }, [provider]);

  const connect = useCallback(async () => {
    if (!provider) throw new Error("No browser wallet found. Install MetaMask or another EVM wallet.");
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    const currentChainId = (await provider.request({ method: "eth_chainId" })) as string;
    setAccount(accounts[0] && isAddress(accounts[0]) ? getAddress(accounts[0]) : undefined);
    setChainId(Number.parseInt(currentChainId, 16));
  }, [provider]);

  const refresh = useCallback(async () => {
    if (!publicClient || !address || !account) {
      setData(undefined);
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const [owner, tokenAddress, paused, totalReserved, availableBalance, registered] = await Promise.all([
        publicClient.readContract({ address, abi: salaryStreamAbi, functionName: "owner" }),
        publicClient.readContract({ address, abi: salaryStreamAbi, functionName: "salaryToken" }),
        publicClient.readContract({ address, abi: salaryStreamAbi, functionName: "paused" }),
        publicClient.readContract({ address, abi: salaryStreamAbi, functionName: "totalReserved" }),
        publicClient.readContract({ address, abi: salaryStreamAbi, functionName: "availableBalance" }),
        publicClient.readContract({ address, abi: salaryStreamAbi, functionName: "isRegistered", args: [account] }),
      ]);

      const [symbolResult, decimalsResult, balanceResult, allowanceResult] = await Promise.allSettled([
        publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "symbol" }),
        publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "decimals" }),
        publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account, address],
        }),
      ]);

      let employee = emptyEmployee;
      if (registered) {
        const [details, configuration, claimable] = await Promise.all([
          publicClient.readContract({ address, abi: salaryStreamAbi, functionName: "employeeDetails", args: [account] }),
          publicClient.readContract({
            address,
            abi: salaryStreamAbi,
            functionName: "employeeSalaryConfig",
            args: [account],
          }),
          publicClient.readContract({ address, abi: salaryStreamAbi, functionName: "claimableSalary", args: [account] }),
        ]);

        employee = {
          registered: true,
          id: details[0],
          age: details[1],
          name: details[2],
          position: details[3],
          totalSalary: configuration[0],
          claimedSalary: configuration[1],
          startedAt: configuration[2],
          streamTill: configuration[3],
          interval: configuration[4],
          claimable,
        };
      }

      setData({
        owner,
        tokenAddress,
        tokenSymbol: symbolResult.status === "fulfilled" ? symbolResult.value : "TOKEN",
        tokenDecimals: decimalsResult.status === "fulfilled" ? decimalsResult.value : 18,
        walletBalance: balanceResult.status === "fulfilled" ? balanceResult.value : 0n,
        allowance: allowanceResult.status === "fulfilled" ? allowanceResult.value : 0n,
        paused,
        totalReserved,
        availableBalance,
        employee,
      });
    } catch (caught) {
      setData(undefined);
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [account, address, publicClient]);

  const transact = useCallback(
    async (target: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) => {
      if (!provider || !publicClient || !account) throw new Error("Connect your wallet first.");
      const walletClient = createWalletClient({ account, transport: custom(provider) });
      const hash = (await walletClient.writeContract({
        address: target,
        abi,
        functionName,
        args,
        account,
        chain: undefined,
      } as any)) as Hash;
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
      return hash;
    },
    [account, provider, publicClient, refresh],
  );

  const writeContract = useCallback(
    (functionName: string, args: readonly unknown[] = []) => {
      if (!address) throw new Error("Enter a valid SalaryStream contract address.");
      return transact(address, salaryStreamAbi, functionName, args);
    },
    [address, transact],
  );

  const approveToken = useCallback(
    (amount: bigint) => {
      if (!data || !address) throw new Error("Contract data is not loaded yet.");
      return transact(data.tokenAddress, erc20Abi, "approve", [address, amount]);
    },
    [address, data, transact],
  );

  useEffect(() => {
    const initialSync = window.setTimeout(() => void syncWallet(), 0);
    if (!provider) return () => window.clearTimeout(initialSync);

    const handleAccounts = () => void syncWallet();
    const handleChain = () => {
      setData(undefined);
      void syncWallet();
    };
    provider.on("accountsChanged", handleAccounts);
    provider.on("chainChanged", handleChain);
    return () => {
      window.clearTimeout(initialSync);
      provider.removeListener("accountsChanged", handleAccounts);
      provider.removeListener("chainChanged", handleChain);
    };
  }, [provider, syncWallet]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 12_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return {
    account,
    address,
    chainId,
    connect,
    data,
    error,
    hasProvider: Boolean(provider),
    loading,
    refresh,
    writeContract,
    approveToken,
  };
}
