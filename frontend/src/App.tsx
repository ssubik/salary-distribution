import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BanknoteArrowDown,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
  UsersRound,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { getAddress, isAddress, parseUnits, type Address } from "viem";
import { useSalaryStream } from "./hooks/useSalaryStream";
import { chainName, explorerAddressUrl, formatDate, formatToken, getErrorMessage, shortAddress } from "./lib/format";

type Tab = "overview" | "admin";
type Toast = { type: "success" | "error"; message: string };

const environmentAddress = import.meta.env.VITE_SALARY_STREAM_ADDRESS ?? "";
const initialAddress = localStorage.getItem("salaryStreamAddress") ?? environmentAddress;

function App() {
  const [contractInput, setContractInput] = useState(initialAddress);
  const [contractAddress, setContractAddress] = useState(
    isAddress(initialAddress) && initialAddress !== "0x0000000000000000000000000000000000000000"
      ? getAddress(initialAddress)
      : "",
  );
  const [tab, setTab] = useState<Tab>("overview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [toast, setToast] = useState<Toast>();

  const stream = useSalaryStream(contractAddress);
  const { account, data } = stream;
  const isOwner = Boolean(account && data && account.toLowerCase() === data.owner.toLowerCase());
  const explorerUrl = contractAddress ? explorerAddressUrl(stream.chainId, contractAddress) : undefined;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 4_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const saveContract = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAddress(contractInput) || contractInput === "0x0000000000000000000000000000000000000000") {
      setToast({ type: "error", message: "Enter a valid deployed contract address." });
      return;
    }
    const normalized = getAddress(contractInput);
    localStorage.setItem("salaryStreamAddress", normalized);
    setContractAddress(normalized);
    setSettingsOpen(false);
    setToast({ type: "success", message: "Contract address updated." });
  };

  const runTransaction = async (label: string, action: () => Promise<unknown>, success: string) => {
    setBusy(label);
    try {
      await action();
      setToast({ type: "success", message: success });
    } catch (error) {
      setToast({ type: "error", message: getErrorMessage(error) });
    } finally {
      setBusy(undefined);
    }
  };

  const handleFund = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    void runTransaction(
      "fund",
      async () => {
        const amount = parseUnits(String(form.get("amount")), data.tokenDecimals);
        if (amount <= 0n) throw new Error("Funding amount must be greater than zero.");
        if (data.allowance < amount) await stream.approveToken(amount);
        await stream.writeContract("fund", [amount]);
      },
      "Treasury funded successfully.",
    );
  };

  const handleRegister = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const details = {
      id: BigInt(String(form.get("id"))),
      age: BigInt(String(form.get("age"))),
      name: String(form.get("name")),
      position: String(form.get("position")),
    };
    void runTransaction(
      "register",
      () => stream.writeContract("registerEmployee", [requireAddress(form.get("employee")), details]),
      `${details.name} is registered.`,
    );
  };

  const handleConfigure = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    void runTransaction(
      "configure",
      () => {
        const salary = parseUnits(String(form.get("salary")), data.tokenDecimals);
        if (salary <= 0n) throw new Error("Salary must be greater than zero.");
        return stream.writeContract("configureEmployeeSalary", [
          requireAddress(form.get("employee")),
          salary,
          Number(form.get("interval")),
        ]);
      },
      "Salary stream configured.",
    );
  };

  const handleManage = (formElement: HTMLFormElement, action: "cancel" | "unregister") => {
    const form = new FormData(formElement);
    const functionName = action === "cancel" ? "cancelSalaryStream" : "unregisterEmployee";
    void runTransaction(
      action,
      () => stream.writeContract(functionName, [requireAddress(form.get("employee"))]),
      action === "cancel" ? "Future vesting cancelled; vested salary remains claimable." : "Employee unregistered.",
    );
  };

  const handleSweep = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    void runTransaction(
      "sweep",
      () => {
        const amount = parseUnits(String(form.get("amount")), data.tokenDecimals);
        if (amount <= 0n) throw new Error("Sweep amount must be greater than zero.");
        return stream.writeContract("sweep", [requireAddress(form.get("recipient")), amount]);
      },
      "Excess funds swept successfully.",
    );
  };

  const handleBatch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runTransaction(
      "batch",
      () => {
        const employees = String(form.get("employees"))
          .split(/[\s,]+/)
          .filter(Boolean)
          .map((value) => requireAddress(value));
        if (employees.length === 0 || employees.length > 10) {
          throw new Error("Enter between one and ten employee addresses.");
        }
        return stream.writeContract("claimOrStreamSalary", [employees]);
      },
      "Batch payout completed.",
    );
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <a className="brand" href="#top" aria-label="SalaryStream home">
          <span className="brand-mark"><Zap size={18} strokeWidth={2.5} /></span>
          <span>Salary<span>Stream</span></span>
        </a>

        <nav className="nav-tabs" aria-label="Main navigation">
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button>
          <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>Admin</button>
        </nav>

        <div className="wallet-area">
          {account && <span className="network-pill"><i />{chainName(stream.chainId)}</span>}
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Contract settings">
            <Settings2 size={18} />
          </button>
          <button
            className="wallet-button"
            onClick={() => void connectWallet(stream.connect, setToast)}
            disabled={!stream.hasProvider}
          >
            <WalletCards size={17} />
            {account ? shortAddress(account) : "Connect wallet"}
          </button>
        </div>
      </header>

      <main id="top">
        {!contractAddress ? (
          <SetupScreen
            value={contractInput}
            onChange={setContractInput}
            onSubmit={saveContract}
            connect={() => void connectWallet(stream.connect, setToast)}
          />
        ) : !account ? (
          <ConnectScreen connect={() => void connectWallet(stream.connect, setToast)} hasProvider={stream.hasProvider} />
        ) : stream.error ? (
          <ErrorScreen error={stream.error} onSettings={() => setSettingsOpen(true)} onRetry={() => void stream.refresh()} />
        ) : stream.loading && !data ? (
          <LoadingScreen />
        ) : data ? (
          <>
            <section className="page-heading">
              <div>
                <span className="eyebrow"><Sparkles size={14} /> Programmable payroll</span>
                <h1>{tab === "overview" ? <>Your salary, <em>in motion.</em></> : <>Run payroll <em>onchain.</em></>}</h1>
                <p>
                  {tab === "overview"
                    ? "Watch earnings vest in real time and claim what is yours—whenever you choose."
                    : "Register teammates, reserve salaries, and keep every payment transparent."}
                </p>
              </div>
              <button className="refresh-button" onClick={() => void stream.refresh()} disabled={stream.loading}>
                <RefreshCw size={16} className={stream.loading ? "spinning" : ""} /> Refresh
              </button>
            </section>

            <section className="stat-grid">
              <StatCard
                icon={<Landmark size={19} />}
                label="Treasury balance"
                value={`${formatToken(data.availableBalance + data.totalReserved, data.tokenDecimals)} ${data.tokenSymbol}`}
                detail="Held by contract"
              />
              <StatCard
                icon={<LockKeyhole size={19} />}
                label="Reserved for payroll"
                value={`${formatToken(data.totalReserved, data.tokenDecimals)} ${data.tokenSymbol}`}
                detail="Protected from sweeping"
                tone="ink"
              />
              <StatCard
                icon={<WalletCards size={19} />}
                label="Your wallet"
                value={`${formatToken(data.walletBalance, data.tokenDecimals)} ${data.tokenSymbol}`}
                detail={shortAddress(account)}
              />
            </section>

            {data.paused && (
              <div className="status-banner warning">
                <Pause size={17} /> Claims are temporarily paused. Vesting continues while the contract is paused.
              </div>
            )}

            {tab === "overview" ? (
              <Overview
                data={data}
                busy={busy}
                claim={() =>
                  void runTransaction("claim", () => stream.writeContract("claimSalary"), "Vested salary claimed.")
                }
                openAdmin={() => setTab("admin")}
                isOwner={isOwner}
              />
            ) : (
              <AdminPanel
                data={data}
                isOwner={isOwner}
                busy={busy}
                account={account}
                onFund={handleFund}
                onRegister={handleRegister}
                onConfigure={handleConfigure}
                onCancel={(event) => {
                  event.preventDefault();
                  handleManage(event.currentTarget, "cancel");
                }}
                onUnregister={(form) => handleManage(form, "unregister")}
                onSweep={handleSweep}
                onBatch={handleBatch}
                onPause={() =>
                  void runTransaction(
                    "pause",
                    () => stream.writeContract(data.paused ? "unpause" : "pause"),
                    data.paused ? "Claims resumed." : "Claims paused.",
                  )
                }
              />
            )}
          </>
        ) : null}
      </main>

      <footer>
        <div className="brand compact"><span className="brand-mark"><Zap size={15} /></span>SalaryStream</div>
        <span>Transparent payroll. Continuous ownership.</span>
        {explorerUrl && <a href={explorerUrl} target="_blank" rel="noreferrer">Contract <ArrowUpRight size={13} /></a>}
      </footer>

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSettingsOpen(false)} aria-label="Close"><X size={18} /></button>
            <span className="panel-icon"><Settings2 size={19} /></span>
            <h2>Contract settings</h2>
            <p>Use the SalaryStream deployment on your wallet’s currently selected network.</p>
            <form onSubmit={saveContract} className="stack-form">
              <Field label="Contract address">
                <input value={contractInput} onChange={(event) => setContractInput(event.target.value)} placeholder="0x…" />
              </Field>
              <button className="primary-button" type="submit">Save address <ArrowRight size={16} /></button>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === "success" ? <Check size={17} /> : <X size={17} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function Overview({ data, busy, claim, openAdmin, isOwner }: {
  data: NonNullable<ReturnType<typeof useSalaryStream>["data"]>;
  busy?: string;
  claim: () => void;
  openAdmin: () => void;
  isOwner: boolean;
}) {
  const { employee } = data;
  const vested = employee.claimedSalary + employee.claimable;
  const progress = employee.totalSalary === 0n
    ? 0
    : Math.min(100, Number((vested * 10_000n) / employee.totalSalary) / 100);

  if (!employee.registered) {
    return (
      <section className="empty-state surface">
        <span className="empty-art"><UsersRound size={34} /></span>
        <span className="eyebrow">Wallet connected</span>
        <h2>{isOwner ? "You are connected as the owner." : "No employee profile yet."}</h2>
        <p>
          {isOwner
            ? "Head to the admin workspace to register employees and configure their first streams."
            : "Ask the contract owner to register this wallet before a salary stream can be configured."}
        </p>
        {isOwner && <button className="primary-button" onClick={openAdmin}>Open admin workspace <ArrowRight size={16} /></button>}
      </section>
    );
  }

  return (
    <section className="overview-grid">
      <article className="stream-card surface">
        <div className="card-topline">
          <div>
            <span className="eyebrow"><CircleDollarSign size={14} /> Available now</span>
            <div className="hero-amount">
              {formatToken(employee.claimable, data.tokenDecimals, 4)}
              <small>{data.tokenSymbol}</small>
            </div>
          </div>
          <span className={`live-badge ${employee.totalSalary === 0n ? "muted" : ""}`}><i />{employee.totalSalary === 0n ? "No active stream" : "Vesting live"}</span>
        </div>

        <div className="progress-wrap">
          <div className="progress-meta"><span>{progress.toFixed(1)}% vested</span><span>{formatToken(employee.totalSalary, data.tokenDecimals)} {data.tokenSymbol} total</span></div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        </div>

        <div className="stream-dates">
          <div><Clock3 size={16} /><span><small>Started</small>{formatDate(employee.startedAt)}</span></div>
          <ChevronRight size={18} />
          <div><BadgeCheck size={16} /><span><small>Fully vested</small>{formatDate(employee.streamTill)}</span></div>
        </div>

        <button
          className="claim-button"
          onClick={claim}
          disabled={busy === "claim" || employee.claimable === 0n || data.paused}
        >
          {busy === "claim" ? <LoaderCircle className="spinning" size={18} /> : <BanknoteArrowDown size={18} />}
          Claim {employee.claimable > 0n ? `${formatToken(employee.claimable, data.tokenDecimals)} ${data.tokenSymbol}` : "salary"}
          <ArrowRight size={17} />
        </button>
      </article>

      <div className="side-stack">
        <article className="profile-card surface">
          <div className="profile-avatar">{employee.name ? initials(employee.name) : "—"}</div>
          <div className="profile-copy">
            <span className="eyebrow">Employee #{employee.id.toString()}</span>
            <h3>{employee.name || "Registered employee"}</h3>
            <p><BriefcaseBusiness size={14} /> {employee.position || "Position not set"}</p>
          </div>
          <BadgeCheck className="verified" size={21} />
        </article>

        <article className="breakdown-card surface">
          <div className="section-title"><span>Stream breakdown</span><ShieldCheck size={18} /></div>
          <BreakdownRow label="Already claimed" value={`${formatToken(employee.claimedSalary, data.tokenDecimals)} ${data.tokenSymbol}`} />
          <BreakdownRow label="Claimable now" value={`${formatToken(employee.claimable, data.tokenDecimals)} ${data.tokenSymbol}`} highlight />
          <BreakdownRow label="Still vesting" value={`${formatToken(employee.totalSalary - vested, data.tokenDecimals)} ${data.tokenSymbol}`} />
          <div className="contract-note"><LockKeyhole size={14} /> Your unpaid salary remains reserved in the contract.</div>
        </article>
      </div>
    </section>
  );
}

