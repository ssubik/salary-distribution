import { parseAbi } from "viem";

export const salaryStreamAbi = parseAbi([
  "function salaryToken() view returns (address)",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function totalReserved() view returns (uint256)",
  "function availableBalance() view returns (uint256)",
  "function isRegistered(address employee) view returns (bool)",
  "function employeeDetails(address employee) view returns (uint64 id, uint64 age, string name, string position)",
  "function employeeSalaryConfig(address employee) view returns (uint256 totalSalary, uint256 claimedSalary, uint64 startedAt, uint64 streamTill, uint64 interval)",
  "function claimableSalary(address employee) view returns (uint256)",
  "function fund(uint256 amount) returns (uint256 received)",
  "function registerEmployee(address employee, (uint64 id, uint64 age, string name, string position) details)",
  "function updateEmployee(address employee, (uint64 id, uint64 age, string name, string position) details)",
  "function unregisterEmployee(address employee)",
  "function configureEmployeeSalary(address employee, uint256 salary, uint8 interval)",
  "function claimSalary() returns (uint256 amount)",
  "function claimOrStreamSalary(address[] employees)",
  "function cancelSalaryStream(address employee)",
  "function sweep(address recipient, uint256 amount)",
  "function pause()",
  "function unpause()",
]);

export const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
