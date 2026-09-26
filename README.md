# Salary Distribution

A salary-streaming smart contract project built with [Foundry](https://book.getfoundry.sh/).

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
forge script script/DeploySalaryStream.s.sol:DeploySalaryStream \
  --rpc-url <RPC_URL> \
  --private-key <PRIVATE_KEY> \
  --broadcast
```