function AdminPanel(props: {
  data: NonNullable<ReturnType<typeof useSalaryStream>["data"]>;
  isOwner: boolean;
  busy?: string;
  account: Address;
  onFund: (event: FormEvent<HTMLFormElement>) => void;
  onRegister: (event: FormEvent<HTMLFormElement>) => void;
  onConfigure: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: (event: FormEvent<HTMLFormElement>) => void;
  onUnregister: (form: HTMLFormElement) => void;
  onSweep: (event: FormEvent<HTMLFormElement>) => void;
  onBatch: (event: FormEvent<HTMLFormElement>) => void;
  onPause: () => void;
}) {
  const { data, isOwner, busy } = props;
  if (!isOwner) {
    return (
      <section className="empty-state surface">
        <span className="empty-art locked"><LockKeyhole size={32} /></span>
        <span className="eyebrow">Owner access only</span>
        <h2>This workspace is restricted.</h2>
        <p>Connect the owner wallet—{shortAddress(data.owner, 6)}—to manage employees and treasury funds.</p>
      </section>
    );
  }

  return (
    <section className="admin-layout">
      <div className="admin-toolbar surface">
        <div>
          <span className="owner-dot"><ShieldCheck size={16} /> Owner verified</span>
          <p>{shortAddress(props.account, 7)}</p>
        </div>
        <div className="toolbar-balance"><small>Available to allocate</small><strong>{formatToken(data.availableBalance, data.tokenDecimals)} {data.tokenSymbol}</strong></div>
        <button className={data.paused ? "resume-button" : "danger-button"} onClick={props.onPause} disabled={busy === "pause"}>
          {busy === "pause" ? <LoaderCircle className="spinning" size={16} /> : data.paused ? <Play size={16} /> : <Pause size={16} />}
          {data.paused ? "Resume claims" : "Pause claims"}
        </button>
      </div>

      <div className="admin-grid">
        <AdminCard icon={<UserRoundPlus size={19} />} title="Register employee" description="Add a wallet and its public employee profile.">
          <form className="stack-form" onSubmit={props.onRegister}>
            <Field label="Wallet address"><input name="employee" required placeholder="0x…" /></Field>
            <div className="field-row">
              <Field label="Employee ID"><input name="id" type="number" min="1" required placeholder="1042" /></Field>
              <Field label="Age"><input name="age" type="number" min="1" required placeholder="30" /></Field>
            </div>
            <div className="field-row">
              <Field label="Full name"><input name="name" required placeholder="Ada Lovelace" /></Field>
              <Field label="Position"><input name="position" required placeholder="Engineer" /></Field>
            </div>
            <SubmitButton busy={busy === "register"}>Register employee</SubmitButton>
          </form>
        </AdminCard>

        <AdminCard icon={<CircleDollarSign size={19} />} title="Create salary stream" description="Reserve a salary and choose its vesting period.">
          <form className="stack-form" onSubmit={props.onConfigure}>
            <Field label="Employee wallet"><input name="employee" required placeholder="0x…" /></Field>
            <div className="field-row">
              <Field label={`Total salary (${data.tokenSymbol})`}><input name="salary" type="number" min="0" step="any" required placeholder="3000" /></Field>
              <Field label="Vesting interval">
                <select name="interval" defaultValue="2"><option value="0">One day</option><option value="1">One week</option><option value="2">30 days</option></select>
              </Field>
            </div>
            <div className="inline-note"><LockKeyhole size={14} /> The full amount is reserved immediately.</div>
            <SubmitButton busy={busy === "configure"}>Configure stream</SubmitButton>
          </form>
        </AdminCard>

        <AdminCard icon={<Landmark size={19} />} title="Fund treasury" description={`Deposit ${data.tokenSymbol} into the payroll contract.`}>
          <form className="stack-form" onSubmit={props.onFund}>
            <Field label={`Amount (${data.tokenSymbol})`}><input name="amount" type="number" min="0" step="any" required placeholder="10000" /></Field>
            <div className="balance-caption">Wallet balance <strong>{formatToken(data.walletBalance, data.tokenDecimals)} {data.tokenSymbol}</strong></div>
            <SubmitButton busy={busy === "fund"}>Approve & fund</SubmitButton>
          </form>
        </AdminCard>

        <AdminCard icon={<UsersRound size={19} />} title="Run batch payout" description="Trigger vested payouts for up to ten employees.">
          <form className="stack-form" onSubmit={props.onBatch}>
            <Field label="Employee wallets" hint="Separate addresses with commas or spaces."><textarea name="employees" required rows={4} placeholder="0x123…&#10;0x456…" /></Field>
            <SubmitButton busy={busy === "batch"}>Run payouts</SubmitButton>
          </form>
        </AdminCard>

        <AdminCard icon={<Pause size={19} />} title="Manage employee" description="Cancel future vesting or remove a settled employee.">
          <form className="stack-form" onSubmit={props.onCancel}>
            <Field label="Employee wallet"><input name="employee" required placeholder="0x…" /></Field>
            <div className="button-row">
              <button className="secondary-button" type="submit" disabled={busy === "cancel"}>{busy === "cancel" && <LoaderCircle className="spinning" size={15} />}Cancel stream</button>
              <button
                className="text-danger"
                type="button"
                disabled={busy === "unregister"}
                onClick={(event) => {
                  if (event.currentTarget.form) props.onUnregister(event.currentTarget.form);
                }}
              >
                Unregister
              </button>
            </div>
          </form>
        </AdminCard>

        <AdminCard icon={<BanknoteArrowDown size={19} />} title="Sweep excess" description="Withdraw only funds not reserved for salaries.">
          <form className="stack-form" onSubmit={props.onSweep}>
            <Field label="Recipient"><input name="recipient" required placeholder="0x…" /></Field>
            <Field label={`Amount (${data.tokenSymbol})`}><input name="amount" type="number" min="0" step="any" required placeholder="1000" /></Field>
            <div className="balance-caption">Sweepable <strong>{formatToken(data.availableBalance, data.tokenDecimals)} {data.tokenSymbol}</strong></div>
            <SubmitButton busy={busy === "sweep"}>Sweep funds</SubmitButton>
          </form>
        </AdminCard>
      </div>
    </section>
  );
}

