'use client';

/**
 * =============================================================================
 * `src/hooks/useWallet.ts` — connection state, and the chain the user is on
 * =============================================================================
 *
 * `eth_accounts` ON MOUNT, NEVER `eth_requestAccounts`. This is the single most
 * important line in the file. `eth_accounts` asks "is this site already
 * authorized?" and answers silently. `eth_requestAccounts` OPENS A WALLET POPUP.
 * Calling the latter on mount means every visitor to the docket gets a wallet
 * prompt for a read-only page they never asked to connect to — the behaviour that
 * trains people to dismiss wallet dialogs without reading them.
 *
 * So: mount reads the existing authorization. A popup only ever follows a click.
 *
 * SWITCH FIRST, ADD ON 4902. `wallet_switchEthereumChain` is tried before
 * `wallet_addEthereumChain`, because a user who already has the chain configured
 * should not be asked to add it again — the add dialog is heavier, asks for more
 * trust, and would overwrite their own RPC settings with this deployment's. Error
 * 4902 is the standard "unrecognized chain" code, and it is the only condition
 * that justifies escalating to add.
 *
 * A REJECTION IS NOT AN ERROR. Code 4001 is the user declining, which is a valid
 * answer to a request for a signature. It clears the pending state and says
 * nothing accusatory — an error panel for "you decided not to" is the interface
 * arguing with the person using it.
 *
 * THE PROVIDER'S EVENTS ARE THE SOURCE OF TRUTH, not the last value this hook
 * fetched. A user can switch accounts or networks in the wallet at any moment,
 * and a screen still showing the previous address would let them sign as one
 * account believing they were another. So `accountsChanged` and `chainChanged`
 * are subscribed for the life of the connection.
 *
 * NO CHAIN COMPARISON HAPPENS HERE. `isOnArc` in `lib/chain.ts` owns that,
 * because it owns the constant and the numeric normalisation a provider's varied
 * chain-id formats require.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ARC_TESTNET, blockExplorerUrls, isOnArc, rpcUrls } from '@/lib/chain';
import { discoverProviders, type Eip6963Provider } from '@/lib/eip6963';

/** EIP-1193 rejection: the user said no. */
const USER_REJECTED = 4001;
/** EIP-3085: the wallet does not know this chain. The one reason to escalate. */
const CHAIN_NOT_ADDED = 4902;

/** An error carrying a numeric provider code. */
function providerCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'number' ? code : null;
}

export interface WalletState {
  /** Every wallet that announced itself. Empty until one does. */
  available: Eip6963Provider[];

  /** The wallet in use, once one has been selected. */
  selected: Eip6963Provider | null;

  /** The authorized account, or `null` when not connected. */
  account: string | null;

  /** The chain the wallet reports, in whatever form it reports it. */
  chainId: string | null;

  /** Is the wallet on the target chain? Delegates to `lib/chain.ts`. */
  onTargetChain: boolean;

  /** A request is open in the wallet. Disables controls that would stack popups. */
  busy: boolean;

  /**
   * The last failure, already a sentence. `null` after a user rejection, which is
   * an answer rather than a fault.
   */
  problem: string | null;

  /** Prompt for authorization. Opens a popup — only ever call this from a click. */
  connect: (provider: Eip6963Provider) => Promise<void>;

  /** Switch to the target chain, adding it only if the wallet does not have it. */
  switchChain: () => Promise<void>;
}

