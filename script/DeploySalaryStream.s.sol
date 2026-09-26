// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.35;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SalaryStream} from "../src/SalaryStream.sol";

contract DeploySalaryStream is Script {
    function run() external returns (SalaryStream salaryStream) {
        address salaryToken = vm.envAddress("SALARY_TOKEN");
        address initialOwner = vm.envAddress("INITIAL_OWNER");

        vm.startBroadcast();
        salaryStream = new SalaryStream(IERC20(salaryToken), initialOwner);
        vm.stopBroadcast();
    }
}