function SetupScreen({ value, onChange, onSubmit, connect }: { value: string; onChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; connect: () => void }) {
  return (
    <section className="landing-grid">
      <div className="landing-copy">
        <span className="eyebrow"><span className="pulse-dot" /> Built for onchain teams</span>
        <h1>Payroll that moves <em>at the speed of work.</em></h1>
        <p>Fund once. Stream continuously. Give every teammate a transparent view of what they have earned.</p>
        <div className="trust-row"><span><ShieldCheck size={16} /> Fully reserved</span><span><Clock3 size={16} /> Real-time vesting</span><span><Zap size={16} /> Claim anytime</span></div>
      </div>
      <div className="setup-card surface">
        <span className="panel-icon"><Settings2 size={20} /></span>
        <span className="eyebrow">One-time setup</span>
        <h2>Connect your deployment</h2>
        <p>Enter the SalaryStream contract address on the network selected in your wallet.</p>
        <form className="stack-form" onSubmit={onSubmit}>
          <Field label="Contract address"><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="0x…" /></Field>
          <button className="primary-button" type="submit">Use this contract <ArrowRight size={16} /></button>
        </form>
        <button className="quiet-button" onClick={connect}><WalletCards size={15} /> Connect wallet first</button>
      </div>
    </section>
  );
}