export function useWallet(): WalletState {
  const [available, setAvailable] = useState<Eip6963Provider[]>([]);
  const [selected, setSelected] = useState<Eip6963Provider | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    const stop = discoverProviders((providers) => {
      if (!cancelled.current) setAvailable(providers);
    });

    return () => {
      cancelled.current = true;
      stop();
    };
  }, []);

  /**
   * Adopt the first announced wallet as the selection, and read any EXISTING
   * authorization without prompting.
   *
   * `eth_accounts` returns `[]` for a site the user has not connected, so this is
   * silent for a first-time visitor and restores the session for a returning one.
   * That is the whole reason the read is split from `connect`.
   */
  useEffect(() => {
    if (selected !== null || available.length === 0) return;

    const candidate = available[0];
    setSelected(candidate);

    void (async () => {
      try {
        const accounts = await candidate.provider.request({ method: 'eth_accounts' });
        const chain = await candidate.provider.request({ method: 'eth_chainId' });

        if (cancelled.current) return;

        if (Array.isArray(accounts) && typeof accounts[0] === 'string') {
          setAccount(accounts[0]);
        }
        if (typeof chain === 'string') setChainId(chain);
      } catch {
        // A wallet that will not answer a silent read is simply not connected.
        // Nothing is reported: the user has not asked for anything yet.
      }
    })();
  }, [available, selected]);

  /**
   * Follow the wallet rather than trusting the last read.
   *
   * `accountsChanged` with an empty array means disconnected — the user revoked
   * this site's permission in the wallet, and the interface must stop showing an
   * address it can no longer sign with.
   */
  useEffect(() => {
    const provider = selected?.provider;
    if (provider?.on === undefined || provider.removeListener === undefined) return;

    const onAccounts = (...args: unknown[]): void => {
      const accounts = args[0];
      setAccount(
        Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null,
      );
    };

    const onChain = (...args: unknown[]): void => {
      const chain = args[0];
      if (typeof chain === 'string') setChainId(chain);
    };

    provider.on('accountsChanged', onAccounts);
    provider.on('chainChanged', onChain);

    return () => {
      provider.removeListener?.('accountsChanged', onAccounts);
      provider.removeListener?.('chainChanged', onChain);
    };
  }, [selected]);

  const connect = useCallback(async (target: Eip6963Provider) => {
    setSelected(target);
    setBusy(true);
    setProblem(null);

    try {
      // The ONE call in this hook that opens a popup, reached only from a click.
      const accounts = await target.provider.request({ method: 'eth_requestAccounts' });
      const chain = await target.provider.request({ method: 'eth_chainId' });

      if (Array.isArray(accounts) && typeof accounts[0] === 'string') {
        setAccount(accounts[0]);
      }
      if (typeof chain === 'string') setChainId(chain);
    } catch (error) {
      // Declining is an answer. Nothing is reported.
      if (providerCode(error) !== USER_REJECTED) {
        setProblem(
          'The wallet did not return an account. Check that it is unlocked and that this site is permitted to see your accounts.',
        );
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const switchChain = useCallback(async () => {
    const provider = selected?.provider;
    if (provider === undefined) return;

    setBusy(true);
    setProblem(null);

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_TESTNET.chainIdHex }],
      });
    } catch (error) {
      const code = providerCode(error);

      if (code === USER_REJECTED) {
        setBusy(false);
        return;
      }

      if (code !== CHAIN_NOT_ADDED) {
        setProblem('The wallet refused to switch networks, and did not say the chain was unknown to it.');
        setBusy(false);
        return;
      }

      // Only now, and only because the wallet said it does not have the chain.
      const endpoints = rpcUrls();
      if (endpoints.length === 0) {
        setProblem(
          `This deployment has no RPC endpoint configured, so ${ARC_TESTNET.name} cannot be added to your wallet. Set NEXT_PUBLIC_ARC_RPC_URL. A guessed endpoint would register a chain whose every call fails.`,
        );
        setBusy(false);
        return;
      }

      const explorers = blockExplorerUrls();

      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: ARC_TESTNET.chainIdHex,
              chainName: ARC_TESTNET.name,
              nativeCurrency: ARC_TESTNET.nativeCurrency,
              rpcUrls: endpoints,
              // The key is OMITTED rather than sent empty when no explorer is
              // configured. A wallet keeps what it is given, and a wrong explorer
              // outlives this demo on every transaction the user ever makes.
              ...(explorers.length > 0 ? { blockExplorerUrls: explorers } : {}),
            },
          ],
        });
      } catch (addError) {
        if (providerCode(addError) !== USER_REJECTED) {
          setProblem(`The wallet declined to add ${ARC_TESTNET.name}.`);
        }
      }
    } finally {
      setBusy(false);
    }
  }, [selected]);

  const onTargetChain = useMemo(() => isOnArc(chainId), [chainId]);

  return {
    available,
    selected,
    account,
    chainId,
    onTargetChain,
    busy,
    problem,
    connect,
    switchChain,
  };
}
