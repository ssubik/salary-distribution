// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.35;

import {Script} from "forge-std/Script.sol";
import {SalaryStream} from "../src/SalaryStream.sol";

contract DeploySalaryStream is Script {
    function run() external returns (SalaryStream salaryStream) {
        vm.startBroadcast();
        salaryStream = new SalaryStream();
        vm.stopBroadcast();
    }
}