function ConnectScreen({ connect, hasProvider }: { connect: () => void; hasProvider: boolean }) {
  return (
    <section className="connect-card surface">
      <div className="wallet-orbit"><span><WalletCards size={30} /></span><i /><i /><i /></div>
      <span className="eyebrow">Your payroll portal</span>
      <h1>Connect to see what’s flowing.</h1>
      <p>Your wallet determines whether you see an employee stream or the owner workspace.</p>
      <button className="primary-button wide" onClick={connect} disabled={!hasProvider}><WalletCards size={17} />{hasProvider ? "Connect wallet" : "Install an EVM wallet"}</button>
    </section>
  );
}

function ErrorScreen({ error, onSettings, onRetry }: { error: string; onSettings: () => void; onRetry: () => void }) {
  return (
    <section className="empty-state surface">
      <span className="empty-art error"><X size={30} /></span>
      <span className="eyebrow">Could not load contract</span>
      <h2>Check the network and address.</h2>
      <p>{error}</p>
      <div className="button-row centered"><button className="primary-button" onClick={onRetry}><RefreshCw size={15} /> Try again</button><button className="secondary-button" onClick={onSettings}><Settings2 size={15} /> Settings</button></div>
    </section>
  );
}

function LoadingScreen() {
  return <section className="loading-screen"><LoaderCircle className="spinning" size={28} /><span>Reading your stream…</span></section>;
}

function StatCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone?: "ink" }) {
  return <article className={`stat-card ${tone ?? ""}`}><span className="stat-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong><span>{detail}</span></div></article>;
}

function AdminCard({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return <article className="admin-card surface"><div className="admin-card-heading"><span className="panel-icon">{icon}</span><div><h3>{title}</h3><p>{description}</p></div></div>{children}</article>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return <button className="primary-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spinning" size={16} /> : null}{children}<ArrowRight size={15} /></button>;
}

function BreakdownRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`breakdown-row ${highlight ? "highlight" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function requireAddress(value: FormDataEntryValue | null) {
  const candidate = String(value ?? "");
  if (!isAddress(candidate)) throw new Error(`Invalid wallet address: ${candidate || "empty"}`);
  return getAddress(candidate);
}

async function connectWallet(connect: () => Promise<void>, setToast: (toast: Toast) => void) {
  try {
    await connect();
  } catch (error) {
    setToast({ type: "error", message: getErrorMessage(error) });
  }
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default App;
