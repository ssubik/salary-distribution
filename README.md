# Salary Distribution

A funded ERC-20 salary-streaming contract built with [Foundry](https://book.getfoundry.sh/).

Each configured salary vests continuously over one day, one week, or 30 days. The full salary is
reserved when the stream is created, employees can claim vested tokens at any time, and only
unreserved funds can be swept by the owner.

## Features

- Owner-controlled employee registration and salary configuration
- Pro-rata ERC-20 vesting with exact final payouts
- Direct employee claims and permissionless batch payouts
- Fund reservation that protects outstanding salaries
- Stream cancellation that preserves already vested salary
- Emergency pause, reentrancy protection, and two-step ownership transfers
- Foundry tests and GitHub Actions CI
- Responsive React dashboard for employees and contract owners

## Requirements

- [Foundry](https://getfoundry.sh/)

## Setup

```shell
git clone --recurse-submodules https://github.com/ssubik/salary-distribution.git
cd salary-distribution
forge build
```

## Usage

### Build

```shell
forge build
```

### Test

```shell
forge test
```

For verbose traces:

```shell
forge test -vvv
```

### Format and lint

```shell
forge fmt
forge lint
```

### Run a local node

```shell
anvil
```

### Deploy

```shell
export SALARY_TOKEN=<ERC20_TOKEN_ADDRESS>
export INITIAL_OWNER=<OWNER_ADDRESS>

forge script script/DeploySalaryStream.s.sol:DeploySalaryStream \
  --rpc-url <RPC_URL> \
  --private-key <PRIVATE_KEY> \
  --broadcast
```

The deployer and initial owner may be different addresses. Before configuring salaries, approve
the deployed contract to transfer salary tokens and call `fund`.

## Frontend

The app in `frontend/` connects to any injected EVM wallet and follows the wallet's selected
network. Copy the example environment file and provide the deployed SalaryStream address:

```shell
cd frontend
cp .env.example .env
# Set VITE_SALARY_STREAM_ADDRESS in .env
npm install
npm run dev
```

The deployment address can also be changed from the settings button in the app. It is saved only
in the browser's local storage.

### Frontend checks

```shell
npm run lint
npm run build
```
